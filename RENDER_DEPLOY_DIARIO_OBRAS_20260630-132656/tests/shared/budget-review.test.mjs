import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildInitialData} from '../../src/data/defaults.js';

test('dashboard preserva obra e unidade quando referências de orçamento coincidem',async()=>{
  let source=await readFile(new URL('../../src/hooks/useDiaryDerived.js',import.meta.url),'utf8');
  const validation=await readFile(new URL('../../src/utils/validation.js',import.meta.url),'utf8');
  const validationUrl='data:text/javascript;base64,'+Buffer.from(validation.replace('"@/utils/formatters"',JSON.stringify(new URL('../../src/utils/formatters.js',import.meta.url).href))).toString('base64');
  source=source.replace("import {useMemo} from 'react';",'const useMemo=fn=>fn();')
    .replaceAll("'../../shared/diary.mjs'",JSON.stringify(new URL('../../shared/diary.mjs',import.meta.url).href))
    .replaceAll("'../../shared/reports.mjs'",JSON.stringify(new URL('../../shared/reports.mjs',import.meta.url).href))
    .replaceAll("'../utils/formatters'",JSON.stringify(new URL('../../src/utils/formatters.js',import.meta.url).href))
    .replaceAll("'../utils/validation'",JSON.stringify(validationUrl));
  const {useDiaryDerived}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const data=buildInitialData();data.multiobra={obraAtivaId:'A',obras:[{id:'A',nome:'Obra A'},{id:'B',nome:'Obra B'}]};
  data.orcamento=[{nivel:4,referencia:'1.1.1.1',descricao:'A',unidade:'m',qtdeOrcada:100,precoTotal:1000}];
  data.historico=[['A','m',10,100,1000],['B','m²',5,20,400]].map(([obraId,unidade,quantidadeProduzida,qtdeOrcada,precoTotalOrcado])=>({
    obraId,cabecalho:{obra:'Obra '+obraId,data:'2026-10-23'},atividades:[],resumo:{totalHH:1,producaoPorUnidade:[{unidade,quantidade:quantidadeProduzida,hh:1}]},
    servicos:[{orcamentoRef:'1.1.1.1',unidade,quantidadeProduzida,qtdeOrcada,precoTotalOrcado,valorExecutado:100}]
  }));
  const result=useDiaryDerived(data,'',{obra:'todas',frente:'todas',equipe:'todas',de:'',ate:''}).dashboardOrcamento;
  assert.equal(result.length,2);
  assert.equal(result.find(row=>row.obraId==='A').quantidadeExecutada,10);
  assert.equal(result.find(row=>row.obraId==='B').quantidadeExecutada,5);
  assert.equal(result.find(row=>row.obraId==='B').unidade,'m²');
  assert.equal(result.find(row=>row.obraId==='B').qtdeOrcada,20);
});
