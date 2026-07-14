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
  const id = partial.id || partial.value || `perfil-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
    editableTabs: ["diario", "produtividade", "historico"],
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
    id: partial.id || `atividade-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
    id: partial.id || `obra-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    codigo: partial.codigo || "",
    nome: partial.nome || "",
    cliente: partial.cliente || "",
    local: partial.local || "",
    responsavel: partial.responsavel || "",
    prazo: partial.prazo || "",
  };
}

export const DEFAULT_OBRAS = [
  createObra({
    id: "obra-1",
    codigo: "VMX-001",
    nome: "VIADUTO MAX STANDACHER - PR",
  }),
];

export function createProfissional(partial = {}) {
  return {
    id: partial.id || `prof-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    nome: partial.nome || "",
    matricula: partial.matricula || "",
    funcao: partial.funcao || "",
    obraId: partial.obraId || DEFAULT_OBRAS[0].id,
    ativo: partial.ativo ?? true,
    custoHora: Number(partial.custoHora || 0),
    observacoes: partial.observacoes || "",
  };
}

export function createAfastamento(partial = {}) {
  return {
    id: partial.id || `afast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
    id: partial.id || `usuario-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    nome: partial.nome || "",
    login: partial.login || "",
    cargo: partial.cargo || "",
    perfil: partial.perfil || "apontador",
    ativo: partial.ativo ?? true,
  };
}

export const DEFAULT_PROFISSIONAIS = [
  createProfissional({ id: "prof-1", nome: "Joao Silva", matricula: "001", funcao: "ENCARREGADO DE CARPINTARIA", obraId: DEFAULT_OBRAS[0].id }),
  createProfissional({ id: "prof-2", nome: "Maria Souza", matricula: "002", funcao: "CARPINTEIRO", obraId: DEFAULT_OBRAS[0].id }),
  createProfissional({ id: "prof-3", nome: "Carlos Lima", matricula: "003", funcao: "SERVENTE", obraId: DEFAULT_OBRAS[0].id }),
  createProfissional({ id: "prof-4", nome: "Ana Rocha", matricula: "004", funcao: "ARMADOR", obraId: DEFAULT_OBRAS[0].id }),
];

export const DEFAULT_USUARIOS = [
  createUsuario({ id: "user-apontador", nome: "Apontador", login: "apontador", cargo: "Apontador", perfil: "apontador" }),
  createUsuario({ id: "user-engenheiro", nome: "Engenheiro", login: "engenheiro", cargo: "Engenheiro", perfil: "engenheiro" }),
  createUsuario({ id: "user-rh", nome: "RH", login: "rh", cargo: "Recursos Humanos", perfil: "rh" }),
  createUsuario({ id: "user-gerencia", nome: "Administrativo", login: "administrativo", cargo: "Administracao", perfil: "gerencia" }),
];

export const ORCAMENTO_EXEMPLO = [
  { nivel: 1, referencia: "1", descricao: "IVAI - PONTE - obra", qtdeOrcada: 0, unidade: "", precoTotal: 0, bdi: 0 },
  { nivel: 2, referencia: "1001", descricao: "01.01 FUNDACAO - ESTACAS RAIZ", qtdeOrcada: 0, unidade: "", precoTotal: 0, bdi: 0 },
  { nivel: 3, referencia: "1001001", descricao: "AQUISICAO DE ACO", qtdeOrcada: 0, unidade: "", precoTotal: 0, bdi: 0 },
  { nivel: 4, referencia: "1001001001", descricao: "Itauba fornecimento aco ca50 diam. 6,3 mm", qtdeOrcada: 1444.36, unidade: "kg", precoTotal: 9743.65, bdi: 0 },
  { nivel: 4, referencia: "1001001002", descricao: "Itauba fornecimento aco ca50 diam. 20 mm", qtdeOrcada: 12221.5, unidade: "kg", precoTotal: 75374.88, bdi: 0 },
];

export function buildInitialData() {
  return {
    schemaVersion: APP_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    cabecalho: {
      obra: DEFAULT_OBRAS[0].nome,
      folha: "00059",
      data: new Date().toISOString().slice(0, 10),
      periodoManha: "07:00 - 12:00",
      periodoTarde: "13:00 - 17:00",
      climaManha: "bom",
      climaTarde: "bom",
    },
    multiobra: {
      obraAtivaId: DEFAULT_OBRAS[0].id,
      obras: DEFAULT_OBRAS,
    },
    cadastros: {
      profissionais: DEFAULT_PROFISSIONAIS,
      afastamentos: [],
    },
    administracao: {
      usuarioAtivoId: "user-gerencia",
      usuarios: DEFAULT_USUARIOS,
      perfis: Object.values(ACCESS_PROFILES),
      visualizarComoPerfil: "",
      cargos: BANCO_TIPOS_PROFISSIONAIS,
    },
    funcionarios: DEFAULT_FUNCIONARIOS,
    presencas: DEFAULT_PROFISSIONAIS.map((item) => item.id),
    atividades: [createAtividade()],
    observacoes: "",
    consideracoes: "",
    equipamentos: "",
    servicos: [createServico()],
    orcamento: ORCAMENTO_EXEMPLO,
    historico: [],
    gerencial: {
      prazoMarco: "",
      responsavel: "",
      riscos: "",
      restricoes: "",
      aquisicoes: "",
      sst: "",
      ppc: "",
      proximasAcoes: "",
    },
  };
}
