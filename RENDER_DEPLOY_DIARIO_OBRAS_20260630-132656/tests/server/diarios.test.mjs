import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createTestRuntime,login} from '../helpers/identity.mjs';
import {addWork,grant,actorFor} from '../helpers/workspace.mjs';
import {getDiary,saveDiary,listHistory,deleteHistory} from '../../server/diarios/service.mjs';
const write=(obraId,extra={})=>({obraId,data:'2026-10-23',expectedVersion:0,mutationId:randomUUID(),changes:{observacoes:'Texto inicial'},...extra});
test('CAS simultâneo e criação concorrente mantêm um diário por data',async()=>{
 const r=await createTestRuntime();try{
  const actor=actorFor(await r.addUser({isAdmin:true})),obra=await addWork(r.db);
  const input=write(obra),first=await saveDiary(r.db,actor,input);assert.equal(first.version,1);
  const results=await Promise.allSettled([saveDiary(r.db,actor,write(obra,{expectedVersion:1,changes:{observacoes:'A'}})),saveDiary(r.db,actor,write(obra,{expectedVersion:1,changes:{observacoes:'B'}}))]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.find(x=>x.status==='rejected').reason.status,409);
  await assert.rejects(saveDiary(r.db,actor,write(obra)),{status:409});
  assert.equal((await r.db.query('SELECT * FROM app.diarios')).rows.length,1);
 }finally{await r.close();}
});
test('repetição de transporte devolve mesmo envelope e rejeita outra entrada ou identidade',async()=>{
 const r=await createTestRuntime();try{
  const a=actorFor(await r.addUser({isAdmin:true})),b=actorFor(await r.addUser({email:'outra@example.invalid',isAdmin:true})),obra=await addWork(r.db),input=write(obra);
  const first=await saveDiary(r.db,a,input),repeated=await saveDiary(r.db,a,input);assert.deepEqual(repeated,first);
  assert.equal((await r.db.query('SELECT * FROM app.diario_revisoes')).rows.length,1);
  await assert.rejects(saveDiary(r.db,a,{...input,changes:{observacoes:'Diferente'}}),{status:409});
  await assert.rejects(saveDiary(r.db,b,input),{status:409});
  await assert.rejects(saveDiary(r.db,a,{...input,data:'2026-10-24'}),{status:409});
 }finally{await r.close();}
});
test('apontador registra diário, sem editar gerencial ou excluir histórico',async()=>{
 const r=await createTestRuntime();try{
  const user=await r.addUser(),actor=actorFor(user),obra=await addWork(r.db);await grant(r.db,user.id,obra);
  const saved=await saveDiary(r.db,actor,write(obra,{register:true}));
  assert.equal(saved.status,'registrado');assert.equal((await listHistory(r.db,actor,{})).length,1);
  await assert.rejects(saveDiary(r.db,actor,write(obra,{expectedVersion:1,changes:{gerencial:{riscos:'teste'}}})),{status:403});
  await assert.rejects(deleteHistory(r.db,actor,saved.id,{reason:'Teste',expectedVersion:1}),{status:403});
  const other=await addWork(r.db);await assert.rejects(getDiary(r.db,actor,{obraId:other,data:'2026-10-23'}),{status:404});
 }finally{await r.close();}
});
test('autoria adulterada, datas inválidas e payload excessivo são recusados',async()=>{
 const r=await createTestRuntime();try{
  const user=await r.addUser({isAdmin:true}),actor=actorFor(user),obra=await addWork(r.db);
  await assert.rejects(saveDiary(r.db,actor,write(obra,{changes:{updatedBy:randomUUID()}})),{status:400});
  await assert.rejects(saveDiary(r.db,actor,write(obra,{data:'2026-02-30'})),{status:400});
  const s=await login(r,user),result=await r.request('PUT','/api/obras/'+obra+'/diarios/2026-10-23',{cookie:s.cookie,csrfToken:s.csrfToken,body:write(obra,{changes:{observacoes:'x'.repeat(2*1024*1024)}})});
  assert.equal(result.status,413);assert.equal((await r.db.query('SELECT * FROM app.diarios')).rows.length,0);
 }finally{await r.close();}
});
test('revisões e exclusão verificam obra, versão e autor autenticado',async()=>{
 const r=await createTestRuntime();try{
  const user=await r.addUser({isAdmin:true}),actor=actorFor(user),obra=await addWork(r.db);
  const saved=await saveDiary(r.db,actor,write(obra,{register:true})),s=await login(r,user);
  const revisions=await r.request('GET','/api/diarios/'+saved.id+'/revisoes',{cookie:s.cookie});
  assert.equal(revisions.status,200);assert.equal(revisions.body.rows[0].actorId,user.id);
  const outsider=await r.addUser({email:'externo@example.invalid'}),os=await login(r,outsider);
  assert.equal((await r.request('GET','/api/diarios/'+saved.id+'/revisoes',{cookie:os.cookie})).status,404);
  await assert.rejects(deleteHistory(r.db,actor,saved.id,{reason:'Correção',expectedVersion:2}),{status:409});
  await deleteHistory(r.db,actor,saved.id,{reason:'Correção',expectedVersion:1});
  assert.equal((await listHistory(r.db,actor,{})).length,0);
 }finally{await r.close();}
});
test('histórico conserva cálculos confirmados quando orçamento muda',async()=>{
 const r=await createTestRuntime();try{
  const user=await r.addUser({isAdmin:true}),actor=actorFor(user),obra=await addWork(r.db);
  const fixture=JSON.parse(await readFile(new URL('../fixtures/diary-regression.json',import.meta.url),'utf8'));
  for(const person of fixture.profissionais)await r.db.query('INSERT INTO app.profissionais(id,obra_id,payload) VALUES($1,$2,$3)',[person.id,obra,person]);
  for(const item of fixture.orcamento)await r.db.query('INSERT INTO app.orcamento_itens(id,obra_id,referencia,payload) VALUES($1,$2,$3,$4)',[randomUUID(),obra,item.referencia,item]);
  await saveDiary(r.db,actor,{...write(obra),changes:fixture.payload,register:true});
  await r.db.query("UPDATE app.orcamento_itens SET payload=jsonb_set(payload,'{precoTotal}','5000') WHERE obra_id=$1 AND referencia='1.1.1.1'",[obra]);
  const [historical]=await listHistory(r.db,actor,{});
  assert.ok(Array.isArray(historical.summary.atividades));
  assert.equal(historical.summary.atividades[0].valorExecutado,120);
 }finally{await r.close();}
});
