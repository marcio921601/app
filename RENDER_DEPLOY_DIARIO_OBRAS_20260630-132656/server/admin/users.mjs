import {randomUUID} from 'node:crypto';
import {HttpError,sendJson,readJson} from '../http.mjs';
import {requireAdmin,assertId,MODULES} from '../access/permissions.mjs';

const invalid=message=>new HttpError(400,'INVALID_INPUT',message);
export async function audit(db,actor,entity,entityId,operation,details={}) {
  await db.query('INSERT INTO app.audit(id,actor_id,entity,entity_id,operation,details) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),actor?.id||null,entity,entityId,operation,details]);
}
async function guardAdmin(tx,actor) {
  requireAdmin(actor);
  await tx.query('SELECT id FROM app.security_guard WHERE id=1 FOR UPDATE');
  const current=(await tx.query("SELECT id FROM app.users WHERE id=$1 AND is_admin AND ativo AND status='active'",[actor.id])).rows[0];
  if(!current) throw new HttpError(403,'FORBIDDEN','Acesso administrativo necessário.');
}
function userView(row) {return {id:row.id,nome:row.nome,email:row.email,cargo:row.cargo,isAdmin:row.is_admin,ativo:row.ativo,status:row.status,version:row.version};}
async function validateMemberships(tx,memberships) {
  if(!Array.isArray(memberships)||memberships.length>100) throw invalid('Vínculos inválidos.');
  const seen=new Set();
  for(const item of memberships) {
    assertId(item.obraId);
    if(seen.has(item.obraId)||typeof item.perfil!=='string') throw invalid('Vínculos inválidos.');
    seen.add(item.obraId);
    const exists=(await tx.query('SELECT id FROM app.profiles WHERE id=$1',[item.perfil])).rows[0];
    const work=(await tx.query('SELECT id FROM app.obras WHERE id=$1',[item.obraId])).rows[0];
    if(!exists||!work) throw invalid('Obra ou perfil inválido.');
  }
}
export async function updateUserAccess(db,actor,userId,input) {
  requireAdmin(actor);assertId(userId);
  if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['nome','cargo','isAdmin','ativo','memberships','expectedVersion'].includes(k))) throw invalid('Campos de usuário inválidos.');
  return db.transaction(async tx=>{
    await guardAdmin(tx,actor);
    const row=(await tx.query('SELECT * FROM app.users WHERE id=$1 FOR UPDATE',[userId])).rows[0];
    if(!row) throw new HttpError(404,'NOT_FOUND','Usuário não encontrado.');
    if(input.expectedVersion!==undefined&&input.expectedVersion!==row.version) throw new HttpError(409,'VERSION_CONFLICT','O cadastro foi alterado.',{current:userView(row)});
    if(input.memberships!==undefined) await validateMemberships(tx,input.memberships);
    for(const key of ['ativo','isAdmin']) if(input[key]!==undefined&&typeof input[key]!=='boolean') throw invalid('Situação inválida.');
    for(const key of ['nome','cargo']) if(input[key]!==undefined&&(typeof input[key]!=='string'||input[key].length>200||!input[key].trim()&&key==='nome')) throw invalid('Nome ou cargo inválido.');
    const next={...row,nome:input.nome??row.nome,cargo:input.cargo??row.cargo,is_admin:input.isAdmin??row.is_admin,ativo:input.ativo??row.ativo};
    if(row.is_admin&&row.ativo&&(!next.is_admin||!next.ativo)) {
      const count=(await tx.query("SELECT count(*)::int AS n FROM app.users WHERE is_admin AND ativo AND status='active'")).rows[0].n;
      if(count<=1) throw new HttpError(409,'LAST_ADMIN','Mantenha pelo menos um administrador ativo.');
    }
    const status=!next.ativo?'blocked':row.status==='blocked'?'pending':row.status;
    const updated=(await tx.query('UPDATE app.users SET nome=$1,cargo=$2,is_admin=$3,ativo=$4,status=$5,version=version+1,updated_at=now() WHERE id=$6 RETURNING *',[next.nome,next.cargo,next.is_admin,next.ativo,status,userId])).rows[0];
    if(input.memberships!==undefined) {
      await tx.query('DELETE FROM app.memberships WHERE user_id=$1',[userId]);
      for(const item of input.memberships) await tx.query('INSERT INTO app.memberships(user_id,obra_id,perfil) VALUES($1,$2,$3)',[userId,item.obraId,item.perfil]);
    }
    if(!next.ativo) await tx.query('DELETE FROM app.sessions WHERE user_id=$1',[userId]);
    await audit(tx,actor,'user',userId,'access_updated');
    return userView(updated);
  });
}
export const deactivateUser=(db,actor,userId)=>updateUserAccess(db,actor,userId,{ativo:false});
export async function inviteUser(db,actor,input,{send=false,authProvider,config}={}) {
  requireAdmin(actor);
  if(typeof input.email!=='string'||input.email.length>254||!/^\S+@\S+\.\S+$/.test(input.email.trim())||typeof input.nome!=='string'||!input.nome.trim()||input.nome.length>200) throw invalid('Nome e e-mail válidos são necessários.');
  const email=input.email.trim().toLowerCase();
  const row=await db.transaction(async tx=>{
    await guardAdmin(tx,actor);
    const existing=(await tx.query('SELECT * FROM app.users WHERE email=$1',[email])).rows[0];
    if(existing) return existing;
    await validateMemberships(tx,input.memberships||[]);
    const user=(await tx.query("INSERT INTO app.users(id,email,nome,cargo,is_admin,status) VALUES($1,$2,$3,$4,$5,'pending') RETURNING *",[randomUUID(),email,input.nome,input.cargo||'',input.isAdmin===true])).rows[0];
    for(const item of input.memberships||[]) await tx.query('INSERT INTO app.memberships(user_id,obra_id,perfil) VALUES($1,$2,$3)',[user.id,item.obraId,item.perfil]);
    await audit(tx,actor,'user',user.id,'invitation_prepared');return user;
  });
  if(send) {
    try {
      const identity=await authProvider.invite({email,nome:row.nome,redirectTo:config.origin+'/definir-senha'});
      await db.query('UPDATE app.users SET auth_user_id=$1 WHERE id=$2 AND (auth_user_id IS NULL OR auth_user_id=$1)',[identity.id,row.id]);
      await audit(db,actor,'user',row.id,'invitation_sent');
    } catch {throw new HttpError(502,'INVITE_FAILED','Convite pendente. Confira o serviço de e-mail antes de tentar novamente.');}
  }
  return userView(row);
}
export async function adminHandler(request,response,context) {
  const {url,db,actor,authProvider,config}=context,path=url.pathname;
  if(!path.startsWith('/api/admin/')) return false;
  requireAdmin(actor);
  if(path==='/api/admin/users') {
    if(request.method==='GET') {
      const users=(await db.query('SELECT * FROM app.users ORDER BY nome')).rows.map(userView),memberships=(await db.query('SELECT user_id AS "userId",obra_id AS "obraId",perfil FROM app.memberships')).rows;
      sendJson(response,200,{users,memberships,profiles:(await db.query('SELECT * FROM app.profiles ORDER BY id')).rows});return true;
    }
    if(request.method==='POST') {const input=await readJson(request);sendJson(response,201,await inviteUser(db,actor,input,{send:input.send===true,authProvider,config}));return true;}
  }
  const user=path.match(/^\/api\/admin\/users\/([^/]+)(\/memberships)?$/);
  if(user&&((!user[2]&&request.method==='PATCH')||(user[2]&&request.method==='PUT'))) {
    sendJson(response,200,await updateUserAccess(db,actor,user[1],await readJson(request)));return true;
  }
  const profile=path.match(/^\/api\/admin\/profiles\/([^/]+)$/);
  if(profile&&request.method==='GET') {
    const row=(await db.query('SELECT * FROM app.profiles WHERE id=$1',[profile[1]])).rows[0];
    if(!row) throw new HttpError(404,'NOT_FOUND','Perfil não encontrado.');
    sendJson(response,200,row);return true;
  }
  if(profile&&request.method==='PUT') {
    if(profile[1]==='gerencia') throw new HttpError(403,'PROTECTED_PROFILE','O perfil administrativo é protegido.');
    const input=await readJson(request);
    if(!Array.isArray(input.tabs)||!Array.isArray(input.editableTabs)||input.tabs.some(t=>!MODULES.includes(t)||['administracao','multiobra'].includes(t))||input.editableTabs.some(t=>!input.tabs.includes(t))||typeof input.label!=='string'||!input.label.trim()) throw invalid('Permissões inválidas.');
    const result=await db.transaction(async tx=>{
      await guardAdmin(tx,actor);
      const row=(await tx.query('UPDATE app.profiles SET label=$1,tabs=$2,editable_tabs=$3,can_delete_history=$4,version=version+1 WHERE id=$5 AND version=$6 RETURNING *',[input.label,JSON.stringify(input.tabs),JSON.stringify(input.editableTabs),input.canDeleteHistory===true,profile[1],input.expectedVersion])).rows[0];
      if(!row) throw new HttpError(409,'VERSION_CONFLICT','O perfil foi alterado.');
      await audit(tx,actor,'profile',profile[1],'updated');return row;
    });sendJson(response,200,result);return true;
  }
  return false;
}
