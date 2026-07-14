import { formatCurrency, formatNumber } from "@/utils/formatters";

function buildPath(values, width, height) {
  if (!values.length) return "";
  const max = Math.max(...values, 1);
  const stepX = values.length === 1 ? 0 : width / (values.length - 1);
  return values
    .map((value, index) => {
      const x = index * stepX;
      const y = height - (value / max) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function TrendChart({ data }) {
  const hh = data.map((item) => Number(item.hh || 0));
  const quantidade = data.map((item) => Number(item.quantidade || 0));
  const valor = data.map((item) => Number(item.valor || 0));
  const labels = data.map((item) => item.data);

  return (
    <div className="chart-card">
      <div className="chart-head">
        <div>
          <h3>Evolucao diaria</h3>
          <p>HH, quantidade e valor realizado no periodo filtrado.</p>
        </div>
      </div>
      {data.length ? (
        <>
          <svg viewBox="0 0 100 48" className="trend-chart" preserveAspectRatio="none" aria-hidden="true">
            <path d={buildPath(hh, 100, 44)} className="trend-line trend-line-orange" />
            <path d={buildPath(quantidade, 100, 44)} className="trend-line trend-line-blue" />
            <path d={buildPath(valor, 100, 44)} className="trend-line trend-line-green" />
          </svg>
          <div className="chart-legend">
            <span><i className="dot dot-orange" /> HH</span>
            <span><i className="dot dot-blue" /> Quantidade</span>
            <span><i className="dot dot-green" /> Valor</span>
          </div>
          <div className="chart-axis">
            {labels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="chart-empty">Ainda nao existem registros suficientes para montar a evolucao.</div>
      )}
    </div>
  );
}

export function HorizontalBars({ title, subtitle, rows = [], valueKey = "quantidade", secondaryKey = "hh" }) {
  const max = Math.max(...rows.map((item) => Number(item[valueKey] || 0)), 1);

  return (
    <div className="chart-card">
      <div className="chart-head">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
      </div>
      <div className="bars-list">
        {rows.length ? (
          rows.map((item) => (
            <div key={item.servico || item.referencia} className="bars-item">
              <div className="bars-copy">
                <strong>{item.servico || item.referencia}</strong>
                <span>
                  {formatNumber(item[valueKey])} {valueKey === "valorRealizado" ? "" : ""} {secondaryKey ? `| ${formatNumber(item[secondaryKey])} ${secondaryKey}` : ""}
                </span>
              </div>
              <div className="bars-track">
                <span className="bars-fill" style={{ width: `${(Number(item[valueKey] || 0) / max) * 100}%` }} />
              </div>
            </div>
          ))
        ) : (
          <div className="chart-empty">Nenhum dado encontrado para o filtro atual.</div>
        )}
      </div>
    </div>
  );
}

export function BudgetBars({ rows = [] }) {
  const max = Math.max(...rows.map((item) => Number(item.valorRealizado || 0)), 1);

  return (
    <div className="chart-card">
      <div className="chart-head">
        <div>
          <h3>Itens com maior valor realizado</h3>
          <p>Comparativo visual dos itens de orcamento mais relevantes.</p>
        </div>
      </div>
      <div className="bars-list">
        {rows.length ? (
          rows.slice(0, 6).map((item) => (
            <div key={item.referencia} className="bars-item">
              <div className="bars-copy">
                <strong>{item.referencia}</strong>
                <span>{formatCurrency(item.valorRealizado)} | {formatNumber(item.percentual)}%</span>
              </div>
              <div className="bars-track">
                <span className="bars-fill bars-fill-green" style={{ width: `${(Number(item.valorRealizado || 0) / max) * 100}%` }} />
              </div>
            </div>
          ))
        ) : (
          <div className="chart-empty">Nenhum item orcamentario vinculado ainda.</div>
        )}
      </div>
    </div>
  );
}
