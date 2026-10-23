import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {connectTestDatabase,resetTestDatabase,testDatabaseConfig} from '../helpers/postgres.mjs';
import {connectDatabase} from '../../server/db/connection.mjs';
import {applyMigrations} from '../../server/db/migrate.mjs';
import {createTestRuntime,login} from '../helpers/identity.mjs';
import {actorFor,addWork} from '../helpers/workspace.mjs';
import {saveDiary} from '../../server/diarios/service.mjs';
import {deactivateUser} from '../../server/admin/users.mjs';

testDatabaseConfig(); // Configuration errors fail, never skip or use DATABASE_URL.
test('PostgreSQL real: migrações, CAS, renovação, expiração e último administrador',async t=>{
  const db=connectTestDatabase();
  await applyMigrations(db);await resetTestDatabase(db);
  const r=await createTestRuntime({db});
  try {
    assert.equal(r.db,db,'O harness deve usar o driver pg injetado.');
    await t.test('migração idempotente e esquema privado',async()=>{
      await applyMigrations(db);
      assert.equal((await db.query('SELECT count(*)::int n FROM app.schema_migrations')).rows[0].n,2);
      assert.equal((await db.query("SELECT has_schema_privilege('public','app','USAGE') allowed")).rows[0].allowed,false);
      assert.ok((await db.query('SELECT inet_server_addr() host')).rows[0].host);
    });
    const a=await r.addUser({email:'a@example.invalid',isAdmin:true}),b=await r.addUser({email:'b@example.invalid',isAdmin:true});
    await t.test('dois pools na mesma versão têm um ACK e um conflito',async()=>{
      const other=connectDatabase(testDatabaseConfig());
      try {
        const obraId=await addWork(db),actor=actorFor(a);
        const input=changes=>({obraId,data:'2026-10-23',expectedVersion:0,mutationId:randomUUID(),changes});
        const results=await Promise.allSettled([saveDiary(db,actor,input({observacoes:'A'})),saveDiary(other,actor,input({observacoes:'B'}))]);
        assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
        assert.equal(results.find(x=>x.status==='rejected').reason.status,409);
        assert.equal((await db.query('SELECT count(*)::int n FROM app.diario_revisoes')).rows[0].n,1);
      }finally{await other.close();}
    });
    await t.test('renovação serializada e expiração sem misturar pessoas',async()=>{
      const [sa,sb]=await Promise.all([login(r,a),login(r,b)]);
      r.advance(3570*1000);
      const results=await Promise.all([r.request('GET','/api/session',{cookie:sa.cookie}),r.request('GET','/api/session',{cookie:sa.cookie}),r.request('GET','/api/session',{cookie:sb.cookie})]);
      assert.deepEqual(results.map(x=>x.status),[200,200,200]);
      assert.deepEqual(results.map(x=>x.body.user.id),[a.id,a.id,b.id]);
      r.advance(12*3600000+1);
      assert.equal((await r.request('GET','/api/session',{cookie:sa.cookie})).status,401);
    });
    await t.test('trava transacional preserva um administrador',async()=>{
      const result=await Promise.allSettled([deactivateUser(db,actorFor(a),b.id),deactivateUser(db,actorFor(b),a.id)]);
      assert.equal(result.filter(x=>x.status==='fulfilled').length,1);
      assert.equal((await db.query("SELECT count(*)::int n FROM app.users WHERE ativo AND is_admin AND status!='blocked'")).rows[0].n,1);
    });
  }finally{await r.close();}
});
