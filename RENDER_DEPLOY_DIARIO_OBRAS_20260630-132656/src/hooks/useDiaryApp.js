import {useEffect,useMemo,useState} from 'react';
import {ACCESS_PROFILES,TAB_ITEMS,BANCO_TIPOS_PROFISSIONAIS,createAtividade} from '../data/defaults';
import {backendClient} from '../services/backend';
import {downloadJson,exportProductivity} from '../services/exports';
import {useSharedDiary} from './useSharedDiary';
import {useDiaryDerived} from './useDiaryDerived';
import {emptyDiary,localWorkDate,calculateDiary} from '../../shared/diary.mjs';
const strip=row=>Object.fromEntries(Object.entries(row).filter(([k])=>!['id','obraId','version','created_at','updated_at'].includes(k)));
const defaultFilters={obra:'todas',frente:'todas',equipe:'todas',de:'',ate:''};
export function useDiaryApp(session) {
  const [obras,setObras]=useState([]),[obraId,setObraId]=useState(''),[date,setDate]=useState(localWorkDate),[history,setHistory]=useState([]);
  const [activeTab,setActiveTab]=useState('diario'),[activeDiaryTab,setActiveDiaryTab]=useState('presenca'),[budgetSearch,setBudgetSearch]=useState(''),[dashboardFilters,setDashboardFilters]=useState(defaultFilters);
  const [adminData,setAdminData]=useState({users:[],memberships:[],profiles:[]}),[historySelection,setHistorySelection]=useState('');
  const [statusMessage,setStatusMessage]=useState('Dados compartilhados da equipe.'),[error,setError]=useState(null),[loading,setLoading]=useState(true),[drafts,setDrafts]=useState({}),[preview,setPreview]=useState(''),[budgetPreview,setBudgetPreview]=useState(null);
  const shared=useSharedDiary({session,obraId,date});
  const run=async action=>{try{setError(null);return await action();}catch(e){setError(e);setStatusMessage('Não foi possível concluir a operação.');return null;}};
  async function refreshObras() {
    const value=await backendClient.request('/api/obras');setObras(value.obras);
    setObraId(current=>value.obras.some(o=>o.id===current)?current:value.obras[0]?.id||'');
  }
  async function refreshHistory() {setHistory((await backendClient.request('/api/historico')).rows);}
  async function refreshAdmin() {if(session.user.isAdmin)setAdminData(await backendClient.request('/api/admin/users'));}
  useEffect(()=>{refreshAdmin().catch(e=>setError(e));},[session.user.id]);
  useEffect(()=>{let live=true;setLoading(true);Promise.all([refreshObras(),refreshHistory()]).catch(e=>{if(live)setError(e);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[session.user.id]);
  useEffect(()=>{
    const refresh=()=>{if(document.visibilityState==='visible')refreshHistory().catch(e=>setError(e));};
    window.addEventListener('diary-saved',refresh);window.addEventListener('focus',refresh);
    const timer=setInterval(refresh,15000);
    return()=>{clearInterval(timer);window.removeEventListener('diary-saved',refresh);window.removeEventListener('focus',refresh);};
  },[session.user.id]);
  const workspace=shared.workspace?.obra.id===obraId?shared.workspace:null;
  const profiles=adminData.profiles.length?adminData.profiles.map(p=>({id:p.id,label:p.label,tabs:p.tabs,editableTabs:p.editable_tabs,dashboardWidgets:p.dashboard_widgets,canDeleteHistory:p.can_delete_history,isAdmin:p.id==='gerencia',version:p.version})):Object.values(ACCESS_PROFILES);
  const rawAccess=session.user.isAdmin?ACCESS_PROFILES.gerencia:workspace?{...workspace.access,id:workspace.access.perfil,label:workspace.access.label||ACCESS_PROFILES[workspace.access.perfil]?.label||workspace.access.perfil}: {tabs:[],editableTabs:[],dashboardWidgets:[],label:'Sem obra',id:''};
  const currentAccess=preview&&session.user.isAdmin?profiles.find(p=>p.id===preview)||rawAccess:rawAccess;
  const access={currentUser:{...session.user,perfil:rawAccess.id},actualAccess:rawAccess,currentAccess,isPreviewing:!!preview,
    accessProfiles:profiles,visibleTabs:TAB_ITEMS.filter(tab=>currentAccess.tabs.includes(tab.value)),
    canEditTab:tab=>currentAccess.editableTabs.includes(tab),canDeleteHistory:!!currentAccess.canDeleteHistory};
  useEffect(()=>{if(!access.visibleTabs.some(t=>t.value===activeTab))setActiveTab(access.visibleTabs[0]?.value||'');},[activeTab,currentAccess]);
  const rowWithDraft=(kind,row)=>({...row,...drafts[kind+':'+row.id]});
  const allRows=(kind,rows)=>[...rows.map(r=>rowWithDraft(kind,r)),...Object.values(drafts).filter(r=>r._kind===kind&&r.version===0&&r.obraId===obraId)].map(({_kind,...row})=>row);
  const initial=emptyDiary(date,workspace?.obra.nome||'');
  const data={...initial,...(workspace?shared.payload:{}),gerencial:{...initial.gerencial,...shared.payload.gerencial},_confirmedSummary:shared.saveState==='saved'?shared.diary?.summary:null,
    funcionarios:[],servicos:[],updatedAt:shared.diary?.updatedAt,
    multiobra:{obraAtivaId:obraId,obras:[...obras.map(r=>rowWithDraft('obra',r)),...Object.values(drafts).filter(r=>r._kind==='obra'&&r.version===0)]},
    cadastros:{profissionais:allRows('profissionais',workspace?.profissionais||[]),afastamentos:allRows('afastamentos',workspace?.afastamentos||[])},
    orcamento:allRows('orcamento',workspace?.orcamento||[]),
    administracao:{usuarios:adminData.users,perfis:profiles,memberships:adminData.memberships,cargos:BANCO_TIPOS_PROFISSIONAIS},
    historico:history.map(row=>{
      const payload={...emptyDiary(row.data),...row.payload};
      const calc=calculateDiary(payload,{obra:{},profissionais:workspace?.profissionais||[],afastamentos:[],orcamento:workspace?.orcamento||[]});
      return {...payload,...row,servicos:row.summary.atividades||calc.atividades,resumo:{...row.summary,valorRealizado:row.summary.totalRealizadoEstimado},createdAt:row.updatedAt};
    })};
  const derived=useDiaryDerived(data,budgetSearch,dashboardFilters);
  const permitted=module=>{if(currentAccess.editableTabs.includes(module))return true;setStatusMessage('Seu perfil pode apenas consultar este módulo.');return false;};
  const edit=(changes,module='diario')=>{if(workspace&&permitted(module))shared.edit(changes);};
  const changeActivity=(index,changes,module)=>edit({atividades:data.atividades.map((a,i)=>i===index?{...a,...changes}:a)},module);
  const toggle=(list,id)=>list.includes(id)?list.filter(v=>v!==id):[...list,id];
  function draft(kind,row,field,value) {setDrafts(d=>({...d,[kind+':'+row.id]:{...row,...d[kind+':'+row.id],[field]:value}}));setStatusMessage('Cadastro alterado. Use Salvar na linha.');}
  function add(kind,defaults) {
    const id=crypto.randomUUID();setDrafts(d=>({...d,[kind+':'+id]:{id,obraId,version:0,_kind:kind,...defaults}}));
    setStatusMessage('Preencha os campos e use Salvar na linha.');
  }
  async function saveMaster(kind,id) {
    if(!permitted(kind==='obra'?'multiobra':kind==='orcamento'?'orcamento':'cadastros'))return;
    const source=kind==='obra'?data.multiobra.obras:kind==='orcamento'?data.orcamento:data.cadastros[kind],row=source.find(r=>r.id===id);
    if(!row) return;
    await run(async()=>{
      const path=kind==='obra'?'/api/obras':'/api/obras/'+obraId+'/'+kind;
      const changes=strip(row);delete changes._kind;delete changes.archived;
      const result=await backendClient.request(path+(row.version?'/'+id:''),{method:row.version?'PATCH':'POST',body:{expectedVersion:row.version,changes}});
      setDrafts(d=>{const next={...d};delete next[kind+':'+id];return next;});
      await refreshObras();await shared.refreshWorkspace();setStatusMessage('Cadastro salvo no servidor.');return result;
    });
  }
  async function removeMaster(kind,id) {
    if(!permitted(kind==='obra'?'multiobra':kind==='orcamento'?'orcamento':'cadastros'))return;
    const source=kind==='obra'?data.multiobra.obras:kind==='orcamento'?data.orcamento:data.cadastros[kind],row=source.find(r=>r.id===id);
    if(!row)return;if(!window.confirm(kind==='profissionais'||kind==='obra'?'Arquivar este cadastro?':'Excluir este cadastro?'))return;
    if(!row.version){setDrafts(d=>{const next={...d};delete next[kind+':'+id];return next;});return;}
    await run(async()=>{
      if(kind==='obra') await backendClient.request('/api/obras/'+id,{method:'PATCH',body:{expectedVersion:row.version,changes:{archived:true}}});
      else await backendClient.request('/api/obras/'+obraId+'/'+kind+'/'+id,{method:'DELETE',body:{expectedVersion:row.version}});
      await refreshObras();await shared.refreshWorkspace();setStatusMessage('Cadastro atualizado no servidor.');
    });
  }
  const saveNow=()=>run(()=>shared.save());
  const saveCurrentToHistory=()=>run(async()=>{const result=await shared.save(undefined,{register:true});await refreshHistory();return result;});
  const actions={
    setActiveTab,setActiveDiaryTab,setBudgetSearch,setDashboardFilters,resetDashboardFilters:()=>setDashboardFilters(defaultFilters),
    selectObraAtiva:id=>{if(Object.keys(drafts).length&&!window.confirm('Há cadastros sem salvar. Deseja descartá-los para trocar de obra?'))return;setObraId(id);setDrafts({});},updateCabecalho:(field,value)=>field==='data'?setDate(value):field!=='obra'&&edit({cabecalho:{...data.cabecalho,[field]:value}}),
    updateField:(field,value)=>edit({[field]:value}),updateGerencial:(field,value)=>edit({gerencial:{...data.gerencial,[field]:value}},'gerencial'),
    togglePresenca:id=>{const presencas=toggle(data.presencas,id);edit({presencas,atividades:data.atividades.map(a=>({...a,alocados:a.alocados.filter(p=>presencas.includes(p))}))});},
    updateAtividade:(i,field,value)=>changeActivity(i,{[field]:['quantidadeProduzida','percentualExecutado'].includes(field)?value===''&&field==='percentualExecutado'?'':Number(value):value},['quantidadeProduzida','percentualExecutado'].includes(field)?'produtividade':'diario'),
    addAtividade:()=>edit({atividades:[...data.atividades,createAtividade()]}),removeAtividade:i=>edit({atividades:data.atividades.filter((_,j)=>i!==j)}),
    toggleAtividadeAlocado:(i,id)=>changeActivity(i,{alocados:toggle(data.atividades[i].alocados,id)}),
    selectBudgetNivel3ForAtividade:(i,ref)=>changeActivity(i,{orcamentoNivel3Ref:ref,orcamentoRef:'',tarefa:data.orcamento.find(r=>r.referencia===ref)?.descricao||''}),
    selectBudgetForAtividade:(i,ref)=>changeActivity(i,{orcamentoRef:ref,unidade:data.orcamento.find(r=>r.referencia===ref)?.unidade||'un'}),
    addObra:()=>add('obra',{codigo:'',nome:'',cliente:'',local:'',responsavel:'',prazo:''}),
    updateObra:(i,k,v)=>draft('obra',data.multiobra.obras[i],k,v),saveObra:id=>saveMaster('obra',id),removeObra:i=>removeMaster('obra',data.multiobra.obras[i].id),
    addProfissional:()=>add('profissionais',{nome:'',matricula:'',funcao:'',custoHora:0,ativo:true,observacoes:''}),
    updateProfissional:(id,k,v)=>draft('profissionais',data.cadastros.profissionais.find(r=>r.id===id),k,k==='custoHora'?Number(v):v),saveProfissional:id=>saveMaster('profissionais',id),removeProfissional:id=>removeMaster('profissionais',id),
    addAfastamento:()=>add('afastamentos',{profissionalId:data.cadastros.profissionais[0]?.id||'',tipo:'ausencia',inicio:date,fim:date,motivo:'',autorizadoPor:''}),
    updateAfastamento:(id,k,v)=>draft('afastamentos',data.cadastros.afastamentos.find(r=>r.id===id),k,v),saveAfastamento:id=>saveMaster('afastamentos',id),removeAfastamento:id=>removeMaster('afastamentos',id),
    addItemOrcamento:()=>add('orcamento',{nivel:4,referencia:'',descricao:'',qtdeOrcada:0,unidade:'un',precoTotal:0,bdi:0}),
    updateOrcamento:(i,k,v)=>draft('orcamento',data.orcamento[i],k,['nivel','qtdeOrcada','precoTotal','bdi'].includes(k)?Number(v):v),saveItemOrcamento:id=>saveMaster('orcamento',id),
    removeItemOrcamento:i=>removeMaster('orcamento',data.orcamento[i].id),removeItensOrcamento:async indices=>{for(const i of indices)await removeMaster('orcamento',data.orcamento[i].id);},
    importBudgetFile:async event=>{const file=event.target.files[0];event.target.value='';if(!file)return;await run(async()=>{const checked=await backendClient.request('/api/obras/'+obraId+'/orcamento/preview',{method:'POST',body:file});setBudgetPreview({...checked,file,obraId});});},
    confirmBudgetImport:()=>run(async()=>{const value=budgetPreview;await backendClient.request('/api/obras/'+value.obraId+'/orcamento/import?expectedVersion='+value.version+'&hash='+value.hash,{method:'POST',body:value.file});setBudgetPreview(null);await shared.refreshWorkspace();setStatusMessage('Orçamento importado no servidor.');}),
    cancelBudgetImport:()=>setBudgetPreview(null),
    saveNow,saveCurrentToHistory,
    loadFromHistory:id=>{const row=history.find(r=>r.id===id);if(row){setHistorySelection(id);setObraId(row.obraId);setDate(row.data);setActiveTab(currentAccess.tabs.includes('diario')?'diario':'historico');}},
    deleteFromHistory:id=>run(async()=>{const row=history.find(r=>r.id===id),reason=window.prompt('Motivo da exclusão:');if(!reason)return;await backendClient.request('/api/diarios/'+id,{method:'DELETE',body:{reason,expectedVersion:row.version}});await refreshHistory();}),
    setVisualizarComoPerfil:setPreview,printReport:()=>window.print(),exportJson:()=>downloadJson({...data,administracao:undefined},'diario-autorizado.json'),
    previewProfile:setPreview,
    inviteUser:input=>run(async()=>{if(!permitted('administracao'))return;try{return await backendClient.request('/api/admin/users',{method:'POST',body:input});}finally{await refreshAdmin();}}),
    updateMemberships:(userId,memberships,expectedVersion)=>run(async()=>{if(!permitted('administracao'))return;await backendClient.request('/api/admin/users/'+userId+'/memberships',{method:'PUT',body:{memberships,expectedVersion}});await refreshAdmin();await shared.refreshWorkspace();setStatusMessage('Acessos atualizados.');return true;}),
    deactivateUser:(userId,expectedVersion)=>run(async()=>{if(!permitted('administracao'))return;await backendClient.request('/api/admin/users/'+userId,{method:'PATCH',body:{ativo:false,expectedVersion}});await refreshAdmin();return true;}),
    updateProfile:input=>run(async()=>{if(!permitted('administracao'))return;await backendClient.request('/api/admin/profiles/'+input.id,{method:'PUT',body:input});await refreshAdmin();await shared.refreshWorkspace();setStatusMessage('Perfil atualizado.');}),
    exportProdutividadeExcel:()=>exportProductivity(data,derived,access.currentUser,currentAccess,setStatusMessage),
    copyResumoROS:()=>navigator.clipboard.writeText(derived.resumoROS),reload:()=>run(async()=>{await refreshObras();await shared.reload();await refreshHistory();})
  };
  const protectedShared={...shared,hasPending:shared.hasPending||Object.keys(drafts).length>0,pendingExport:()=>({...shared.pendingExport(),cadastrosPendentes:Object.values(drafts)}),clearForUser:()=>{setDrafts({});shared.clearForUser();}};
  return {data,activeTab,activeDiaryTab,budgetSearch,dashboardFilters,statusMessage,error:error||shared.error,loading:loading||shared.loading,saveState:shared.saveState,syncState:'',backendEnabled:true,access,derived,actions,budgetPreview,shared:protectedShared,selectedHistory:data.historico.find(r=>r.id===historySelection)};
}
