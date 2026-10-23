import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createTestRuntime,login} from '../helpers/identity.mjs';
import {addWork,grant,actorFor} from '../helpers/workspace.mjs';
import {listObras,getWorkspace,writeMasterRecord,previewBudget,importBudget} from '../../server/obras/service.mjs';
test('base vazia permanece vazia',async()=>{
 const r=await createTestRuntime();try {assert.deepEqual(await listObras(r.db,actorFor(await r.addUser({isAdmin:true}))),[]);}finally{await r.close();}
});
test('remoção de afastamento exige versão atual e fica auditada',async()=>{
 const r=await createTestRuntime();try {
  const user=await r.addUser({isAdmin:true}),actor=actorFor(user),obra=await addWork(r.db);
  const prof=await writeMasterRecord(r.db,actor,{obraId:obra,kind:'profissional',expectedVersion:0,changes:{nome:'Pessoa',funcao:'ARMADOR'}});
  const afast=await writeMasterRecord(r.db,actor,{obraId:obra,kind:'afastamento',expectedVersion:0,changes:{profissionalId:prof.id,tipo:'ausencia',inicio:'2026-10-23',fim:'2026-10-24'}});
  const s=await login(r,user),path='/api/obras/'+obra+'/afastamentos/'+afast.id;
  assert.equal((await r.request('DELETE',path,{cookie:s.cookie,csrfToken:s.csrfToken,body:{expectedVersion:2}})).status,409);
  assert.equal((await r.request('DELETE',path,{cookie:s.cookie,csrfToken:s.csrfToken,body:{expectedVersion:1}})).status,200);
  assert.equal((await getWorkspace(r.db,actor,obra)).afastamentos.length,0);
  assert.equal((await r.db.query("SELECT * FROM app.audit WHERE entity_id=$1 AND operation='deleted'",[afast.id])).rows.length,1);
 }finally{await r.close();}
});
test('cadastro não vaza outra obra nem altera sua versão',async()=>{
 const r=await createTestRuntime();try {
  const a=actorFor(await r.addUser({email:'a@example.invalid',isAdmin:true})),u=await r.addUser(),one=await addWork(r.db),two=await addWork(r.db);await grant(r.db,u.id,one);
  assert.equal((await listObras(r.db,actorFor(u))).length,1);
  await assert.rejects(getWorkspace(r.db,actorFor(u),two),{status:404});
  await assert.rejects(writeMasterRecord(r.db,actorFor(u),{obraId:one,kind:'profissional',expectedVersion:0,changes:{nome:'Fictício',funcao:'CARPINTEIRO'}}),{status:403});
  const item=await writeMasterRecord(r.db,a,{obraId:one,kind:'profissional',expectedVersion:0,changes:{nome:'Fictício',funcao:'CARPINTEIRO',custoHora:25}});
  const edit={obraId:one,kind:'profissional',id:item.id,expectedVersion:1,changes:{nome:'Nome atualizado'}};
  assert.equal((await writeMasterRecord(r.db,a,edit)).version,2);
  await assert.rejects(writeMasterRecord(r.db,a,edit),{status:409});
  await assert.rejects(writeMasterRecord(r.db,a,{...edit,obraId:two,expectedVersion:2}),{status:404});
  assert.equal((await getWorkspace(r.db,a,one)).profissionais[0].version,2);
 }finally{await r.close();}
});
test('afastamento recusa referência cruzada e profissional usado é arquivado',async()=>{
 const r=await createTestRuntime();try {
  const a=actorFor(await r.addUser({isAdmin:true})),one=await addWork(r.db),two=await addWork(r.db);
  const item=await writeMasterRecord(r.db,a,{obraId:one,kind:'profissional',expectedVersion:0,changes:{nome:'Pessoa fictícia',funcao:'ARMADOR'}});
  await assert.rejects(writeMasterRecord(r.db,a,{obraId:two,kind:'afastamento',expectedVersion:0,changes:{profissionalId:item.id,inicio:'2026-10-23',fim:'2026-10-24',tipo:'ausencia'}}),{status:400});
  await r.db.query('INSERT INTO app.diarios(id,obra_id,data,payload) VALUES($1,$2,$3,$4)',[randomUUID(),one,'2026-10-23',{presencas:[item.id]}]);
  await writeMasterRecord(r.db,a,{obraId:one,kind:'profissional',id:item.id,expectedVersion:1,changes:{ativo:false}});
  assert.equal((await getWorkspace(r.db,a,one)).profissionais[0].ativo,false);
  assert.equal((await r.db.query('SELECT * FROM app.diarios WHERE obra_id=$1',[one])).rows.length,1);
 }finally{await r.close();}
});
test('importação excedente ou inválida não grava parcialmente',async()=>{
 const r=await createTestRuntime();try {
  const a=actorFor(await r.addUser({isAdmin:true})),obra=await addWork(r.db);
  await assert.rejects(previewBudget(r.db,a,obra,Buffer.alloc(5*1024*1024+1)),{status:413});
  const invalid=Buffer.from('nivel,referencia,descricao,qtdeOrcada,unidade,precoTotal,bdi\n4,1,Item,-5,m,20,0');
  const preview=await previewBudget(r.db,a,obra,invalid);assert.ok(preview.errors.length);
  await assert.rejects(importBudget(r.db,a,obra,invalid,{expectedVersion:preview.version,hash:preview.hash}),{status:400});
  assert.equal((await getWorkspace(r.db,a,obra)).orcamento.length,0);
  const valid=Buffer.from('nivel,referencia,descricao,qtdeOrcada,unidade,precoTotal,bdi\n1,1,Grupo,0,,0,0\n2,1.1,Subgrupo,0,,0,0\n3,1.1.1,Serviço,0,,0,0\n4,1.1.1.1,Item,12,m,20,0');
  const checked=await previewBudget(r.db,a,obra,valid);assert.deepEqual(checked.errors,[]);
  const result=await importBudget(r.db,a,obra,valid,{expectedVersion:checked.version,hash:checked.hash});
  assert.equal(result.rows.length,4);
  await assert.rejects(importBudget(r.db,a,obra,valid,{expectedVersion:checked.version,hash:checked.hash}),{status:409});
 }finally{await r.close();}
});
