import {HttpError,readJson,sendJson} from '../http.mjs';
import {getDiary,saveDiary,listHistory,listRevisions,deleteHistory} from './service.mjs';
export async function diariosHandler(request,response,{db,actor,url}) {
  const route=url.pathname.match(/^\/api\/obras\/([^/]+)\/diarios\/([^/]+)$/);
  if(route) {
    const [,obraId,data]=route;
    if(request.method==='GET') {sendJson(response,200,{diary:await getDiary(db,actor,{obraId,data})});return true;}
    if(request.method==='PUT') {
      const body=await readJson(request);
      if(!body||typeof body!=='object'||Object.keys(body).some(k=>!['obraId','data','expectedVersion','mutationId','changes','register','restore'].includes(k))) throw new HttpError(400,'INVALID_INPUT','Alteração inválida.');
      if(body.obraId&&body.obraId!==obraId||body.data&&body.data!==data) throw new HttpError(400,'INVALID_SCOPE','O diário pertence a outra obra ou data.');
      sendJson(response,200,await saveDiary(db,actor,{...body,obraId,data}));return true;
    }
  }
  if(url.pathname==='/api/historico'&&request.method==='GET') {
    sendJson(response,200,{rows:await listHistory(db,actor,Object.fromEntries(url.searchParams))});return true;
  }
  const diary=url.pathname.match(/^\/api\/diarios\/([^/]+)(\/revisoes)?$/);
  if(diary&&diary[2]&&request.method==='GET') {sendJson(response,200,{rows:await listRevisions(db,actor,diary[1])});return true;}
  if(diary&&!diary[2]&&request.method==='DELETE') {sendJson(response,200,await deleteHistory(db,actor,diary[1],await readJson(request)));return true;}
  return false;
}
