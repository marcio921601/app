import {randomUUID,createHash} from 'node:crypto';
import {HttpError} from '../http.mjs';
import {getObraAccess,requirePermission,assertId} from '../access/permissions.mjs';
import {getWorkspace} from '../obras/service.mjs';
import {audit} from '../admin/users.mjs';
import {validateDiary,calculateDiary,emptyDiary,validWorkDate,DiaryValidationError} from '../../shared/diary.mjs';
const fields=['cabecalho','presencas','atividades','observacoes','consideracoes','equipamentos','gerencial'];
const invalid=message=>new HttpError(400,'INVALID_INPUT',message);
const json=value=>JSON.stringify(value);
function canonical(value) {if(Array.isArray(value)) return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object') return '{'+Object.keys(value).sort().map(k=>json(k)+':'+canonical(value[k])).join(',')+'}';return json(value);}
function envelope(row) {return {id:row.id,obraId:row.obra_id,data:row.data,status:row.status,version:row.version,updatedAt:new Date(row.updated_at).toISOString(),updatedBy:row.updated_by,deletedAt:row.deleted_at?new Date(row.deleted_at).toISOString():null,payload:row.payload,summary:row.summary};}
function project(value,access) {
  if(!value) return null;
  const result=structuredClone(value);
  if(!access.tabs.includes('gerencial')) delete result.payload.gerencial;
  if(!access.tabs.some(t=>['orcamento','gerencial','dashboard'].includes(t))) {
    delete result.summary.totalRealizadoEstimado;
    for(const activity of result.summary.atividades||[])for(const key of ['valorUnitario','valorExecutado','precoTotalOrcado'])delete activity[key];
  }
  return result;
}
function canRead(access) {if(!access.tabs.some(t=>['diario','produtividade','historico','dashboard'].includes(t))) throw new HttpError(403,'FORBIDDEN','Seu perfil não permite consultar diários.');}
function checkDate(data) {if(!validWorkDate(data)) throw invalid('Data inválida.');}
function conflict(current,access) {return new HttpError(409,'VERSION_CONFLICT','Existe uma versão mais recente. Compare antes de reaplicar.',{current:project(current,access)});}
export async function getDiary(db,actor,{obraId,data}) {
  checkDate(data);const access=await getObraAccess(db,actor,obraId);canRead(access);
  const row=(await db.query('SELECT *,data::text AS data FROM app.diarios WHERE obra_id=$1 AND data=$2 AND deleted_at IS NULL',[obraId,data])).rows[0];
  if(row&&!access.tabs.some(t=>['diario','produtividade'].includes(t))&&row.status!=='registrado') return null;
  return row?project(envelope(row),access):null;
}
function requireChanges(access,old,changes,register) {
  if(register) requirePermission(access,'diario','edit');
  for(const key of Object.keys(changes)) {
    if(key==='gerencial') requirePermission(access,'gerencial','edit');
    else if(key==='atividades') {
      const operational=list=>(list||[]).map(({quantidadeProduzida,percentualExecutado,...rest})=>rest);
      if(json(operational(changes.atividades))!==json(operational(old.atividades))) requirePermission(access,'diario','edit');
      const quantities=list=>(list||[]).map(({id,quantidadeProduzida,percentualExecutado})=>({id,quantidadeProduzida,percentualExecutado}));
      if(json(quantities(changes.atividades))!==json(quantities(old.atividades))) requirePermission(access,'produtividade','edit');
    } else requirePermission(access,'diario','edit');
  }
}
export async function saveDiary(db,actor,{obraId,data,expectedVersion,mutationId,changes,register=false,restore=false}) {
  checkDate(data);assertId(mutationId);
  if(!Number.isInteger(expectedVersion)||expectedVersion<0||typeof register!=='boolean'||typeof restore!=='boolean'||!changes||Array.isArray(changes)||typeof changes!=='object'||Object.keys(changes).some(k=>!fields.includes(k))) throw invalid('Alteração de diário inválida.');
  const access=await getObraAccess(db,actor,obraId);canRead(access);
  if(!access.editableTabs.some(t=>['diario','produtividade','gerencial'].includes(t)))throw new HttpError(403,'FORBIDDEN','Seu perfil não permite gravar diários.');
  if(restore)requirePermission(access,'historico','deleteHistory');
  const inputHash=createHash('sha256').update(canonical({obraId,data,expectedVersion,changes,register,restore})).digest('hex');
  try {return await db.transaction(async tx=>{
    // The work row also serializes creation and master-data changes during validation.
    await tx.query('SELECT id FROM app.obras WHERE id=$1 FOR UPDATE',[obraId]);
    const previous=(await tx.query('SELECT *,data::text AS data FROM app.diarios WHERE obra_id=$1 AND data=$2 FOR UPDATE',[obraId,data])).rows[0];
    const retry=(await tx.query('SELECT * FROM app.diario_revisoes WHERE mutation_id=$1',[mutationId])).rows[0];
    if(retry) {
      if(retry.actor_id!==actor.id||retry.input_hash!==inputHash||retry.diario_id!==previous?.id) throw new HttpError(409,'MUTATION_REUSED','Esta tentativa já foi utilizada para outra alteração.');
      return project(retry.content,access);
    }
    if((previous?.version||0)!==expectedVersion||previous?.deleted_at&&!restore||restore&&!previous?.deleted_at) throw conflict(previous?envelope(previous):null,access);
    const workspace=await getWorkspace(tx,actor,obraId,{trusted:true});
    if(workspace.obra.archived) throw new HttpError(409,'ARCHIVED','A obra está arquivada.');
    const old=previous?.payload||emptyDiary(data,workspace.obra.nome);
    requireChanges(access,old,changes,register);
    if(changes.cabecalho?.data&&changes.cabecalho.data!==data) throw invalid('A data pertence ao endereço do diário.');
    let payload;
    try {payload=validateDiary({...old,...changes,cabecalho:{...old.cabecalho,...changes.cabecalho,data},gerencial:{...old.gerencial,...changes.gerencial}},workspace,{register,previousPayload:previous?.payload});}
    catch(error) {if(error instanceof DiaryValidationError) throw new HttpError(400,'INVALID_DIARY',error.message,error.details);throw error;}
    if(previous&&!restore&&canonical(payload)===canonical(old)&&(!register||previous.status==='registrado'))return project(envelope(previous),access);
    let summary;
    if(previous&&canonical(payload.atividades)===canonical(old.atividades)&&canonical(payload.presencas)===canonical(old.presencas))summary=structuredClone(previous.summary);
    else {
      const calculated=calculateDiary(payload,workspace);summary=calculated.summary;
      summary.atividades=calculated.atividades.map(({profissionais,itemOrcado,itemNivel3,...activity})=>({...activity,precoTotalOrcado:itemOrcado?.precoTotal||0}));
    }
    const id=previous?.id||randomUUID(),status=register||previous?.status==='registrado'?'registrado':'rascunho';
    const row=previous?(await tx.query('UPDATE app.diarios SET payload=$1,summary=$2,status=$3,version=version+1,updated_by=$4,updated_at=now(),deleted_at=NULL WHERE id=$5 RETURNING *,data::text AS data',[payload,summary,status,actor.id,id])).rows[0]:
      (await tx.query('INSERT INTO app.diarios(id,obra_id,data,payload,summary,status,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$7) RETURNING *,data::text AS data',[id,obraId,data,payload,summary,status,actor.id])).rows[0];
    const result=envelope(row);
    await tx.query('INSERT INTO app.diario_revisoes(id,diario_id,version,mutation_id,actor_id,input_hash,content) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),id,row.version,mutationId,actor.id,inputHash,result]);
    await audit(tx,actor,'diary',id,restore?'restored':register?'registered':'saved',{version:row.version,obraId,data});
    return project(result,access);
  });} catch(error) {
    if(error.code==='23505') throw new HttpError(409,'VERSION_CONFLICT','O diário ou a tentativa foi alterado. Atualize antes de salvar.');
    throw error;
  }
}
export async function listHistory(db,actor,filters={}) {
  if(filters.obraId) await getObraAccess(db,actor,filters.obraId);
  for(const date of [filters.de,filters.ate].filter(Boolean)) checkDate(date);
  const rows=(await db.query("SELECT d.*,d.data::text AS data FROM app.diarios d WHERE d.deleted_at IS NULL AND d.status='registrado' AND ($1::boolean OR EXISTS(SELECT 1 FROM app.memberships m WHERE m.obra_id=d.obra_id AND m.user_id=$2)) ORDER BY d.data DESC",[actor.isAdmin,actor.id])).rows;
  const result=[];
  for(const row of rows) {
    if(filters.obraId&&row.obra_id!==filters.obraId||filters.de&&row.data<filters.de||filters.ate&&row.data>filters.ate) continue;
    const access=await getObraAccess(db,actor,row.obra_id);
    if(!access.tabs.some(t=>['historico','dashboard'].includes(t))) continue;
    result.push(project(envelope(row),access));
  }
  return result;
}
export async function listRevisions(db,actor,id) {
  assertId(id);
  const diary=(await db.query('SELECT * FROM app.diarios WHERE id=$1',[id])).rows[0];
  if(!diary) throw new HttpError(404,'NOT_FOUND','Diário não encontrado.');
  const access=await getObraAccess(db,actor,diary.obra_id);requirePermission(access,'historico','read');
  return (await db.query('SELECT version,actor_id,created_at,content FROM app.diario_revisoes WHERE diario_id=$1 ORDER BY version DESC',[id])).rows.map(row=>({version:row.version,actorId:row.actor_id,createdAt:row.created_at,content:project(row.content,access)}));
}
export async function deleteHistory(db,actor,id,{reason,expectedVersion}) {
  assertId(id);if(typeof reason!=='string'||!reason.trim()||reason.length>1000) throw invalid('Informe o motivo da exclusão.');
  return db.transaction(async tx=>{
    const row=(await tx.query('SELECT * FROM app.diarios WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!row) throw new HttpError(404,'NOT_FOUND','Diário não encontrado.');
    const access=await getObraAccess(tx,actor,row.obra_id);requirePermission(access,'historico','deleteHistory');
    if(row.version!==expectedVersion) throw conflict(envelope({...row,data:typeof row.data==='string'?row.data.slice(0,10):row.data.toISOString().slice(0,10)}),access);
    await tx.query('UPDATE app.diarios SET deleted_at=now(),updated_at=now(),updated_by=$1,version=version+1 WHERE id=$2',[actor.id,id]);
    await audit(tx,actor,'diary',id,'deleted',{reason,obraId:row.obra_id,version:row.version+1});return {ok:true};
  });
}
