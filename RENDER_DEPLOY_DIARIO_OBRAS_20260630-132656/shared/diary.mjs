import {z} from 'zod';
const text=z.string().max(20000),short=z.string().max(500),num=z.number().finite().nonnegative().max(1e12);
const time=z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const activity=z.object({
  id:z.uuid(),inicio:time,fim:time,local:short.default(''),tarefa:short.default(''),equipe:short.default(''),
  orcamentoNivel3Ref:short.default(''),orcamentoNivel3Descricao:short.default(''),orcamentoRef:short.default(''),orcamentoDescricao:short.default(''),
  unidade:z.string().max(30).default('un'),quantidadeProduzida:num.default(0),percentualExecutado:z.union([num.max(100),z.literal('')]).default(''),alocados:z.array(z.uuid()).max(1000).default([])
}).strict();
const head=z.object({obra:short.default(''),data:z.string(),folha:short.default(''),periodoManha:short.default('07:00 - 12:00'),periodoTarde:short.default('13:00 - 17:00'),climaManha:z.enum(['bom','instavel','chuva','impraticavel']).default('bom'),climaTarde:z.enum(['bom','instavel','chuva','impraticavel']).default('bom')}).strict();
const management=z.object(Object.fromEntries(['prazoMarco','responsavel','riscos','restricoes','aquisicoes','sst','ppc','proximasAcoes'].map(k=>[k,text.default('')]))).strict();
const schema=z.object({cabecalho:head,presencas:z.array(z.uuid()).max(1000).default([]),atividades:z.array(activity).max(500).default([]),observacoes:text.default(''),consideracoes:text.default(''),equipamentos:text.default(''),gerencial:management.default({})}).strict();
export class DiaryValidationError extends Error {constructor(message,details){super(message);this.details=details;}}
export function validWorkDate(value) {
  return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
}
export function localWorkDate(date=new Date(),timezone='America/Sao_Paulo') {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const get=type=>parts.find(p=>p.type===type).value;
  return get('year')+'-'+get('month')+'-'+get('day');
}
const minutes=value=>Number(value.slice(0,2))*60+Number(value.slice(3));
export function emptyDiary(data=localWorkDate(),obra='') {return schema.parse({cabecalho:{data,obra}});}
export function validateDiary(input,workspace,{register=false,previousPayload}={}) {
  const result=schema.safeParse(input);
  if(!result.success) throw new DiaryValidationError('Confira os campos do diário.',result.error.issues.map(i=>({field:i.path.join('.'),message:i.message})));
  const payload=result.data,date=payload.cabecalho.data;
  if(!validWorkDate(date)) throw new DiaryValidationError('Data inválida.');
  payload.cabecalho.obra=workspace.obra.nome;
  const people=new Map(workspace.profissionais.map(p=>[p.id,p])),present=new Set(payload.presencas);
  if(present.size!==payload.presencas.length) throw new DiaryValidationError('Presença duplicada.');
  const unavailable=new Set(),priorPresence=new Set(previousPayload?.presencas||[]);
  for(const id of present) {
    if(!people.has(id))throw new DiaryValidationError('Profissional indisponível ou de outra obra.');
    if(people.get(id).ativo===false||(workspace.afastamentos||[]).some(a=>a.profissionalId===id&&a.inicio<=date&&a.fim>=date)) {
      if(!priorPresence.has(id))throw new DiaryValidationError('Profissional indisponível ou de outra obra.');
      unavailable.add(id);
    }
  }
  const ids=new Set(),budget=new Map(workspace.orcamento.map(i=>[String(i.referencia),i]));
  for(const [index,item] of payload.atividades.entries()) {
    if(ids.has(item.id)) throw new DiaryValidationError('Atividade duplicada.');ids.add(item.id);
    if(minutes(item.fim)<=minutes(item.inicio)) throw new DiaryValidationError('O horário final deve ser posterior ao inicial.');
    if(new Set(item.alocados).size!==item.alocados.length||item.alocados.some(id=>!present.has(id))) throw new DiaryValidationError('Somente pessoas presentes podem ser alocadas.');
    const priorActivity=previousPayload?.atividades?.find(a=>a.id===item.id);
    if(item.alocados.some(id=>unavailable.has(id)&&(!priorActivity?.alocados.includes(id)||priorActivity.inicio!==item.inicio||priorActivity.fim!==item.fim)))throw new DiaryValidationError('Novas alocações exigem profissional disponível.');
    if(item.orcamentoRef&&(!budget.has(item.orcamentoRef)||budget.get(item.orcamentoRef).nivel!==4)) throw new DiaryValidationError('Subitem de orçamento inválido para a obra.');
    if(item.orcamentoNivel3Ref&&(!budget.has(item.orcamentoNivel3Ref)||budget.get(item.orcamentoNivel3Ref).nivel!==3)) throw new DiaryValidationError('Grupo de orçamento inválido para a obra.');
    if(register&&(!item.local.trim()||!item.tarefa.trim())) throw new DiaryValidationError('Preencha local e tarefa das atividades antes de registrar.');
    for(const other of payload.atividades.slice(index+1)) if(item.inicio<other.fim&&other.inicio<item.fim&&item.alocados.some(id=>other.alocados.includes(id))) throw new DiaryValidationError('Há profissionais em atividades simultâneas.');
  }
  return payload;
}
export function calculateDiary(payload,workspace) {
  const budget=new Map(workspace.orcamento.map(i=>[String(i.referencia),i])),people=new Map(workspace.profissionais.map(i=>[i.id,i])),groups=new Map();
  const atividades=(payload.atividades||[]).map(item=>{
    const itemOrcado=budget.get(item.orcamentoRef),itemNivel3=budget.get(item.orcamentoNivel3Ref),profissionais=item.alocados.map(id=>people.get(id)).filter(Boolean);
    const horasTrabalhadas=(minutes(item.fim)-minutes(item.inicio))/60,qtdPessoas=profissionais.length,hh=qtdPessoas*horasTrabalhadas;
    const qtdeOrcada=itemOrcado?.qtdeOrcada||0,percentualInformado=item.percentualExecutado!==''&&item.percentualExecutado!=null;
    const quantidadeProduzida=percentualInformado&&itemOrcado?qtdeOrcada*item.percentualExecutado/100:item.quantidadeProduzida;
    const percentualExecutado=percentualInformado?item.percentualExecutado:qtdeOrcada>0?quantidadeProduzida/qtdeOrcada*100:0;
    const valorUnitario=qtdeOrcada>0?(itemOrcado?.precoTotal||0)/qtdeOrcada:0,valorExecutado=quantidadeProduzida*valorUnitario,unidade=itemOrcado?.unidade||item.unidade||'un';
    const pessoasPorFuncao={};for(const person of profissionais) pessoasPorFuncao[person.funcao]=(pessoasPorFuncao[person.funcao]||0)+1;
    const group=groups.get(unidade)||{unidade,quantidade:0,hh:0,atividades:0};group.quantidade+=quantidadeProduzida;group.hh+=hh;group.atividades++;groups.set(unidade,group);
    return {...item,profissionais,pessoasPorFuncao,pessoasPorFuncaoTexto:Object.entries(pessoasPorFuncao).map(([f,n])=>n+' '+f).join(', '),
      itemOrcado,itemNivel3,orcamentoDescricao:itemOrcado?.descricao||item.orcamentoDescricao,orcamentoNivel3Descricao:itemNivel3?.descricao||item.orcamentoNivel3Descricao,
      horasTrabalhadas,qtdPessoas,hh,qtdeOrcada,percentualExecutado,pctExecutado:percentualExecutado,quantidadeProduzida,valorUnitario,valorExecutado,unidade,
      servico:item.tarefa||itemOrcado?.descricao||'',prodUnPorHH:hh>0?quantidadeProduzida/hh:0,prodHHPorUn:quantidadeProduzida>0?hh/quantidadeProduzida:0};
  });
  const totalHH=atividades.reduce((n,i)=>n+i.hh,0),totalQtd=groups.size<=1?[...groups.values()][0]?.quantidade||0:null;
  return {atividades,summary:{totalHH,totalQtd,totalPresentes:payload.presencas.length,totalPrevisto:workspace.profissionais.filter(p=>p.ativo!==false).length,
    totalRealizadoEstimado:atividades.reduce((n,i)=>n+i.valorExecutado,0),producaoPorUnidade:[...groups.values()],produtividade:totalQtd!==null&&totalHH>0?totalQtd/totalHH:0}};
}
