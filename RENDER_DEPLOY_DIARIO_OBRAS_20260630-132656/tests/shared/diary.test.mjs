import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {calculateDiary,validateDiary,localWorkDate} from '../../shared/diary.mjs';
function fixture() {
 const ids=[randomUUID(),randomUUID()],workspace={obra:{nome:'Obra fictícia'},profissionais:ids.map(id=>({id,ativo:true,nome:'Pessoa',funcao:'ARMADOR'})),afastamentos:[],orcamento:[{nivel:4,referencia:'1',descricao:'Serviço',qtdeOrcada:100,unidade:'m',precoTotal:1000}]};
 const payload={cabecalho:{data:'2026-10-23'},presencas:ids,atividades:[{id:randomUUID(),inicio:'07:00',fim:'11:00',local:'Frente',tarefa:'Serviço',alocados:ids,orcamentoRef:'1',quantidadeProduzida:12,percentualExecutado:'',unidade:'m'}]};
 return {payload,workspace};
}
test('duas pessoas por quatro horas produzem oito HH e produtividade 1.5',()=>{
 const {payload,workspace}=fixture(),result=calculateDiary(validateDiary(payload,workspace),workspace);
 assert.equal(result.summary.totalHH,8);assert.equal(result.atividades[0].prodUnPorHH,1.5);
});
test('percentual usa orçamento confiável e zero explícito é preservado',()=>{
 const {payload,workspace}=fixture();payload.atividades[0].percentualExecutado=10;
 assert.equal(calculateDiary(payload,workspace).atividades[0].quantidadeProduzida,10);
 payload.atividades[0].percentualExecutado=0;
 assert.equal(calculateDiary(payload,workspace).atividades[0].quantidadeProduzida,0);
 workspace.orcamento[0].qtdeOrcada=0;
 const result=calculateDiary(payload,workspace);assert.equal(result.atividades[0].prodHHPorUn,0);assert.equal(result.atividades[0].valorUnitario,0);
});
test('números não finitos e textos numéricos são recusados',()=>{
 for(const invalid of [NaN,Infinity,'abc','12',-1]) {const {payload,workspace}=fixture();payload.atividades[0].quantidadeProduzida=invalid;assert.throws(()=>validateDiary(payload,workspace));}
});
test('referências, afastamentos, horários e sobreposição são validados',()=>{
 const {payload,workspace}=fixture();
 payload.presencas.push(randomUUID());assert.throws(()=>validateDiary(payload,workspace));payload.presencas.pop();
 workspace.afastamentos=[{profissionalId:payload.presencas[0],inicio:'2026-10-23',fim:'2026-10-23'}];assert.throws(()=>validateDiary(payload,workspace));workspace.afastamentos=[];
 payload.atividades[0].fim='28:00';assert.throws(()=>validateDiary(payload,workspace));payload.atividades[0].fim='11:00';
 payload.atividades.push({...payload.atividades[0],id:randomUUID()});assert.throws(()=>validateDiary(payload,workspace));
});
test('unidades incompatíveis ficam separadas e data segue São Paulo',()=>{
 const {payload,workspace}=fixture();payload.atividades.push({...payload.atividades[0],id:randomUUID(),inicio:'12:00',fim:'13:00',orcamentoRef:'',unidade:'kg'});
 const summary=calculateDiary(payload,workspace).summary;
 assert.equal(summary.totalQtd,null);assert.equal(summary.producaoPorUnidade.length,2);
 assert.equal(localWorkDate(new Date('2026-10-23T01:00:00Z')),'2026-10-22');
});
