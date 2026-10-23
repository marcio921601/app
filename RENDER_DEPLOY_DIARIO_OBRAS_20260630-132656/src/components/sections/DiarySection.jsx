import { useMemo, useState } from "react";
import { Card } from "@/components/common/Card";
import { Field } from "@/components/common/Field";
import { StatCard } from "@/components/common/StatCard";
import { CLIMA_OPTIONS } from "@/data/defaults";
import { formatNumber, stripAccents } from "@/utils/formatters";

export function DiarySection({
  data,
  activeDiaryTab,
  totalPrevisto,
  totalPresentes,
  profissionaisDisponiveis,
  profissionaisPresentes,
  afastamentosAtivosNoDia,
  referenciasNivel3,
  referenciasNivel4,
  nivel4ByNivel3,
  servicosCalculados,
  getWeekday,
  readOnly,
  onSetDiaryTab,
  onUpdateCabecalho,
  onTogglePresenca,
  onUpdateAtividade,
  onAddAtividade,
  onRemoveAtividade,
  onToggleAtividadeAlocado,
  onSelectBudgetNivel3ForAtividade,
  onSelectBudgetForAtividade,
  onUpdateField,
}) {
  const [nivel3SearchByActivity, setNivel3SearchByActivity] = useState({});
  const [nivel4SearchByActivity, setNivel4SearchByActivity] = useState({});
  const presencas = new Set(data.presencas || []);
  const profissionaisPresentesIds = new Set(profissionaisPresentes.map((item) => item.id));

  const presentesPorFuncao = useMemo(() => {
    return profissionaisPresentes.reduce((acc, profissional) => {
      const funcao = profissional.funcao || "Sem funcao";
      acc[funcao] = (acc[funcao] || 0) + 1;
      return acc;
    }, {});
  }, [profissionaisPresentes]);

  function getNivel3Results(activity) {
    const search = stripAccents(nivel3SearchByActivity[activity.id] || activity.orcamentoNivel3Ref || activity.tarefa || "");
    if (!search) return referenciasNivel3.slice(0, 6);
    return referenciasNivel3
      .filter((item) => stripAccents(item.referencia).includes(search) || stripAccents(item.descricao).includes(search))
      .slice(0, 8);
  }

  function getNivel4Results(activity) {
    const nivel4Items = nivel4ByNivel3[activity.orcamentoNivel3Ref] || referenciasNivel4.filter((item) => item.nivel3Ref === activity.orcamentoNivel3Ref);
    const search = stripAccents(nivel4SearchByActivity[activity.id] || activity.orcamentoRef || "");
    if (!search) return nivel4Items.slice(0, 8);
    return nivel4Items
      .filter((item) => stripAccents(item.referencia).includes(search) || stripAccents(item.descricao).includes(search))
      .slice(0, 10);
  }

  function toMinutes(value) {
    const [hours, minutes] = String(value || "").split(":").map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return hours * 60 + minutes;
  }

  function overlaps(first, second) {
    const firstStart = toMinutes(first?.inicio);
    const firstEnd = toMinutes(first?.fim);
    const secondStart = toMinutes(second?.inicio);
    const secondEnd = toMinutes(second?.fim);

    if (firstStart === null || firstEnd === null || secondStart === null || secondEnd === null) return false;
    if (firstEnd <= firstStart || secondEnd <= secondStart) return false;

    return firstStart < secondEnd && secondStart < firstEnd;
  }

  function getAllocationConflict(currentIndex, profissionalId) {
    const current = servicosCalculados[currentIndex];
    if (!current || (current.alocados || []).includes(profissionalId)) return null;

    return servicosCalculados.find((atividade, index) => {
      if (index === currentIndex) return false;
      if (!(atividade.alocados || []).includes(profissionalId)) return false;
      return overlaps(current, atividade);
    });
  }

  return (
    <div className="section-stack">
      <Card title="Cabecalho do diario" subtitle="Dados gerais do dia; o lancamento operacional fica dividido abaixo.">
        <div className="form-grid form-grid-4">
          <Field label="Obra" className="span-2">
            <input readOnly value={data.cabecalho.obra} />
          </Field>
          <Field label="No da folha">
            <input disabled={readOnly} value={data.cabecalho.folha} onChange={(event) => onUpdateCabecalho("folha", event.target.value)} />
          </Field>
          <Field label="Data">
            <input disabled={readOnly} type="date" value={data.cabecalho.data} onChange={(event) => onUpdateCabecalho("data", event.target.value)} />
          </Field>
          <Field label="Clima manha">
            <select disabled={readOnly} value={data.cabecalho.climaManha} onChange={(event) => onUpdateCabecalho("climaManha", event.target.value)}>
              {CLIMA_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Periodo manha">
            <input disabled={readOnly} value={data.cabecalho.periodoManha} onChange={(event) => onUpdateCabecalho("periodoManha", event.target.value)} />
          </Field>
          <Field label="Clima tarde">
            <select disabled={readOnly} value={data.cabecalho.climaTarde} onChange={(event) => onUpdateCabecalho("climaTarde", event.target.value)}>
              {CLIMA_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Periodo tarde">
            <input disabled={readOnly} value={data.cabecalho.periodoTarde} onChange={(event) => onUpdateCabecalho("periodoTarde", event.target.value)} />
          </Field>
          <div className="weekday-box">
            <span>Dia da semana</span>
            <strong>{getWeekday(data.cabecalho.data) || "-"}</strong>
          </div>
        </div>
      </Card>

      <div className="stats-grid stats-grid-4">
        <StatCard label="Disponiveis" value={totalPrevisto} />
        <StatCard label="Presentes" value={totalPresentes} tone="success" />
        <StatCard label="Afastados / ausentes" value={afastamentosAtivosNoDia.length} tone="warning" />
        <StatCard label="Atividades do dia" value={data.atividades.length} />
      </div>

      <div className="subtabs-bar">
        <button type="button" className={activeDiaryTab === "presenca" ? "subtab-button is-active" : "subtab-button"} onClick={() => onSetDiaryTab("presenca")}>
          1. Funcionarios presentes
        </button>
        <button type="button" className={activeDiaryTab === "atividades" ? "subtab-button is-active" : "subtab-button"} onClick={() => onSetDiaryTab("atividades")}>
          2. Atividades do dia
        </button>
      </div>

      {readOnly ? <div className="inline-note"><strong>Somente leitura</strong><span>Seu perfil pode consultar esta aba, mas nao alterar o diario.</span></div> : null}

      {activeDiaryTab === "presenca" ? (
        <div className="content-grid content-grid-2wide">
          <Card title="Quem veio hoje" subtitle="A lista mostra apenas profissionais cadastrados na obra ativa e sem afastamento no dia.">
            <div className="check-grid">
              {profissionaisDisponiveis.map((profissional) => (
                <button
                  key={profissional.id}
                  type="button"
                  disabled={readOnly}
                  className={presencas.has(profissional.id) ? "check-card is-checked" : "check-card"}
                  onClick={() => onTogglePresenca(profissional.id)}
                >
                  <span className="check-mark">{presencas.has(profissional.id) ? "OK" : ""}</span>
                  <strong>{profissional.nome || "Sem nome"}</strong>
                  <small>{profissional.funcao || "Sem funcao"}</small>
                </button>
              ))}
            </div>
          </Card>

          <div className="section-stack">
            <Card title="Resumo por funcao">
              <div className="mini-list">
                {Object.entries(presentesPorFuncao).length ? (
                  Object.entries(presentesPorFuncao).map(([funcao, total]) => (
                    <div key={funcao} className="mini-list-row">
                      <span>{funcao}</span>
                      <strong>{total}</strong>
                    </div>
                  ))
                ) : (
                  <div className="chart-empty">Marque quem veio para montar o resumo.</div>
                )}
              </div>
            </Card>

            <Card title="Indisponiveis no dia" subtitle="Afastamentos, atestados, viagens e ausencias lancadas em Cadastros.">
              <div className="mini-list">
                {afastamentosAtivosNoDia.length ? (
                  afastamentosAtivosNoDia.map(({ profissional, afastamento }) => (
                    <div key={afastamento.id} className="mini-list-row">
                      <span>{profissional.nome} · {afastamento.tipo}</span>
                      <strong>{afastamento.motivo || "-"}</strong>
                    </div>
                  ))
                ) : (
                  <div className="chart-empty">Nenhum profissional afastado nesta data.</div>
                )}
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {activeDiaryTab === "atividades" ? (
        <Card
          title="Atividades do dia"
          subtitle="Selecione primeiro o item de nivel 3 e depois o subitem de nivel 4 dentro dele."
          actions={<button type="button" disabled={readOnly} className="btn btn-secondary" onClick={onAddAtividade}>Adicionar atividade</button>}
        >
          <div className="stack">
            {servicosCalculados.map((item, index) => (
              <div key={item.id} className="activity-card">
                <div className="activity-head">
                  <div>
                    <strong>Atividade {index + 1}</strong>
                    <p className="card-subtitle">
                      N3: {item.orcamentoNivel3Ref ? `${item.orcamentoNivel3Ref} · ${item.orcamentoNivel3Descricao}` : "pendente"} | N4:{" "}
                      {item.orcamentoRef ? `${item.orcamentoRef} · ${item.itemOrcado?.descricao || item.orcamentoDescricao}` : "pendente"}
                    </p>
                  </div>
                  <button type="button" disabled={readOnly} className="btn btn-danger" onClick={() => onRemoveAtividade(index)}>Excluir</button>
                </div>

                <div className="form-grid form-grid-4">
                  <Field label="Inicio">
                    <input disabled={readOnly} value={item.inicio} onChange={(event) => onUpdateAtividade(index, "inicio", event.target.value)} />
                  </Field>
                  <Field label="Fim">
                    <input disabled={readOnly} value={item.fim} onChange={(event) => onUpdateAtividade(index, "fim", event.target.value)} />
                  </Field>
                  <Field label="Local / frente" className="span-2">
                    <input disabled={readOnly} value={item.local} onChange={(event) => onUpdateAtividade(index, "local", event.target.value)} />
                  </Field>
                  <Field label="Buscar item nivel 3" className="span-2">
                    <input
                      disabled={readOnly}
                      value={nivel3SearchByActivity[item.id] ?? item.orcamentoNivel3Ref}
                      onChange={(event) => setNivel3SearchByActivity((prev) => ({ ...prev, [item.id]: event.target.value }))}
                      placeholder="Codigo ou nome do nivel 3"
                    />
                  </Field>
                  <Field label="Buscar subitem nivel 4" className="span-2">
                    <input
                      disabled={readOnly || !item.orcamentoNivel3Ref}
                      value={nivel4SearchByActivity[item.id] ?? item.orcamentoRef}
                      onChange={(event) => setNivel4SearchByActivity((prev) => ({ ...prev, [item.id]: event.target.value }))}
                      placeholder={item.orcamentoNivel3Ref ? "Codigo ou nome do nivel 4" : "Selecione o nivel 3 primeiro"}
                    />
                  </Field>
                  <Field label="Tarefa" className="span-2">
                    <textarea disabled={readOnly} rows="3" value={item.tarefa} onChange={(event) => onUpdateAtividade(index, "tarefa", event.target.value)} />
                  </Field>
                </div>

                <div className="budget-selected-grid">
                  <div>
                    <span>Item nivel 3</span>
                    <strong>{item.orcamentoNivel3Ref || "-"}</strong>
                    <small>{item.orcamentoNivel3Descricao || item.itemNivel3?.descricao || "Selecione o nivel 3"}</small>
                  </div>
                  <div>
                    <span>Subitem nivel 4</span>
                    <strong>{item.orcamentoRef || "-"}</strong>
                    <small>{item.itemOrcado?.descricao || item.orcamentoDescricao || "Selecione o subitem nivel 4"}</small>
                  </div>
                </div>

                <div className="budget-result-list">
                  <div className="budget-result-title">Item nivel 3</div>
                  {getNivel3Results(item).map((orcamento) => (
                    <button
                      key={`${item.id}-${orcamento.referencia}`}
                      type="button"
                      disabled={readOnly}
                      className={item.orcamentoNivel3Ref === orcamento.referencia ? "budget-result is-selected" : "budget-result"}
                      onClick={() => {
                        onSelectBudgetNivel3ForAtividade(index, orcamento.referencia);
                        setNivel4SearchByActivity((prev) => ({ ...prev, [item.id]: "" }));
                      }}
                    >
                      <strong>{orcamento.referencia}</strong>
                      <span>{orcamento.descricao}</span>
                      <small>N3</small>
                    </button>
                  ))}
                </div>

                <div className="budget-result-list">
                  <div className="budget-result-title">Subitem nivel 4</div>
                  {item.orcamentoNivel3Ref ? (
                    getNivel4Results(item).length ? (
                      getNivel4Results(item).map((orcamento) => (
                        <button
                          key={`${item.id}-${orcamento.referencia}`}
                          type="button"
                          disabled={readOnly}
                          className={item.orcamentoRef === orcamento.referencia ? "budget-result is-selected" : "budget-result"}
                          onClick={() => onSelectBudgetForAtividade(index, orcamento.referencia)}
                        >
                          <strong>{orcamento.referencia}</strong>
                          <span>{orcamento.descricao}</span>
                          <small>{orcamento.unidade || "-"}</small>
                        </button>
                      ))
                    ) : (
                      <div className="chart-empty">Nenhum subitem nivel 4 encontrado dentro deste nivel 3.</div>
                    )
                  ) : (
                    <div className="chart-empty">Selecione um item de nivel 3 para liberar os subitens de nivel 4.</div>
                  )}
                </div>

                <div className="allocation-block">
                  <div className="allocation-head">
                    <strong>Profissionais alocados</strong>
                    <span>{item.qtdPessoas} pessoas · {formatNumber(item.horasTrabalhadas)} h · {formatNumber(item.hh)} HH</span>
                  </div>
                  <div className="check-grid check-grid-compact">
                    {profissionaisPresentes.map((profissional) => {
                      const isAlocado = (item.alocados || []).includes(profissional.id) && profissionaisPresentesIds.has(profissional.id);
                      const conflito = getAllocationConflict(index, profissional.id);
                      const isBlocked = Boolean(conflito) && !isAlocado;
                      const className = [isAlocado ? "check-card is-checked" : "check-card", isBlocked ? "is-disabled" : ""].filter(Boolean).join(" ");

                      return (
                        <button
                          key={`${item.id}-${profissional.id}`}
                          type="button"
                          disabled={readOnly || isBlocked}
                          className={className}
                          title={isBlocked ? `Ja alocado em ${conflito.local || conflito.tarefa || "outra atividade"} (${conflito.inicio}-${conflito.fim})` : ""}
                          onClick={() => onToggleAtividadeAlocado(index, profissional.id)}
                        >
                          <span className="check-mark">{isAlocado ? "OK" : isBlocked ? "!" : ""}</span>
                          <strong>{profissional.nome || "Sem nome"}</strong>
                          <small>{profissional.funcao || "Sem funcao"}</small>
                          {isBlocked ? (
                            <small className="conflict-note">
                              Ocupado {conflito.inicio}-{conflito.fim}
                            </small>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                  <p className="field-hint">Por funcao: {item.pessoasPorFuncaoTexto}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="content-grid content-grid-3">
        <Card title="Observacoes">
          <textarea disabled={readOnly} rows="8" value={data.observacoes} onChange={(event) => onUpdateField("observacoes", event.target.value)} />
        </Card>
        <Card title="Consideracoes">
          <textarea disabled={readOnly} rows="8" value={data.consideracoes} onChange={(event) => onUpdateField("consideracoes", event.target.value)} />
        </Card>
        <Card title="Equipamentos">
          <textarea disabled={readOnly} rows="8" value={data.equipamentos} onChange={(event) => onUpdateField("equipamentos", event.target.value)} />
        </Card>
      </div>
    </div>
  );
}
