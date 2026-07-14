import { Card } from "@/components/common/Card";
import { Field } from "@/components/common/Field";
import { StatCard } from "@/components/common/StatCard";
import { formatNumber, formatShortDate } from "@/utils/formatters";

export function CadastrosSection({
  data,
  obraAtiva,
  profissionaisObraAtiva,
  afastamentosAtivosNoDia,
  afastamentoEvolucao,
  readOnly,
  onSelectObra,
  onAddProfissional,
  onUpdateProfissional,
  onRemoveProfissional,
  onAddAfastamento,
  onUpdateAfastamento,
  onRemoveAfastamento,
}) {
  const profissionaisIds = new Set(profissionaisObraAtiva.map((item) => item.id));
  const afastamentosDaObra = (data.cadastros?.afastamentos || []).filter((item) => profissionaisIds.has(item.profissionalId));
  const percentualAfastado = profissionaisObraAtiva.length
    ? (afastamentosAtivosNoDia.length / profissionaisObraAtiva.length) * 100
    : 0;

  return (
    <div className="section-stack">
      <div className="stats-grid stats-grid-4">
        <StatCard label="Equipe da obra" value={profissionaisObraAtiva.length} />
        <StatCard label="Afastados hoje" value={afastamentosAtivosNoDia.length} tone="warning" />
        <StatCard label="% afastado hoje" value={`${formatNumber(percentualAfastado)}%`} tone="accent" />
        <StatCard label="Obra ativa" value={obraAtiva?.codigo || "-"} detail={obraAtiva?.nome || "Sem obra"} />
      </div>

      <Card title="Obra em cadastro" subtitle="RH e Engenharia usam esta obra ativa para alocar profissionais e lancar ausencias.">
        <Field label="Selecionar obra">
          <select disabled={readOnly} value={data.multiobra?.obraAtivaId || ""} onChange={(event) => onSelectObra(event.target.value)}>
            {(data.multiobra?.obras || []).map((obra) => (
              <option key={obra.id} value={obra.id}>
                {obra.codigo ? `${obra.codigo} - ` : ""}
                {obra.nome || "Obra sem nome"}
              </option>
            ))}
          </select>
        </Field>
      </Card>

      {readOnly ? <div className="inline-note"><strong>Somente leitura</strong><span>Seu perfil pode consultar Cadastros, mas nao alterar alocacoes.</span></div> : null}

      <Card
        title="Profissionais alocados na obra"
        subtitle="Esta lista alimenta o checklist de presenca do Diario."
        actions={<button type="button" disabled={readOnly} className="btn btn-secondary" onClick={onAddProfissional}>Adicionar profissional</button>}
      >
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Matricula</th>
                <th>Funcao</th>
                <th>Custo hora</th>
                <th>Ativo</th>
                <th>Observacoes</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {profissionaisObraAtiva.map((profissional) => (
                <tr key={profissional.id}>
                  <td><input disabled={readOnly} value={profissional.nome} onChange={(event) => onUpdateProfissional(profissional.id, "nome", event.target.value)} /></td>
                  <td><input disabled={readOnly} value={profissional.matricula} onChange={(event) => onUpdateProfissional(profissional.id, "matricula", event.target.value)} /></td>
                  <td>
                    <input
                      disabled={readOnly}
                      list="cargos-cadastrados"
                      value={profissional.funcao}
                      onChange={(event) => onUpdateProfissional(profissional.id, "funcao", event.target.value)}
                    />
                  </td>
                  <td><input disabled={readOnly} type="number" value={profissional.custoHora} onChange={(event) => onUpdateProfissional(profissional.id, "custoHora", event.target.value)} /></td>
                  <td>
                    <select disabled={readOnly} value={profissional.ativo ? "sim" : "nao"} onChange={(event) => onUpdateProfissional(profissional.id, "ativo", event.target.value === "sim")}>
                      <option value="sim">Sim</option>
                      <option value="nao">Nao</option>
                    </select>
                  </td>
                  <td><input disabled={readOnly} value={profissional.observacoes} onChange={(event) => onUpdateProfissional(profissional.id, "observacoes", event.target.value)} /></td>
                  <td className="actions-cell">
                    <button type="button" disabled={readOnly} className="btn btn-danger" onClick={() => onRemoveProfissional(profissional.id)}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <datalist id="cargos-cadastrados">
          {(data.administracao?.cargos || []).map((cargo) => <option key={cargo} value={cargo} />)}
        </datalist>
      </Card>

      <div className="content-grid content-grid-2">
        <Card
          title="Afastamentos e ausencias"
          subtitle="Atestado medico, afastamento, viagem e ausencia removem o profissional da lista disponivel do Diario no periodo."
          actions={<button type="button" disabled={readOnly} className="btn btn-secondary" onClick={onAddAfastamento}>Adicionar ausencia</button>}
        >
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Profissional</th>
                  <th>Tipo</th>
                  <th>Inicio</th>
                  <th>Fim</th>
                  <th>Motivo</th>
                  <th>Autorizado por</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {afastamentosDaObra.map((afastamento) => (
                  <tr key={afastamento.id}>
                    <td>
                      <select disabled={readOnly} value={afastamento.profissionalId} onChange={(event) => onUpdateAfastamento(afastamento.id, "profissionalId", event.target.value)}>
                        <option value="">Selecione</option>
                        {profissionaisObraAtiva.map((profissional) => (
                          <option key={profissional.id} value={profissional.id}>{profissional.nome || profissional.funcao}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select disabled={readOnly} value={afastamento.tipo} onChange={(event) => onUpdateAfastamento(afastamento.id, "tipo", event.target.value)}>
                        <option value="ausencia">Ausencia</option>
                        <option value="atestado_medico">Atestado medico</option>
                        <option value="afastamento">Afastamento</option>
                        <option value="viagem">Viagem</option>
                      </select>
                    </td>
                    <td><input disabled={readOnly} type="date" value={afastamento.inicio} onChange={(event) => onUpdateAfastamento(afastamento.id, "inicio", event.target.value)} /></td>
                    <td><input disabled={readOnly} type="date" value={afastamento.fim} onChange={(event) => onUpdateAfastamento(afastamento.id, "fim", event.target.value)} /></td>
                    <td><input disabled={readOnly} value={afastamento.motivo} onChange={(event) => onUpdateAfastamento(afastamento.id, "motivo", event.target.value)} /></td>
                    <td><input disabled={readOnly} value={afastamento.autorizadoPor} onChange={(event) => onUpdateAfastamento(afastamento.id, "autorizadoPor", event.target.value)} /></td>
                    <td className="actions-cell">
                      <button type="button" disabled={readOnly} className="btn btn-danger" onClick={() => onRemoveAfastamento(afastamento.id)}>Excluir</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Percentual da equipe afastada" subtitle="Leitura simples por data cadastrada.">
          <div className="bars-list">
            {afastamentoEvolucao.length ? (
              afastamentoEvolucao.map((item) => (
                <div key={item.data} className="bars-item">
                  <div className="bars-copy">
                    <strong>{item.data}</strong>
                    <span>{item.afastados}/{item.total} afastados · {formatNumber(item.percentual)}%</span>
                  </div>
                  <div className="bars-track">
                    <span className="bars-fill bars-fill-green" style={{ width: `${Math.min(item.percentual, 100)}%` }} />
                  </div>
                </div>
              ))
            ) : (
              <div className="chart-empty">Cadastre ausencias para acompanhar a evolucao.</div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
