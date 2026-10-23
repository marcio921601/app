import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createTestRuntime} from '../helpers/identity.mjs';
import {addWork,grant,actorFor} from '../helpers/workspace.mjs';
import {getDiary,saveDiary,deleteHistory} from '../../server/diarios/service.mjs';
import {applyMigrations} from '../../server/db/migrate.mjs';

async function fixture(r){
  const admin=actorFor(await r.addUser({isAdmin:true})),obraId=await addWork(r.db);
  const record=JSON.parse(await readFile(new URL('../fixtures/diary-regression.json',import.meta.url),'utf8'));
  for(const person of record.profissionais)await r.db.query('INSERT INTO app.profissionais(id,obra_id,payload) VALUES($1,$2,$3)',[person.id,obraId,person]);
  for(const item of record.orcamento)await r.db.query('INSERT INTO app.orcamento_itens(id,obra_id,referencia,payload) VALUES($1,$2,$3,$4)',[randomUUID(),obraId,item.referencia,item]);
  const input={obraId,data:record.data,expectedVersion:0,mutationId:randomUUID(),changes:record.payload,register:true};
  return {admin,obraId,record,input,saved:await saveDiary(r.db,admin,input)};
}
test('perfil de leitura não grava vazio; conteúdo idêntico não recalcula nem cria revisão',async()=>{
  const r=await createTestRuntime();try{
    const {admin,obraId,input,saved}=await fixture(r),rh=await r.addUser({email:'rh@example.invalid'});await grant(r.db,rh.id,obraId,'rh');
    await r.db.query("UPDATE app.orcamento_itens SET payload=jsonb_set(payload,'{precoTotal}','5000') WHERE obra_id=$1 AND referencia='1.1.1.1'",[obraId]);
    const empty={...input,expectedVersion:1,mutationId:randomUUID(),changes:{},register:false};
    await assert.rejects(saveDiary(r.db,actorFor(rh),empty),{status:403});
    const unchanged=await saveDiary(r.db,admin,empty);
    assert.deepEqual(unchanged,saved);
    assert.equal((await r.db.query('SELECT count(*)::int n FROM app.diario_revisoes')).rows[0].n,1);
  }finally{await r.close();}
});
test('restauração explícita exige administrador autorizado e mantém revisões anteriores',async()=>{
  const r=await createTestRuntime();try{
    const {admin,obraId,input,saved}=await fixture(r),user=await r.addUser({email:'apontador@example.invalid'});await grant(r.db,user.id,obraId);
    await deleteHistory(r.db,admin,saved.id,{reason:'Ensaio de exclusão',expectedVersion:1});
    assert.equal(await getDiary(r.db,admin,{obraId,data:input.data}),null);
    const restore={...input,expectedVersion:2,mutationId:randomUUID(),changes:{observacoes:'Restaurado conscientemente'},restore:true};
    await assert.rejects(saveDiary(r.db,actorFor(user),restore),{status:403});
    await assert.rejects(saveDiary(r.db,admin,{...restore,restore:false}),{status:409});
    const result=await saveDiary(r.db,admin,restore);
    assert.equal(result.version,3);assert.equal(result.id,saved.id);
    assert.equal((await r.db.query('SELECT count(*)::int n FROM app.diario_revisoes')).rows[0].n,2);
    assert.equal((await r.db.query("SELECT count(*)::int n FROM app.audit WHERE operation='restored'")).rows[0].n,1);
    assert.equal((await getDiary(r.db,admin,{obraId,data:input.data})).payload.observacoes,'Restaurado conscientemente');
  }finally{await r.close();}
});
test('arquivar profissional permite corrigir texto histórico sem remover presença ou alterar valores',async()=>{
  const r=await createTestRuntime();try{
    const {admin,obraId,record,input,saved}=await fixture(r);
    await r.db.query('UPDATE app.profissionais SET ativo=false WHERE id=$1',[record.profissionais[0].id]);
    await r.db.query("UPDATE app.orcamento_itens SET payload=jsonb_set(payload,'{precoTotal}','5000') WHERE obra_id=$1 AND referencia='1.1.1.1'",[obraId]);
    const result=await saveDiary(r.db,admin,{...input,expectedVersion:1,mutationId:randomUUID(),changes:{observacoes:'Correção histórica'},register:false});
    assert.deepEqual(result.payload.presencas,saved.payload.presencas);
    assert.equal(result.summary.totalHH,8);
    assert.equal(result.summary.atividades[0].valorExecutado,120);
    await assert.rejects(saveDiary(r.db,admin,{...input,data:'2026-10-24',mutationId:randomUUID()}),{status:400});
  }finally{await r.close();}
});
test('migração aplicada com LF verifica novamente com CRLF sem aceitar mudança SQL',async()=>{
  const r=await createTestRuntime(),dir=await mkdtemp(path.join(tmpdir(),'itauba-sql-'));
  try{
    for(const name of ['20261023122813_online.sql','20261023163946_diary_mutation_identity.sql']){
      const sql=await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8');
      await writeFile(path.join(dir,name),sql.replace(/\r?\n/g,'\r\n'));
    }
    await applyMigrations(r.db,{directory:dir});
    await writeFile(path.join(dir,'20261023163946_diary_mutation_identity.sql'),'SELECT 123;');
    await assert.rejects(applyMigrations(r.db,{directory:dir}),/alterada/);
  }finally{
    await r.close();
    if(path.dirname(path.resolve(dir))!==path.resolve(tmpdir())||!path.basename(dir).startsWith('itauba-sql-'))throw new Error('Unsafe temporary cleanup');
    await rm(dir,{recursive:true,force:true});
  }
});
