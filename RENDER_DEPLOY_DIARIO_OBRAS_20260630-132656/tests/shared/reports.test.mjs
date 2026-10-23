import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregateProduction} from '../../shared/reports.mjs';
test('relatório agregado mantém metros e quilos separados entre dias',()=>{
 const result=aggregateProduction([{producaoPorUnidade:[{unidade:'m',quantidade:12,hh:8}]},{producaoPorUnidade:[{unidade:'kg',quantidade:5,hh:2}]}]);
 assert.equal(result.quantidade,null);assert.equal(result.produtividade,null);
 assert.deepEqual(result.porUnidade.map(v=>v.quantidade),[12,5]);
});
test('relatório agregado soma a mesma unidade e trata base vazia',()=>{
 assert.deepEqual(aggregateProduction([]),{quantidade:0,produtividade:0,porUnidade:[]});
 const result=aggregateProduction([{producaoPorUnidade:[{unidade:'m',quantidade:12,hh:8}]},{producaoPorUnidade:[{unidade:'m',quantidade:3,hh:2}]}]);
 assert.equal(result.quantidade,15);assert.equal(result.produtividade,1.5);
});
