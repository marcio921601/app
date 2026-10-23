import {createHash} from 'node:crypto';
import {HttpError,readJson,sendJson} from '../http.mjs';
import {checkOrigin,checkCsrf,createSession,endSession,sessionCookie} from './sessions.mjs';
const unauthorized=()=>new HttpError(401,'INVALID_CREDENTIALS','E-mail ou senha inválidos, ou conta indisponível.');
function emailFrom(body) {
  if(typeof body.email!=='string'||body.email.length>254||!/^\S+@\S+\.\S+$/.test(body.email.trim())) throw new HttpError(400,'INVALID_INPUT','Informe um e-mail válido.');
  return body.email.trim().toLowerCase();
}
async function reserveLimits(db,rules,clock) {
  return db.transaction(async tx=>{
    const reservations=[];
    // Same key order in every request prevents deadlocks across shared IPs.
    for(const {key,max,windowMs} of rules.map(r=>({...r,key:createHash('sha256').update(r.key).digest('hex')})).sort((a,b)=>a.key.localeCompare(b.key))) {
      const row=(await tx.query('INSERT INTO app.auth_limits(key,count,started_at) VALUES($1,1,$2) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN app.auth_limits.started_at<$3 THEN 1 ELSE app.auth_limits.count+1 END,started_at=CASE WHEN app.auth_limits.started_at<$3 THEN $2 ELSE app.auth_limits.started_at END RETURNING count,started_at',[key,new Date(clock()),new Date(clock()-windowMs)])).rows[0];
      if(row.count>max)throw new HttpError(429,'RATE_LIMITED','Muitas tentativas. Tente novamente mais tarde.');
      reservations.push({key,startedAt:row.started_at});
    }
    return reservations;
  });
}
async function releaseLimits(db,reservations) {
  await db.transaction(async tx=>{
    for(const {key,startedAt} of reservations)await tx.query('UPDATE app.auth_limits SET count=GREATEST(0,count-1) WHERE key=$1 AND started_at=$2',[key,startedAt]);
  });
}
export async function publicAuthHandler(request,response,context) {
  const {url,config,db,authProvider,clock}=context,path=url.pathname;
  if(request.method==='POST'&&['/api/auth/login','/api/auth/recover'].includes(path)) {
    checkOrigin(request,config);const body=await readJson(request,16384),email=emailFrom(body),ip=request.socket.remoteAddress||'unknown';
    if(path.endsWith('/recover')) {
      await reserveLimits(db,[{key:'recover:'+email,max:3,windowMs:3600000}],clock);
      const known=(await db.query('SELECT id FROM app.users WHERE email=$1 AND ativo=true',[email])).rows[0];
      if(known) {try {await authProvider.recover(email,config.origin+'/definir-senha');} catch {}}
      sendJson(response,200,{message:'Se a conta estiver habilitada, você receberá instruções no e-mail.'});return true;
    }
    const reservations=await reserveLimits(db,[{key:'ip:'+ip,max:10,windowMs:900000},{key:'pair:'+ip+':'+email,max:5,windowMs:900000}],clock);
    if(typeof body.password!=='string'||body.password.length>512) throw unauthorized();
    try {
      const tokens=await authProvider.signIn({email,password:body.password});
      const session=await createSession(db,tokens,{config,clock});
      await releaseLimits(db,reservations);
      sendJson(response,200,{user:session.user,csrfToken:session.csrfToken,setupRequired:false},{'Set-Cookie':sessionCookie(session.cookieValue,config)});
    } catch {
      throw unauthorized();
    }
    return true;
  }
  if(path==='/api/auth/confirm'&&request.method==='GET') {
    const type=url.searchParams.get('type'),tokenHash=url.searchParams.get('token_hash');
    if(!['invite','recovery'].includes(type)||!tokenHash||tokenHash.length>1024||url.searchParams.has('next')) throw new HttpError(400,'INVALID_LINK','Link inválido ou expirado.');
    let session;
    try {const tokens=await authProvider.verifyEmailToken({type,tokenHash});session=await createSession(db,tokens,{purpose:'setup',config,clock});}
    catch {throw new HttpError(400,'INVALID_LINK','Link inválido ou expirado.');}
    response.writeHead(303,{'Location':'/definir-senha','Set-Cookie':sessionCookie(session.cookieValue,config),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});response.end();return true;
  }
  return false;
}
publicAuthHandler.public=true;
export async function authenticatedAuthHandler(request,response,context) {
  const {url,config,db,clock,session,authProvider,user,csrfToken}=context;
  if(url.pathname==='/api/session'&&request.method==='GET') {sendJson(response,200,{user,csrfToken,setupRequired:session.purpose==='setup'});return true;}
  if(url.pathname==='/api/auth/logout'&&request.method==='POST') {
    checkCsrf(request,context);await endSession(db,session.hash);
    try {await authProvider.revoke(session.tokens);} catch {}
    sendJson(response,200,{ok:true},{'Set-Cookie':sessionCookie('',config,true)});return true;
  }
  if(url.pathname==='/api/auth/password'&&request.method==='POST') {
    checkCsrf(request,context);const body=await readJson(request,16384);
    if(typeof body.password!=='string'||body.password.length<12||body.password.length>512) throw new HttpError(400,'WEAK_PASSWORD','Use uma senha com pelo menos 12 caracteres.');
    try {await authProvider.changePassword(session.tokens,body.password);} catch {throw new HttpError(502,'IDENTITY_UNAVAILABLE','Não foi possível alterar a senha. Tente novamente.');}
    await db.transaction(async tx=>{
      await tx.query("UPDATE app.users SET status='active',updated_at=$1 WHERE id=$2 AND ativo=true AND status IN ('pending','active')",[new Date(clock()),context.actor.id]);
      await tx.query('DELETE FROM app.sessions WHERE user_id=$1',[context.actor.id]);
    });
    const next=await createSession(db,session.tokens,{config,clock});
    sendJson(response,200,{user:next.user,csrfToken:next.csrfToken,setupRequired:false},{'Set-Cookie':sessionCookie(next.cookieValue,config)});return true;
  }
  return false;
}
