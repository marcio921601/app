import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Readable,Writable} from 'node:stream';
import {createTestDb} from '../helpers/database.mjs';
import {applyMigrations} from '../../server/db/migrate.mjs';
import {preparePilot} from '../../server/cli/pilot.mjs';
import {backupDatabase,TABLES,pgEnvironment,launchPg} from '../../server/cli/backup.mjs';
import {restoreCheck} from '../../server/cli/restore-check.mjs';
const record={obra:{codigo:'PILOTO-TESTE',nome:'Obra piloto fictícia',cliente:'Cliente fictício',responsavel:'Pessoa responsável',municipio:'',uf:'PR'},
 administrador:{nome:'Admin fictício',email:'admin@example.invalid'},
 usuarios:[{nome:'Apontador fictício',email:'apontador@example.invalid',cargo:'Assistente',perfil:'apontador',obras:['PILOTO-TESTE']}]};
const provider={invites:[],async invite(input){this.invites.push(input);return {id:crypto.randomUUID()};}};
async function database(){const db=await createTestDb();await applyMigrations(db);return db;}
test('dry-run não altera a base nem envia mensagens',async()=>{
 const db=await database();try{
  const result=await preparePilot(db,provider,record);
  assert.equal(result.invites.length,2);assert.equal(provider.invites.length,0);
  assert.equal((await db.query('SELECT * FROM app.obras')).rows.length,0);
  assert.equal((await db.query('SELECT * FROM app.users')).rows.length,0);
 }finally{await db.close();}
});
test('aplicar o piloto duas vezes mantém uma obra, duas pessoas pendentes e nenhum diário',async()=>{
 const db=await database();try{
  await preparePilot(db,provider,record,{apply:true});
  const result=await preparePilot(db,provider,record,{apply:true});
  assert.equal(result.counts.obras,1);assert.equal(result.counts.users,2);assert.equal(result.counts.diarios,0);assert.equal(provider.invites.length,0);
  const users=(await db.query('SELECT * FROM app.users')).rows;
  assert.equal(users.filter(u=>u.is_admin).length,1);assert.ok(users.every(u=>u.status==='pending'&&!u.auth_user_id));
  assert.equal((await db.query('SELECT local FROM app.obras')).rows[0].local,'');
  assert.deepEqual((await db.query('SELECT perfil FROM app.memberships')).rows,[{perfil:'apontador'}]);
 }finally{await db.close();}
});
test('diferenças em cadastro existente exigem conferência e não são sobrescritas',async()=>{
 const db=await database();try{
  await preparePilot(db,provider,record,{apply:true});
  const changed={...record,obra:{...record.obra,nome:'Outra descrição'}};
  const preview=await preparePilot(db,provider,changed);assert.ok(preview.conflicts.length);
  await assert.rejects(preparePilot(db,provider,changed,{apply:true}),/diverg/);
  assert.equal((await db.query('SELECT nome FROM app.obras')).rows[0].nome,record.obra.nome);
 }finally{await db.close();}
});
test('backup criptografado restaura contagens e hashes e recusa alvo preenchido',async()=>{
 const source=await database(),target=await createTestDb(),directory=await mkdtemp(path.join(tmpdir(),'itauba-ops-'));
 try {
  await preparePilot(source,provider,record,{apply:true});
  await source.query("SET TIME ZONE 'America/Sao_Paulo'");
  const keyFile=path.join(directory,'key');await writeFile(keyFile,randomBytes(32).toString('base64'),{mode:0o600});
  async function runDump({db}){const content={};for(const [table] of TABLES)content[table]=(await db.query('SELECT * FROM app.'+table)).rows;return {stdout:Readable.from([JSON.stringify(content)]),completed:Promise.resolve(),abort(){}};}
  function runRestore(){
    let resolve,reject;const completed=new Promise((yes,no)=>{resolve=yes;reject=no;}),parts=[];
    const stdin=new Writable({write(chunk,encoding,done){parts.push(chunk);done();},final(done){(async()=>{
      await applyMigrations(target);
      for(const [table] of [...TABLES].reverse())await target.query('DELETE FROM app.'+table);
      const content=JSON.parse(Buffer.concat(parts).toString());
      for(const [table] of TABLES)for(const row of content[table]){
        const columns=Object.keys(row);assert.ok(columns.every(c=>/^[a-z_]+$/.test(c)));
        await target.query('INSERT INTO app.'+table+'('+columns.map(c=>'"'+c+'"').join(',')+') VALUES('+columns.map((_,i)=>'$'+(i+1)).join(',')+')',columns.map(c=>row[c]&&typeof row[c]==='object'?JSON.stringify(row[c]):row[c]));
      }
    })().then(()=>{resolve();done();},error=>{reject(error);done(error);});}});
    return {stdin,completed,abort(){stdin.destroy();}};
  }
  const manifest=await backupDatabase({db:source,connectionUrl:'postgres://test:private-password@localhost/example',outputDir:directory,keyFile,runDump,exportSnapshot:async()=> 'test-snapshot'});
  const encrypted=await readFile(path.join(directory,manifest.file));assert.ok(!encrypted.includes(Buffer.from('admin@example.invalid')));
  const tampered=Buffer.from(encrypted);tampered[40]^=1;await writeFile(path.join(directory,manifest.file),tampered);
  await assert.rejects(restoreCheck({db:target,backupPath:path.join(directory,manifest.manifestFile),targetDatabaseUrl:'postgres://test:private-password@localhost/empty',keyFile,runRestore}),/Checksum/);
  await writeFile(path.join(directory,manifest.file),encrypted);
  const result=await restoreCheck({db:target,backupPath:path.join(directory,manifest.manifestFile),targetDatabaseUrl:'postgres://test:private-password@localhost/empty',keyFile,runRestore});
  assert.deepEqual(result.counts,manifest.counts);assert.deepEqual(result.checks,manifest.checks);
  await assert.rejects(restoreCheck({db:target,backupPath:path.join(directory,manifest.manifestFile),targetDatabaseUrl:'postgres://test:private-password@localhost/empty',keyFile,runRestore}),/vazio/);
 }finally{
  await source.close();await target.close();
  if(!path.resolve(directory).startsWith(path.resolve(tmpdir())+path.sep)||!path.basename(directory).startsWith('itauba-ops-'))throw new Error('Unsafe temporary path');
  await rm(directory,{recursive:true,force:true});
 }
});
test('senha de conexão fica somente no ambiente do processo e TLS é verificado',()=>{
 const env=pgEnvironment('postgres://someone:private-password@db.example.invalid:5432/app');
 assert.equal(env.PGPASSWORD,'private-password');assert.equal(env.PGSSLMODE,'verify-full');assert.equal(env.PGDATABASE,'app');
});
test('cliente PostgreSQL ausente fornece instrução de configuração',async()=>{
 const processHandle=launchPg('itauba-missing-pg-dump-for-test-0000',[],'postgres://test:private-password@localhost/test');
 await assert.rejects(processHandle.completed,/Instale o cliente PostgreSQL/);
});
