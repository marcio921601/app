import { createServer } from 'node:http';
import { loadConfig } from './config.mjs';
import { connectDatabase } from './db/connection.mjs';
import { createApp } from './app.mjs';
import { createAuthProvider } from './auth/provider.mjs';
const config=loadConfig();
const db=connectDatabase(config);
await db.query('SELECT 1 FROM app.schema_migrations LIMIT 1');
const server=createServer(createApp({db,config:{...config,logRequests:true},authProvider:createAuthProvider(config)}));
server.requestTimeout=30000;
server.headersTimeout=15000;
server.listen(config.port,config.host,()=>console.log('Servidor Node ativo na porta '+config.port));
async function shutdown() {
  const timer=setTimeout(()=>process.exit(1),10000).unref();
  server.close(async()=>{ await db.close(); clearTimeout(timer); });
}
process.once('SIGTERM',shutdown);
process.once('SIGINT',shutdown);
