import {useEffect,useRef,useState} from 'react';
import {backendClient,ApiError} from '../services/backend';
import {pendingDrafts} from '../services/pendingDrafts';
import {emptyDiary,validWorkDate} from '../../shared/diary.mjs';
const fields=['cabecalho','presencas','atividades','observacoes','consideracoes','equipamentos','gerencial'];
const scopeName=key=>JSON.stringify([key.userId,key.obraId,key.date]);
const copy=value=>structuredClone(value);
function hydrate(diary,date,name='') {const initial=emptyDiary(date,name);return {...initial,...diary?.payload,gerencial:{...initial.gerencial,...diary?.payload?.gerencial}};}
function difference(payload,base,workspace) {
  const changes={};
  for(const key of fields) {
    if(key==='gerencial'&&!workspace?.access.editableTabs.includes('gerencial'))continue;
    if(JSON.stringify(payload[key])!==JSON.stringify(base[key]))changes[key]=copy(payload[key]);
  }
  return changes;
}
export function useSharedDiary({session,obraId,date}) {
  const resources=useRef(new Map()),mounted=useRef(true),paused=useRef(false),active=useRef(''),[,render]=useState(0);
  const key={userId:session.user.id,obraId,date},name=scopeName(key);active.current=name;
  if(!resources.current.has(name)) {
    const workspace=[...resources.current.values()].find(e=>e.workspace?.obra.id===obraId)?.workspace||null;
    const payload=emptyDiary(date,workspace?.obra.nome||'');
    resources.current.set(name,{key,name,payload,basePayload:copy(payload),expectedVersion:0,workspace,diary:null,loading:!!obraId,loaded:false,error:null,storageError:null,saveState:'idle',changes:{},operation:null,inFlight:null,timer:null,restoreAvailable:null,conflict:null,registerWanted:false,discarded:false});
  }
  const current=resources.current.get(name);
  const publish=entry=>{if(mounted.current&&active.current===entry.name)render(n=>n+1);};
  function persist(entry) {
    if(entry.discarded)return;
    try {
      if(Object.keys(entry.changes).length||entry.operation||entry.registerWanted)pendingDrafts.save(entry.key,{version:entry.expectedVersion,changes:entry.changes,mutationId:entry.operation?.mutationId||null,operation:entry.operation,basePayload:entry.basePayload});
      else pendingDrafts.remove(entry.key);
      entry.storageError=null;
    }catch(error){entry.storageError=error;}
  }
  function schedule(entry,delay=1000) {
    clearTimeout(entry.timer);
    if(paused.current||!mounted.current||entry.discarded||entry.conflict||entry.restoreAvailable)return;
    entry.timer=setTimeout(()=>send(entry).catch(()=>{}),delay);
  }
  function editEntry(entry,changes) {
    if(!mounted.current||paused.current||!entry.workspace||entry.loading||entry.restoreAvailable)return;
    entry.discarded=false;
    entry.payload={...entry.payload,...copy(changes)};
    entry.changes=difference(entry.payload,entry.basePayload,entry.workspace);
    entry.error=null;
    if(!entry.inFlight&&!entry.conflict)entry.saveState='altered';
    persist(entry);publish(entry);schedule(entry);
  }
  async function send(entry,{register=false,restore=false}={}) {
    clearTimeout(entry.timer);
    if(!mounted.current||paused.current||entry.discarded)return entry.diary;
    if(!entry.workspace||entry.loading)return;
    if(entry.restoreAvailable)throw new Error('Restaure ou descarte a edição pendente antes de salvar.');
    if(entry.conflict)throw new ApiError(409,{code:'VERSION_CONFLICT',message:'Compare as versões antes de continuar.'});
    if(entry.inFlight) {
      if(register)entry.registerWanted=true;
      await entry.inFlight;
      return send(entry);
    }
    entry.changes=difference(entry.payload,entry.basePayload,entry.workspace);
    if(!entry.operation&&!Object.keys(entry.changes).length&&!register&&!entry.registerWanted&&entry.diary)return entry.diary;
    const operation=entry.operation||{expectedVersion:entry.expectedVersion,mutationId:crypto.randomUUID(),changes:copy(entry.changes),register:register||entry.registerWanted,restore,payloadSnapshot:copy(entry.payload)};
    entry.operation=operation;entry.registerWanted=false;entry.saveState='sending';entry.error=null;persist(entry);publish(entry);
    entry.inFlight=(async()=>{
      try {
        const result=await backendClient.request('/api/obras/'+entry.key.obraId+'/diarios/'+entry.key.date,{method:'PUT',
          expectedUserId:entry.key.userId,body:{expectedVersion:operation.expectedVersion,mutationId:operation.mutationId,changes:operation.changes,register:operation.register,restore:operation.restore||false}});
        if(!mounted.current||entry.discarded){persist(entry);return result;}
        entry.diary=result;entry.expectedVersion=result.version;
        entry.basePayload=hydrate(result,entry.key.date,entry.workspace.obra.nome);
        if(JSON.stringify(entry.payload)===JSON.stringify(operation.payloadSnapshot))entry.payload=copy(entry.basePayload);
        entry.payload.cabecalho={...entry.payload.cabecalho,obra:entry.basePayload.cabecalho.obra,data:entry.key.date};
        entry.operation=null;entry.changes=difference(entry.payload,entry.basePayload,entry.workspace);
        entry.saveState=Object.keys(entry.changes).length?'altered':'saved';entry.error=null;
        persist(entry);publish(entry);
        window.dispatchEvent(new Event('diary-saved'));
        if(Object.keys(entry.changes).length||entry.registerWanted)schedule(entry,0);
        return result;
      }catch(error){
        entry.error=error;entry.saveState=error.status===409?'conflict':'failed';
        if(error.status===409)entry.conflict={current:error.details?.current||null};
        if([400,403,413,415,422].includes(error.status))entry.operation=null;
        persist(entry);publish(entry);throw error;
      }finally{entry.inFlight=null;}
    })();
    return entry.inFlight;
  }
  async function load(entry,signal,{quiet=false}={}) {
    if(!entry.key.obraId){entry.loading=false;publish(entry);return;}
    if(!validWorkDate(entry.key.date)){entry.error=new Error('Selecione uma data válida.');entry.loading=false;publish(entry);return;}
    if(!quiet){entry.loading=true;publish(entry);}
    const hadChanges=Object.keys(entry.changes).length||entry.operation||entry.conflict;
    try {
      const [workspace,{diary}]=await Promise.all([
        backendClient.request('/api/obras/'+entry.key.obraId+'/workspace',{signal,expectedUserId:entry.key.userId}),
        backendClient.request('/api/obras/'+entry.key.obraId+'/diarios/'+entry.key.date,{signal,expectedUserId:entry.key.userId})
      ]);
      if(signal?.aborted)return;
      entry.workspace=workspace;
      if(!entry.loaded) {
        try{entry.restoreAvailable=pendingDrafts.load(entry.key);}catch(error){entry.storageError=error;}
      }
      // A read started before an edit must never overwrite the edit when it finishes.
      if(!hadChanges&&!Object.keys(entry.changes).length&&!entry.inFlight&&!entry.conflict) {
        entry.diary=diary;entry.expectedVersion=diary?.version||0;entry.payload=hydrate(diary,entry.key.date,workspace.obra.nome);entry.basePayload=copy(entry.payload);entry.saveState=diary?'saved':'idle';
      }
      entry.loaded=true;entry.loading=false;if(!entry.operation)entry.error=null;publish(entry);
    }catch(error){if(!signal?.aborted){entry.error=error;entry.loading=false;publish(entry);}}
  }
  useEffect(()=>{
    mounted.current=true;
    return()=>{mounted.current=false;for(const entry of resources.current.values())clearTimeout(entry.timer);};
  },[]);
  useEffect(()=>{
    const controller=new AbortController();load(current,controller.signal);
    const refresh=()=>{if(document.visibilityState==='visible'&&!current.inFlight&&!current.conflict&&!current.restoreAvailable&&!Object.keys(current.changes).length)load(current,controller.signal,{quiet:true});};
    const interval=setInterval(refresh,15000);window.addEventListener('focus',refresh);
    return()=>{controller.abort();clearInterval(interval);window.removeEventListener('focus',refresh);};
  },[name]);
  async function refreshWorkspace() {
    if(!current.key.obraId)return;
    const workspace=await backendClient.request('/api/obras/'+current.key.obraId+'/workspace',{expectedUserId:current.key.userId});
    current.workspace=workspace;publish(current);
  }
  function restorePending() {
    const pending=current.restoreAvailable;if(!pending)return;
    current.basePayload=pending.basePayload||copy(current.basePayload);
    current.expectedVersion=pending.version;
    current.payload={...current.basePayload,...pending.changes};
    current.changes=difference(current.payload,current.basePayload,current.workspace);
    current.operation=pending.operation||null;current.restoreAvailable=null;current.saveState='altered';
    persist(current);publish(current);schedule(current,0);
  }
  function discardPending() {
    current.restoreAvailable=null;current.operation=null;current.changes={};current.payload=copy(current.basePayload);current.error=null;current.conflict=null;current.saveState=current.diary?'saved':'idle';
    persist(current);publish(current);
  }
  function resolveConflict(reapply) {
    const remote=current.conflict?.current,changes=copy(current.changes);
    const removed=!!remote?.deletedAt;
    current.diary=removed&&!reapply?null:remote;current.expectedVersion=removed&&!reapply?0:remote?.version||0;current.basePayload=hydrate(removed&&!reapply?null:remote,date,current.workspace.obra.nome);
    current.payload=reapply?{...current.basePayload,...changes}:copy(current.basePayload);
    const register=current.operation?.register||false;current.operation=null;current.conflict=null;current.error=null;
    current.changes=difference(current.payload,current.basePayload,current.workspace);current.saveState=reapply?'altered':remote?'saved':'idle';
    persist(current);publish(current);
    if(reapply)send(current,{register,restore:removed}).catch(()=>{});
  }
  function pendingExport() {
    const merged=new Map();
    try{for(const item of pendingDrafts.listUser(session.user.id))merged.set(scopeName(item.key),item);}catch{/* In-memory content is still exportable. */}
    for(const entry of resources.current.values())if(Object.keys(entry.changes).length||entry.operation||entry.restoreAvailable)merged.set(entry.name,{key:entry.key,draft:entry.restoreAvailable||{version:entry.expectedVersion,changes:entry.changes,operation:entry.operation,basePayload:entry.basePayload}});
    return {userId:session.user.id,drafts:[...merged.values()]};
  }
  const hasPending=[...resources.current.values()].some(e=>Object.keys(e.changes).length||e.operation||e.restoreAvailable||e.inFlight)||pendingExport().drafts.length>0;
  return {...current,hasPending,
    edit:changes=>editEntry(current,changes),
    save:async(changes,options={})=>{if(changes)editEntry(current,changes);return send(current,options);},
    reload:()=>load(current),refreshWorkspace,restorePending,discardPending,
    reapply:()=>resolveConflict(true),useRemote:()=>resolveConflict(false),pendingExport,
    pause:()=>{paused.current=true;for(const e of resources.current.values())clearTimeout(e.timer);},
    resume:()=>{paused.current=false;for(const e of resources.current.values())if(Object.keys(e.changes).length&&!e.conflict)schedule(e);},
    clearForUser:()=>{for(const e of resources.current.values()){clearTimeout(e.timer);e.discarded=true;e.changes={};e.operation=null;e.restoreAvailable=null;}try{pendingDrafts.clearUser(session.user.id);}catch(error){current.storageError=error;}publish(current);}
  };
}
