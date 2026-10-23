import {useMemo} from 'react';
import {calculateDiary} from '../../shared/diary.mjs';
import {aggregateProduction,aggregateBudgetHistory} from '../../shared/reports.mjs';
import {countLines,formatCurrency,formatNumber,formatShortDate,getWeekday,joinLines,stripAccents,toNumber,uniqueSorted} from '../utils/formatters';
import {validateAppData} from '../utils/validation';
function isDateInside(date, inicio, fim) {
  if (!date || !inicio) return false;
  const end = fim || inicio;
  return date >= inicio && date <= end;
}

function getAfastamentoAtivo(profissionalId, afastamentos, date) {
  return (afastamentos || []).find((item) => item.profissionalId === profissionalId && isDateInside(date, item.inicio, item.fim));
}

function summarizeByFuncao(profissionais = []) {
  return profissionais.reduce((acc, profissional) => {
    const funcao = profissional.funcao || "Sem funcao";
    acc[funcao] = (acc[funcao] || 0) + 1;
    return acc;
  }, {});
}

function formatFuncaoResumo(resumo = {}) {
  return Object.entries(resumo)
    .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
    .map(([funcao, total]) => `${funcao}: ${total}`)
    .join(" | ");
}

function resolveNivel3ForNivel4(itemNivel4, referenciasNivel3, fallbackNivel3 = null) {
  const ref = String(itemNivel4?.referencia || "");
  if (!ref) return fallbackNivel3;

  return (
    [...referenciasNivel3]
      .filter((item) => {
        const parentRef = String(item.referencia || "");
        return parentRef && ref !== parentRef && ref.startsWith(parentRef);
      })
      .sort((a, b) => String(b.referencia || "").length - String(a.referencia || "").length)[0] ||
    fallbackNivel3 ||
    null
  );
}

function buildFuncionariosResumo(profissionaisObra, profissionaisPresentes) {
  const previstos = summarizeByFuncao(profissionaisObra);
  const presentes = summarizeByFuncao(profissionaisPresentes);
  return uniqueSorted([...Object.keys(previstos), ...Object.keys(presentes)]).map((funcao) => ({
    funcao,
    previsto: previstos[funcao] || 0,
    presente: presentes[funcao] || 0,
    observacoes: "",
  }));
}


export function useDiaryDerived(data,budgetSearch,dashboardFilters) {
  const obraAtiva = useMemo(() => {
    return (data.multiobra?.obras || []).find((item) => item.id === data.multiobra?.obraAtivaId) || null;
  }, [data.multiobra]);

  const budgetHierarchy = useMemo(() => {
    const nivel3 = [];
    const nivel4 = [];
    const nivel4ByNivel3 = {};
    let currentNivel3 = null;

    data.orcamento.forEach((item) => {
      const nivel = Number(item.nivel);
      if (nivel === 3) {
        currentNivel3 = item;
        nivel3.push(item);
        if (!nivel4ByNivel3[item.referencia]) nivel4ByNivel3[item.referencia] = [];
      }

      if (nivel === 4) {
        const parent = resolveNivel3ForNivel4(item, nivel3, currentNivel3);
        const enriched = {
          ...item,
          nivel3Ref: parent?.referencia || "",
          nivel3Descricao: parent?.descricao || "",
        };
        nivel4.push(enriched);
        if (parent?.referencia) {
          if (!nivel4ByNivel3[parent.referencia]) nivel4ByNivel3[parent.referencia] = [];
          nivel4ByNivel3[parent.referencia].push(enriched);
        }
      }
    });

    return { nivel3, nivel4, nivel4ByNivel3 };
  }, [data.orcamento]);

  const budgetNivel4Map = useMemo(() => {
    const map = new Map();
    budgetHierarchy.nivel4.forEach((item) => map.set(String(item.referencia), item));
    return map;
  }, [budgetHierarchy.nivel4]);

  const profissionaisObraAtiva = useMemo(() => {
    if (!obraAtiva) return [];
    return (data.cadastros?.profissionais || []).filter((item) => item.obraId === obraAtiva.id);
  }, [data.cadastros?.profissionais, obraAtiva]);

  const profissionaisPorId = useMemo(() => {
    const map = new Map();
    (data.cadastros?.profissionais || []).forEach((item) => map.set(item.id, item));
    return map;
  }, [data.cadastros?.profissionais]);

  const afastamentosAtivosNoDia = useMemo(() => {
    const date = data.cabecalho?.data || "";
    return profissionaisObraAtiva
      .map((profissional) => ({
        profissional,
        afastamento: getAfastamentoAtivo(profissional.id, data.cadastros?.afastamentos || [], date),
      }))
      .filter((item) => item.afastamento);
  }, [data.cabecalho?.data, data.cadastros?.afastamentos, profissionaisObraAtiva]);

  const profissionaisDisponiveis = useMemo(() => {
    const afastados = new Set(afastamentosAtivosNoDia.map((item) => item.profissional.id));
    return profissionaisObraAtiva.filter((item) => item.ativo !== false && !afastados.has(item.id));
  }, [afastamentosAtivosNoDia, profissionaisObraAtiva]);

  const profissionaisPresentes = useMemo(() => {
    const disponiveis = new Set(profissionaisDisponiveis.map((item) => item.id));
    const presencas = new Set(data.presencas || []);
    return profissionaisDisponiveis.filter((item) => disponiveis.has(item.id) && presencas.has(item.id));
  }, [data.presencas, profissionaisDisponiveis]);

  const totalPrevisto = profissionaisDisponiveis.length;
  const totalPresentes = profissionaisPresentes.length;

  const funcionariosResumo = useMemo(
    () => buildFuncionariosResumo(profissionaisObraAtiva, profissionaisPresentes),
    [profissionaisObraAtiva, profissionaisPresentes]
  );

  const calculation = useMemo(() => data._confirmedSummary?.atividades?{atividades:data._confirmedSummary.atividades,summary:data._confirmedSummary}:calculateDiary(data, {obra:obraAtiva||{},profissionais:profissionaisObraAtiva,afastamentos:data.cadastros.afastamentos,orcamento:data.orcamento}),[data.atividades,data.presencas,data.orcamento,profissionaisObraAtiva,data._confirmedSummary]);
  const atividadesCalculadas = calculation.atividades;
  const servicosCalculados = atividadesCalculadas;
  const totalHH = useMemo(() => servicosCalculados.reduce((acc, item) => acc + item.hh, 0), [servicosCalculados]);
  const totalQtd = calculation.summary.totalQtd;
  const totalOrcamento = useMemo(
    () => data.orcamento.reduce((acc, item) => acc + toNumber(item.precoTotal), 0),
    [data.orcamento]
  );
  const totalRealizadoEstimado = useMemo(
    () => servicosCalculados.reduce((acc, item) => acc + toNumber(item.valorExecutado), 0),
    [servicosCalculados]
  );

  const producaoPorUnidade = useMemo(() => {
    const grouped = {};
    servicosCalculados.forEach((item) => {
      const unidade = item.unidade || "un";
      if (!grouped[unidade]) grouped[unidade] = { unidade, quantidade: 0, atividades: 0, hh: 0 };
      grouped[unidade].quantidade += toNumber(item.quantidadeProduzida);
      grouped[unidade].hh += toNumber(item.hh);
      grouped[unidade].atividades += toNumber(item.quantidadeProduzida) > 0 ? 1 : 0;
    });
    return Object.values(grouped).sort((a, b) => a.unidade.localeCompare(b.unidade, "pt-BR"));
  }, [servicosCalculados]);

  const budgetFiltered = useMemo(() => {
    const search = stripAccents(budgetSearch);
    const indexedRows = data.orcamento.map((item, index) => ({ ...item, __index: index }));
    if (!search) return indexedRows;

    return indexedRows.filter((item) => {
      return (
        stripAccents(item.referencia).includes(search) ||
        stripAccents(item.descricao).includes(search) ||
        stripAccents(item.unidade).includes(search)
      );
    });
  }, [budgetSearch, data.orcamento]);

  const referenciasNivel3 = budgetHierarchy.nivel3;
  const referenciasNivel4 = budgetHierarchy.nivel4;
  const nivel4ByNivel3 = budgetHierarchy.nivel4ByNivel3;
  const servicosVinculados = useMemo(
    () => servicosCalculados.filter((item) => item.orcamentoRef).length,
    [servicosCalculados]
  );
  const mediaProdutividade = useMemo(() => {
    const validos = servicosCalculados.filter((item) => item.prodUnPorHH > 0);
    if (!validos.length) return 0;
    return validos.reduce((acc, item) => acc + item.prodUnPorHH, 0) / validos.length;
  }, [servicosCalculados]);

  const filtrosObra = useMemo(() => uniqueSorted(data.historico.map((item) => item.cabecalho?.obra)), [data.historico]);
  const filtrosFrente = useMemo(
    () => uniqueSorted(data.historico.flatMap((item) => (item.atividades || []).map((atividade) => atividade.local))),
    [data.historico]
  );
  const filtrosEquipe = useMemo(
    () =>
      uniqueSorted(
        data.historico.flatMap((item) =>
          (item.atividades || []).map((atividade) => atividade.equipeResumo || atividade.equipe || atividade.pessoasPorFuncaoTexto)
        )
      ),
    [data.historico]
  );

  const historicoOrdenado = useMemo(() => {
    return [...(data.historico || [])].sort((a, b) => {
      const ad = new Date(a.cabecalho?.data || a.createdAt || 0).getTime();
      const bd = new Date(b.cabecalho?.data || b.createdAt || 0).getTime();
      return bd - ad;
    });
  }, [data.historico]);

  const historicoFiltrado = useMemo(() => {
    return historicoOrdenado.filter((item) => {
      const obraOk = dashboardFilters.obra === "todas" || item.cabecalho?.obra === dashboardFilters.obra;
      const frenteOk =
        dashboardFilters.frente === "todas" ||
        (item.atividades || []).some((atividade) => stripAccents(atividade.local).includes(stripAccents(dashboardFilters.frente)));
      const equipeOk =
        dashboardFilters.equipe === "todas" ||
        (item.atividades || []).some((atividade) =>
          stripAccents(atividade.equipeResumo || atividade.equipe || atividade.pessoasPorFuncaoTexto).includes(stripAccents(dashboardFilters.equipe))
        );
      const dataItem = item.cabecalho?.data || "";
      const deOk = !dashboardFilters.de || dataItem >= dashboardFilters.de;
      const ateOk = !dashboardFilters.ate || dataItem <= dashboardFilters.ate;
      return obraOk && frenteOk && equipeOk && deOk && ateOk;
    });
  }, [historicoOrdenado, dashboardFilters]);

  const dashboardResumo = useMemo(() => {
    const dias = historicoFiltrado.length;
    const hh = historicoFiltrado.reduce((acc, item) => acc + toNumber(item.resumo?.totalHH), 0);
    const production=aggregateProduction(historicoFiltrado.map(item=>item.resumo));
    const qtd = production.quantidade;
    const valor = historicoFiltrado.reduce((acc, item) => acc + toNumber(item.resumo?.valorRealizado), 0);
    const produtividade = production.produtividade;
    const sameWork=historicoFiltrado.every(item=>item.obraId===obraAtiva?.id);
    const progressoFinanceiro = sameWork&&totalOrcamento > 0 ? (valor / totalOrcamento) * 100 : null;
    return { dias, hh, qtd, valor, produtividade, progressoFinanceiro };
  }, [historicoFiltrado, totalOrcamento,obraAtiva]);

  const dashboardEvolucao = useMemo(() => {
    return [...historicoFiltrado]
      .sort((a, b) => (a.cabecalho?.data || "").localeCompare(b.cabecalho?.data || ""))
      .map((item) => ({
        data: formatShortDate(item.cabecalho?.data),
        hh: toNumber(item.resumo?.totalHH),
        quantidade: toNumber(item.resumo?.totalQtd),
        valor: toNumber(item.resumo?.valorRealizado),
      }));
  }, [historicoFiltrado]);

  const dashboardServicos = useMemo(() => {
    const grouped = {};
    historicoFiltrado.forEach((snapshot) => {
      (snapshot.servicos || []).forEach((servico) => {
        const label = servico.servico || servico.orcamentoDescricao || servico.orcamentoRef || "Sem identificacao";
        const key=JSON.stringify([snapshot.obraId,label,servico.unidade]);
        if (!grouped[key]) {
          grouped[key] = { servico: label+' ('+servico.unidade+')', hh: 0, quantidade: 0 };
        }
        grouped[key].hh += toNumber(servico.hh);
        grouped[key].quantidade += toNumber(servico.quantidadeProduzida);
      });
    });

    return Object.values(grouped)
      .map((item) => ({ ...item, produtividade: item.hh > 0 ? item.quantidade / item.hh : 0 }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 8);
  }, [historicoFiltrado]);

  const dashboardOrcamento = useMemo(() => aggregateBudgetHistory(historicoFiltrado,{obraId:obraAtiva?.id,orcamento:data.orcamento})
    .sort((a,b)=>b.valorRealizado-a.valorRealizado).slice(0,12),[historicoFiltrado,obraAtiva,data.orcamento]);

  const afastamentoEvolucao = useMemo(() => {
    const dates = uniqueSorted([
      data.cabecalho?.data,
      ...(data.cadastros?.afastamentos || []).flatMap((item) => [item.inicio, item.fim]),
    ]).filter(Boolean);

    return dates.slice(-12).map((date) => {
      const afastados = profissionaisObraAtiva.filter((profissional) =>
        getAfastamentoAtivo(profissional.id, data.cadastros?.afastamentos || [], date)
      ).length;
      const total = profissionaisObraAtiva.length;
      return {
        data: formatShortDate(date),
        percentual: total > 0 ? (afastados / total) * 100 : 0,
        afastados,
        total,
      };
    });
  }, [data.cabecalho?.data, data.cadastros?.afastamentos, profissionaisObraAtiva]);

  const gerencialIndicadores = useMemo(() => {
    return {
      riscos: countLines(data.gerencial.riscos),
      restricoes: countLines(data.gerencial.restricoes),
      aquisicoes: countLines(data.gerencial.aquisicoes),
      proximasAcoes: countLines(data.gerencial.proximasAcoes),
      produtividade: mediaProdutividade,
      progressoFinanceiro: totalOrcamento > 0 ? (totalRealizadoEstimado / totalOrcamento) * 100 : 0,
    };
  }, [data.gerencial, mediaProdutividade, totalOrcamento, totalRealizadoEstimado]);

  const historicoObraAtiva = useMemo(() => {
    if (!obraAtiva) return [];
    return historicoOrdenado.filter((item) => item.obraId === obraAtiva.id || item.cabecalho?.obra === obraAtiva.nome);
  }, [historicoOrdenado, obraAtiva]);

  const indicadoresObraAtiva = useMemo(() => {
    const dias = historicoObraAtiva.length;
    const hh = historicoObraAtiva.reduce((acc, item) => acc + toNumber(item.resumo?.totalHH), 0);
    const valor = historicoObraAtiva.reduce((acc, item) => acc + toNumber(item.resumo?.valorRealizado), 0);
    return { dias, hh, valor };
  }, [historicoObraAtiva]);

  const resumoROS = useMemo(() => {
    const principaisFrentes = uniqueSorted(data.atividades.map((item) => item.local)).join(", ") || "-";
    const equipeTexto = funcionariosResumo
      .filter((item) => item.presente || item.previsto)
      .map((item) => `${item.funcao}: ${item.presente}/${item.previsto}`)
      .join("; ") || "-";
    const servicosTexto =
      servicosCalculados
        .filter((item) => item.servico || item.orcamentoRef)
        .map(
          (item) =>
            `${item.servico || item.itemOrcado?.descricao || item.orcamentoRef}: ${formatNumber(item.quantidadeProduzida)} ${
              item.itemOrcado?.unidade || item.unidade
            } | ${item.pessoasPorFuncaoTexto}`
        )
        .join("; ") || "-";
    const unidadesTexto = producaoPorUnidade.map((item) => `${formatNumber(item.quantidade)} ${item.unidade}`).join("; ") || "-";

    return [
      `OBRA: ${data.cabecalho.obra}`,
      `CODIGO: ${obraAtiva?.codigo || "-"}`,
      `CLIENTE: ${obraAtiva?.cliente || "-"}`,
      `LOCAL: ${obraAtiva?.local || "-"}`,
      `DATA: ${formatShortDate(data.cabecalho.data)}`,
      `RESPONSAVEL: ${data.gerencial.responsavel || obraAtiva?.responsavel || "-"}`,
      `PRAZO / MARCO: ${data.gerencial.prazoMarco || obraAtiva?.prazo || "-"}`,
      `EQUIPE DO DIA: disponiveis ${totalPrevisto} / presentes ${totalPresentes} | ${equipeTexto}`,
      `FRENTES EM ATUACAO: ${principaisFrentes}`,
      `PRODUCAO DO DIA: ${servicosTexto}`,
      `PRODUCAO POR UNIDADE: ${unidadesTexto}`,
      `HH TOTAL: ${formatNumber(totalHH)} | VALOR REALIZADO ESTIMADO: ${formatCurrency(totalRealizadoEstimado)}`,
      `PROGRESSO FINANCEIRO ESTIMADO: ${formatNumber(gerencialIndicadores.progressoFinanceiro)}%`,
      `RISCOS: ${joinLines(data.gerencial.riscos) || "-"}`,
      `RESTRICOES: ${joinLines(data.gerencial.restricoes) || "-"}`,
      `AQUISICOES: ${joinLines(data.gerencial.aquisicoes) || "-"}`,
      `SST / QUALIDADE: ${joinLines(data.gerencial.sst) || "-"}`,
      `PPC / COMENTARIOS: ${joinLines(data.gerencial.ppc) || "-"}`,
      `PROXIMAS ACOES: ${joinLines(data.gerencial.proximasAcoes) || "-"}`,
      `OBSERVACOES GERAIS: ${data.observacoes || "-"}`,
      `CONSIDERACOES: ${data.consideracoes || "-"}`,
    ].join("\n");
  }, [
    data,
    funcionariosResumo,
    servicosCalculados,
    producaoPorUnidade,
    totalPrevisto,
    totalPresentes,
    totalHH,
    totalRealizadoEstimado,
    gerencialIndicadores.progressoFinanceiro,
    obraAtiva,
  ]);

  const validation = useMemo(() => validateAppData(data, dashboardFilters), [data, dashboardFilters]);


return {
      obraAtiva,
      totalPrevisto,
      totalPresentes,
      totalHH,
      totalQtd,
      totalOrcamento,
      totalRealizadoEstimado,
      budgetFiltered,
      referenciasNivel3,
      referenciasNivel4,
      nivel4ByNivel3,
      servicosCalculados,
      servicosVinculados,
      mediaProdutividade,
      producaoPorUnidade,
      profissionaisObraAtiva,
      profissionaisDisponiveis,
      profissionaisPresentes,
      profissionaisPorId,
      afastamentosAtivosNoDia,
      funcionariosResumo,
      afastamentoEvolucao,
      filtrosObra,
      filtrosFrente,
      filtrosEquipe,
      historicoOrdenado,
      historicoFiltrado,
      dashboardResumo,
      dashboardEvolucao,
      dashboardServicos,
      dashboardOrcamento,
      gerencialIndicadores,
      historicoObraAtiva,
      indicadoresObraAtiva,
      resumoROS,
      validation,
      getWeekday,
    };
}

