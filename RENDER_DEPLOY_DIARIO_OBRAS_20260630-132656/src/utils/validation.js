import { stripAccents } from "@/utils/formatters";

function makeIssue(type, scope, message) {
  return {
    id: `${type}-${scope}-${message}`,
    type,
    scope,
    message,
  };
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value || "").split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
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

export function validateDashboardFilters(filters) {
  if (!filters.de || !filters.ate) return [];
  if (filters.de <= filters.ate) return [];
  return [makeIssue("warning", "dashboard", "A data inicial do dashboard esta maior que a data final.")];
}

export function validateAppData(data, dashboardFilters) {
  const errors = [];
  const warnings = [];

  if (!data.multiobra?.obras?.length) {
    errors.push(makeIssue("error", "multiobra", "Cadastre pelo menos uma obra para continuar operando o diario."));
  }

  const obraAtiva = (data.multiobra?.obras || []).find((item) => item.id === data.multiobra?.obraAtivaId);
  if (!obraAtiva) {
    errors.push(makeIssue("error", "multiobra", "Nao existe obra ativa selecionada."));
  }

  if (!data.cabecalho?.obra?.trim()) {
    errors.push(makeIssue("error", "cabecalho", "Informe o nome da obra no cabecalho do diario."));
  }

  if (!data.cabecalho?.data) {
    errors.push(makeIssue("error", "cabecalho", "Informe a data do diario."));
  }

  if (obraAtiva?.nome && data.cabecalho?.obra && stripAccents(obraAtiva.nome) !== stripAccents(data.cabecalho.obra)) {
    warnings.push(makeIssue("warning", "cabecalho", "A obra ativa e o nome informado no cabecalho estao diferentes."));
  }

  const profissionaisDaObra = (data.cadastros?.profissionais || []).filter((item) => item.obraId === obraAtiva?.id && item.ativo !== false);
  if (!profissionaisDaObra.length) {
    warnings.push(makeIssue("warning", "cadastros", "Cadastre profissionais na obra ativa para alimentar o checklist do Diario."));
  }

  const presencas = new Set(data.presencas || []);
  const presentes = profissionaisDaObra.filter((item) => presencas.has(item.id));
  if (profissionaisDaObra.length && !presentes.length) {
    warnings.push(makeIssue("warning", "presencas", "Nenhum profissional foi marcado como presente no Diario."));
  }

  (data.atividades || []).forEach((item, index) => {
    if (!item.local?.trim() || !item.tarefa?.trim()) {
      warnings.push(makeIssue("warning", `atividades-${index}`, `A atividade ${index + 1} precisa de local e tarefa para ficar completa.`));
    }
    if (item.inicio && item.fim && item.inicio > item.fim) {
      warnings.push(makeIssue("warning", `atividades-${index}`, `O horario final da atividade ${index + 1} esta antes do horario inicial.`));
    }
    if (!item.orcamentoNivel3Ref?.trim()) {
      warnings.push(makeIssue("warning", `atividades-${index}`, `A atividade ${index + 1} ainda nao possui item de nivel 3 selecionado.`));
    }
    if (!item.orcamentoRef?.trim()) {
      warnings.push(makeIssue("warning", `atividades-${index}`, `A atividade ${index + 1} ainda nao possui subitem de nivel 4 selecionado.`));
    }
    if (!Array.isArray(item.alocados) || !item.alocados.length) {
      warnings.push(makeIssue("warning", `atividades-${index}`, `A atividade ${index + 1} nao possui profissionais alocados.`));
    }
  });

  const profissionaisPorId = new Map((data.cadastros?.profissionais || []).map((item) => [item.id, item]));
  (data.atividades || []).forEach((atividade, index) => {
    (atividade.alocados || []).forEach((profissionalId) => {
      (data.atividades || []).slice(index + 1).forEach((outraAtividade, offset) => {
        const outraIndex = index + 1 + offset;
        if (!(outraAtividade.alocados || []).includes(profissionalId)) return;
        if (!activitiesOverlap(atividade, outraAtividade)) return;

        const profissional = profissionaisPorId.get(profissionalId);
        warnings.push(
          makeIssue(
            "warning",
            `alocacao-${index}-${outraIndex}-${profissionalId}`,
            `${profissional?.nome || "Um profissional"} esta alocado em atividades simultaneas: atividade ${index + 1} e atividade ${outraIndex + 1}.`
          )
        );
      });
    });
  });

  return {
    errors,
    warnings: [...warnings, ...validateDashboardFilters(dashboardFilters)],
  };
}
