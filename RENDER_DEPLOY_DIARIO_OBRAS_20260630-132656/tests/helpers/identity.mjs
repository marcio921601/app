import { randomUUID,randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { createTestDb } from './database.mjs';
import { applyMigrations } from '../../server/db/migrate.mjs';
import { createApp } from '../../server/app.mjs';

export function createFakeProvider(clock) {
  const users=new Map(),refreshTokens=new Map(),emailTokens=new Map();
  function issue(user) {
    const refresh_token='refresh-'+randomBytes(20).toString('hex');
    refreshTokens.set(refresh_token,user);
    return {access_token:'access-'+randomBytes(20).toString('hex'),refresh_token,
      expires_at:Math.floor(clock()/1000)+3600,expires_in:3600,token_type:'bearer',
      user:{id:user.id,email:user.email,email_confirmed_at:new Date(clock()).toISOString(),user_metadata:{name:user.nome||'Teste'}}};
  }
  return {
    addUser(input) { const user={id:randomUUID(),password:'Uma senha forte de teste 123!',...input}; users.set(user.email,user); return user; },
    emailToken(user,type='recovery') { const hash=randomBytes(24).toString('hex'); emailTokens.set(hash,{user,type}); return hash; },
    async signIn({email,password}) {
      const user=users.get(email); if(!user||user.password!==password) throw new Error('invalid_credentials');
      return issue(user);
    },
    async refresh(tokens) {
      const user=refreshTokens.get(tokens.refresh_token);
      if(!user) throw new Error('invalid_refresh_token');
      refreshTokens.delete(tokens.refresh_token); return issue(user);
    },
    async verifyEmailToken({tokenHash,type}) {
      const value=emailTokens.get(tokenHash);
      if(!value||value.type!==type) throw new Error('invalid_token');
      emailTokens.delete(tokenHash); return issue(value.user);
    },
    async changePassword(tokens,password) {
      const user=refreshTokens.get(tokens.refresh_token); if(!user) throw new Error('invalid_session'); user.password=password;
    },
    async recover() {},
    async invite({email,nome}) { return this.addUser({email,nome}); },
    async revoke(tokens) { refreshTokens.delete(tokens.refresh_token); }
  };
}
export async function createTestRuntime({production=false,db:injectedDb}={}) {
  let now=Date.parse('2026-10-23T12:00:00Z');
  const clock=()=>now;
  const db=injectedDb||await createTestDb(); await applyMigrations(db);
  const provider=createFakeProvider(clock);
  const config={production,origin:'http://localhost:3000',encryptionKey:Buffer.alloc(32,3),
    idleMs:12*3600*1000,absoluteMs:7*86400*1000};
  const server=createServer(createApp({db,config,authProvider:provider,clock}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  return {db,provider,config,clock,advance:ms=>{now+=ms;},
    async addUser({email='pessoa@example.invalid',nome='Pessoa fictícia',isAdmin=false,status='active'}={}) {
      const identity=provider.addUser({email,nome});
      const user={id:randomUUID(),authUserId:identity.id,email,nome,isAdmin,identity};
      await db.query('INSERT INTO app.users(id,auth_user_id,email,nome,is_admin,status) VALUES($1,$2,$3,$4,$5,$6)',
        [user.id,user.authUserId,email,nome,isAdmin,status]);
      return user;
    },
    async request(method,path,{body,cookie,csrfToken,origin=config.origin,headers={}}={}) {
      const response=await fetch(base+path,{method,redirect:'manual',headers:{
        ...(body!==undefined?{'Content-Type':'application/json'}:{}),
        ...(origin?{Origin:origin}:{}),...(cookie?{Cookie:cookie}:{}),
        ...(csrfToken?{'X-CSRF-Token':csrfToken}:{}),...headers},
        ...(body!==undefined?{body:JSON.stringify(body)}:{})});
      const text=await response.text(); let value;
      try{value=JSON.parse(text);}catch{value=text;}
      return {status:response.status,body:value,headers:response.headers,cookie:response.headers.get('set-cookie')?.split(';')[0]};
    },
    async close() { await new Promise(resolve=>server.close(resolve)); await db.close(); }
  };
}
export async function login(runtime,user) {
  const result=await runtime.request('POST','/api/auth/login',{body:{email:user.email,password:user.identity.password}});
  return {...result,csrfToken:result.body.csrfToken};
}
