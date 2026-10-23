import {emptyDiary,localWorkDate} from '../../shared/diary.mjs';
export const STORAGE_KEY = "diario-obra-app-v6-itauba";
export const BACKUP_STORAGE_KEY = `${STORAGE_KEY}:backup`;
export const APP_SCHEMA_VERSION = 9;
export const AUTOSAVE_DELAY_MS = 700;

export const ITAUBA_LOGO =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='260' height='84' viewBox='0 0 260 84'><rect width='260' height='84' rx='22' fill='%231b1f2a'/><rect x='12' y='12' width='60' height='60' rx='18' fill='%23f97316'/><text x='42' y='50' font-family='Arial' font-size='28' font-weight='700' text-anchor='middle' fill='white'>I</text><text x='92' y='38' font-family='Arial' font-size='22' font-weight='700' fill='white'>ITAUBA</text><text x='92' y='58' font-family='Arial' font-size='12' font-weight='600' fill='%23fdba74'>ENGENHARIA</text></svg>";

export const CLIMA_OPTIONS = [
  { value: "bom", label: "Bom" },
  { value: "instavel", label: "Instavel" },
  { value: "chuva", label: "Chuva" },
  { value: "impraticavel", label: "Impraticavel" },
];

export const TAB_ITEMS = [
  { value: "multiobra", label: "Multiobra" },
  { value: "cadastros", label: "Cadastros" },
  { value: "diario", label: "Diario" },
  { value: "produtividade", label: "Produtividade" },
  { value: "gerencial", label: "Gerencial" },
  { value: "dashboard", label: "Dashboard" },
  { value: "historico", label: "Historico" },
  { value: "orcamento", label: "Orcamento" },
  { value: "administracao", label: "Logins" },
];

export const DASHBOARD_WIDGETS = [
  { value: "resumo", label: "Resumo" },
  { value: "evolucao", label: "Evolucao" },
  { value: "servicos", label: "Servicos" },
  { value: "orcamento", label: "Orcamento" },
  { value: "tabelaOrcamento", label: "Tabela orcamento" },
];

const ALL_TAB_VALUES = TAB_ITEMS.map((item) => item.value);
const ALL_DASHBOARD_WIDGETS = DASHBOARD_WIDGETS.map((item) => item.value);

export function createAccessProfile(partial = {}) {
  const id = partial.id || partial.value || crypto.randomUUID();
  const isAdmin = id === "gerencia" || partial.isAdmin === true;
  const tabs = isAdmin ? ALL_TAB_VALUES : Array.isArray(partial.tabs) ? partial.tabs : [];
  const editableTabs = isAdmin ? ALL_TAB_VALUES : Array.isArray(partial.editableTabs) ? partial.editableTabs : [];
  const dashboardWidgets = isAdmin
    ? ALL_DASHBOARD_WIDGETS
    : Array.isArray(partial.dashboardWidgets)
      ? partial.dashboardWidgets
      : ALL_DASHBOARD_WIDGETS;

  return {
    id,
    label: partial.label || partial.nome || "Nova funcao",
    tabs: tabs.filter((tab) => ALL_TAB_VALUES.includes(tab)),
    editableTabs: editableTabs.filter((tab) => ALL_TAB_VALUES.includes(tab)),
    dashboardWidgets: dashboardWidgets.filter((item) => ALL_DASHBOARD_WIDGETS.includes(item)),
    canDeleteHistory: isAdmin ? true : Boolean(partial.canDeleteHistory),
    isAdmin,
  };
}

export const ACCESS_PROFILES = {
  apontador: createAccessProfile({
    id: "apontador",
    label: "Apontador",
    tabs: ["diario", "produtividade", "historico"],
    editableTabs: ["diario", "produtividade"],
    dashboardWidgets: ["resumo", "servicos"],
  }),
  engenheiro: createAccessProfile({
    id: "engenheiro",
    label: "Engenheiro",
    tabs: ["cadastros", "diario", "produtividade", "gerencial", "dashboard", "historico"],
    editableTabs: ["cadastros", "diario", "produtividade", "gerencial", "historico"],
    dashboardWidgets: ["resumo", "evolucao", "servicos", "orcamento", "tabelaOrcamento"],
  }),
  rh: createAccessProfile({
    id: "rh",
    label: "RH",
    tabs: ["cadastros", "historico"],
    editableTabs: ["cadastros"],
    dashboardWidgets: ["resumo"],
  }),
  gerencia: createAccessProfile({
    id: "gerencia",
    label: "Administrativo",
    isAdmin: true,
  }),
};

export const BANCO_TIPOS_PROFISSIONAIS = [
  "ADMINISTRATIVO",
  "ARMADOR",
  "AUXILIAR DE ALMOXARIFADO",
  "CARPINTEIRO",
  "CONTRA MESTRE",
  "ENCARREGADO DE ARMACAO",
  "ENCARREGADO DE CARPINTARIA",
  "ENGENHEIRO CIVIL",
  "MESTRE DE OBRAS",
  "MOTORISTA",
  "SERVENTE",
  "TEC. SEGURANCA TRABALHO",
  "ZELADOR",
  "TOPOGRAFO",
  "OPERADOR DE MUNCK",
  "MONTADOR DE ANDAIMES",
  "ESTAGIARIO",
  "TRAINEE DE ENGENHARIA",
];

export function createFuncionario(funcao = "") {
  return {
    funcao,
    previsto: 0,
    presente: 0,
    observacoes: "",
  };
}

export const DEFAULT_FUNCIONARIOS = BANCO_TIPOS_PROFISSIONAIS.map((funcao) => createFuncionario(funcao));

export function createAtividade(partial = {}) {
  return {
    id: partial.id || crypto.randomUUID(),
    inicio: partial.inicio || "07:00",
    fim: partial.fim || "17:00",
    local: partial.local || "",
    tarefa: partial.tarefa || "",
    equipe: partial.equipe || "",
    orcamentoNivel3Ref: partial.orcamentoNivel3Ref || "",
    orcamentoNivel3Descricao: partial.orcamentoNivel3Descricao || "",
    orcamentoRef: partial.orcamentoRef || "",
    orcamentoDescricao: partial.orcamentoDescricao || "",
    unidade: partial.unidade || "un",
    quantidadeProduzida: Number(partial.quantidadeProduzida || 0),
    percentualExecutado: partial.percentualExecutado === "" || partial.percentualExecutado == null ? "" : Number(partial.percentualExecutado || 0),
    alocados: Array.isArray(partial.alocados) ? partial.alocados : [],
  };
}

export function createServico() {
  return {
    servico: "",
    unidade: "un",
    quantidadeProduzida: 0,
    qtdPessoas: 0,
    horasTrabalhadas: 0,
    orcamentoRef: "",
  };
}

export function createObra(partial = {}) {
  return {
    id: partial.id || crypto.randomUUID(),
    codigo: partial.codigo || "",
    nome: partial.nome || "",
    cliente: partial.cliente || "",
    local: partial.local || "",
    responsavel: partial.responsavel || "",
    prazo: partial.prazo || "",
  };
}

export const DEFAULT_OBRAS = [];

export function createProfissional(partial = {}) {
  return {
    id: partial.id || crypto.randomUUID(),
    nome: partial.nome || "",
    matricula: partial.matricula || "",
    funcao: partial.funcao || "",
    obraId: partial.obraId || "",
    ativo: partial.ativo ?? true,
    custoHora: Number(partial.custoHora || 0),
    observacoes: partial.observacoes || "",
  };
}

export function createAfastamento(partial = {}) {
  return {
    id: partial.id || crypto.randomUUID(),
    profissionalId: partial.profissionalId || "",
    tipo: partial.tipo || "ausencia",
    inicio: partial.inicio || new Date().toISOString().slice(0, 10),
    fim: partial.fim || partial.inicio || new Date().toISOString().slice(0, 10),
    motivo: partial.motivo || "",
    autorizadoPor: partial.autorizadoPor || "",
    createdAt: partial.createdAt || new Date().toISOString(),
  };
}

export function createUsuario(partial = {}) {
  return {
    id: partial.id || crypto.randomUUID(),
    nome: partial.nome || "",
    login: partial.login || "",
    cargo: partial.cargo || "",
    perfil: partial.perfil || "apontador",
    ativo: partial.ativo ?? true,
  };
}

export const DEFAULT_PROFISSIONAIS = [];

export const DEFAULT_USUARIOS = [];

export const ORCAMENTO_EXEMPLO = [];

export function buildInitialData() {
  return {...emptyDiary(localWorkDate()),schemaVersion:APP_SCHEMA_VERSION,funcionarios:[],servicos:[],orcamento:[],historico:[],multiobra:{obraAtivaId:'',obras:[]},cadastros:{profissionais:[],afastamentos:[]},administracao:{usuarios:[],perfis:[],cargos:BANCO_TIPOS_PROFISSIONAIS}};
}
