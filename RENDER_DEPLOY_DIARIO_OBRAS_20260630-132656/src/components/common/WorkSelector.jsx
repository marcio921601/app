export function WorkSelector({obras,obraId,onChange,disabled=false}) {
  return <div><label className="work-selector">Obra ativa<select aria-label="Obra ativa" disabled={disabled||!obras.length} value={obraId||''} onChange={e=>onChange(e.target.value)}>
    {!obras.length?<option value="">Selecione uma obra</option>:obras.map(obra=><option key={obra.id} value={obra.id}>{obra.codigo+' · '+obra.nome}</option>)}
  </select></label>{!obras.length?<p>Nenhuma obra disponível.</p>:null}</div>;
}
