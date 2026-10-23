import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError,sendJson,sendError } from './http.mjs';
import {publicAuthHandler,authenticatedAuthHandler} from './auth/http.mjs';
import {requireSession,checkCsrf} from './auth/sessions.mjs';
import {adminHandler} from './admin/users.mjs';
import {obrasHandler} from './obras/http.mjs';
import {diariosHandler} from './diarios/http.mjs';
const defaultDist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
export function createApp({db,config={},authProvider,clock=()=>Date.now(),handlers=[],authenticate}={}) {
  const routes=authProvider?[publicAuthHandler,adminHandler,obrasHandler,diariosHandler,...handlers]:handlers;
  const identify=authenticate||(authProvider?requireSession:null);
  return async(request,response)=>{
    const requestId=randomUUID(); response.setHeader('X-Request-ID',requestId);
    response.setHeader('X-Content-Type-Options','nosniff');
    response.setHeader('Referrer-Policy','same-origin');
    response.setHeader('X-Frame-Options','DENY');
    const started=Date.now();
    try {
      const url=new URL(request.url||'/',config.origin||'http://localhost:3000');
      if(url.pathname==='/api/health') return sendJson(response,200,{status:'ok'});
      if(url.pathname==='/api/ready') {
        try { if(!db) throw new Error(); await db.query('SELECT 1'); return sendJson(response,200,{status:'ready'}); }
        catch { return sendJson(response,503,{status:'unavailable'}); }
      }
      if(url.pathname.startsWith('/api/')) {
        const context={db,config,authProvider,clock,url,requestId,actor:null};
        for(const handler of routes.filter(item=>item.public)) if(await handler(request,response,context)) return;
        if(!identify) throw new HttpError(401,'UNAUTHENTICATED','Entre para continuar.');
        Object.assign(context,await identify(request,context));
        if(authProvider&&await authenticatedAuthHandler(request,response,context)) return;
        if(context.session?.purpose==='setup') throw new HttpError(403,'SETUP_REQUIRED','Defina sua senha para continuar.');
        if(!['GET','HEAD','OPTIONS'].includes(request.method)) checkCsrf(request,context);
        for(const handler of routes.filter(item=>!item.public)) if(await handler(request,response,context)) return;
        throw new HttpError(404,'NOT_FOUND','Recurso não encontrado.');
      }
      if(!['GET','HEAD'].includes(request.method)) throw new HttpError(405,'METHOD_NOT_ALLOWED','Método não permitido.');
      const dist=path.resolve(config.distDir||defaultDist);
      const pathname=decodeURIComponent(url.pathname);
      const candidate=path.resolve(dist,'.'+pathname);
      if(candidate!==dist&&!candidate.startsWith(dist+path.sep)) throw new HttpError(404,'NOT_FOUND','Recurso não encontrado.');
      let target=candidate===dist?path.join(dist,'index.html'):candidate;
      let content;
      try { content=await fs.readFile(target); }
      catch {
        if(path.extname(pathname)) throw new HttpError(404,'NOT_FOUND','Recurso não encontrado.');
        target=path.join(dist,'index.html');
        try { content=await fs.readFile(target); } catch { throw new HttpError(503,'FRONTEND_UNAVAILABLE','Aplicativo em preparação.'); }
      }
      response.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream',
        'Cache-Control':target.endsWith('index.html')?'no-store':'public, max-age=3600'});
      response.end(request.method==='HEAD'?undefined:content);
    } catch(error) {
      if(!response.headersSent) sendError(response,error,requestId);
      else response.end();
    } finally {
      if(config.logRequests) console.log(JSON.stringify({requestId,status:response.statusCode,durationMs:Date.now()-started}));
    }
  };
}
