import {HttpError,readJson,sendJson} from '../http.mjs';
import {listObras,getWorkspace,writeMasterRecord,previewBudget,importBudget,removeMasterRecord} from './service.mjs';
async function fileBody(request) {
  const parts=[];let size=0;
  for await(const part of request.iterator({destroyOnReturn:false})) {
    size+=part.length;if(size>5*1024*1024) {request.resume();throw new HttpError(413,'FILE_TOO_LARGE','O arquivo deve ter no máximo 5 MiB.');}parts.push(part);
  }
  return Buffer.concat(parts);
}
export async function obrasHandler(request,response,{db,actor,url}) {
  const path=url.pathname;
  if(path==='/api/obras'&&request.method==='GET') {sendJson(response,200,{obras:await listObras(db,actor)});return true;}
  if(path==='/api/obras'&&request.method==='POST') {
    const body=await readJson(request);sendJson(response,201,await writeMasterRecord(db,actor,{kind:'obra',expectedVersion:0,changes:body.changes}));return true;
  }
  const route=path.match(/^\/api\/obras\/([^/]+)(?:\/(workspace|profissionais|afastamentos|orcamento)(?:\/([^/]+))?)?$/);
  if(!route) return false;
  const [,obraId,resource,id]=route;
  if(resource==='workspace'&&request.method==='GET') {sendJson(response,200,await getWorkspace(db,actor,obraId));return true;}
  if(resource==='orcamento'&&['preview','import'].includes(id)&&request.method==='POST') {
    const file=await fileBody(request);
    const result=id==='preview'?await previewBudget(db,actor,obraId,file):await importBudget(db,actor,obraId,file,{expectedVersion:Number(url.searchParams.get('expectedVersion')),hash:url.searchParams.get('hash')});
    sendJson(response,200,result);return true;
  }
  if(resource&&request.method==='GET'&&!id) {
    const workspace=await getWorkspace(db,actor,obraId);
    const module=resource==='orcamento'?'orcamento':'cadastros';
    if(!workspace.access.tabs.includes(module)) throw new HttpError(403,'FORBIDDEN','Seu perfil não permite esta consulta.');
    sendJson(response,200,{rows:workspace[resource]});return true;
  }
  const kind=!resource?'obra':({profissionais:'profissional',afastamentos:'afastamento',orcamento:'itemOrcamento'})[resource];
  if(kind&&['POST','PATCH'].includes(request.method)) {
    const input=await readJson(request);
    sendJson(response,200,await writeMasterRecord(db,actor,{obraId,kind,id:kind==='obra'?obraId:id,expectedVersion:input.expectedVersion,changes:input.changes}));return true;
  }
  if(kind==='profissional'&&id&&request.method==='DELETE') {
    const input=await readJson(request);
    sendJson(response,200,await writeMasterRecord(db,actor,{obraId,kind,id,expectedVersion:input.expectedVersion,changes:{ativo:false}}));return true;
  }
  if(['afastamento','itemOrcamento'].includes(kind)&&id&&request.method==='DELETE') {
    const input=await readJson(request);sendJson(response,200,await removeMasterRecord(db,actor,{obraId,kind,id,expectedVersion:input.expectedVersion}));return true;
  }
  return false;
}
