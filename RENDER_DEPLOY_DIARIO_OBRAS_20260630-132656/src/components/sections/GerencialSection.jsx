import { Card } from "@/components/common/Card";
import { Field } from "@/components/common/Field";
import { StatCard } from "@/components/common/StatCard";
import { formatNumber } from "@/utils/formatters";

export function GerencialSection({ data, gerencialIndicadores, resumoROS, onCopyResumo, onUpdateGerencial,readOnly }) {
  return (
    <div className="section-stack">
      <div className="stats-grid stats-grid-6">
        <StatCard label="Riscos" value={gerencialIndicadores.riscos} tone="warning" />
        <StatCard label="Restricoes" value={gerencialIndicadores.restricoes} />
        <StatCard label="Aquisicoes" value={gerencialIndicadores.aquisicoes} />
        <StatCard label="Proximas acoes" value={gerencialIndicadores.proximasAcoes} />
        <StatCard label="Media un/HH" value={formatNumber(gerencialIndicadores.produtividade, 4)} />
        <StatCard label="% financeiro" value={`${formatNumber(gerencialIndicadores.progressoFinanceiro)}%`} tone="accent" />
      </div>

      <Card title="Relatorio gerencial ROS / Itauba" subtitle="Campos estruturados para a ata e o relatorio padrao.">
        <div className="form-grid form-grid-2">
          <Field label="Prazo / marco relevante">
            <input disabled={readOnly} value={data.gerencial.prazoMarco} onChange={(event) => onUpdateGerencial("prazoMarco", event.target.value)} />
          </Field>
          <Field label="Responsavel">
            <input disabled={readOnly} value={data.gerencial.responsavel} onChange={(event) => onUpdateGerencial("responsavel", event.target.value)} />
          </Field>
          <Field label="Riscos">
            <textarea disabled={readOnly} rows="6" value={data.gerencial.riscos} onChange={(event) => onUpdateGerencial("riscos", event.target.value)} />
          </Field>
          <Field label="Restricoes / impedimentos">
            <textarea disabled={readOnly} rows="6" value={data.gerencial.restricoes} onChange={(event) => onUpdateGerencial("restricoes", event.target.value)} />
          </Field>
          <Field label="Aquisicoes / suprimentos">
            <textarea disabled={readOnly} rows="6" value={data.gerencial.aquisicoes} onChange={(event) => onUpdateGerencial("aquisicoes", event.target.value)} />
          </Field>
          <Field label="SST / qualidade">
            <textarea disabled={readOnly} rows="6" value={data.gerencial.sst} onChange={(event) => onUpdateGerencial("sst", event.target.value)} />
          </Field>
          <Field label="PPC / comentarios operacionais">
            <textarea disabled={readOnly} rows="6" value={data.gerencial.ppc} onChange={(event) => onUpdateGerencial("ppc", event.target.value)} />
          </Field>
          <Field label="Proximas acoes">
            <textarea disabled={readOnly} rows="6" value={data.gerencial.proximasAcoes} onChange={(event) => onUpdateGerencial("proximasAcoes", event.target.value)} />
          </Field>
        </div>
      </Card>

      <Card
        title="Resumo gerencial pronto para e-mail"
        subtitle="Texto consolidado com producao, riscos, restricoes e proximas acoes."
        actions={<button type="button" className="btn btn-secondary" onClick={onCopyResumo}>Copiar resumo</button>}
      >
        <textarea rows="18" value={resumoROS} readOnly className="mono-textarea" />
      </Card>
    </div>
  );
}
