import {randomBytes,createHash,createCipheriv,createDecipheriv,timingSafeEqual} from 'node:crypto';
import {HttpError} from '../http.mjs';
const denied=()=>new HttpError(401,'UNAUTHENTICATED','Entre para continuar.');
export const hashSession=value=>createHash('sha256').update(value).digest('hex');
export const cookieName=config=>config.production?'__Host-itauba_session':'itauba_session';
export function sessionCookie(value,config,clear=false) {
  return cookieName(config)+'='+value+'; Path=/; HttpOnly; SameSite=Lax; Max-Age='+(clear?0:Math.floor(config.absoluteMs/1000))+(config.production?'; Secure':'');
}
export function readCookie(request,config) {
  const value=(request.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName(config)+'='))?.slice(cookieName(config).length+1);
  return value&&/^[\w-]{43}$/.test(value)?value:null;
}
export function encryptTokens(tokens,key) {
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  const data=Buffer.concat([cipher.update(JSON.stringify(tokens),'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64url');
}
function decryptTokens(value,key) {
  const data=Buffer.from(value,'base64url'),decipher=createDecipheriv('aes-256-gcm',key,data.subarray(0,12));
  decipher.setAuthTag(data.subarray(12,28));
  return JSON.parse(Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString('utf8'));
}
export function checkOrigin(request,config) {
  if(request.headers.origin!==config.origin) throw new HttpError(403,'INVALID_ORIGIN','Origem não autorizada.');
}
export function checkCsrf(request,context) {
  checkOrigin(request,context.config);
  const actual=Buffer.from(request.headers['x-csrf-token']||''),expected=Buffer.from(context.csrfToken||'');
  if(actual.length!==expected.length||!expected.length||!timingSafeEqual(actual,expected)) throw new HttpError(403,'INVALID_CSRF','Atualize a sessão antes de continuar.');
}
export function publicUser(row) {return {id:row.id,nome:row.nome,email:row.email,cargo:row.cargo,isAdmin:row.is_admin};}
export async function createSession(db,tokens,{purpose='normal',config,clock=()=>Date.now()}={}) {
  const row=(await db.query('SELECT * FROM app.users WHERE auth_user_id=$1',[tokens.user.id])).rows[0];
  if(!row||!row.ativo||row.status==='blocked'||(purpose==='normal'&&row.status!=='active')) throw denied();
  const cookieValue=randomBytes(32).toString('base64url'),csrfToken=randomBytes(32).toString('base64url'),now=clock();
  await db.query('INSERT INTO app.sessions(hash,user_id,tokens_encrypted,csrf_token,purpose,created_at,last_seen,expires_at,absolute_expires_at) VALUES($1,$2,$3,$4,$5,$6,$6,$7,$8)',
    [hashSession(cookieValue),row.id,encryptTokens(tokens,config.encryptionKey),csrfToken,purpose,new Date(now),new Date(now+config.idleMs),new Date(now+config.absoluteMs)]);
  return {cookieValue,csrfToken,user:publicUser(row),setupRequired:purpose==='setup'};
}
export async function requireSession(request,context) {
  const {db,config,clock,authProvider}=context,value=readCookie(request,config);
  if(!value) throw denied();
  return db.transaction(async tx=>{
    const row=(await tx.query('SELECT s.*,u.auth_user_id,u.nome,u.email,u.cargo,u.is_admin,u.ativo,u.status FROM app.sessions s JOIN app.users u ON u.id=s.user_id WHERE s.hash=$1 FOR UPDATE OF s',[hashSession(value)])).rows[0];
    const now=clock();
    if(!row||!row.ativo||row.status==='blocked'||new Date(row.expires_at).getTime()<=now||new Date(row.absolute_expires_at).getTime()<=now||(row.purpose==='normal'&&row.status!=='active')) throw denied();
    let tokens;
    try {
      tokens=decryptTokens(row.tokens_encrypted,config.encryptionKey);
      if(tokens.expires_at*1000<=now+60000) tokens=await authProvider.refresh(tokens);
      if(tokens.user.id!==row.auth_user_id) throw denied();
    } catch {throw denied();}
    await tx.query('UPDATE app.sessions SET last_seen=$1,expires_at=$2,tokens_encrypted=$3 WHERE hash=$4',
      [new Date(now),new Date(Math.min(now+config.idleMs,new Date(row.absolute_expires_at).getTime())),encryptTokens(tokens,config.encryptionKey),row.hash]);
    return {actor:{id:row.user_id,authUserId:row.auth_user_id,nome:row.nome,isAdmin:row.is_admin},user:publicUser({...row,id:row.user_id}),
      session:{hash:row.hash,purpose:row.purpose,tokens},csrfToken:row.csrf_token};
  });
}
export async function endSession(db,hash) {await db.query('DELETE FROM app.sessions WHERE hash=$1',[hash]);}
