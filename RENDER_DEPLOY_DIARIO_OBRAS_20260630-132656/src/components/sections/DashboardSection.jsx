import { BudgetBars, HorizontalBars, TrendChart } from "@/components/common/Charts";
import { Card } from "@/components/common/Card";
import { Field } from "@/components/common/Field";
import { StatCard } from "@/components/common/StatCard";
import { formatCurrency, formatNumber } from "@/utils/formatters";

export function DashboardSection({
  dashboardFilters,
  filtrosObra,
  filtrosFrente,
  filtrosEquipe,
  dashboardResumo,
  dashboardEvolucao,
  dashboardServicos,
  dashboardOrcamento,
  visibleDashboardWidgets = ["resumo", "evolucao", "servicos", "orcamento", "tabelaOrcamento"],
  onSetFilters,
  onResetFilters,
}) {
  const canSee = (widget) => visibleDashboardWidgets.includes(widget);

  return (
    <div className="section-stack">
      <Card title="Filtros do dashboard" subtitle="Leitura consolidada por obra, frente, equipe e periodo.">
        <div className="form-grid form-grid-5">
          <Field label="Obra">
            <select value={dashboardFilters.obra} onChange={(event) => onSetFilters((prev) => ({ ...prev, obra: event.target.value }))}>
              <option value="todas">Todas</option>
              {filtrosObra.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="Frente">
            <select value={dashboardFilters.frente} onChange={(event) => onSetFilters((prev) => ({ ...prev, frente: event.target.value }))}>
              <option value="todas">Todas</option>
              {filtrosFrente.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="Equipe">
            <select value={dashboardFilters.equipe} onChange={(event) => onSetFilters((prev) => ({ ...prev, equipe: event.target.value }))}>
              <option value="todas">Todas</option>
              {filtrosEquipe.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="Data inicial">
            <input type="date" value={dashboardFilters.de} onChange={(event) => onSetFilters((prev) => ({ ...prev, de: event.target.value }))} />
          </Field>
          <Field label="Data final">
            <div className="field-inline">
              <input type="date" value={dashboardFilters.ate} onChange={(event) => onSetFilters((prev) => ({ ...prev, ate: event.target.value }))} />
              <button type="button" className="btn btn-secondary btn-fit" onClick={onResetFilters}>Limpar</button>
            </div>
          </Field>
        </div>
      </Card>

      {canSee("resumo") ? (
        <div className="stats-grid stats-grid-5">
          <StatCard label="Dias lancados" value={dashboardResumo.dias} />
          <StatCard label="HH acumulado" value={formatNumber(dashboardResumo.hh)} />
          <StatCard label="Quantidade acumulada" value={formatNumber(dashboardResumo.qtd)} />
          <StatCard label="Valor realizado" value={formatCurrency(dashboardResumo.valor)} tone="success" />
          <StatCard label="% financeiro" value={`${formatNumber(dashboardResumo.progressoFinanceiro)}%`} tone="accent" />
        </div>
      ) : null}

      <div className="content-grid content-grid-2">
        {canSee("evolucao") ? <TrendChart data={dashboardEvolucao} /> : null}
        {canSee("servicos") ? (
          <HorizontalBars
            title="Top servicos por producao"
            subtitle="Servicos com maior volume produzido no periodo filtrado."
            rows={dashboardServicos}
          />
        ) : null}
      </div>

      <div className="content-grid content-grid-2">
        {canSee("orcamento") ? <BudgetBars rows={dashboardOrcamento} /> : null}
        {canSee("tabelaOrcamento") ? (
          <Card title="Orcado x realizado por item" subtitle="Itens vinculados pelos lancamentos de produtividade.">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Referencia</th>
                  <th>Descricao</th>
                  <th>Unidade</th>
                  <th>Qtd. orcada</th>
                  <th>Qtd. executada</th>
                  <th>% executado</th>
                  <th>Valor orcado</th>
                  <th>Valor realizado</th>
                </tr>
              </thead>
              <tbody>
                {dashboardOrcamento.map((item) => (
                  <tr key={item.referencia}>
                    <td>{item.referencia}</td>
                    <td>{item.descricao}</td>
                    <td>{item.unidade}</td>
                    <td>{formatNumber(item.qtdeOrcada)}</td>
                    <td>{formatNumber(item.quantidadeExecutada)}</td>
                    <td><span className="pill pill-accent">{formatNumber(item.percentual)}%</span></td>
                    <td>{formatCurrency(item.precoTotal)}</td>
                    <td>{formatCurrency(item.valorRealizado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
