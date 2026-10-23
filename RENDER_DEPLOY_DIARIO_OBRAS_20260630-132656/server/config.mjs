export function loadConfig(env=process.env) {
  const production=env.NODE_ENV==='production';
  const names=['DATABASE_URL','APP_ORIGIN','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','SESSION_ENCRYPTION_KEY'];
  const missing=names.filter(name=>!env[name]);
  if(missing.length) throw new Error('Configuração incompleta: '+missing.join(', '));
  let origin;
  try { origin=new URL(env.APP_ORIGIN); } catch { throw new Error('Configuração inválida: APP_ORIGIN'); }
  if(origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash||
    !['http:','https:'].includes(origin.protocol)||(production&&origin.protocol!=='https:'))
    throw new Error('Configuração inválida: APP_ORIGIN');
  const key=Buffer.from(env.SESSION_ENCRYPTION_KEY,'base64');
  if(key.length!==32) throw new Error('Configuração inválida: SESSION_ENCRYPTION_KEY precisa conter 32 bytes em base64.');
  if(production&&env.DATABASE_SSL==='false') throw new Error('Configuração inválida: TLS do banco é obrigatório.');
  return {
    production,origin:origin.origin,databaseUrl:env.DATABASE_URL,
    migrationDatabaseUrl:env.MIGRATION_DATABASE_URL||env.DATABASE_URL,
    databaseSsl:env.DATABASE_SSL!=='false',databaseCa:env.DATABASE_CA||undefined,
    supabaseUrl:env.SUPABASE_URL,publishableKey:env.SUPABASE_PUBLISHABLE_KEY,
    secretKey:env.SUPABASE_SECRET_KEY,encryptionKey:key,
    host:env.HOST||'0.0.0.0',port:Number(env.PORT||3000),
    idleMs:12*60*60*1000,absoluteMs:7*24*60*60*1000
  };
}
