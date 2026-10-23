import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export async function applyMigrations(db,{directory=path.join(project,'supabase/migrations')}={}) {
  await db.query('CREATE SCHEMA IF NOT EXISTS app; CREATE TABLE IF NOT EXISTS app.schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
  const files=(await fs.readdir(directory)).filter(name=>/^\d+_.+\.sql$/.test(name)).sort();
  for(const name of files) {
    const sql=(await fs.readFile(path.join(directory,name),'utf8')).replace(/\r\n/g,'\n');
    const checksum=createHash('sha256').update(sql).digest('hex');
    await db.transaction(async tx=>{
      await tx.query('LOCK TABLE app.schema_migrations IN EXCLUSIVE MODE');
      const found=(await tx.query('SELECT checksum FROM app.schema_migrations WHERE name=$1',[name])).rows[0];
      if(found) {
        if(found.checksum!==checksum) throw new Error('Uma migração já aplicada foi alterada: '+name);
        return;
      }
      await tx.query(sql);
      await tx.query('INSERT INTO app.schema_migrations (name,checksum) VALUES ($1,$2)',[name,checksum]);
    });
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const {loadConfig}=await import('../config.mjs');
  const {connectDatabase}=await import('./connection.mjs');
  const config=loadConfig(); const db=connectDatabase({...config,databaseUrl:config.migrationDatabaseUrl});
  try { await applyMigrations(db); console.log('Migrações aplicadas.'); }
  finally { await db.close(); }
}
