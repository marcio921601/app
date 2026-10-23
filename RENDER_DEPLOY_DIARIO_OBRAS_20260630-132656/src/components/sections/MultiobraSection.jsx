import { Card } from "@/components/common/Card";
import { Field } from "@/components/common/Field";
import { StatCard } from "@/components/common/StatCard";
import { formatCurrency, formatNumber } from "@/utils/formatters";

export function MultiobraSection({
  data,
  obraAtiva,
  indicadoresObraAtiva,
  backendEnabled,
  syncState,
  onSync,
  onSelectObra,
  onApplyObraAtiva,
  onAddObra,
  onUpdateObra,
  onSaveObra,
  onRemoveObra,
}) {
  return (
    <div className="section-stack">
      <div className="stats-grid stats-grid-4">
        <StatCard label="Obra ativa" value={obraAtiva?.nome || "-"} detail={obraAtiva?.codigo || "Sem codigo"} />
        <StatCard label="Dias lancados" value={indicadoresObraAtiva.dias} />
        <StatCard label="HH acumulado" value={formatNumber(indicadoresObraAtiva.hh)} />
        <StatCard label="Valor acumulado" value={formatCurrency(indicadoresObraAtiva.valor)} tone="accent" />
      </div>

      <div className="content-grid content-grid-2">
        <Card
          title="Troca rapida de obra"
          subtitle="Sincronize o diario corrente com a obra ativa e deixe os dados mestres centralizados."
        >
          <div className="stack">
            <Field label="Selecionar obra ativa">
              <select value={data.multiobra?.obraAtivaId || ""} onChange={(event) => onSelectObra(event.target.value)}>
                {(data.multiobra?.obras || []).map((obra) => (
                  <option key={obra.id} value={obra.id}>
                    {obra.codigo ? `${obra.codigo} · ` : ""}
                    {obra.nome || "Obra sem nome"}
                  </option>
                ))}
              </select>
            </Field>

            <div className="info-block">
              <strong>Dados da obra ativa</strong>
              <div className="info-grid">
                <span><b>Codigo</b>{obraAtiva?.codigo || "-"}</span>
                <span><b>Nome</b>{obraAtiva?.nome || "-"}</span>
                <span><b>Cliente</b>{obraAtiva?.cliente || "-"}</span>
                <span><b>Local</b>{obraAtiva?.local || "-"}</span>
                <span><b>Responsavel</b>{obraAtiva?.responsavel || "-"}</span>
                <span><b>Prazo</b>{obraAtiva?.prazo || "-"}</span>
              </div>
            </div>

          </div>
        </Card>

        <Card
          title="Cadastro de obras"
          subtitle="Preencha os campos e salve cada cadastro."
          actions={
            <button type="button" className="btn btn-secondary" onClick={onAddObra}>
              Adicionar obra
            </button>
          }
        >
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Codigo</th>
                  <th>Nome</th>
                  <th>Cliente</th>
                  <th>Local</th>
                  <th>Responsavel</th>
                  <th>Prazo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(data.multiobra?.obras || []).map((obra, index) => (
                  <tr key={obra.id}>
                    <td><input value={obra.codigo} onChange={(event) => onUpdateObra(index, "codigo", event.target.value)} /></td>
                    <td><input value={obra.nome} onChange={(event) => onUpdateObra(index, "nome", event.target.value)} /></td>
                    <td><input value={obra.cliente} onChange={(event) => onUpdateObra(index, "cliente", event.target.value)} /></td>
                    <td><input value={obra.local} onChange={(event) => onUpdateObra(index, "local", event.target.value)} /></td>
                    <td><input value={obra.responsavel} onChange={(event) => onUpdateObra(index, "responsavel", event.target.value)} /></td>
                    <td><input value={obra.prazo} onChange={(event) => onUpdateObra(index, "prazo", event.target.value)} /></td>
                    <td className="actions-cell">
                      <button type="button" className="btn btn-primary" onClick={()=>onSaveObra(obra.id)}>Salvar</button>
                      <button type="button" className="btn btn-ghost" onClick={() => onSelectObra(obra.id)}>
                        Ativar
                      </button>
                      <button type="button" className="btn btn-danger" onClick={() => onRemoveObra(index)}>
                        Arquivar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
