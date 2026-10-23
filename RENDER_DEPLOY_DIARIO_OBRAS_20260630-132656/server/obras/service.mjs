import {randomUUID,createHash} from 'node:crypto';
import {Worker} from 'node:worker_threads';
import {z} from 'zod';
import {HttpError} from '../http.mjs';
import {getObraAccess,requirePermission,requireAdmin,assertId} from '../access/permissions.mjs';
import {audit} from '../admin/users.mjs';
const text=z.string().max(500),nonblank=z.string().trim().min(1).max(300),number=z.number().finite().nonnegative().max(1e12);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v);
const schemas={
  obra:z.object({codigo:nonblank,nome:nonblank,cliente:text.default(''),local:text.default(''),responsavel:text.default(''),prazo:text.default(''),archived:z.boolean().default(false)}).strict(),
  profissional:z.object({nome:nonblank,matricula:text.default(''),funcao:nonblank,ativo:z.boolean().default(true),custoHora:number.default(0),observacoes:text.default('')}).strict(),
  afastamento:z.object({profissionalId:z.uuid(),tipo:nonblank,inicio:date,fim:date,motivo:text.default(''),autorizadoPor:text.default('')}).strict().refine(v=>v.fim>=v.inicio,{message:'O fim deve ser posterior ao início.'}),
  itemOrcamento:z.object({nivel:z.number().int().min(1).max(4),referencia:nonblank,descricao:nonblank,qtdeOrcada:number,unidade:z.string().max(30),precoTotal:number,bdi:number.max(1000)}).strict()
};
const bad=(message='Cadastro inválido.',details)=>new HttpError(400,'INVALID_INPUT',message,details);
function parse(kind,input) {const result=schemas[kind].safeParse(input);if(!result.success) throw bad('Confira os campos do cadastro.',result.error.issues.map(i=>({field:i.path.join('.'),message:i.message})));return result.data;}
const tables={profissional:'profissionais',afastamento:'afastamentos',itemOrcamento:'orcamento_itens'};
function flatten(row) {return {...row.payload,id:row.id,obraId:row.obra_id,version:row.version,...('ativo' in row?{ativo:row.ativo}:{})};}
export async function listObras(db,actor) {
  return (await db.query(actor.isAdmin?'SELECT o.* FROM app.obras o ORDER BY o.codigo':'SELECT o.* FROM app.obras o JOIN app.memberships m ON m.obra_id=o.id WHERE m.user_id=$1 ORDER BY o.codigo',actor.isAdmin?[]:[actor.id])).rows;
}
export async function getWorkspace(db,actor,obraId,{trusted=false}={}) {
  const access=await getObraAccess(db,actor,obraId);
  const obra=(await db.query('SELECT * FROM app.obras WHERE id=$1',[obraId])).rows[0];
  const profissionais=(await db.query('SELECT * FROM app.profissionais WHERE obra_id=$1 ORDER BY payload->>\'nome\'',[obraId])).rows.map(flatten);
  const afastamentos=(await db.query('SELECT * FROM app.afastamentos WHERE obra_id=$1',[obraId])).rows.map(flatten);
  const orcamento=(await db.query('SELECT * FROM app.orcamento_itens WHERE obra_id=$1 ORDER BY referencia',[obraId])).rows.map(flatten);
  if(!trusted&&!access.tabs.includes('orcamento')) for(const item of orcamento) {delete item.precoTotal;delete item.bdi;}
  if(!trusted&&!access.tabs.includes('cadastros')) for(const item of profissionais) delete item.custoHora;
  return {obra,access,profissionais,afastamentos,orcamento};
}
export async function writeMasterRecord(db,actor,{obraId,kind,id,expectedVersion,changes}) {
  if(!schemas[kind]||!Number.isInteger(expectedVersion)||expectedVersion<0||!changes||Array.isArray(changes)||typeof changes!=='object') throw bad();
  if(kind==='obra') requireAdmin(actor);
  else requirePermission(await getObraAccess(db,actor,obraId),kind==='itemOrcamento'?'orcamento':'cadastros','edit');
  if(id) assertId(id);
  if(!id&&expectedVersion!==0) throw bad();
  return db.transaction(async tx=>{
    let work;
    if(obraId) {work=(await tx.query('SELECT * FROM app.obras WHERE id=$1 FOR UPDATE',[assertId(obraId)])).rows[0];if(!work) throw new HttpError(404,'NOT_FOUND','Obra não encontrada.');}
    const table=kind==='obra'?'obras':tables[kind];
    const current=id?(await tx.query('SELECT * FROM app.'+table+' WHERE id=$1'+(kind==='obra'?'':' AND obra_id=$2')+' FOR UPDATE',kind==='obra'?[id]:[id,obraId])).rows[0]:null;
    if(id&&!current) throw new HttpError(404,'NOT_FOUND','Cadastro não encontrado.');
    if(current?.version!==expectedVersion&&(current||expectedVersion!==0)) throw new HttpError(409,'VERSION_CONFLICT','O cadastro foi alterado.',{current:kind==='obra'?current:flatten(current)});
    const previous=kind==='obra'&&current?Object.fromEntries(Object.keys(schemas.obra.shape).map(k=>[k,current[k]])):current?.payload||{};
    const payload=parse(kind,{...previous,...changes});
    const entityId=id||randomUUID();
    if(kind==='afastamento') {
      const prof=(await tx.query('SELECT id FROM app.profissionais WHERE id=$1 AND obra_id=$2',[payload.profissionalId,obraId])).rows[0];
      if(!prof) throw bad('Profissional não pertence à obra.');
    }
    let saved;
    try {
      if(kind==='obra') {
        const vals=[payload.codigo,payload.nome,payload.cliente,payload.local,payload.responsavel,payload.prazo,payload.archived,entityId];
        saved=current?(await tx.query('UPDATE app.obras SET codigo=$1,nome=$2,cliente=$3,local=$4,responsavel=$5,prazo=$6,archived=$7,version=version+1,updated_at=now() WHERE id=$8 RETURNING *',vals)).rows[0]:
          (await tx.query('INSERT INTO app.obras(codigo,nome,cliente,local,responsavel,prazo,archived,id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',vals)).rows[0];
      } else {
        const extra=kind==='profissional'?'ativo':kind==='afastamento'?'profissional_id':'referencia',extraValue=kind==='profissional'?payload.ativo:kind==='afastamento'?payload.profissionalId:payload.referencia;
        saved=current?(await tx.query('UPDATE app.'+table+' SET payload=$1,'+extra+'=$2,version=version+1 WHERE id=$3 RETURNING *',[payload,extraValue,entityId])).rows[0]:
          (await tx.query('INSERT INTO app.'+table+'(payload,'+extra+',id,obra_id) VALUES($1,$2,$3,$4) RETURNING *',[payload,extraValue,entityId,obraId])).rows[0];
        await tx.query('UPDATE app.obras SET version=version+1,updated_at=now() WHERE id=$1',[obraId]);
      }
    } catch(error) {if(error.code==='23505') throw new HttpError(409,'DUPLICATE','Código ou referência já cadastrado.');throw error;}
    await audit(tx,actor,kind,entityId,current?'updated':'created',{obraId});
    return kind==='obra'?saved:flatten(saved);
  });
}
async function parseFile(file) {
  if(!Buffer.isBuffer(file)||file.length>5*1024*1024) throw new HttpError(413,'FILE_TOO_LARGE','O arquivo deve ter no máximo 5 MiB.');
  if(!file.length) throw bad('Arquivo vazio.');
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./budget-worker.mjs',import.meta.url),{workerData:file,resourceLimits:{maxOldGenerationSizeMb:128}});
    const timer=setTimeout(()=>{worker.terminate();reject(bad('O arquivo excedeu o tempo de leitura.'));},5000);
    worker.once('message',value=>{clearTimeout(timer);worker.terminate();value.error?reject(bad(value.error==='ROW_LIMIT'?'Limite de 10 mil linhas excedido.':'Arquivo inválido.')):resolve(value.rows);});
    worker.once('error',()=>{clearTimeout(timer);reject(bad('Não foi possível ler o arquivo.'));});
    worker.once('exit',code=>{clearTimeout(timer);if(code) reject(bad('Leitura do arquivo interrompida.'));});
  });
}
function normalizeRows(input) {
  const rows=[],errors=[],refs=new Set(),parents=[];
  const aliases={nivel:'nivel',referencia:'referencia',descricao:'descricao',qtdeorcada:'qtdeOrcada',quantidade:'qtdeOrcada',unidade:'unidade',precototal:'precoTotal',valortotal:'precoTotal',bdi:'bdi'};
  for(const [index,raw] of input.entries()) {
    const row={};
    for(const [key,value] of Object.entries(raw)) {
      const normalized=String(key).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]/g,'');
      if(aliases[normalized]) row[aliases[normalized]]=value;
    }
    for(const key of ['nivel','qtdeOrcada','precoTotal','bdi']) {
      const value=row[key]??0;
      row[key]=typeof value==='number'?value:typeof value==='string'&&/^\s*\d+(?:[.,]\d+)?\s*$/.test(value)?Number(value.replace(',','.')):value===''?0:NaN;
    }
    for(const key of ['referencia','descricao','unidade']) row[key]=String(row[key]??'').trim();
    const result=schemas.itemOrcamento.safeParse(row);
    if(!result.success) {errors.push({row:index+2,message:'Campos ou números inválidos.'});continue;}
    if(refs.has(row.referencia)) errors.push({row:index+2,message:'Referência repetida.'});
    if(row.nivel>1&&!parents[row.nivel-1]) errors.push({row:index+2,message:'Nível sem grupo superior.'});
    if(row.nivel===4&&!row.unidade) errors.push({row:index+2,message:'Item de produção exige unidade.'});
    parents[row.nivel]=row.referencia;parents.length=row.nivel+1;refs.add(row.referencia);rows.push(row);
  }
  if(!rows.length&&!errors.length) errors.push({row:0,message:'Nenhum item encontrado.'});
  return {rows,errors};
}
export async function previewBudget(db,actor,obraId,file) {
  requireAdmin(actor);const {obra}=await getWorkspace(db,actor,obraId);
  return {...normalizeRows(await parseFile(file)),hash:createHash('sha256').update(file).digest('hex'),version:obra.version};
}
export async function importBudget(db,actor,obraId,file,{expectedVersion,hash}) {
  const checked=await previewBudget(db,actor,obraId,file);
  if(checked.hash!==hash||checked.errors.length) throw bad('Confira as inconsistências antes de importar.',checked.errors);
  return db.transaction(async tx=>{
    const obra=(await tx.query('SELECT version FROM app.obras WHERE id=$1 FOR UPDATE',[obraId])).rows[0];
    if(obra.version!==expectedVersion) throw new HttpError(409,'VERSION_CONFLICT','A obra foi alterada. Confira novamente o arquivo.');
    // Existing references retain stable IDs; replacing a budget must not break diary links.
    for(const row of checked.rows) await tx.query('INSERT INTO app.orcamento_itens(id,obra_id,referencia,payload) VALUES($1,$2,$3,$4) ON CONFLICT(obra_id,referencia) DO UPDATE SET payload=excluded.payload,version=app.orcamento_itens.version+1',[randomUUID(),obraId,row.referencia,row]);
    await tx.query('UPDATE app.obras SET version=version+1 WHERE id=$1',[obraId]);
    await audit(tx,actor,'budget',obraId,'imported',{hash:checked.hash,count:checked.rows.length});
    return {rows:checked.rows,version:obra.version+1};
  });
}
export async function removeMasterRecord(db,actor,{obraId,kind,id,expectedVersion}) {
  if(!['afastamento','itemOrcamento'].includes(kind)) throw bad();
  assertId(id);requirePermission(await getObraAccess(db,actor,obraId),kind==='itemOrcamento'?'orcamento':'cadastros','edit');
  return db.transaction(async tx=>{
    await tx.query('SELECT id FROM app.obras WHERE id=$1 FOR UPDATE',[obraId]);
    const row=(await tx.query('SELECT * FROM app.'+tables[kind]+' WHERE id=$1 AND obra_id=$2 FOR UPDATE',[id,obraId])).rows[0];
    if(!row) throw new HttpError(404,'NOT_FOUND','Cadastro não encontrado.');
    if(row.version!==expectedVersion) throw new HttpError(409,'VERSION_CONFLICT','O cadastro foi alterado.');
    if(kind==='itemOrcamento') {
      const used=(await tx.query('SELECT id FROM app.diarios WHERE obra_id=$1 AND payload::text LIKE $2 LIMIT 1',[obraId,'%'+row.referencia+'%'])).rows[0];
      if(used) throw new HttpError(409,'IN_USE','Item utilizado por um diário. Preserve a referência.');
    }
    await tx.query('DELETE FROM app.'+tables[kind]+' WHERE id=$1',[id]);
    await tx.query('UPDATE app.obras SET version=version+1 WHERE id=$1',[obraId]);
    await audit(tx,actor,kind,id,'deleted',{obraId});return {ok:true};
  });
}
