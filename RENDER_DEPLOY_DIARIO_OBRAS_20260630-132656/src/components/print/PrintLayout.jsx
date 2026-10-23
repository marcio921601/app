import { ITAUBA_LOGO } from "@/data/defaults";
import { formatCurrency, formatNumber, formatShortDate, getClimaLabel } from "@/utils/formatters";

export function PrintLayout({ data, obraAtiva, funcionariosResumo = [], totalPrevisto, totalPresentes, totalHH, totalQtd, totalRealizadoEstimado, servicosCalculados,preview=false }) {
  const funcionarios = (funcionariosResumo.length ? funcionariosResumo : data.funcionarios||[]).filter((item) => item.previsto || item.presente || item.observacoes);

  return (
    <div className={preview?"print-layout is-preview":"print-layout"}>
      <div className="print-header">
        <div>
          <div className="print-kicker">Itauba Engenharia</div>
          <h1>Diario de Obra</h1>
          <p>Relatorio para impressao e exportacao em PDF.</p>
        </div>
        <img src={ITAUBA_LOGO} alt="Marca Itauba" className="print-logo" />
      </div>

      <div className="print-grid print-grid-5">
        <PrintBox label="Obra" value={data.cabecalho.obra} />
        <PrintBox label="Codigo" value={obraAtiva?.codigo || "-"} />
        <PrintBox label="Cliente" value={obraAtiva?.cliente || "-"} />
        <PrintBox label="Local" value={obraAtiva?.local || "-"} />
        <PrintBox label="Data" value={formatShortDate(data.cabecalho.data)} />
      </div>

      <div className="print-grid print-grid-5">
        <PrintBox label="Folha" value={data.cabecalho.folha} />
        <PrintBox label="Clima manha" value={getClimaLabel(data.cabecalho.climaManha)} />
        <PrintBox label="Clima tarde" value={getClimaLabel(data.cabecalho.climaTarde)} />
        <PrintBox label="Periodo manha" value={data.cabecalho.periodoManha} />
        <PrintBox label="Periodo tarde" value={data.cabecalho.periodoTarde} />
      </div>

      <section className="print-section">
        <h2>Resumo executivo do dia</h2>
        <div className="print-grid print-grid-5">
          <PrintBox label="Previsto" value={totalPrevisto} />
          <PrintBox label="Presentes" value={totalPresentes} />
          <PrintBox label="HH total" value={formatNumber(totalHH)} />
          <PrintBox label="Producao" value={totalQtd===null?'Por unidade':formatNumber(totalQtd)} />
          <PrintBox label="Valor realizado" value={formatCurrency(totalRealizadoEstimado)} />
        </div>
      </section>

      <PrintTable
        title="Quadro de profissionais"
        headers={["Funcao", "Previsto", "Presente", "Observacoes"]}
        rows={funcionarios.map((item) => [item.funcao, item.previsto, item.presente, item.observacoes || "-"])}
      />

      <PrintTable
        title="Atividades executadas"
        headers={["Inicio", "Fim", "Local / Frente", "Item nivel 3", "Subitem nivel 4", "Tarefa", "Profissionais por funcao"]}
        rows={servicosCalculados.map((item) => [
          item.inicio,
          item.fim,
          item.local || "-",
          item.orcamentoNivel3Ref ? `${item.orcamentoNivel3Ref} - ${item.orcamentoNivel3Descricao || item.itemNivel3?.descricao || ""}` : "-",
          item.orcamentoRef ? `${item.orcamentoRef} - ${item.itemOrcado?.descricao || item.orcamentoDescricao || ""}` : "-",
          item.tarefa || item.servico || "-",
          item.pessoasPorFuncaoTexto || "-",
        ])}
      />

      <PrintTable
        title="Tabela de produtividade"
        headers={["Servico", "Item nivel 3", "Subitem nivel 4", "Unidade", "Qtd. produzida", "Qtd. orcada", "HH", "un/HH", "HH/un", "Valor realizado"]}
        rows={servicosCalculados.map((item) => [
          item.servico || "-",
          item.orcamentoNivel3Ref || "-",
          item.orcamentoRef || "-",
          item.unidade || "-",
          formatNumber(item.quantidadeProduzida),
          formatNumber(item.qtdeOrcada),
          formatNumber(item.hh),
          formatNumber(item.prodUnPorHH, 4),
          formatNumber(item.prodHHPorUn, 4),
          formatCurrency(item.valorExecutado),
        ])}
      />

      <section className="print-section">
        <h2>Relatorio gerencial</h2>
        <div className="print-grid print-grid-2">
          <PrintBox label="Prazo / marco" value={data.gerencial.prazoMarco || obraAtiva?.prazo || "-"} multiline />
          <PrintBox label="Responsavel" value={data.gerencial.responsavel || obraAtiva?.responsavel || "-"} multiline />
          <PrintBox label="Riscos" value={data.gerencial.riscos || "-"} multiline />
          <PrintBox label="Restricoes" value={data.gerencial.restricoes || "-"} multiline />
          <PrintBox label="Aquisicoes" value={data.gerencial.aquisicoes || "-"} multiline />
          <PrintBox label="SST / qualidade" value={data.gerencial.sst || "-"} multiline />
          <PrintBox label="PPC / comentarios" value={data.gerencial.ppc || "-"} multiline />
          <PrintBox label="Proximas acoes" value={data.gerencial.proximasAcoes || "-"} multiline />
        </div>
      </section>

      <div className="print-grid print-grid-3">
        <PrintBox label="Observacoes" value={data.observacoes || "-"} multiline />
        <PrintBox label="Consideracoes" value={data.consideracoes || "-"} multiline />
        <PrintBox label="Equipamentos" value={data.equipamentos || "-"} multiline />
      </div>
    </div>
  );
}

function PrintBox({ label, value, multiline = false }) {
  return (
    <div className="print-box">
      <div className="print-box-label">{label}</div>
      <div className={multiline ? "print-box-value multiline" : "print-box-value"}>{value}</div>
    </div>
  );
}

function PrintTable({ title, headers, rows }) {
  return (
    <section className="print-section">
      <h2>{title}</h2>
      <table className="print-table">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`${title}-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <td key={`${title}-${rowIndex}-${cellIndex}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
