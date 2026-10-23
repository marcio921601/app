export function aggregateProduction(summaries) {
  const groups=new Map();let hh=0;
  for(const summary of summaries)for(const item of summary.producaoPorUnidade||[]) {
    const row=groups.get(item.unidade)||{unidade:item.unidade,quantidade:0,hh:0};
    row.quantidade+=item.quantidade;row.hh+=item.hh;hh+=item.hh;groups.set(item.unidade,row);
  }
  const porUnidade=[...groups.values()],quantidade=groups.size>1?null:porUnidade[0]?.quantidade||0;
  return {quantidade,produtividade:quantidade===null?null:hh>0?quantidade/hh:0,porUnidade};
}

export function aggregateBudgetHistory(snapshots,{obraId,orcamento=[]}={}) {
  const budgets=new Map(orcamento.map(row=>[String(row.referencia),row])),groups=new Map();
  for(const snapshot of snapshots)for(const service of snapshot.servicos||[]) {
    const referencia=String(service.orcamentoRef||'');if(!referencia)continue;
    const unidade=service.unidade||'un',key=JSON.stringify([snapshot.obraId,referencia,unidade]);
    const current=snapshot.obraId===obraId?budgets.get(referencia):null;
    const budget=current?.unidade===unidade?current:null;
    if(!groups.has(key))groups.set(key,{key,obraId:snapshot.obraId,obraNome:snapshot.cabecalho?.obra||snapshot.obraId,
      referencia,descricao:budget?.descricao||service.orcamentoDescricao||service.servico||'-',unidade,
      qtdeOrcada:budget?.qtdeOrcada??service.qtdeOrcada??0,precoTotal:budget?.precoTotal??service.precoTotalOrcado??0,
      quantidadeExecutada:0,valorRealizado:0});
    const row=groups.get(key);row.quantidadeExecutada+=service.quantidadeProduzida||0;row.valorRealizado+=service.valorExecutado||0;
  }
  return [...groups.values()].map(row=>({...row,percentual:row.qtdeOrcada>0?row.quantidadeExecutada/row.qtdeOrcada*100:0}));
}
