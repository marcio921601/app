export function IssueSummary({ errors = [], warnings = [] }) {
  const hasItems = errors.length || warnings.length;

  return (
    <section className="issue-summary">
      <div className="issue-summary-head">
        <div>
          <h3>Validacoes e consistencia</h3>
          <p>O app aponta pendencias sem bloquear o fluxo atual da equipe.</p>
        </div>
        <div className="issue-pills">
          <span className="pill pill-error">{errors.length} erros</span>
          <span className="pill pill-warning">{warnings.length} alertas</span>
        </div>
      </div>

      {!hasItems ? (
        <div className="issue-empty">Nenhuma inconsistencia relevante encontrada neste momento.</div>
      ) : (
        <div className="issue-grid">
          <div>
            <strong>Erros</strong>
            <ul className="issue-list">
              {errors.length ? errors.map((item) => <li key={item.id}>{item.message}</li>) : <li>Nenhum erro.</li>}
            </ul>
          </div>
          <div>
            <strong>Alertas</strong>
            <ul className="issue-list">
              {warnings.length ? warnings.slice(0, 8).map((item) => <li key={item.id}>{item.message}</li>) : <li>Nenhum alerta.</li>}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
