import { Card } from "@/components/common/Card";
import { StatCard } from "@/components/common/StatCard";
import { formatCurrency, formatNumber } from "@/utils/formatters";

export function ProductivitySection({
  servicosCalculados,
  totalHH,
  servicosVinculados,
  totalRealizadoEstimado,
  producaoPorUnidade,
  readOnly,
  onUpdateAtividade,
  onExportExcel,
}) {
  const unidadesComProducao = producaoPorUnidade.filter((item) => item.quantidade > 0);

  return (
    <div className="section-stack">
      <div className="stats-grid stats-grid-4">
        <StatCard label="HH vindo do diario" value={formatNumber(totalHH)} />
        <StatCard label="Atividades vinculadas" value={servicosVinculados} />
        <StatCard label="Unidades diferentes" value={unidadesComProducao.length || 0} tone="warning" />
        <StatCard label="Valor realizado" value={formatCurrency(totalRealizadoEstimado)} tone="accent" />
      </div>

      <Card title="Resumo por unidade" subtitle="As quantidades nao sao somadas em um numero unico quando possuem unidades diferentes.">
        <div className="unit-summary-grid">
          {producaoPorUnidade.length ? (
            producaoPorUnidade.map((item) => (
              <div key={item.unidade} className="unit-summary-card">
                <span>{item.unidade || "-"}</span>
                <strong>{formatNumber(item.quantidade)}</strong>
                <small>{formatNumber(item.hh)} HH</small>
              </div>
            ))
          ) : (
            <div className="chart-empty">Preencha as atividades do Diario para gerar a produtividade.</div>
          )}
        </div>
      </Card>

      {readOnly ? <div className="inline-note"><strong>Somente leitura</strong><span>Seu perfil pode consultar a produtividade, mas nao alterar quantidades.</span></div> : null}

      <Card
        title="Produtividade por atividade"
        subtitle="Atividades, pessoas por funcao e horarios vem da aba Diario. Aqui entra apenas o percentual executado."
        actions={<button type="button" className="btn btn-secondary" onClick={onExportExcel}>Exportar Excel</button>}
      >
        <div className="table-wrap desktop-productivity-table">
          <table className="data-table">
            <thead>
              <tr>
                <th>Atividade</th>
                <th>Item nivel 3</th>
                <th>% executada</th>
                <th>Unidade</th>
                <th>Inicio</th>
                <th>Fim</th>
                <th>Profissionais por funcao</th>
                <th>Pessoas</th>
              </tr>
            </thead>
            <tbody>
              {servicosCalculados.map((item, index) => (
                <tr key={item.id || index}>
                  <td>{item.servico || "-"}</td>
                  <td className="cell-muted">
                    <strong>{item.orcamentoNivel3Ref || "-"}</strong>
                    <br />
                    {item.orcamentoNivel3Descricao || item.itemNivel3?.descricao || "-"}
                  </td>
                  <td>
                    <input
                      disabled={readOnly}
                      type="number"
                      value={item.percentualExecutado}
                      onChange={(event) => onUpdateAtividade(index, "percentualExecutado", event.target.value)}
                    />
                  </td>
                  <td>{item.unidade || "-"}</td>
                  <td>{item.inicio}</td>
                  <td>{item.fim}</td>
                  <td className="cell-muted">{item.pessoasPorFuncaoTexto}</td>
                  <td>{item.qtdPessoas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mobile-productivity-list">
          {servicosCalculados.map((item, index) => (
            <div key={item.id || index} className="productivity-mobile-card">
              <div className="productivity-mobile-head">
                <strong>{item.servico || "-"}</strong>
                <span>{item.unidade || "-"}</span>
              </div>
              <div className="productivity-mobile-grid">
                <span>
                  <small>Item Nivel 3</small>
                  <b>{item.orcamentoNivel3Ref || "-"}</b>
                  <em>{item.orcamentoNivel3Descricao || item.itemNivel3?.descricao || "-"}</em>
                </span>
                <label>
                  <small>% executada</small>
                  <input
                    disabled={readOnly}
                    type="number"
                    value={item.percentualExecutado}
                    onChange={(event) => onUpdateAtividade(index, "percentualExecutado", event.target.value)}
                  />
                </label>
                <span>
                  <small>Inicio</small>
                  <b>{item.inicio || "-"}</b>
                </span>
                <span>
                  <small>Fim</small>
                  <b>{item.fim || "-"}</b>
                </span>
                <span className="span-2">
                  <small>Profissionais por funcao</small>
                  <b>{item.pessoasPorFuncaoTexto || "-"}</b>
                </span>
                <span>
                  <small>Pessoas</small>
                  <b>{item.qtdPessoas}</b>
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
