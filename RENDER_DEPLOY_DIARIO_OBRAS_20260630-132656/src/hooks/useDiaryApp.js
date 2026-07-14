import { useEffect, useMemo, useRef, useState } from "react";
import {
  ACCESS_PROFILES,
  DASHBOARD_WIDGETS,
  STORAGE_KEY,
  TAB_ITEMS,
  buildInitialData,
  createAfastamento,
  createAccessProfile,
  createAtividade,
  createFuncionario,
  createObra,
  createProfissional,
  createServico,
  createUsuario,
} from "@/data/defaults";
import { backendClient } from "@/services/backend";
import { exportAppData, loadAppData, saveAppData } from "@/services/storage";
import {
  countLines,
  formatCurrency,
  formatNumber,
  formatShortDate,
  getWeekday,
  joinLines,
  normalizeBudgetRow,
  stripAccents,
  toNumber,
  uniqueSorted,
} from "@/utils/formatters";
import { validateAppData } from "@/utils/validation";

function cloneList(list = []) {
  return list.map((item) => ({ ...item }));
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value || "").split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function calculateHours(inicio, fim) {
  const start = timeToMinutes(inicio);
  const end = timeToMinutes(fim);
  if (start === null || end === null || end <= start) return 0;
  return (end - start) / 60;
}

function activitiesOverlap(first, second) {
  const firstStart = timeToMinutes(first?.inicio);
  const firstEnd = timeToMinutes(first?.fim);
  const secondStart = timeToMinutes(second?.inicio);
  const secondEnd = timeToMinutes(second?.fim);

  if (firstStart === null || firstEnd === null || secondStart === null || secondEnd === null) return false;
  if (firstEnd <= firstStart || secondEnd <= secondStart) return false;

  return firstStart < secondEnd && secondStart < firstEnd;
}

function findAllocationConflict(atividades, currentIndex, profissionalId) {
  const target = atividades[currentIndex];
  if (!target) return null;

  return atividades.find((atividade, index) => {
    if (index === currentIndex) return false;
    if (!(atividade.alocados || []).includes(profissionalId)) return false;
    return activitiesOverlap(target, atividade);
  });
}

function getAccess(perfil, accessProfiles = ACCESS_PROFILES) {
  return accessProfiles[perfil] || accessProfiles.apontador || ACCESS_PROFILES.apontador;
}

function normalizeAccessProfilesForMap(perfis = []) {
  const source = Array.isArray(perfis) && perfis.length ? perfis : Object.values(ACCESS_PROFILES);
  const map = {};
  source.forEach((item) => {
    const profile = createAccessProfile(item);
    map[profile.id] = profile;
  });
  if (!Object.values(map).some((item) => item.isAdmin)) {
    map.gerencia = ACCESS_PROFILES.gerencia;
  }
  return map;
}

function makeBudgetDedupKey(row = {}) {
  return JSON.stringify({
    nivel: toNumber(row.nivel),
    referencia: String(row.referencia || "").trim(),
    descricao: String(row.descricao || "").trim(),
    qtdeOrcada: toNumber(row.qtdeOrcada),
    unidade: String(row.unidade || "").trim(),
    precoTotal: toNumber(row.precoTotal),
    bdi: toNumber(row.bdi),
  });
}

function mergeBudgetRows(existingRows = [], incomingRows = []) {
  const keys = new Set(existingRows.map(makeBudgetDedupKey));
  const merged = [...existingRows];
  let skipped = 0;

  incomingRows.forEach((row) => {
    const key = makeBudgetDedupKey(row);
    if (keys.has(key)) {
      skipped += 1;
      return;
    }
    keys.add(key);
    merged.push(row);
  });

  return { rows: merged, added: merged.length - existingRows.length, skipped };
}

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

function detectSnapshotChanges(previous, next) {
  if (!previous) return [];

  const checks = [
    ["Cabecalho", previous.cabecalho, next.cabecalho],
    ["Presencas", previous.presencas, next.presencas],
    ["Atividades", previous.atividades, next.atividades],
    ["Produtividade", previous.servicos, next.servicos],
    ["Observacoes", previous.observacoes, next.observacoes],
    ["Consideracoes", previous.consideracoes, next.consideracoes],
    ["Equipamentos", previous.equipamentos, next.equipamentos],
    ["Gerencial", previous.gerencial, next.gerencial],
  ];

  return checks.filter(([, before, after]) => JSON.stringify(before || null) !== JSON.stringify(after || null)).map(([label]) => label);
}

export function useDiaryApp() {
  const firstPersistRef = useRef(true);
  const [activeTab, setActiveTabState] = useState("multiobra");
  const [activeDiaryTab, setActiveDiaryTab] = useState("presenca");
  const [budgetSearch, setBudgetSearch] = useState("");
  const [statusMessage, setStatusMessage] = useState("Autosave local ativo. O app mantem compatibilidade com a base anterior.");
  const [saveState, setSaveState] = useState("idle");
  const [syncState, setSyncState] = useState("idle");
  const [dashboardFilters, setDashboardFilters] = useState({
    obra: "todas",
    frente: "todas",
    equipe: "todas",
    de: "",
    ate: "",
  });
  const [data, setData] = useState(() => loadAppData());
  const accessProfiles = useMemo(
    () => normalizeAccessProfilesForMap(data.administracao?.perfis || []),
    [data.administracao?.perfis]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(STORAGE_KEY)) {
      setStatusMessage("Dados restaurados do navegador com migracao de compatibilidade aplicada.");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const perfilParam = stripAccents(params.get("perfil") || params.get("usuario") || "");
    if (!perfilParam) return;

    setData((prev) => {
      const usuarios = prev.administracao?.usuarios || [];
      const target = usuarios.find((usuario) => {
        const perfil = stripAccents(usuario.perfil);
        const nome = stripAccents(usuario.nome);
        const login = stripAccents(usuario.login);
        return (
          perfil === perfilParam ||
          nome === perfilParam ||
          login === perfilParam ||
          (perfilParam === "administrativo" && usuario.perfil === "gerencia")
        );
      });

      if (!target) return prev;

      const next = {
        ...prev,
        administracao: {
          ...prev.administracao,
          usuarioAtivoId: target.id,
        },
        updatedAt: new Date().toISOString(),
      };
      saveAppData(next);
      setActiveTabState(getAccess(target.perfil).tabs[0] || "diario");
      setStatusMessage(`Perfil ativo alterado para ${getAccess(target.perfil).label}.`);
      return next;
    });

    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  useEffect(() => {
    if (firstPersistRef.current) {
      firstPersistRef.current = false;
      return;
    }

    const timeout = window.setTimeout(() => {
      saveAppData(data);
      setSaveState("saved");
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [data]);

  const currentUser = useMemo(() => {
    const usuarios = data.administracao?.usuarios || [];
    return usuarios.find((item) => item.id === data.administracao?.usuarioAtivoId) || usuarios[0] || createUsuario({ perfil: "gerencia" });
  }, [data.administracao]);

  const actualAccess = useMemo(() => getAccess(currentUser.perfil, accessProfiles), [accessProfiles, currentUser.perfil]);
  const previewProfileId = data.administracao?.visualizarComoPerfil || "";
  const previewAccess = useMemo(
    () => (actualAccess.isAdmin && previewProfileId ? getAccess(previewProfileId, accessProfiles) : null),
    [accessProfiles, actualAccess.isAdmin, previewProfileId]
  );
  const currentAccess = previewAccess || actualAccess;
  const isPreviewing = Boolean(previewAccess);

  const visibleTabs = useMemo(
    () => TAB_ITEMS.filter((item) => currentAccess.tabs.includes(item.value)),
    [currentAccess]
  );

  useEffect(() => {
    if (!visibleTabs.length) return;
    if (!visibleTabs.some((item) => item.value === activeTab)) {
      setActiveTabState(visibleTabs[0].value);
    }
  }, [activeTab, visibleTabs]);

  function canEditTab(tab) {
    return currentAccess.editableTabs.includes(tab);
  }

  function blockReadOnly(tab) {
    if (canEditTab(tab)) return false;
    setStatusMessage(`${currentAccess.label} tem acesso somente leitura em ${TAB_ITEMS.find((item) => item.value === tab)?.label || tab}.`);
    return true;
  }

  const obraAtiva = useMemo(() => {
    return (data.multiobra?.obras || []).find((item) => item.id === data.multiobra?.obraAtivaId) || null;
  }, [data.multiobra]);

  const budgetMap = useMemo(() => {
    const map = new Map();
    data.orcamento.forEach((item) => map.set(String(item.referencia), item));
    return map;
  }, [data.orcamento]);

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

  const atividadesCalculadas = useMemo(() => {
    const presentes = new Set(profissionaisPresentes.map((item) => item.id));

    return (data.atividades || []).map((item) => {
      const atividade = createAtividade(item);
      const itemOrcado = budgetNivel4Map.get(String(atividade.orcamentoRef || "")) || budgetMap.get(String(atividade.orcamentoRef || ""));
      const itemNivel3 =
        budgetMap.get(String(atividade.orcamentoNivel3Ref || "")) ||
        (itemOrcado?.nivel3Ref ? budgetMap.get(String(itemOrcado.nivel3Ref)) : null);
      const orcamentoNivel3Ref = itemNivel3?.referencia || itemOrcado?.nivel3Ref || atividade.orcamentoNivel3Ref || "";
      const orcamentoNivel3Descricao = itemNivel3?.descricao || itemOrcado?.nivel3Descricao || atividade.orcamentoNivel3Descricao || "";
      const alocados = (atividade.alocados || []).filter((id) => presentes.has(id));
      const profissionais = alocados.map((id) => profissionaisPorId.get(id)).filter(Boolean);
      const horasTrabalhadas = calculateHours(atividade.inicio, atividade.fim);
      const qtdPessoas = profissionais.length;
      const hh = qtdPessoas * horasTrabalhadas;
      const qtdeOrcada = toNumber(itemOrcado?.qtdeOrcada);
      const percentualInformado = atividade.percentualExecutado !== "" && atividade.percentualExecutado != null;
      const percentualExecutado = percentualInformado
        ? toNumber(atividade.percentualExecutado)
        : qtdeOrcada > 0
          ? (toNumber(atividade.quantidadeProduzida) / qtdeOrcada) * 100
          : 0;
      const quantidade = percentualInformado && qtdeOrcada > 0
        ? (qtdeOrcada * percentualExecutado) / 100
        : toNumber(atividade.quantidadeProduzida);
      const valorUnitario = qtdeOrcada > 0 ? toNumber(itemOrcado?.precoTotal) / qtdeOrcada : 0;
      const valorExecutado = quantidade * valorUnitario;
      const pessoasPorFuncao = summarizeByFuncao(profissionais);
      const unidade = itemOrcado?.unidade || atividade.unidade || "un";

      return {
        ...atividade,
        alocados,
        profissionais,
        pessoasPorFuncao,
        pessoasPorFuncaoTexto: formatFuncaoResumo(pessoasPorFuncao) || "-",
        orcamentoNivel3Ref,
        orcamentoNivel3Descricao,
        qtdPessoas,
        horasTrabalhadas,
        hh,
        servico: atividade.tarefa || itemOrcado?.descricao || atividade.orcamentoDescricao || "",
        unidade,
        itemNivel3,
        itemOrcado,
        qtdeOrcada,
        percentualExecutado,
        quantidadeProduzida: quantidade,
        pctExecutado: percentualExecutado,
        valorUnitario,
        valorExecutado,
        prodUnPorHH: hh > 0 ? quantidade / hh : 0,
        prodHHPorUn: quantidade > 0 ? hh / quantidade : 0,
      };
    });
  }, [budgetMap, budgetNivel4Map, data.atividades, profissionaisPorId, profissionaisPresentes]);

  const servicosCalculados = atividadesCalculadas;
  const totalHH = useMemo(() => servicosCalculados.reduce((acc, item) => acc + item.hh, 0), [servicosCalculados]);
  const totalQtd = useMemo(
    () => servicosCalculados.reduce((acc, item) => acc + toNumber(item.quantidadeProduzida), 0),
    [servicosCalculados]
  );
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
    const qtd = historicoFiltrado.reduce((acc, item) => acc + toNumber(item.resumo?.totalQtd), 0);
    const valor = historicoFiltrado.reduce((acc, item) => acc + toNumber(item.resumo?.valorRealizado), 0);
    const produtividade = hh > 0 ? qtd / hh : 0;
    const progressoFinanceiro = totalOrcamento > 0 ? (valor / totalOrcamento) * 100 : 0;
    return { dias, hh, qtd, valor, produtividade, progressoFinanceiro };
  }, [historicoFiltrado, totalOrcamento]);

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
        const key = servico.servico || servico.orcamentoDescricao || servico.orcamentoRef || "Sem identificacao";
        if (!grouped[key]) {
          grouped[key] = { servico: key, hh: 0, quantidade: 0 };
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

  const dashboardOrcamento = useMemo(() => {
    const grouped = {};
    historicoFiltrado.forEach((snapshot) => {
      (snapshot.servicos || []).forEach((servico) => {
        const ref = servico.orcamentoRef || "sem-vinculo";
        if (!ref || ref === "sem-vinculo") return;

        const budget = budgetMap.get(String(ref));
        if (!grouped[ref]) {
          grouped[ref] = {
            referencia: ref,
            descricao: budget?.descricao || servico.orcamentoDescricao || servico.servico || "-",
            unidade: budget?.unidade || servico.unidade || "-",
            qtdeOrcada: toNumber(budget?.qtdeOrcada || servico.qtdeOrcada),
            precoTotal: toNumber(budget?.precoTotal),
            quantidadeExecutada: 0,
            valorRealizado: 0,
          };
        }
        grouped[ref].quantidadeExecutada += toNumber(servico.quantidadeProduzida);
        grouped[ref].valorRealizado += toNumber(servico.valorExecutado);
      });
    });

    return Object.values(grouped)
      .map((item) => ({
        ...item,
        percentual: item.qtdeOrcada > 0 ? (item.quantidadeExecutada / item.qtdeOrcada) * 100 : 0,
      }))
      .sort((a, b) => b.valorRealizado - a.valorRealizado)
      .slice(0, 12);
  }, [historicoFiltrado, budgetMap]);

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

  function touchData(updater) {
    setData((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      return {
        ...next,
        updatedAt: new Date().toISOString(),
      };
    });
    setSaveState("dirty");
  }

  function setActiveTab(tab) {
    if (!visibleTabs.some((item) => item.value === tab)) {
      setStatusMessage(`${currentAccess.label} nao possui acesso a esta aba.`);
      return;
    }
    setActiveTabState(tab);
  }

  function saveNow() {
    saveAppData(data);
    setSaveState("saved");
    setStatusMessage("Dados salvos localmente com backup de seguranca.");
  }

  function printReport() {
    window.print();
  }

  function exportJson() {
    exportAppData(data);
    setStatusMessage("Exportacao JSON gerada com o formato compativel da aplicacao.");
  }

  async function syncBackend() {
    if (!backendClient.enabled) {
      setStatusMessage("Backend ainda nao configurado. Defina VITE_API_BASE_URL para habilitar sincronizacao.");
      return;
    }

    try {
      setSyncState("syncing");
      await backendClient.saveDraft(data);
      setSyncState("synced");
      setStatusMessage("Rascunho sincronizado com o backend.");
    } catch (error) {
      console.error(error);
      setSyncState("error");
      setStatusMessage("Nao foi possivel sincronizar com o backend nesta tentativa.");
    }
  }

  async function copyResumoROS() {
    try {
      await navigator.clipboard.writeText(resumoROS);
      setStatusMessage("Resumo gerencial copiado para a area de transferencia.");
    } catch {
      setStatusMessage("Nao foi possivel copiar o resumo automaticamente.");
    }
  }

  function updateCabecalho(field, value) {
    if (blockReadOnly("diario")) return;
    touchData((prev) => ({
      ...prev,
      cabecalho: {
        ...prev.cabecalho,
        [field]: value,
      },
    }));
  }

  function updateFuncionario(index, field, value) {
    if (blockReadOnly("diario")) return;
    touchData((prev) => {
      const funcionarios = cloneList(prev.funcionarios);
      funcionarios[index] = {
        ...funcionarios[index],
        [field]: ["previsto", "presente"].includes(field) ? toNumber(value) : value,
      };
      return { ...prev, funcionarios };
    });
  }

  function addFuncionario() {
    if (blockReadOnly("diario")) return;
    touchData((prev) => ({
      ...prev,
      funcionarios: [...prev.funcionarios, createFuncionario()],
    }));
  }

  function removeFuncionario(index) {
    if (blockReadOnly("diario")) return;
    touchData((prev) => ({
      ...prev,
      funcionarios: prev.funcionarios.filter((_, current) => current !== index),
    }));
  }

  function togglePresenca(profissionalId) {
    if (blockReadOnly("diario")) return;
    touchData((prev) => {
      const presencas = new Set(prev.presencas || []);
      if (presencas.has(profissionalId)) {
        presencas.delete(profissionalId);
      } else {
        presencas.add(profissionalId);
      }
      return { ...prev, presencas: Array.from(presencas) };
    });
  }

  function updateAtividade(index, field, value) {
    if (blockReadOnly(["quantidadeProduzida", "percentualExecutado"].includes(field) ? "produtividade" : "diario")) return;
    touchData((prev) => {
      const atividades = cloneList(prev.atividades).map((item) => createAtividade(item));
      atividades[index] = {
        ...atividades[index],
        [field]: ["quantidadeProduzida", "percentualExecutado"].includes(field) ? toNumber(value) : value,
      };
      return { ...prev, atividades };
    });
  }

  function addAtividade() {
    if (blockReadOnly("diario")) return;
    touchData((prev) => ({
      ...prev,
      atividades: [...prev.atividades, createAtividade()],
    }));
  }

  function removeAtividade(index) {
    if (blockReadOnly("diario")) return;
    touchData((prev) => ({
      ...prev,
      atividades: prev.atividades.filter((_, current) => current !== index),
    }));
  }

  function toggleAtividadeAlocado(index, profissionalId) {
    if (blockReadOnly("diario")) return;
    touchData((prev) => {
      const atividades = cloneList(prev.atividades).map((item) => createAtividade(item));
      const alocados = new Set(atividades[index]?.alocados || []);
      if (alocados.has(profissionalId)) {
        alocados.delete(profissionalId);
      } else {
        const conflito = findAllocationConflict(atividades, index, profissionalId);
        if (conflito) {
          const profissional = profissionaisPorId.get(profissionalId);
          const nome = profissional?.nome || "Profissional";
          const atividadeConflitante = conflito.local || conflito.tarefa || conflito.orcamentoDescricao || "outra atividade";
          setStatusMessage(
            `${nome} ja esta alocado em ${atividadeConflitante} no horario ${conflito.inicio || "-"}-${conflito.fim || "-"}. Horario final igual ao inicio de outra atividade e permitido.`
          );
          return prev;
        }
        alocados.add(profissionalId);
      }
      atividades[index] = { ...atividades[index], alocados: Array.from(alocados) };
      return { ...prev, atividades };
    });
  }

  function selectBudgetNivel3ForAtividade(index, referencia) {
    if (blockReadOnly("diario")) return;
    const itemNivel3 = budgetMap.get(String(referencia || ""));
    touchData((prev) => {
      const atividades = cloneList(prev.atividades).map((item) => createAtividade(item));
      atividades[index] = {
        ...atividades[index],
        orcamentoNivel3Ref: referencia,
        orcamentoNivel3Descricao: itemNivel3?.descricao || "",
        orcamentoRef: "",
        orcamentoDescricao: "",
        unidade: atividades[index]?.unidade || "un",
      };
      return { ...prev, atividades };
    });
  }

  function selectBudgetForAtividade(index, referencia) {
    if (blockReadOnly("diario")) return;
    const itemOrcado = budgetNivel4Map.get(String(referencia || "")) || budgetMap.get(String(referencia || ""));
    const itemNivel3 = itemOrcado?.nivel3Ref ? budgetMap.get(String(itemOrcado.nivel3Ref)) : null;
    touchData((prev) => {
      const atividades = cloneList(prev.atividades).map((item) => createAtividade(item));
      atividades[index] = {
        ...atividades[index],
        orcamentoNivel3Ref: atividades[index]?.orcamentoNivel3Ref || itemNivel3?.referencia || itemOrcado?.nivel3Ref || "",
        orcamentoNivel3Descricao: atividades[index]?.orcamentoNivel3Descricao || itemNivel3?.descricao || itemOrcado?.nivel3Descricao || "",
        orcamentoRef: referencia,
        orcamentoDescricao: itemOrcado?.descricao || "",
        unidade: itemOrcado?.unidade || atividades[index]?.unidade || "un",
        tarefa: atividades[index]?.tarefa || itemOrcado?.descricao || "",
      };
      return { ...prev, atividades };
    });
  }

  function updateServico(index, field, value) {
    if (blockReadOnly("produtividade")) return;
    touchData((prev) => {
      const servicos = cloneList(prev.servicos);
      servicos[index] = {
        ...servicos[index],
        [field]: ["quantidadeProduzida", "qtdPessoas", "horasTrabalhadas"].includes(field) ? toNumber(value) : value,
      };
      return { ...prev, servicos };
    });
  }

  function addServico() {
    if (blockReadOnly("produtividade")) return;
    touchData((prev) => ({
      ...prev,
      servicos: [...prev.servicos, createServico()],
    }));
  }

  function removeServico(index) {
    if (blockReadOnly("produtividade")) return;
    touchData((prev) => ({
      ...prev,
      servicos: prev.servicos.filter((_, current) => current !== index),
    }));
  }

  function updateOrcamento(index, field, value) {
    if (blockReadOnly("orcamento")) return;
    touchData((prev) => {
      const orcamento = cloneList(prev.orcamento);
      orcamento[index] = {
        ...orcamento[index],
        [field]: ["nivel", "qtdeOrcada", "precoTotal", "bdi"].includes(field) ? toNumber(value) : value,
      };
      return { ...prev, orcamento };
    });
  }

  function addItemOrcamento() {
    if (blockReadOnly("orcamento")) return;
    touchData((prev) => ({
      ...prev,
      orcamento: [...prev.orcamento, { nivel: 4, referencia: "", descricao: "", qtdeOrcada: 0, unidade: "", precoTotal: 0, bdi: 0 }],
    }));
  }

  function removeItemOrcamento(index) {
    if (blockReadOnly("orcamento")) return;
    touchData((prev) => ({
      ...prev,
      orcamento: prev.orcamento.filter((_, current) => current !== index),
    }));
  }

  function removeItensOrcamento(indices = []) {
    if (blockReadOnly("orcamento")) return;
    const selected = new Set(indices.map((item) => Number(item)));
    if (!selected.size) {
      setStatusMessage("Selecione itens do orcamento para excluir em massa.");
      return;
    }
    touchData((prev) => ({
      ...prev,
      orcamento: prev.orcamento.filter((_, current) => !selected.has(current)),
    }));
    setStatusMessage(`${selected.size} itens removidos do orcamento.`);
  }

  function updateGerencial(field, value) {
    if (blockReadOnly("gerencial")) return;
    touchData((prev) => ({
      ...prev,
      gerencial: {
        ...prev.gerencial,
        [field]: value,
      },
    }));
  }

  function updateObra(index, field, value) {
    if (blockReadOnly("multiobra")) return;
    touchData((prev) => {
      const obras = cloneList(prev.multiobra?.obras || []);
      obras[index] = {
        ...obras[index],
        [field]: value,
      };
      return {
        ...prev,
        multiobra: {
          ...prev.multiobra,
          obras,
        },
      };
    });
  }

  function addObra() {
    if (blockReadOnly("multiobra")) return;
    touchData((prev) => ({
      ...prev,
      multiobra: {
        ...prev.multiobra,
        obras: [...(prev.multiobra?.obras || []), createObra()],
      },
    }));
  }

  function removeObra(index) {
    if (blockReadOnly("multiobra")) return;
    touchData((prev) => {
      const obras = [...(prev.multiobra?.obras || [])];
      const removida = obras[index];
      const novas = obras.filter((_, current) => current !== index);
      const obraAtivaId = prev.multiobra?.obraAtivaId === removida?.id ? novas[0]?.id || "" : prev.multiobra?.obraAtivaId;

      return {
        ...prev,
        multiobra: {
          ...prev.multiobra,
          obraAtivaId,
          obras: novas,
        },
      };
    });
  }

  function selectObraAtiva(id) {
    if (!canEditTab("multiobra") && !canEditTab("cadastros")) {
      setStatusMessage("Seu perfil nao pode trocar a obra ativa.");
      return;
    }
    touchData((prev) => ({
      ...prev,
      multiobra: {
        ...prev.multiobra,
        obraAtivaId: id,
      },
    }));
  }

  function applyObraAtivaAoDiario() {
    if (blockReadOnly("multiobra")) return;
    if (!obraAtiva) return;
    touchData((prev) => ({
      ...prev,
      cabecalho: {
        ...prev.cabecalho,
        obra: obraAtiva.nome || prev.cabecalho.obra,
      },
      gerencial: {
        ...prev.gerencial,
        responsavel: obraAtiva.responsavel || prev.gerencial.responsavel,
        prazoMarco: obraAtiva.prazo || prev.gerencial.prazoMarco,
      },
    }));
    setStatusMessage(`Obra ativa aplicada ao diario: ${obraAtiva.nome || "obra sem nome"}.`);
  }

  function addProfissional() {
    if (blockReadOnly("cadastros")) return;
    touchData((prev) => ({
      ...prev,
      cadastros: {
        ...prev.cadastros,
        profissionais: [...(prev.cadastros?.profissionais || []), createProfissional({ obraId: prev.multiobra?.obraAtivaId })],
      },
    }));
  }

  function updateProfissional(id, field, value) {
    if (blockReadOnly("cadastros")) return;
    touchData((prev) => ({
      ...prev,
      cadastros: {
        ...prev.cadastros,
        profissionais: (prev.cadastros?.profissionais || []).map((item) =>
          item.id === id ? { ...item, [field]: field === "custoHora" ? toNumber(value) : value } : item
        ),
      },
    }));
  }

  function removeProfissional(id) {
    if (blockReadOnly("cadastros")) return;
    touchData((prev) => ({
      ...prev,
      presencas: (prev.presencas || []).filter((item) => item !== id),
      atividades: (prev.atividades || []).map((atividade) => ({
        ...atividade,
        alocados: (atividade.alocados || []).filter((item) => item !== id),
      })),
      cadastros: {
        ...prev.cadastros,
        profissionais: (prev.cadastros?.profissionais || []).filter((item) => item.id !== id),
        afastamentos: (prev.cadastros?.afastamentos || []).filter((item) => item.profissionalId !== id),
      },
    }));
  }

  function addAfastamento() {
    if (blockReadOnly("cadastros")) return;
    touchData((prev) => ({
      ...prev,
      cadastros: {
        ...prev.cadastros,
        afastamentos: [
          ...(prev.cadastros?.afastamentos || []),
          createAfastamento({ profissionalId: profissionaisObraAtiva[0]?.id || "", inicio: prev.cabecalho?.data, fim: prev.cabecalho?.data }),
        ],
      },
    }));
  }

  function updateAfastamento(id, field, value) {
    if (blockReadOnly("cadastros")) return;
    touchData((prev) => ({
      ...prev,
      cadastros: {
        ...prev.cadastros,
        afastamentos: (prev.cadastros?.afastamentos || []).map((item) => (item.id === id ? { ...item, [field]: value } : item)),
      },
    }));
  }

  function removeAfastamento(id) {
    if (blockReadOnly("cadastros")) return;
    touchData((prev) => ({
      ...prev,
      cadastros: {
        ...prev.cadastros,
        afastamentos: (prev.cadastros?.afastamentos || []).filter((item) => item.id !== id),
      },
    }));
  }

  function isAdminPerfil(perfil) {
    return getAccess(perfil, accessProfiles).isAdmin;
  }

  function countActiveAdmins(usuarios = []) {
    return usuarios.filter((item) => item.ativo !== false && isAdminPerfil(item.perfil)).length;
  }

  function setUsuarioAtivo(id) {
    touchData((prev) => ({
      ...prev,
      administracao: {
        ...prev.administracao,
        usuarioAtivoId: id,
        visualizarComoPerfil: "",
      },
    }));
  }

  function addUsuario() {
    if (blockReadOnly("administracao")) return;
    touchData((prev) => ({
      ...prev,
      administracao: {
        ...prev.administracao,
        usuarios: [...(prev.administracao?.usuarios || []), createUsuario({ perfil: "apontador" })],
      },
    }));
  }

  function updateUsuario(id, field, value) {
    if (blockReadOnly("administracao")) return;
    const usuariosAtuais = data.administracao?.usuarios || [];
    const target = usuariosAtuais.find((item) => item.id === id);
    const nextPerfil = field === "perfil" ? value : target?.perfil;
    const nextAtivo = field === "ativo" ? value : target?.ativo !== false;
    const targetIsAdmin = isAdminPerfil(target?.perfil);
    const nextIsAdmin = isAdminPerfil(nextPerfil);
    const isDefaultAdmin = target?.id === "user-gerencia" || target?.perfil === "gerencia";
    const isSelfAdmin = target?.id === currentUser.id && actualAccess.isAdmin;

    if (targetIsAdmin && (!nextIsAdmin || nextAtivo === false) && (countActiveAdmins(usuariosAtuais) <= 1 || isDefaultAdmin || isSelfAdmin)) {
      setStatusMessage("Trava de seguranca: o administrativo ativo nao pode perder permissao administrativa.");
      return;
    }

    touchData((prev) => ({
      ...prev,
      administracao: {
        ...prev.administracao,
        usuarios: (prev.administracao?.usuarios || []).map((item) => (item.id === id ? { ...item, [field]: value } : item)),
      },
    }));
  }

  function removeUsuario(id) {
    if (blockReadOnly("administracao")) return;
    const usuariosAtuais = data.administracao?.usuarios || [];
    const target = usuariosAtuais.find((item) => item.id === id);
    if (target?.id === "user-gerencia" || (isAdminPerfil(target?.perfil) && countActiveAdmins(usuariosAtuais) <= 1)) {
      setStatusMessage("Trava de seguranca: mantenha pelo menos um login administrativo ativo.");
      return;
    }
    touchData((prev) => {
      const usuarios = (prev.administracao?.usuarios || []).filter((item) => item.id !== id);
      return {
        ...prev,
        administracao: {
          ...prev.administracao,
          usuarios,
          usuarioAtivoId: prev.administracao?.usuarioAtivoId === id ? usuarios[0]?.id || "" : prev.administracao?.usuarioAtivoId,
        },
      };
    });
  }

  function addPerfilAcesso() {
    if (blockReadOnly("administracao")) return;
    const dashboardWidgets = DASHBOARD_WIDGETS.map((item) => item.value);
    touchData((prev) => ({
      ...prev,
      administracao: {
        ...prev.administracao,
        perfis: [
          ...(prev.administracao?.perfis || []),
          createAccessProfile({
            label: "Nova funcao",
            tabs: ["dashboard"],
            editableTabs: [],
            dashboardWidgets,
          }),
        ],
      },
    }));
  }

  function updatePerfilAcesso(id, field, value) {
    if (blockReadOnly("administracao")) return;
    const profile = accessProfiles[id];
    if (!profile) return;

    touchData((prev) => ({
      ...prev,
      administracao: {
        ...prev.administracao,
        perfis: (prev.administracao?.perfis || []).map((item) => {
          if (item.id !== id) return item;
          const base = { ...profile, ...item, [field]: value };
          if (field === "editableTabs") {
            base.tabs = uniqueSorted([...(base.tabs || []), ...(value || [])]);
          }
          if (field === "tabs") {
            base.editableTabs = (base.editableTabs || []).filter((tab) => (value || []).includes(tab));
          }
          return createAccessProfile(base);
        }),
      },
    }));
  }

  function removePerfilAcesso(id) {
    if (blockReadOnly("administracao")) return;
    const profile = accessProfiles[id];
    if (!profile) return;
    if (profile.isAdmin) {
      setStatusMessage("Trava de seguranca: o perfil administrativo nao pode ser excluido.");
      return;
    }
    if ((data.administracao?.usuarios || []).some((item) => item.perfil === id)) {
      setStatusMessage("Este perfil esta em uso por um login. Troque os logins antes de excluir.");
      return;
    }
    touchData((prev) => ({
      ...prev,
      administracao: {
        ...prev.administracao,
        perfis: (prev.administracao?.perfis || []).filter((item) => item.id !== id),
        visualizarComoPerfil: prev.administracao?.visualizarComoPerfil === id ? "" : prev.administracao?.visualizarComoPerfil || "",
      },
    }));
  }

  function setVisualizarComoPerfil(perfil) {
    if (!actualAccess.isAdmin) {
      setStatusMessage("Somente o administrativo pode usar visualizar como.");
      return;
    }
    const nextPerfil = perfil && perfil !== actualAccess.id ? perfil : "";
    touchData((prev) => ({
      ...prev,
      administracao: {
        ...prev.administracao,
        visualizarComoPerfil: nextPerfil,
      },
    }));
    if (nextPerfil) {
      const preview = getAccess(nextPerfil, accessProfiles);
      setActiveTabState(preview.tabs[0] || "diario");
      setStatusMessage(`Visualizando como ${preview.label}. Use voltar ao administrativo para sair da simulacao.`);
    } else {
      setStatusMessage("Visualizacao administrativa restaurada.");
    }
  }

  async function importBudgetFile(event) {
    if (blockReadOnly("orcamento")) {
      event.target.value = "";
      return;
    }

    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    try {
      const XLSX = await import("xlsx");
      const budgetRows = [];

      for (const file of files) {
        const extension = file.name.split(".").pop()?.toLowerCase();
        const workbook =
          extension === "csv"
            ? XLSX.read(await file.text(), { type: "string" })
            : XLSX.read(await file.arrayBuffer(), { type: "array" });

        const firstSheet = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheet];
        const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
        budgetRows.push(...rows.map(normalizeBudgetRow).filter((item) => item.referencia || item.descricao));
      }

      const summary = mergeBudgetRows(data.orcamento, budgetRows);
      touchData((prev) => ({
        ...prev,
        orcamento: mergeBudgetRows(prev.orcamento, budgetRows).rows,
      }));
      setStatusMessage(
        `${summary.added} itens importados de ${files.length} arquivo(s). ${summary.skipped} repetidos identicos foram ignorados.`
      );
    } catch (error) {
      console.error(error);
      setStatusMessage("Nao foi possivel importar uma das planilhas. Use XLSX, XLS ou CSV.");
    } finally {
      event.target.value = "";
    }
  }

  async function exportProdutividadeExcel() {
    try {
      const XLSX = await import("xlsx");
      const records = [
        ...historicoOrdenado.flatMap((snapshot) =>
          (snapshot.servicos || []).map((item, index) => ({
            source: "Historico",
            snapshot,
            item,
            atividade: (snapshot.atividades || [])[index] || {},
            index,
          }))
        ),
        ...servicosCalculados.map((item, index) => ({
          source: "Rascunho atual",
          snapshot: {
            id: "rascunho-atual",
            createdAt: data.updatedAt,
            updatedBy: currentUser.nome || currentUser.login || currentAccess.label,
            updatedByPerfil: currentUser.perfil,
            cabecalho: data.cabecalho,
          },
          item,
          atividade: item,
          index,
        })),
      ];

      const rows = records.map(({ source, snapshot, item, atividade, index }) => {
        const referenciaNivel4 = item.orcamentoRef || atividade.orcamentoRef || "";
        const itemOrcado = budgetMap.get(String(referenciaNivel4));
        const qtdeOrcada = toNumber(item.qtdeOrcada || itemOrcado?.qtdeOrcada);
        const quantidadeExecutada = toNumber(item.quantidadeProduzida);
        const percentualExecutado =
          item.percentualExecutado !== "" && item.percentualExecutado != null
            ? toNumber(item.percentualExecutado)
            : qtdeOrcada > 0
              ? (quantidadeExecutada / qtdeOrcada) * 100
              : toNumber(item.pctExecutado);
        const codigoNivel3 = item.orcamentoNivel3Ref || atividade.orcamentoNivel3Ref || "";
        const descricaoNivel3 = item.orcamentoNivel3Descricao || atividade.orcamentoNivel3Descricao || "";
        const pessoasPorFuncao = item.pessoasPorFuncao || atividade.pessoasPorFuncao || {};
        const row = {
          Atividade: item.servico || atividade.tarefa || "",
          "Item Nivel 3": [codigoNivel3, descricaoNivel3].filter(Boolean).join(" - "),
          "% executada": percentualExecutado,
          Unidade: item.unidade || atividade.unidade || itemOrcado?.unidade || "",
          Inicio: item.inicio || atividade.inicio || "",
          Fim: item.fim || atividade.fim || "",
          "Profissionais por funcao": item.pessoasPorFuncaoTexto || atividade.pessoasPorFuncaoTexto || formatFuncaoResumo(pessoasPorFuncao),
          Pessoas: toNumber(item.qtdPessoas || atividade.qtdPessoas),
          Data: snapshot.cabecalho?.data || "",
          Obra: snapshot.cabecalho?.obra || "",
          Frente: item.local || atividade.local || "",
          Equipe: item.equipe || atividade.equipe || "",
          "Codigo nivel 3": codigoNivel3,
          "Descricao nivel 3": descricaoNivel3,
          "Codigo nivel 4": referenciaNivel4,
          "Descricao nivel 4": item.orcamentoDescricao || atividade.orcamentoDescricao || itemOrcado?.descricao || "",
          "Qtd. orcada": qtdeOrcada,
          "Quantidade executada": quantidadeExecutada,
          Horas: toNumber(item.horasTrabalhadas || atividade.horasTrabalhadas),
          HH: toNumber(item.hh || atividade.hh),
          "un/HH": toNumber(item.prodUnPorHH),
          "HH/un": toNumber(item.prodHHPorUn),
          "Valor realizado": toNumber(item.valorExecutado),
          Fonte: source,
          "ID registro": snapshot.id || "",
          "Criado em": snapshot.createdAt || "",
          "Atualizado por": snapshot.updatedBy || "",
          Perfil: snapshot.updatedByPerfil || "",
          "Linha atividade": index + 1,
        };
        uniqueSorted(Object.keys(pessoasPorFuncao)).forEach((funcao) => {
          row[`Funcao - ${funcao}`] = pessoasPorFuncao[funcao] || 0;
        });
        return row;
      });

      const rowsPorFuncao = records.flatMap(({ source, snapshot, item, atividade, index }) => {
        const pessoasPorFuncao = item.pessoasPorFuncao || atividade.pessoasPorFuncao || {};
        const referenciaNivel4 = item.orcamentoRef || atividade.orcamentoRef || "";
        const itemOrcado = budgetMap.get(String(referenciaNivel4));
        const quantidadeExecutada = toNumber(item.quantidadeProduzida);
        return Object.entries(pessoasPorFuncao).map(([funcao, totalProfissionais]) => {
          const horas = toNumber(item.horasTrabalhadas || atividade.horasTrabalhadas);
          const hhFuncao = toNumber(totalProfissionais) * horas;
          return {
            Atividade: item.servico || atividade.tarefa || "",
            "Item Nivel 3": [item.orcamentoNivel3Ref || atividade.orcamentoNivel3Ref || "", item.orcamentoNivel3Descricao || atividade.orcamentoNivel3Descricao || ""]
              .filter(Boolean)
              .join(" - "),
            "% executada": toNumber(item.percentualExecutado || item.pctExecutado),
            Funcao: funcao,
            "Profissionais da funcao": totalProfissionais,
            Unidade: item.unidade || atividade.unidade || itemOrcado?.unidade || "",
            Data: snapshot.cabecalho?.data || "",
            Obra: snapshot.cabecalho?.obra || "",
            Frente: item.local || atividade.local || "",
            Inicio: item.inicio || atividade.inicio || "",
            Fim: item.fim || atividade.fim || "",
            "Horas por profissional": horas,
            "HH da funcao": hhFuncao,
            "Quantidade executada da atividade": quantidadeExecutada,
            "un/HH da funcao": hhFuncao > 0 ? quantidadeExecutada / hhFuncao : 0,
            "HH/un da funcao": quantidadeExecutada > 0 ? hhFuncao / quantidadeExecutada : 0,
            Fonte: source,
            "ID registro": snapshot.id || "",
            "Linha atividade": index + 1,
          };
        });
      });

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const worksheetPorFuncao = XLSX.utils.json_to_sheet(rowsPorFuncao);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Banco de dados");
      XLSX.utils.book_append_sheet(workbook, worksheetPorFuncao, "Por funcao");
      const payload = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
      downloadBlob(new Blob([payload], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `produtividade-${data.cabecalho?.data || "sem-data"}.xlsx`);
      setStatusMessage("Banco completo de produtividade exportado para Excel, incluindo historico e rascunho atual.");
    } catch (error) {
      console.error(error);
      setStatusMessage("Nao foi possivel exportar a produtividade para Excel.");
    }
  }

  async function saveCurrentToHistory() {
    if (blockReadOnly("historico")) return;

    const funcionarios = buildFuncionariosResumo(profissionaisObraAtiva, profissionaisPresentes);
    const snapshotBase = {
      id: `${data.cabecalho.obra}-${data.cabecalho.data}-${Date.now()}`,
      obraId: obraAtiva?.id || "",
      createdAt: new Date().toISOString(),
      updatedBy: currentUser.nome || currentUser.login || currentAccess.label,
      updatedByPerfil: currentUser.perfil,
      cabecalho: { ...data.cabecalho },
      funcionarios,
      presencas: [...(data.presencas || [])],
      profissionaisPresentes: cloneList(profissionaisPresentes),
      atividades: atividadesCalculadas.map((item) => ({
        id: item.id,
        inicio: item.inicio,
        fim: item.fim,
        local: item.local,
        tarefa: item.tarefa,
        equipe: item.equipe,
        orcamentoRef: item.orcamentoRef,
        orcamentoNivel3Ref: item.orcamentoNivel3Ref,
        orcamentoNivel3Descricao: item.orcamentoNivel3Descricao,
        orcamentoDescricao: item.itemOrcado?.descricao || item.orcamentoDescricao || "",
        unidade: item.unidade,
        quantidadeProduzida: item.quantidadeProduzida,
        percentualExecutado: item.percentualExecutado,
        alocados: item.alocados,
        pessoasPorFuncao: item.pessoasPorFuncao,
        pessoasPorFuncaoTexto: item.pessoasPorFuncaoTexto,
        qtdPessoas: item.qtdPessoas,
        horasTrabalhadas: item.horasTrabalhadas,
        hh: item.hh,
      })),
      observacoes: data.observacoes,
      consideracoes: data.consideracoes,
      equipamentos: data.equipamentos,
      gerencial: { ...data.gerencial },
      servicos: servicosCalculados.map((item) => ({
        servico: item.servico,
        unidade: item.itemOrcado?.unidade || item.unidade,
        quantidadeProduzida: item.quantidadeProduzida,
        percentualExecutado: item.percentualExecutado,
        qtdPessoas: item.qtdPessoas,
        pessoasPorFuncao: item.pessoasPorFuncao,
        pessoasPorFuncaoTexto: item.pessoasPorFuncaoTexto,
        horasTrabalhadas: item.horasTrabalhadas,
        hh: item.hh,
        prodUnPorHH: item.prodUnPorHH,
        prodHHPorUn: item.prodHHPorUn,
        orcamentoRef: item.orcamentoRef,
        orcamentoNivel3Ref: item.orcamentoNivel3Ref,
        orcamentoNivel3Descricao: item.orcamentoNivel3Descricao,
        orcamentoDescricao: item.itemOrcado?.descricao || "",
        qtdeOrcada: item.qtdeOrcada,
        valorExecutado: item.valorExecutado,
      })),
      resumo: {
        totalPrevisto,
        totalPresentes,
        totalHH,
        totalQtd,
        valorRealizado: totalRealizadoEstimado,
        producaoPorUnidade,
      },
    };

    const existing = (data.historico || []).find(
      (item) => item.cabecalho?.obra === snapshotBase.cabecalho.obra && item.cabecalho?.data === snapshotBase.cabecalho.data
    );
    const changes = detectSnapshotChanges(existing, snapshotBase);
    const snapshot = {
      ...snapshotBase,
      id: existing?.id || snapshotBase.id,
      createdAt: existing?.createdAt || snapshotBase.createdAt,
      audit: existing
        ? [
            ...(existing.audit || []),
            {
              id: `audit-${Date.now()}`,
              changedAt: new Date().toISOString(),
              usuario: currentUser.nome || currentUser.login || currentAccess.label,
              perfil: currentUser.perfil,
              campos: changes.length ? changes : ["Registro salvo novamente"],
              resumo: changes.length ? changes.join(", ") : "Registro salvo novamente sem diferencas detectadas",
            },
          ]
        : [],
    };

    touchData((prev) => {
      const semDuplicado = (prev.historico || []).filter((item) => item.id !== snapshot.id);
      return {
        ...prev,
        historico: [snapshot, ...semDuplicado],
      };
    });

    if (backendClient.enabled) {
      try {
        await backendClient.saveSnapshot(snapshot);
      } catch (error) {
        console.error(error);
      }
    }

    setStatusMessage(
      existing
        ? `Registro de ${formatShortDate(data.cabecalho.data)} atualizado no historico com auditoria.`
        : `Diario de ${formatShortDate(data.cabecalho.data)} salvo no historico.`
    );
  }

  function loadFromHistory(snapshotId) {
    if (blockReadOnly("historico")) return;
    const snapshot = (data.historico || []).find((item) => item.id === snapshotId);
    if (!snapshot) return;

    touchData((prev) => ({
      ...prev,
      cabecalho: { ...snapshot.cabecalho },
      funcionarios: cloneList(snapshot.funcionarios || []).length ? cloneList(snapshot.funcionarios || []) : [createFuncionario()],
      presencas: Array.isArray(snapshot.presencas)
        ? snapshot.presencas
        : (snapshot.profissionaisPresentes || []).map((item) => item.id).filter(Boolean),
      atividades: cloneList(snapshot.atividades || []).length
        ? cloneList(snapshot.atividades || []).map((item) => createAtividade(item))
        : [createAtividade()],
      observacoes: snapshot.observacoes || "",
      consideracoes: snapshot.consideracoes || "",
      equipamentos: snapshot.equipamentos || "",
      gerencial: {
        ...buildInitialData().gerencial,
        ...(snapshot.gerencial || {}),
      },
      servicos: (snapshot.servicos || []).length
        ? snapshot.servicos.map((item) => ({
            ...createServico(),
            servico: item.servico,
            unidade: item.unidade || "un",
            quantidadeProduzida: toNumber(item.quantidadeProduzida),
            percentualExecutado: item.percentualExecutado === "" || item.percentualExecutado == null ? "" : toNumber(item.percentualExecutado),
            qtdPessoas: toNumber(item.qtdPessoas),
            horasTrabalhadas: toNumber(item.horasTrabalhadas),
            orcamentoRef: item.orcamentoRef || "",
            orcamentoNivel3Ref: item.orcamentoNivel3Ref || "",
            orcamentoNivel3Descricao: item.orcamentoNivel3Descricao || "",
          }))
        : [createServico()],
      multiobra: {
        ...prev.multiobra,
        obraAtivaId: snapshot.obraId || prev.multiobra?.obraAtivaId,
      },
    }));

    setStatusMessage(`Registro de ${formatShortDate(snapshot.cabecalho?.data)} carregado para edicao.`);
  }

  function deleteFromHistory(snapshotId) {
    if (!currentAccess.canDeleteHistory) {
      setStatusMessage("Somente Gerencia pode excluir registros do historico.");
      return;
    }
    touchData((prev) => ({
      ...prev,
      historico: (prev.historico || []).filter((item) => item.id !== snapshotId),
    }));
  }

  function updateField(field, value) {
    if (blockReadOnly("diario")) return;
    touchData((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function resetDashboardFilters() {
    setDashboardFilters({ obra: "todas", frente: "todas", equipe: "todas", de: "", ate: "" });
  }

  return {
    data,
    activeTab,
    activeDiaryTab,
    budgetSearch,
    dashboardFilters,
    statusMessage,
    saveState,
    syncState,
    backendEnabled: backendClient.enabled,
    access: {
      currentUser,
      currentAccess,
      actualAccess,
      previewAccess,
      isPreviewing,
      accessProfiles: Object.values(accessProfiles),
      visibleTabs,
      canEditTab,
      activeTabCanEdit: canEditTab(activeTab),
      canDeleteHistory: currentAccess.canDeleteHistory,
    },
    derived: {
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
    },
    actions: {
      setActiveTab,
      setActiveDiaryTab,
      setBudgetSearch,
      setDashboardFilters,
      saveNow,
      printReport,
      exportJson,
      exportProdutividadeExcel,
      syncBackend,
      copyResumoROS,
      updateCabecalho,
      updateFuncionario,
      addFuncionario,
      removeFuncionario,
      togglePresenca,
      updateAtividade,
      addAtividade,
      removeAtividade,
      toggleAtividadeAlocado,
      selectBudgetNivel3ForAtividade,
      selectBudgetForAtividade,
      updateServico,
      addServico,
      removeServico,
      updateOrcamento,
      addItemOrcamento,
      removeItemOrcamento,
      removeItensOrcamento,
      updateGerencial,
      updateObra,
      addObra,
      removeObra,
      selectObraAtiva,
      applyObraAtivaAoDiario,
      addProfissional,
      updateProfissional,
      removeProfissional,
      addAfastamento,
      updateAfastamento,
      removeAfastamento,
      setUsuarioAtivo,
      addUsuario,
      updateUsuario,
      removeUsuario,
      addPerfilAcesso,
      updatePerfilAcesso,
      removePerfilAcesso,
      setVisualizarComoPerfil,
      importBudgetFile,
      saveCurrentToHistory,
      loadFromHistory,
      deleteFromHistory,
      updateField,
      resetDashboardFilters,
    },
  };
}
