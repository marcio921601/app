import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { applyMigrations } from '../../server/db/migrate.mjs';
import { createApp } from '../../server/app.mjs';
import { loadConfig } from '../../server/config.mjs';
import { createTestDb } from '../helpers/database.mjs';

test('migra uma única vez e recusa diário duplicado', async () => {
  const db = await createTestDb();
  try {
    await applyMigrations(db);
    await applyMigrations(db);
    const obra = randomUUID();
    await db.query('INSERT INTO app.obras (id,codigo,nome) VALUES ($1,$2,$3)', [obra,'TESTE','Obra fictícia']);
    const sql = 'INSERT INTO app.diarios (id,obra_id,data,status,version,payload) VALUES ($1,$2,$3,$4,$5,$6)';
    await db.query(sql,[randomUUID(),obra,'2026-10-23','rascunho',1,{}]);
    await assert.rejects(db.query(sql,[randomUUID(),obra,'2026-10-23','rascunho',1,{}]));
    const result = await db.query('SELECT count(*)::int AS count FROM app.schema_migrations');
    assert.equal(result.rows[0].count,2);
    const publicTables = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    assert.deepEqual(publicTables.rows,[]);
  } finally { await db.close(); }
});

test('configuração de produção incompleta falha sem imprimir segredos', () => {
  assert.throws(() => loadConfig({NODE_ENV:'production',DATABASE_URL:'postgres://sensitive-password@host/db'}), error => {
    assert.match(error.message,/Configuração/);
    assert.doesNotMatch(error.message,/sensitive-password/);
    return true;
  });
});

test('saúde não libera dados e prontidão falha sem banco', async () => {
  const server = createServer(createApp({db:null,config:{production:false,origin:'http://localhost:3000'}}));
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/health`)).status,200);
    assert.equal((await fetch(`${base}/api/ready`)).status,503);
    assert.equal((await fetch(`${base}/api/diarios`)).status,401);
    const response = await fetch(`${base}/api/diarios/draft`,{method:'POST',body:'{}'});
    assert.equal(response.status,401);
    const json = await response.json();
    assert.equal(json.error.code,'UNAUTHENTICATED');
    assert.equal(typeof json.error.requestId,'string');
  } finally { await new Promise(resolve => server.close(resolve)); }
});
