import { randomUUID } from 'node:crypto';
export class HttpError extends Error {
  constructor(status,code,message,details) { super(message); Object.assign(this,{status,code,details}); }
}
export function sendJson(response,status,payload,headers={}) {
  response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff',...headers});
  response.end(JSON.stringify(payload));
}
export async function readJson(request,limit=2*1024*1024) {
  const contentLength=Number(request.headers['content-length']||0);
  if(contentLength>limit) { request.resume(); throw new HttpError(413,'TOO_LARGE','Conteúdo acima do limite permitido.'); }
  if(!String(request.headers['content-type']||'').startsWith('application/json'))
    throw new HttpError(415,'CONTENT_TYPE','Use o formato JSON.');
  let size=0; const chunks=[];
  for await(const chunk of request.iterator({destroyOnReturn:false})) {
    size+=chunk.length;
    if(size>limit) { request.resume(); throw new HttpError(413,'TOO_LARGE','Conteúdo acima do limite permitido.'); }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}'); }
  catch { throw new HttpError(400,'INVALID_JSON','JSON inválido.'); }
}
export function sendError(response,error,requestId=randomUUID()) {
  const known=error instanceof HttpError;
  sendJson(response,known?error.status:500,{error:{
    code:known?error.code:'INTERNAL_ERROR',
    message:known?error.message:'Não foi possível concluir a operação.',
    requestId,...(known&&error.details?{details:error.details}:{})
  }});
}
