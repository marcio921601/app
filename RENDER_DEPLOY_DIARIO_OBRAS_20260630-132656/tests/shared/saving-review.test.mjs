import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {emptyDiary} from '../../shared/diary.mjs';
import {backendClient} from '../../src/services/backend.js';

test('cliente recusa despacho e resposta de diário com identidade antiga',async()=>{
  const originalFetch=globalThis.fetch;let release,calls=0;
  const gate=new Promise(resolve=>release=resolve);
  globalThis.fetch=async()=>{calls++;await gate;return {ok:true,status:200,json:async()=>({version:1})};};
  try{
    backendClient.setCsrf('csrf-A','A');
    const old=backendClient.request('/api/obras/work/diarios/date',{method:'PUT',body:{},expectedUserId:'A'});
    backendClient.setCsrf('csrf-B','B');release();
    await assert.rejects(old,{status:401});
    await assert.rejects(backendClient.request('/api/obras/work/diarios/date',{method:'PUT',body:{},expectedUserId:'A'}),{status:401});
    assert.equal(calls,1);
  }finally{release();globalThis.fetch=originalFetch;backendClient.setCsrf(null);}
});

// Controlled effects make the exact await/unmount ordering deterministic.
async function hookHarness(write) {
  const effects=[],requests=[],pending=new Map(),workspace={obra:{id:'work',nome:'Obra fictícia'},access:{editableTabs:['diario','produtividade']},profissionais:[],afastamentos:[],orcamento:[]};
  class ApiError extends Error{constructor(status,error={}){super(error.message);Object.assign(this,{status,...error});}}
  const fixture={useRef:current=>({current}),useState:()=>[0,()=>{}],useEffect:fn=>effects.push(fn),ApiError,
    backendClient:{async request(path,options={}){if(options.method==='PUT'){requests.push(structuredClone(options));return write(options,requests.length);}return path.endsWith('/workspace')?workspace:{diary:null};}},
    pendingDrafts:{load:()=>null,save:(key,value)=>pending.set(key.userId,structuredClone(value)),remove:key=>pending.delete(key.userId),listUser:()=>[],clearUser:id=>pending.delete(id)}};
  const id='hook-'+randomUUID();globalThis[id]=fixture;
  const previousWindow=globalThis.window;globalThis.window={addEventListener(){},removeEventListener(){},dispatchEvent(){}};
  let source=await readFile(new URL('../../src/hooks/useSharedDiary.js',import.meta.url),'utf8');
  source=source.replace(/import \{useEffect,useRef,useState\} from 'react';/,"const {useEffect,useRef,useState}=globalThis["+JSON.stringify(id)+"];")
    .replace(/import \{backendClient,ApiError\} from '..\/services\/backend';/,"const {backendClient,ApiError}=globalThis["+JSON.stringify(id)+"];")
    .replace(/import \{pendingDrafts\} from '..\/services\/pendingDrafts';/,"const {pendingDrafts}=globalThis["+JSON.stringify(id)+"];")
    .replace("'../../shared/diary.mjs'",JSON.stringify(new URL('../../shared/diary.mjs',import.meta.url).href));
  const {useSharedDiary}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const hook=useSharedDiary({session:{user:{id:'A'}},obraId:'work',date:'2026-10-23'});
  const cleanups=effects.map(fn=>fn());await hook.reload();
  const unmount=()=>{for(const cleanup of cleanups)cleanup?.();};
  return {hook,requests,pending,ApiError,unmount,close(){unmount();delete globalThis[id];globalThis.window=previousWindow;}};
}
function result(operation,version=1){return {version,payload:{...emptyDiary('2026-10-23','Obra fictícia'),...operation.body.changes},summary:{},status:'rascunho'};}

test('save enfileirado não despacha após desmontagem durante troca de conta',async()=>{
  let release;const gate=new Promise(resolve=>release=resolve);
  const h=await hookHarness(async(operation,n)=>{if(n===1)await gate;return result(operation,n);});
  try{
    h.hook.edit({observacoes:'Primeira edição A'});const first=h.hook.save();
    h.hook.edit({observacoes:'Segunda edição privada A'});const queued=h.hook.save();
    h.unmount();release();await Promise.allSettled([first,queued]);
    assert.equal(h.requests.length,1,'A fila antiga não pode usar o cliente da nova conta.');
  }finally{release();h.close();}
});
test('erro 400 libera operação rejeitada e a próxima gravação usa a correção atual',async()=>{
  const h=await hookHarness(async(operation,n)=>{if(n===1)throw new h.ApiError(400,{code:'INVALID_DIARY'});return result(operation,n);});
  try{
    h.hook.edit({observacoes:'Entrada inválida'});await assert.rejects(h.hook.save());
    h.hook.edit({observacoes:'Entrada corrigida'});await h.hook.save();
    assert.equal(h.requests[1].body.changes.observacoes,'Entrada corrigida');
    assert.notEqual(h.requests[0].body.mutationId,h.requests[1].body.mutationId);
  }finally{h.close();}
});
