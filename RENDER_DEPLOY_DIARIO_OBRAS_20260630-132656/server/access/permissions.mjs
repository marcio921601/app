import {HttpError} from '../http.mjs';
export const MODULES=['multiobra','cadastros','diario','produtividade','gerencial','dashboard','historico','orcamento','administracao'];
export function requireAdmin(actor) {if(!actor?.isAdmin) throw new HttpError(403,'FORBIDDEN','Acesso administrativo necessário.');}
export function assertId(value) {if(typeof value!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new HttpError(400,'INVALID_ID','Identificador inválido.');return value;}
export async function getObraAccess(db,actor,obraId) {
  assertId(obraId);
  const work=(await db.query('SELECT id FROM app.obras WHERE id=$1',[obraId])).rows[0];
  if(!work) throw new HttpError(404,'NOT_FOUND','Obra não encontrada.');
  if(actor.isAdmin) return {obraId,perfil:'gerencia',tabs:MODULES,editableTabs:MODULES,canDeleteHistory:true,dashboardWidgets:['resumo','evolucao','servicos','orcamento','tabelaOrcamento']};
  const row=(await db.query('SELECT p.* FROM app.memberships m JOIN app.profiles p ON p.id=m.perfil WHERE m.user_id=$1 AND m.obra_id=$2',[actor.id,obraId])).rows[0];
  if(!row) throw new HttpError(404,'NOT_FOUND','Obra não encontrada.');
  return {obraId,perfil:row.id,tabs:row.tabs,editableTabs:row.editable_tabs,canDeleteHistory:row.can_delete_history,dashboardWidgets:row.dashboard_widgets};
}
export function requirePermission(access,module,action='read') {
  const allowed=action==='deleteHistory'?access.canDeleteHistory:(action==='edit'?access.editableTabs:access.tabs)?.includes(module);
  if(!allowed) throw new HttpError(403,'FORBIDDEN','Seu perfil não permite esta operação.');
}
