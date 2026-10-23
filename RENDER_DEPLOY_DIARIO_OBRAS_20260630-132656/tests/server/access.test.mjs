import test from 'node:test';
import assert from 'node:assert/strict';
import {createTestRuntime,login} from '../helpers/identity.mjs';
import {addWork,grant,actorFor} from '../helpers/workspace.mjs';
import {getObraAccess,requirePermission} from '../../server/access/permissions.mjs';
import {deactivateUser,inviteUser,updateUserAccess} from '../../server/admin/users.mjs';

test('apontador não administra e não acessa outra obra',async()=>{
  const r=await createTestRuntime();
  try {
    const u=await r.addUser(),own=await addWork(r.db),other=await addWork(r.db);
    await grant(r.db,u.id,own);const s=await login(r,u);
    assert.equal((await r.request('GET','/api/admin/users',{cookie:s.cookie})).status,403);
    const access=await getObraAccess(r.db,actorFor(u),own);
    requirePermission(access,'diario','edit');
    requirePermission(access,'historico','read');
    assert.throws(()=>requirePermission(access,'historico','edit'),{status:403});
    assert.throws(()=>requirePermission(access,'cadastros','edit'),{status:403});
    await assert.rejects(getObraAccess(r.db,actorFor(u),other),{status:404});
  } finally {await r.close();}
});
test('duas desativações preservam um administrador',async()=>{
  const r=await createTestRuntime();
  try {
    const a=await r.addUser({email:'admin-a@example.invalid',isAdmin:true}),b=await r.addUser({email:'admin-b@example.invalid',isAdmin:true});
    await Promise.allSettled([deactivateUser(r.db,actorFor(a),b.id),deactivateUser(r.db,actorFor(b),a.id)]);
    assert.equal((await r.db.query("SELECT count(*)::int AS n FROM app.users WHERE is_admin AND ativo AND status!='blocked'")).rows[0].n,1);
  } finally {await r.close();}
});
test('vínculo adulterado falha integralmente e simulação não troca autoria',async()=>{
  const r=await createTestRuntime();
  try {
    const a=await r.addUser({email:'admin@example.invalid',isAdmin:true}),u=await r.addUser(),obra=await addWork(r.db);
    await assert.rejects(updateUserAccess(r.db,actorFor(a),u.id,{memberships:[{obraId:obra,perfil:'inventado'}]}),{status:400});
    assert.equal((await r.db.query('SELECT * FROM app.memberships WHERE user_id=$1',[u.id])).rows.length,0);
    const s=await login(r,a);
    const response=await r.request('GET','/api/session?perfil=apontador&usuario='+u.id,{cookie:s.cookie});
    assert.equal(response.body.user.id,a.id);
    assert.equal(response.body.user.isAdmin,true);
  } finally {await r.close();}
});
test('falha no convite mantém cadastro pendente sem ampliar acesso',async()=>{
  const r=await createTestRuntime();
  try {
    const a=await r.addUser({isAdmin:true});
    r.provider.invite=async()=>{throw new Error('SMTP unavailable');};
    const input={email:'convidado@example.invalid',nome:'Pessoa convidada',memberships:[]};
    await assert.rejects(inviteUser(r.db,actorFor(a),input,{send:true,authProvider:r.provider,config:r.config}),{status:502});
    const rows=(await r.db.query('SELECT * FROM app.users WHERE email=$1',[input.email])).rows;
    assert.equal(rows.length,1);assert.equal(rows[0].status,'pending');assert.equal(rows[0].auth_user_id,null);
    const again=await inviteUser(r.db,actorFor(a),input,{send:false});
    assert.equal(again.id,rows[0].id);
  } finally {await r.close();}
});
