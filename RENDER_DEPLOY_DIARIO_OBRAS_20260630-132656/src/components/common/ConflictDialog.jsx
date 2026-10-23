export function ConflictDialog({conflict,local,onReapply,onDiscard,canRestore=false}) {
  if(!conflict)return null;
  const removed=!!conflict.current?.deletedAt;
  return <div className="dialog-backdrop"><section role="dialog" aria-modal="true" aria-label="Conflito de edição" className="conflict-dialog">
    <h2>{removed?'Diário excluído':'Conflito de edição'}</h2><p>{removed?'Este diário foi excluído. A restauração exige permissão administrativa e preserva as revisões anteriores.':'O diário foi alterado em outro acesso. Compare os conteúdos antes de continuar.'}</p>
    <div className="content-grid content-grid-2"><div><h3>Minha edição</h3><pre>{JSON.stringify(local,null,2)}</pre></div>
      <div><h3>Versão do servidor</h3><pre>{JSON.stringify(conflict.current?.payload||{},null,2)}</pre></div></div>
    <div className="button-row">{(!removed||canRestore)&&<button className="btn btn-primary" onClick={onReapply}>{removed?'Restaurar e reaplicar minhas alterações':'Reaplicar minhas alterações'}</button>}
      <button className="btn btn-secondary" onClick={onDiscard}>{removed?'Descartar minha edição':'Usar versão do servidor'}</button></div>
  </section></div>;
}
