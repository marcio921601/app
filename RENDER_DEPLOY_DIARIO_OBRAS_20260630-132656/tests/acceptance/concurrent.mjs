import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {connectTestDatabase,resetTestDatabase} from '../helpers/postgres.mjs';
import {applyMigrations} from '../../server/db/migrate.mjs';
import {createTestRuntime,login} from '../helpers/identity.mjs';
import {addWork,grant} from '../helpers/workspace.mjs';

const db=connectTestDatabase();await applyMigrations(db);await resetTestDatabase(db);
const r=await createTestRuntime({db});
const measurements=[],memoryBefore=process.memoryUsage().rss;
async function timed(fn){const start=performance.now();const result=await fn();measurements.push(performance.now()-start);return result;}
try {
  const obra=await addWork(db),sessions=[];
  for(let i=0;i<10;i++){
    const user=await r.addUser({email:'pessoa'+i+'@example.invalid'});await grant(db,user.id,obra);
    const session=await login(r,user);assert.equal(session.status,200);sessions.push({...session,user});
  }
  const path='/api/obras/'+obra+'/diarios/2026-10-23';
  const attempts=sessions.map((s,index)=>({s,body:{expectedVersion:0,mutationId:randomUUID(),changes:{observacoes:'Contribuição '+index}}}));
  const first=await Promise.all(attempts.map(({s,body})=>timed(()=>r.request('PUT',path,{cookie:s.cookie,csrfToken:s.csrfToken,body}))));
  assert.equal(first.filter(x=>x.status===200).length,1);
  assert.equal(first.filter(x=>x.status===409).length,9);
  for(let index=0;index<attempts.length;index++)if(first[index].status===409){
    const {s,body}=attempts[index];
    const current=await r.request('GET',path,{cookie:s.cookie});assert.equal(current.status,200);
    // Deliberate reapplication after reading the current server version. No silent retry.
    const next={...body,expectedVersion:current.body.diary.version,mutationId:randomUUID()};
    const result=await timed(()=>r.request('PUT',path,{cookie:s.cookie,csrfToken:s.csrfToken,body:next}));assert.equal(result.status,200);
    const duplicate=await r.request('PUT',path,{cookie:s.cookie,csrfToken:s.csrfToken,body:next});assert.equal(duplicate.body.version,result.body.version);
  }
  const revisions=(await db.query('SELECT actor_id FROM app.diario_revisoes ORDER BY version')).rows;
  assert.equal(revisions.length,10);assert.equal(new Set(revisions.map(x=>x.actor_id)).size,10);
  const outsider=await r.addUser({email:'externo@example.invalid'}),other=await login(r,outsider);
  assert.equal((await r.request('GET','/api/obras')).status,401);
  assert.equal((await r.request('GET','/api/admin/users',{cookie:sessions[0].cookie})).status,403);
  assert.equal((await r.request('GET',path,{cookie:other.cookie})).status,404);
  assert.equal((await r.request('POST','/api/state',{cookie:sessions[0].cookie,csrfToken:sessions[0].csrfToken,body:{}})).status,404);
  assert.equal((await r.request('GET','/api/health')).status,200);assert.equal((await r.request('GET','/api/ready')).status,200);
  measurements.sort((a,b)=>a-b);const percentile=q=>Math.round(measurements[Math.min(measurements.length-1,Math.ceil(measurements.length*q)-1)]*100)/100;
  const report={environment:'Local PostgreSQL real; HTTP Node; provedor de identidade simulado exclusivo de testes',sessions:10,concurrentInitialRequests:10,acknowledgements:1,identifiedConflicts:9,deliberateReapplications:9,revisions:10,distinctAuthors:10,unexpectedErrors:0,latencyMs:{p50:percentile(.5),p95:percentile(.95),max:percentile(1)},processRssMiB:{before:Math.round(memoryBefore/1048576),after:Math.round(process.memoryUsage().rss/1048576)}};
  if(process.env.ACCEPTANCE_REPORT_PATH)await writeFile(process.env.ACCEPTANCE_REPORT_PATH,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}finally{await r.close();}
