import {connectDatabase} from '../../server/db/connection.mjs';
export function testDatabaseConfig() {
  const value=process.env.TEST_DATABASE_URL;
  if(!value)throw new Error('TEST_DATABASE_URL ausente. Informe um banco PostgreSQL descartável exclusivo de testes.');
  const url=new URL(value);
  if(!/^itauba_test_[a-z0-9_]+$/.test(url.pathname.slice(1))||process.env.TEST_DATABASE_IS_DISPOSABLE!=='1')
    throw new Error('Use um banco itauba_test_* e confirme TEST_DATABASE_IS_DISPOSABLE=1. Nunca use a produção.');
  return {databaseUrl:value,databaseSsl:process.env.TEST_DATABASE_SSL!=='false',databaseCa:process.env.TEST_DATABASE_CA};
}
export async function resetTestDatabase(db) {
  const {rows}=await db.query("SELECT tablename FROM pg_tables WHERE schemaname='app' AND tablename NOT IN ('profiles','security_guard','schema_migrations')");
  for(const {tablename} of rows)if(!/^[a-z_]+$/.test(tablename))throw new Error('Tabela inesperada.');
  if(rows.length)await db.query('TRUNCATE '+rows.map(r=>'app.'+r.tablename).join(',')+' CASCADE');
}
export const connectTestDatabase=()=>connectDatabase(testDatabaseConfig());
