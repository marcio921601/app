import {
  APP_SCHEMA_VERSION,
  ACCESS_PROFILES,
  BACKUP_STORAGE_KEY,
  STORAGE_KEY,
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

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeList(list, fallbackFactory) {
  if (!Array.isArray(list) || !list.length) {
    return [fallbackFactory()];
  }
  return list.map((item) => ({
    ...fallbackFactory(),
    ...(item || {}),
  }));
}

function migrateProfissionais(funcionarios, obraId, fallback) {
  if (!Array.isArray(funcionarios) || !funcionarios.length) return fallback;

  const profissionais = [];
  funcionarios.forEach((item) => {
    const total = Math.max(Number(item.previsto || 0), Number(item.presente || 0));
    for (let index = 0; index < total; index += 1) {
      profissionais.push(
        createProfissional({
          id: `prof-migrado-${String(item.funcao || "funcao").toLowerCase().replace(/\W+/g, "-")}-${index + 1}`,
          nome: `${item.funcao || "Profissional"} ${index + 1}`,
          funcao: item.funcao || "",
          obraId,
        })
      );
    }
  });

  return profissionais.length ? profissionais : fallback;
}

function migratePresencas(safe, profissionais, fallback) {
  if (Array.isArray(safe.presencas)) return safe.presencas;
  if (!Array.isArray(safe.funcionarios) || !safe.funcionarios.length) return fallback;

  const selected = [];
  safe.funcionarios.forEach((item) => {
    const presentes = Number(item.presente || 0);
    profissionais
      .filter((profissional) => profissional.funcao === item.funcao)
      .slice(0, presentes)
      .forEach((profissional) => selected.push(profissional.id));
  });

  return selected.length ? selected : fallback;
}

function normalizeAccessProfiles(rawProfiles, fallbackProfiles) {
  const source = Array.isArray(rawProfiles) && rawProfiles.length ? rawProfiles : fallbackProfiles;
  const profiles = source.map((item) => createAccessProfile(item));
  const hasAdmin = profiles.some((item) => item.isAdmin);
  return hasAdmin ? profiles : [...profiles, ACCESS_PROFILES.gerencia];
}

export function mergeWithDefaults(parsed) {
  const base = buildInitialData();
  const safe = parsed && typeof parsed === "object" ? parsed : {};

  const perfis = normalizeAccessProfiles(safe.administracao?.perfis, base.administracao.perfis);
  const perfisById = new Map(perfis.map((item) => [item.id, item]));

  const obras = Array.isArray(safe.multiobra?.obras) && safe.multiobra.obras.length
    ? safe.multiobra.obras.map((obra) => createObra(obra))
    : base.multiobra.obras;

  const obraAtivaId = safe.multiobra?.obraAtivaId && obras.some((item) => item.id === safe.multiobra.obraAtivaId)
    ? safe.multiobra.obraAtivaId
    : obras[0]?.id || "";

  const profissionais = Array.isArray(safe.cadastros?.profissionais) && safe.cadastros.profissionais.length
    ? safe.cadastros.profissionais.map((item) => createProfissional({ ...item, obraId: item.obraId || obraAtivaId }))
    : migrateProfissionais(safe.funcionarios, obraAtivaId, base.cadastros.profissionais);

  let usuarios = Array.isArray(safe.administracao?.usuarios) && safe.administracao.usuarios.length
    ? safe.administracao.usuarios.map((item) => createUsuario(item))
    : base.administracao.usuarios;

  if (!usuarios.some((item) => perfisById.get(item.perfil)?.isAdmin && item.ativo !== false)) {
    const existingAdminIndex = usuarios.findIndex((item) => item.id === "user-gerencia" || item.perfil === "gerencia");
    if (existingAdminIndex >= 0) {
      usuarios = usuarios.map((item, index) => (index === existingAdminIndex ? { ...item, perfil: "gerencia", ativo: true } : item));
    } else {
      usuarios = [...usuarios, createUsuario({ id: "user-gerencia", nome: "Administrativo", login: "administrativo", cargo: "Administracao", perfil: "gerencia" })];
    }
  }

  const usuarioAtivoId = safe.administracao?.usuarioAtivoId && usuarios.some((item) => item.id === safe.administracao.usuarioAtivoId)
    ? safe.administracao.usuarioAtivoId
    : usuarios.find((item) => item.perfil === "gerencia")?.id || usuarios[0]?.id || "";

  const visualizarComoPerfil =
    safe.administracao?.visualizarComoPerfil && perfisById.has(safe.administracao.visualizarComoPerfil)
      ? safe.administracao.visualizarComoPerfil
      : "";

  return {
    ...base,
    ...safe,
    schemaVersion: APP_SCHEMA_VERSION,
    updatedAt: safe.updatedAt || base.updatedAt,
    cabecalho: {
      ...base.cabecalho,
      ...(safe.cabecalho || {}),
    },
    multiobra: {
      ...base.multiobra,
      ...(safe.multiobra || {}),
      obraAtivaId,
      obras,
    },
    cadastros: {
      ...base.cadastros,
      ...(safe.cadastros || {}),
      profissionais,
      afastamentos: Array.isArray(safe.cadastros?.afastamentos)
        ? safe.cadastros.afastamentos.map((item) => createAfastamento(item))
        : base.cadastros.afastamentos,
    },
    administracao: {
      ...base.administracao,
      ...(safe.administracao || {}),
      usuarioAtivoId,
      usuarios,
      perfis,
      visualizarComoPerfil,
      cargos: Array.isArray(safe.administracao?.cargos) && safe.administracao.cargos.length
        ? safe.administracao.cargos
        : base.administracao.cargos,
    },
    funcionarios: Array.isArray(safe.funcionarios) && safe.funcionarios.length
      ? safe.funcionarios.map((item) => ({ ...createFuncionario(), ...(item || {}) }))
      : base.funcionarios,
    presencas: migratePresencas(safe, profissionais, base.presencas),
    atividades: normalizeList(safe.atividades, createAtividade).map((item) => createAtividade(item)),
    servicos: normalizeList(safe.servicos, createServico),
    orcamento: Array.isArray(safe.orcamento) && safe.orcamento.length ? safe.orcamento : base.orcamento,
    historico: Array.isArray(safe.historico) ? safe.historico : base.historico,
    gerencial: {
      ...base.gerencial,
      ...(safe.gerencial || {}),
    },
  };
}

export function loadAppData() {
  if (typeof window === "undefined") return buildInitialData();

  const primary = safeParse(window.localStorage.getItem(STORAGE_KEY));
  if (primary) {
    return mergeWithDefaults(primary);
  }

  const backup = safeParse(window.localStorage.getItem(BACKUP_STORAGE_KEY));
  if (backup?.data) {
    return mergeWithDefaults(backup.data);
  }

  return buildInitialData();
}

export function saveAppData(data) {
  if (typeof window === "undefined") return false;

  const payload = {
    ...data,
    schemaVersion: APP_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  window.localStorage.setItem(
    BACKUP_STORAGE_KEY,
    JSON.stringify({
      savedAt: payload.updatedAt,
      data: payload,
    })
  );

  return true;
}

export function exportAppData(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `diario-obra-${data.cabecalho?.data || "sem-data"}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
