import test from 'node:test';
import assert from 'node:assert/strict';
import {createPendingDrafts} from '../../src/services/pendingDrafts.js';
function memoryStorage(){const map=new Map();return {get length(){return map.size;},key:i=>[...map.keys()][i],getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};}
const key={userId:'user-a',obraId:'work-a',date:'2026-10-23'},draft={version:1,changes:{observacoes:'Pendente'},mutationId:'id-ficticio'};
test('pendência é isolada por pessoa, obra e data',()=>{
 const storage=memoryStorage(),pending=createPendingDrafts(storage);pending.save(key,draft);
 assert.deepEqual(pending.load(key),draft);
 for(const other of [{...key,userId:'user-b'},{...key,obraId:'work-b'},{...key,date:'2026-10-24'}])assert.equal(pending.load(other),null);
 pending.remove(key);assert.equal(pending.load(key),null);
});
test('limpeza de conta preserva outra conta e preferências',()=>{
 const storage=memoryStorage(),pending=createPendingDrafts(storage);
 pending.save(key,draft);pending.save({...key,userId:'user-b'},draft);storage.setItem('preferencia','manter');
 pending.clearUser('user-a');assert.equal(pending.load(key),null);assert.deepEqual(pending.load({...key,userId:'user-b'}),draft);assert.equal(storage.getItem('preferencia'),'manter');
});
test('falha de armazenamento é observável e chave inválida é recusada',()=>{
 const pending=createPendingDrafts({getItem(){throw new Error('denied');},setItem(){throw new Error('quota');}});
 assert.throws(()=>pending.save(key,draft),/preservar/);assert.throws(()=>pending.load(key),/ler/);
 assert.throws(()=>pending.save({...key,userId:''},draft));
});
