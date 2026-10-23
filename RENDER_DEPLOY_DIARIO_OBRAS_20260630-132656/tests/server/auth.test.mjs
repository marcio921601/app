import test from 'node:test';
import assert from 'node:assert/strict';
import {createTestRuntime,login} from '../helpers/identity.mjs';

test('tentativas simultâneas reservam o limite antes de chamar o provedor',async()=>{
  const r=await createTestRuntime();try{
    const u=await r.addUser();let calls=0;
    r.provider.signIn=async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,75));throw new Error('invalid');};
    const results=await Promise.all(Array.from({length:12},()=>r.request('POST','/api/auth/login',{body:{email:u.email,password:'errada'}})));
    assert.equal(calls,5);assert.equal(results.filter(x=>x.status===429).length,7);
  }finally{await r.close();}
});

test('login não devolve tokens do provedor e os criptografa no banco',async()=>{
  const r=await createTestRuntime({production:true});
  try {
    const user=await r.addUser(); const result=await login(r,user);
    assert.equal(result.status,200);
    assert.equal(result.body.user.id,user.id);
    assert.equal(result.body.access_token,undefined);
    assert.equal(result.body.refresh_token,undefined);
    assert.match(result.headers.get('set-cookie'),/HttpOnly/);
    assert.match(result.headers.get('set-cookie'),/Secure/);
    assert.match(result.headers.get('set-cookie'),/SameSite=Lax/);
    const stored=(await r.db.query('SELECT hash,tokens_encrypted FROM app.sessions')).rows[0];
    assert.doesNotMatch(stored.tokens_encrypted,/refresh-|access-/);
    assert.ok(!result.cookie.includes(stored.hash));
    const me=await r.request('GET','/api/session',{cookie:result.cookie});
    assert.equal(me.status,200); assert.equal(me.body.user.id,user.id);
  } finally {await r.close();}
});
test('logout bloqueia cookie anterior mesmo se houver token válido',async()=>{
  const r=await createTestRuntime();
  try {
    const result=await login(r,await r.addUser());
    assert.equal((await r.request('POST','/api/auth/logout',{cookie:result.cookie,csrfToken:result.csrfToken,body:{}})).status,200);
    assert.equal((await r.request('GET','/api/session',{cookie:result.cookie})).status,401);
  } finally {await r.close();}
});
test('sessão expira após 12 horas sem atividade',async()=>{
  const r=await createTestRuntime();
  try {const s=await login(r,await r.addUser());r.advance(12*3600*1000+1);assert.equal((await r.request('GET','/api/session',{cookie:s.cookie})).status,401);}
  finally {await r.close();}
});
test('sessão expira em sete dias mesmo se prazo ocioso estiver estendido',async()=>{
  const r=await createTestRuntime();
  try {
    const s=await login(r,await r.addUser());
    await r.db.query('UPDATE app.sessions SET expires_at=$1',[new Date(r.clock()+8*86400*1000)]);
    r.advance(7*86400*1000+1);
    assert.equal((await r.request('GET','/api/session',{cookie:s.cookie})).status,401);
  } finally {await r.close();}
});
test('conta bloqueada perde acesso imediatamente',async()=>{
  const r=await createTestRuntime();
  try {
    const u=await r.addUser();const s=await login(r,u);
    await r.db.query('UPDATE app.users SET ativo=false WHERE id=$1',[u.id]);
    assert.equal((await r.request('GET','/api/session',{cookie:s.cookie})).status,401);
  } finally {await r.close();}
});
test('logout exige origem e proteção CSRF',async()=>{
  const r=await createTestRuntime();
  try {
    const s=await login(r,await r.addUser());
    assert.equal((await r.request('POST','/api/auth/logout',{cookie:s.cookie,body:{}})).status,403);
    assert.equal((await r.request('POST','/api/auth/logout',{cookie:s.cookie,csrfToken:s.csrfToken,origin:'https://evil.invalid',body:{}})).status,403);
    assert.equal((await r.request('GET','/api/session',{cookie:s.cookie})).status,200);
  } finally {await r.close();}
});
test('login de origem externa é recusado',async()=>{
  const r=await createTestRuntime();
  try {const u=await r.addUser();assert.equal((await r.request('POST','/api/auth/login',{origin:'https://evil.invalid',body:{email:u.email,password:u.identity.password}})).status,403);}
  finally {await r.close();}
});
test('logins e renovações paralelos mantêm pessoas separadas',async()=>{
  const r=await createTestRuntime();
  try {
    const a=await r.addUser({email:'a@example.invalid'}),b=await r.addUser({email:'b@example.invalid'});
    const [sa,sb]=await Promise.all([login(r,a),login(r,b)]);
    assert.equal(sa.status,200);assert.equal(sb.status,200);assert.notEqual(sa.cookie,sb.cookie);
    r.advance(3570*1000);
    const results=await Promise.all([r.request('GET','/api/session',{cookie:sa.cookie}),r.request('GET','/api/session',{cookie:sa.cookie}),r.request('GET','/api/session',{cookie:sb.cookie})]);
    assert.deepEqual(results.map(item=>item.status),[200,200,200]);
    assert.deepEqual(results.map(item=>item.body.user.id),[a.id,a.id,b.id]);
  } finally {await r.close();}
});
test('tentativas de senha incorreta são limitadas',async()=>{
  const r=await createTestRuntime();
  try {
    const u=await r.addUser();
    for(let i=0;i<5;i++) assert.equal((await r.request('POST','/api/auth/login',{body:{email:u.email,password:'errada'}})).status,401);
    assert.equal((await r.request('POST','/api/auth/login',{body:{email:u.email,password:'errada'}})).status,429);
  } finally {await r.close();}
});
test('token de recuperação é de uso único e sessão de configuração não acessa dados',async()=>{
  const r=await createTestRuntime();
  try {
    const u=await r.addUser(); const token=r.provider.emailToken(u.identity);
    const link='/api/auth/confirm?type=recovery&token_hash='+token;
    const first=await r.request('GET',link);
    assert.equal(first.status,303);
    assert.equal(first.headers.get('location'),'/definir-senha');
    const session=await r.request('GET','/api/session',{cookie:first.cookie});
    assert.equal(session.status,200);assert.equal(session.body.setupRequired,true);
    assert.equal((await r.request('GET','/api/obras',{cookie:first.cookie})).status,403);
    const changed=await r.request('POST','/api/auth/password',{cookie:first.cookie,csrfToken:session.body.csrfToken,body:{password:'Nova senha forte para teste 123!'}});
    assert.equal(changed.status,200);
    assert.equal((await r.request('GET',link)).status,400);
    assert.equal((await r.request('GET','/api/session',{cookie:changed.cookie})).body.setupRequired,false);
  } finally {await r.close();}
});
test('callback de autenticação recusa redirecionamento externo',async()=>{
  const r=await createTestRuntime();
  try {assert.equal((await r.request('GET','/api/auth/confirm?type=recovery&token_hash=bad&next=https://evil.invalid')).status,400);}
  finally {await r.close();}
});
test('cookie adulterado é recusado e falha de revogação externa não restaura sessão',async()=>{
  const r=await createTestRuntime();
  try {
    const s=await login(r,await r.addUser());
    assert.equal((await r.request('GET','/api/session',{cookie:s.cookie.slice(0,-1)+'!'})).status,401);
    r.provider.revoke=async()=>{throw new Error('provider unavailable');};
    assert.equal((await r.request('POST','/api/auth/logout',{cookie:s.cookie,csrfToken:s.csrfToken,body:{}})).status,200);
    assert.equal((await r.request('GET','/api/session',{cookie:s.cookie})).status,401);
  } finally {await r.close();}
});
test('recuperação tem resposta genérica e limite por endereço',async()=>{
  const r=await createTestRuntime();
  try {
    const input={body:{email:'ausente@example.invalid'}};
    for(let i=0;i<3;i++) assert.equal((await r.request('POST','/api/auth/recover',input)).status,200);
    assert.equal((await r.request('POST','/api/auth/recover',input)).status,429);
  } finally {await r.close();}
});
