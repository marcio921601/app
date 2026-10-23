import {createCipheriv,createDecipheriv,createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {readFile,writeFile,mkdir,appendFile,unlink,open,stat} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {Writable} from 'node:stream';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';
import {connectDatabase} from '../db/connection.mjs';
export const TABLES=[['users','id'],['profiles','id'],['obras','id'],['memberships','user_id,obra_id'],['profissionais','id'],['afastamentos','id'],['orcamento_itens','id'],['diarios','id'],['diario_revisoes','id'],['audit','id'],['sessions','hash'],['auth_limits','key'],['security_guard','id'],['schema_migrations','name']];
export const MAGIC=Buffer.from('ITAUBA-BACKUP-V1\0');
export async function readKey(keyFile) {
  const content=await readFile(keyFile),key=content.length===32?content:Buffer.from(content.toString('utf8').trim(),'base64');
  if(key.length!==32)throw new Error('A chave do backup deve conter 32 bytes, em arquivo privado.');return key;
}
export function pgEnvironment(connectionUrl,{ssl=true,caFile=process.env.PGSSLROOTCERT}={}) {
  const url=new URL(connectionUrl);
  if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('Conexão PostgreSQL inválida.');
  return {PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP,
    PGHOST:url.hostname,PGPORT:url.port||'5432',PGDATABASE:decodeURIComponent(url.pathname.slice(1)),PGUSER:decodeURIComponent(url.username),
    PGPASSWORD:decodeURIComponent(url.password),PGSSLMODE:ssl?'verify-full':'disable',...(caFile?{PGSSLROOTCERT:caFile}:{})};
}
export function databaseIdentity(url) {const parsed=new URL(url);return createHash('sha256').update(parsed.hostname+':'+(parsed.port||'5432')+parsed.pathname).digest('hex');}
export function launchPg(command,args,connectionUrl,{ssl=true,caFile}={}) {
  const child=spawn(command,args,{env:pgEnvironment(connectionUrl,{ssl,caFile}),stdio:['pipe','pipe','pipe'],windowsHide:true});
  child.stderr.resume(); // Never echo a raw connection error or credential-bearing output.
  const completed=new Promise((resolve,reject)=>{
    child.once('error',error=>reject(new Error(error.code==='ENOENT'?'Instale o cliente PostgreSQL compatível e configure PG_DUMP_PATH/PG_RESTORE_PATH.':'Não foi possível iniciar o cliente PostgreSQL.')));
    child.once('close',code=>code===0?resolve():reject(new Error('O cliente PostgreSQL encerrou sem concluir a operação. Confira conectividade, certificados e permissões.')));
  });
  completed.catch(()=>{});
  return {stdout:child.stdout,stdin:child.stdin,completed,abort:()=>child.kill()};
}
function dump({connectionUrl,snapshot,ssl,caFile}) {return launchPg(process.env.PG_DUMP_PATH||'pg_dump',['--format=custom','--schema=app','--no-owner','--no-acl','--snapshot='+snapshot],connectionUrl,{ssl,caFile});}
export async function inspectDatabase(db) {
  if(db.transaction)return db.transaction(tx=>inspectDatabase(tx));
  await db.query("SET LOCAL TIME ZONE 'UTC'");
  const counts={},checks={};
  for(const [table,order] of TABLES) {
    const rows=(await db.query('SELECT to_jsonb(t) AS row FROM app.'+table+' t ORDER BY '+order)).rows.map(r=>r.row);
    counts[table]=rows.length;checks[table]=createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  }
  return {counts,checks};
}
export const manifestAuth=(manifest,key)=>createHmac('sha256',key).update(JSON.stringify(manifest)).digest('hex');
export async function fileHash(file) {const hash=createHash('sha256');for await(const part of createReadStream(file))hash.update(part);return hash.digest('hex');}
export async function backupDatabase({db,connectionUrl,outputDir,keyFile,runDump=dump,exportSnapshot=async tx=>(await tx.query('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot,ssl=true,caFile}={}) {
  if(!db||!connectionUrl||!outputDir||!keyFile)throw new Error('Informe conexão, diretório e arquivo de chave para o backup.');
  const key=await readKey(keyFile);await mkdir(outputDir,{recursive:true,mode:0o700});
  const stamp=new Date().toISOString().replace(/[:.]/g,'-'),file='itauba-'+stamp+'-'+randomBytes(4).toString('hex')+'.dump.enc',target=path.join(outputDir,file);
  let processHandle;
  try {
    const snapshotData=await db.transaction(async tx=>{
      await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      const snapshot=await exportSnapshot(tx),details=await inspectDatabase(tx);
      processHandle=await runDump({db:tx,connectionUrl,snapshot,ssl,caFile});
      processHandle.completed.catch(()=>{});
      const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),output=createWriteStream(target,{flags:'wx',mode:0o600});
      output.write(Buffer.concat([MAGIC,iv]));
      await pipeline(processHandle.stdout,cipher,output);await processHandle.completed;
      await appendFile(target,cipher.getAuthTag());return details;
    });
    const manifestFile=file+'.manifest.json';
    const unsigned={format:1,createdAt:new Date().toISOString(),schemas:['app'],cipher:'AES-256-GCM',file,manifestFile,sourceIdentity:databaseIdentity(connectionUrl),sha256:await fileHash(target),...snapshotData};
    const manifest={...unsigned,auth:manifestAuth(unsigned,key)};
    await writeFile(path.join(outputDir,manifestFile),JSON.stringify(manifest,null,2),{flag:'wx',mode:0o600});return manifest;
  }catch(error){processHandle?.abort();if(processHandle)await processHandle.completed.catch(cause=>{error=cause;});await unlink(target).catch(()=>{});throw error;}
}
export async function openBackup(backupPath,keyFile) {
  const key=await readKey(keyFile);
  if((await stat(backupPath)).size>1024*1024)throw new Error('Manifesto de backup inválido.');
  const manifest=JSON.parse(await readFile(backupPath,'utf8')),{auth,...unsigned}=manifest;
  if(typeof auth!=='string'||auth.length!==64||!timingSafeEqual(Buffer.from(auth),Buffer.from(manifestAuth(unsigned,key))))throw new Error('Autenticação do manifesto de backup falhou.');
  if(manifest.format!==1||manifest.cipher!=='AES-256-GCM'||typeof manifest.file!=='string'||path.basename(manifest.file)!==manifest.file||manifest.schemas?.join(',')!=='app')throw new Error('Formato de backup inválido.');
  const file=path.join(path.dirname(backupPath),manifest.file);
  if(await fileHash(file)!==manifest.sha256)throw new Error('Checksum do backup não confere.');
  const size=(await stat(file)).size,header=Buffer.alloc(MAGIC.length+12),tag=Buffer.alloc(16),handle=await open(file,'r');
  try{await handle.read(header,0,header.length,0);await handle.read(tag,0,16,size-16);}finally{await handle.close();}
  if(size<header.length+17||!header.subarray(0,MAGIC.length).equals(MAGIC))throw new Error('Arquivo de backup inválido.');
  const plaintextStream=()=>{
    const cipher=createDecipheriv('aes-256-gcm',key,header.subarray(MAGIC.length));cipher.setAuthTag(tag);
    return {source:createReadStream(file,{start:header.length,end:size-17}),cipher};
  };
  // Authenticate the entire ciphertext before allowing decrypted bytes into pg_restore.
  const verification=plaintextStream();
  await pipeline(verification.source,verification.cipher,new Writable({write(chunk,encoding,done){done();}}));
  return {manifest,plaintextStream};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  let db;
  try{
    const {values}=parseArgs({options:{'output-dir':{type:'string'},'key-file':{type:'string'}}});
    const connectionUrl=process.env.BACKUP_DATABASE_URL||process.env.MIGRATION_DATABASE_URL;
    if(!connectionUrl)throw new Error('Configure BACKUP_DATABASE_URL ou MIGRATION_DATABASE_URL.');
    db=connectDatabase({databaseUrl:connectionUrl,databaseSsl:process.env.DATABASE_SSL!=='false',databaseCa:process.env.DATABASE_CA});
    console.log(JSON.stringify(await backupDatabase({db,connectionUrl,outputDir:values['output-dir'],keyFile:values['key-file'],ssl:process.env.DATABASE_SSL!=='false'}),null,2));
  }catch(error){console.error(error.message);process.exitCode=1;}finally{await db?.close();}
}
