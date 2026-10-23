import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {createApp} from '../../server/app.mjs';
import {createTestDb} from './database.mjs';
import {createFakeProvider} from './identity.mjs';
import {applyMigrations} from '../../server/db/migrate.mjs';
import {addWork,grant} from './workspace.mjs';
import {readFile} from 'node:fs/promises';
import {writeMasterRecord} from '../../server/obras/service.mjs';
import {saveDiary} from '../../server/diarios/service.mjs';
let db,provider,app,users,works;
const config={origin:'http://localhost:4173',production:false,encryptionKey:Buffer.alloc(32,7),idleMs:43200000,absoluteMs:604800000};
async function reset(mode='normal') {
  if(db) await db.close();
  db=await createTestDb();await applyMigrations(db);provider=createFakeProvider(()=>Date.now());users={};works=[];
  for(const [email,isAdmin] of [['admin@example.invalid',true],['apontador@example.invalid',false],['rh@example.invalid',false],['engenheiro@example.invalid',false]]) {
    const identity=provider.addUser({email,nome:email.split('@')[0]});const id=randomUUID();
    await db.query("INSERT INTO app.users(id,auth_user_id,email,nome,is_admin,status) VALUES($1,$2,$3,$4,$5,'active')",[id,identity.id,email,identity.nome,isAdmin]);
    users[email]={id,identity};
  }
  if(mode!=='empty') {
    for(const [codigo,nome] of [['T1','Obra fictícia A'],['T2','Obra fictícia B'],['T3','Obra restrita']]) works.push(await addWork(db,{codigo,nome}));
    for(const obra of works.slice(0,2)) {
      await grant(db,users['apontador@example.invalid'].id,obra);
      await grant(db,users['rh@example.invalid'].id,obra,'rh');
      await grant(db,users['engenheiro@example.invalid'].id,obra,'engenheiro');
    }
  }
  app=createApp({db,config,authProvider:provider});
}
await reset();
const server=createServer(async(req,res)=>{
  if(req.url.startsWith('/__test/')) {
    let input='';for await(const part of req) input+=part;
    input=input?JSON.parse(input):{};
    if(req.url==='/__test/reset') {await reset(input.mode);res.end(JSON.stringify({works}));return;}
    if(req.url==='/__test/invite') {
      const user=users[input.email];await db.query("UPDATE app.users SET status='pending' WHERE id=$1",[user.id]);
      const token=provider.emailToken(user.identity,'invite');res.end(JSON.stringify({link:'/api/auth/confirm?type=invite&token_hash='+token}));return;
    }
    if(req.url==='/__test/expire') {await db.query('DELETE FROM app.sessions');res.end('{}');return;}
    if(req.url==='/__test/regression') {
      const fixture=JSON.parse(await readFile(new URL('../fixtures/diary-regression.json',import.meta.url),'utf8'));
      const actor={id:users['admin@example.invalid'].id,isAdmin:true};
      for(const person of fixture.profissionais)await db.query('INSERT INTO app.profissionais(id,obra_id,payload,ativo) VALUES($1,$2,$3,true)',[person.id,works[0],Object.fromEntries(Object.entries(person).filter(([k])=>k!=='id'))]);
      for(const row of fixture.orcamento)await writeMasterRecord(db,actor,{obraId:works[0],kind:'itemOrcamento',expectedVersion:0,changes:row});
      const diary=await saveDiary(db,actor,{obraId:works[0],data:fixture.data,expectedVersion:0,mutationId:randomUUID(),changes:fixture.payload,register:true});
      await saveDiary(db,actor,{obraId:works[2],data:fixture.data,expectedVersion:0,mutationId:randomUUID(),changes:{observacoes:'Dado de obra restrita'},register:true});
      res.end(JSON.stringify({diary,works}));return;
    }
    if(req.url==='/__test/change-budget') {
      const item=(await db.query("SELECT * FROM app.orcamento_itens WHERE obra_id=$1 AND referencia='1.1.1.1'",[works[0]])).rows[0];
      await writeMasterRecord(db,{id:users['admin@example.invalid'].id,isAdmin:true},{obraId:works[0],kind:'itemOrcamento',id:item.id,expectedVersion:item.version,changes:{precoTotal:5000}});
      res.end('{}');return;
    }
    res.writeHead(404);res.end();return;
  }
  await app(req,res);
});
server.listen(4173,'127.0.0.1');
process.once('SIGTERM',()=>server.close(()=>db.close()));
