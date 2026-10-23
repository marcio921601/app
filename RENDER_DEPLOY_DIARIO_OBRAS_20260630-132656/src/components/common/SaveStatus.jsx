const labels={idle:'Pronto',altered:'Alterado',sending:'Enviando',saved:'Salvo no servidor',failed:'Falha no envio',conflict:'Conflito'};
export function SaveStatus({state,onRetry}) {
  return <div className="status-tray"><span className="status-chip" role="status" aria-live="polite">{labels[state]||labels.idle}</span>
    {state==='failed'?<button className="btn btn-secondary" onClick={onRetry}>Tentar salvar</button>:null}
  </div>;
}
