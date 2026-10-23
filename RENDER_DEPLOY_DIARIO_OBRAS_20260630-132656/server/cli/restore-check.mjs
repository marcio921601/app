import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';
import {pipeline} from 'node:stream/promises';
import {openBackup,inspectDatabase,launchPg,databaseIdentity} from './backup.mjs';
import {connectDatabase} from '../db/connection.mjs';
function restore({targetDatabaseUrl,ssl,caFile}) {
  return launchPg(process.env.PG_RESTORE_PATH||'pg_restore',['--single-transaction','--exit-on-error','--no-owner','--no-acl','--dbname='+decodeURIComponent(new URL(targetDatabaseUrl).pathname.slice(1))],targetDatabaseUrl,{ssl,caFile});
}
export async function restoreCheck({db,backupPath,targetDatabaseUrl,keyFile,runRestore=restore,ssl=true,caFile}={}) {
  if(!db||!backupPath||!targetDatabaseUrl||!keyFile)throw new Error('Informe explicitamente um banco de teste vazio, backup e chave.');
  const {manifest,plaintextStream}=await openBackup(backupPath,keyFile);
  if(databaseIdentity(targetDatabaseUrl)===manifest.sourceIdentity)throw new Error('Use um banco de teste vazio diferente da origem.');
  const tables=(await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='app' AND table_type='BASE TABLE'")).rows;
  if(tables.length)throw new Error('O alvo deve ser um banco vazio, sem tabelas da aplicação. Nenhum dado foi removido.');
  const processHandle=await runRestore({db,targetDatabaseUrl,ssl,caFile});processHandle.completed.catch(()=>{});
  try {
    const input=plaintextStream();await pipeline(input.source,input.cipher,processHandle.stdin);await processHandle.completed;
    const result=await inspectDatabase(db);
    if(JSON.stringify(result.counts)!==JSON.stringify(manifest.counts)||JSON.stringify(result.checks)!==JSON.stringify(manifest.checks))throw new Error('A restauração terminou, mas contagens ou hashes divergiram. Preserve o alvo para investigação; não altere a produção.');
    return result;
  }catch(error){processHandle.abort();await processHandle.completed.catch(cause=>{error=cause;});throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  let db;
  try {
    const {values}=parseArgs({options:{backup:{type:'string'},'key-file':{type:'string'},'target-confirm-empty':{type:'boolean'}}});
    const targetDatabaseUrl=process.env.RESTORE_DATABASE_URL;
    if(!values['target-confirm-empty']||!targetDatabaseUrl)throw new Error('Configure RESTORE_DATABASE_URL para um banco de teste vazio e use --target-confirm-empty.');
    db=connectDatabase({databaseUrl:targetDatabaseUrl,databaseSsl:process.env.DATABASE_SSL!=='false',databaseCa:process.env.DATABASE_CA});
    console.log(JSON.stringify(await restoreCheck({db,backupPath:values.backup,keyFile:values['key-file'],targetDatabaseUrl,ssl:process.env.DATABASE_SSL!=='false'}),null,2));
  }catch(error){console.error(error.message);process.exitCode=1;}finally{await db?.close();}
}
