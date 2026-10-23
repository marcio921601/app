import { Card } from "@/components/common/Card";
import {PrintLayout} from '../print/PrintLayout';
import { StatCard } from "@/components/common/StatCard";
import { formatCurrency, formatNumber, formatShortDate, uniqueSorted } from "@/utils/formatters";

export function HistorySection({ historicoOrdenado, canDelete, readOnly, canRegister, onSaveCurrent, onLoad, onDelete,selectedDiary,obras=[] }) {
  return (
    <div className="section-stack">
      <div className="stats-grid stats-grid-4">
        <StatCard label="Registros salvos" value={historicoOrdenado.length} />
        <StatCard label="Ultima data" value={historicoOrdenado[0]?.cabecalho?.data ? formatShortDate(historicoOrdenado[0].cabecalho.data) : "-"} />
        <StatCard label="Ultimo HH" value={formatNumber(historicoOrdenado[0]?.resumo?.totalHH || 0)} />
        <StatCard label="Ultimo valor" value={formatCurrency(historicoOrdenado[0]?.resumo?.valorRealizado || 0)} tone="success" />
      </div>

      <Card
        title="Historico diario"
        subtitle="Snapshots diarios por obra, data, resumo executivo e auditoria de alteracoes."
        actions={<button type="button" disabled={!canRegister} className="btn btn-secondary" onClick={onSaveCurrent}>Salvar registro atual</button>}
      >
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Obra</th>
                <th>Frentes</th>
                <th>HH</th>
                <th>Quantidade</th>
                <th>Valor realizado</th>
                <th>Alteracoes</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {historicoOrdenado.map((item) => (
                <tr key={item.id}>
                  <td>{formatShortDate(item.cabecalho?.data)}</td>
                  <td>{item.cabecalho?.obra}</td>
                  <td className="cell-muted">{uniqueSorted((item.atividades || []).map((atividade) => atividade.local)).join(" | ") || "-"}</td>
                  <td>{formatNumber(item.resumo?.totalHH || 0)}</td>
                  <td>{formatNumber(item.resumo?.totalQtd || 0)}</td>
                  <td>{formatCurrency(item.resumo?.valorRealizado || 0)}</td>
                  <td className="cell-muted">
                    {(item.audit || []).length ? (
                      <details>
                        <summary>{item.audit.length} registro(s)</summary>
                        <div className="audit-list">
                          {item.audit.map((audit) => (
                            <span key={audit.id}>
                              {formatShortDate(audit.changedAt?.slice(0, 10))} · {audit.usuario} · {audit.resumo}
                            </span>
                          ))}
                        </div>
                      </details>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="actions-cell">
                    <button type="button" className="btn btn-ghost" onClick={() => onLoad(item.id)}>Consultar</button>
                    <button type="button" disabled={!canDelete} className="btn btn-danger" onClick={() => onDelete(item.id)}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {selectedDiary?<Card title="Consulta do diário"><PrintLayout preview data={selectedDiary} obraAtiva={obras.find(o=>o.id===selectedDiary.obraId)} totalPrevisto={selectedDiary.summary.totalPrevisto} totalPresentes={selectedDiary.summary.totalPresentes} totalHH={selectedDiary.summary.totalHH} totalQtd={selectedDiary.summary.totalQtd} totalRealizadoEstimado={selectedDiary.summary.totalRealizadoEstimado} servicosCalculados={selectedDiary.servicos}/></Card>:null}
    </div>
  );
}
