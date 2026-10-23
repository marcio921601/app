import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {z} from 'zod';
import {connectDatabase} from '../db/connection.mjs';
import {loadConfig} from '../config.mjs';
import {createAuthProvider} from '../auth/provider.mjs';
const nonblank=z.string().trim().min(1).max(300),email=z.string().trim().toLowerCase().email().max(254);
const person=z.object({nome:nonblank,email,cargo:z.string().max(200).optional()}).strict();
const schema=z.object({
  obra:z.object({codigo:nonblank,nome:nonblank,cliente:nonblank,responsavel:nonblank,municipio:z.string().max(200).default(''),uf:z.string().regex(/^[A-Z]{2}$/).optional()}).strict(),
  administrador:person,usuarios:z.array(person.extend({perfil:z.enum(['apontador','engenheiro','rh']),obras:z.array(nonblank).min(1)}).strict()).max(9)
}).strict();
async function counts(db) {
  const result={};for(const table of ['obras','users','diarios'])result[table]=Number((await db.query('SELECT count(*)::int AS n FROM app.'+table)).rows[0].n);return result;
}
export async function preparePilot(db,authProvider,input,{apply=false,sendInvites=false,origin,confirmedRecipients}={}) {
  const parsed=schema.safeParse(input);if(!parsed.success)throw new Error('Cadastro privado inválido. Confira os campos e perfis sem incluir senhas.');
  const record=parsed.data,emails=[record.administrador.email,...record.usuarios.map(u=>u.email)];
  if(new Set(emails).size!==emails.length||record.usuarios.some(u=>u.obras.some(code=>code!==record.obra.codigo)))throw new Error('Pessoas duplicadas ou vínculo com obra não fornecida.');
  const people=[{...record.administrador,isAdmin:true},...record.usuarios.map(u=>({...u,isAdmin:false}))];
  const recipientsHash=createHash('sha256').update([...emails].sort().join('\n')).digest('hex');
  if(sendInvites&&(!apply||confirmedRecipients!==recipientsHash||!origin||!authProvider))throw new Error('Antes do envio, confira a prévia e confirme explicitamente o hash dos destinatários, a origem e o serviço SMTP.');
  const report=await db.transaction(async tx=>{
    await tx.query('SELECT id FROM app.security_guard WHERE id=1 FOR UPDATE');
    const changes=[],conflicts=[],existingWork=(await tx.query('SELECT * FROM app.obras WHERE codigo=$1',[record.obra.codigo])).rows[0];
    const work={codigo:record.obra.codigo,nome:record.obra.nome,cliente:record.obra.cliente,responsavel:record.obra.responsavel,local:record.obra.municipio?record.obra.municipio+(record.obra.uf?'/'+record.obra.uf:''):''};
    if(existingWork)for(const [field,value] of Object.entries(work))if(existingWork[field]!==value)conflicts.push({entity:'obra',field,existing:existingWork[field],proposed:value});
    if(!existingWork)changes.push({entity:'obra',operation:'create',codigo:work.codigo});
    const users=[];
    for(const person of people) {
      const existing=(await tx.query('SELECT * FROM app.users WHERE email=$1',[person.email])).rows[0];
      if(existing)for(const [field,value] of Object.entries({nome:person.nome,is_admin:person.isAdmin,...(person.cargo!==undefined?{cargo:person.cargo}:{})}))if(existing[field]!==value)conflicts.push({entity:'user',email:person.email,field,existing:existing[field],proposed:value});
      if(!existing)changes.push({entity:'user',operation:'create',email:person.email,isAdmin:person.isAdmin});
      if(existingWork&&existing&&!person.isAdmin) {
        const membership=(await tx.query('SELECT perfil FROM app.memberships WHERE user_id=$1 AND obra_id=$2',[existing.id,existingWork.id])).rows[0];
        if(membership&&membership.perfil!==person.perfil)conflicts.push({entity:'membership',email:person.email,existing:membership.perfil,proposed:person.perfil});
        if(!membership)changes.push({entity:'membership',operation:'create',email:person.email,perfil:person.perfil});
      }
      users.push({person,existing});
    }
    if(apply&&conflicts.length)throw new Error('Existem divergências no cadastro. Confira a prévia; nenhum dado foi sobrescrito.');
    let obraId=existingWork?.id;
    if(apply) {
      if(!obraId){obraId=randomUUID();await tx.query('INSERT INTO app.obras(id,codigo,nome,cliente,responsavel,local) VALUES($1,$2,$3,$4,$5,$6)',[obraId,work.codigo,work.nome,work.cliente,work.responsavel,work.local]);}
      for(const item of users) {
        let userId=item.existing?.id;
        if(!userId){userId=randomUUID();await tx.query("INSERT INTO app.users(id,email,nome,cargo,is_admin,status) VALUES($1,$2,$3,$4,$5,'pending')",[userId,item.person.email,item.person.nome,item.person.cargo||'',item.person.isAdmin]);}
        if(!item.person.isAdmin)await tx.query('INSERT INTO app.memberships(user_id,obra_id,perfil) VALUES($1,$2,$3) ON CONFLICT(user_id,obra_id) DO NOTHING',[userId,obraId,item.person.perfil]);
      }
      if(changes.length)await tx.query("INSERT INTO app.audit(id,entity,entity_id,operation,details) VALUES($1,'pilot',$2,'prepared',$3)",[randomUUID(),obraId,{people:people.length}]);
    }
    return {changes,conflicts,invites:people.map(p=>({email:p.email,nome:p.nome,status:'pending'})),recipientsHash,applied:apply,counts:await counts(tx)};
  });
  if(sendInvites) {
    report.errors=[];
    for(const person of people) {
      const existing=(await db.query('SELECT id,auth_user_id FROM app.users WHERE email=$1',[person.email])).rows[0];
      if(existing.auth_user_id)continue;
      try {const identity=await authProvider.invite({email:person.email,nome:person.nome,redirectTo:origin+'/definir-senha'});await db.query('UPDATE app.users SET auth_user_id=$1 WHERE id=$2 AND auth_user_id IS NULL',[identity.id,existing.id]);}
      catch {report.errors.push({email:person.email,message:'Convite pendente: envio não confirmado.'});}
    }
  }
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  let db;
  try {
    const {values}=parseArgs({options:{file:{type:'string'},'dry-run':{type:'boolean'},apply:{type:'boolean'},'send-invites':{type:'boolean'},'confirm-recipients':{type:'string'}}});
    if(!values.file||values.apply&&values['dry-run'])throw new Error('Use --file <arquivo privado> com --dry-run ou --apply.');
    const databaseUrl=process.env.MIGRATION_DATABASE_URL||process.env.DATABASE_URL;if(!databaseUrl)throw new Error('Configure MIGRATION_DATABASE_URL antes de conferir o cadastro.');
    db=connectDatabase({databaseUrl,databaseSsl:process.env.DATABASE_SSL!=='false',databaseCa:process.env.DATABASE_CA});
    const auth=values['send-invites']?createAuthProvider(loadConfig()):null;
    const result=await preparePilot(db,auth,JSON.parse(await readFile(values.file,'utf8')),{apply:values.apply===true,sendInvites:values['send-invites']===true,origin:process.env.APP_ORIGIN,confirmedRecipients:values['confirm-recipients']});
    console.log(JSON.stringify(result,null,2));if(result.errors?.length)process.exitCode=1;
  }catch(error){console.error(error.message);process.exitCode=1;}finally{await db?.close();}
}
