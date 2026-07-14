export function stripAccents(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function normalizeBudgetRow(row) {
  const map = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    map[stripAccents(key)] = value;
  });

  return {
    nivel: Number(map.nivel || 0),
    referencia: String(map.referencia || ""),
    descricao: String(map.descricao || ""),
    qtdeOrcada: Number(map["qtde. orcada"] || map["qtde orcada"] || 0),
    unidade: String(map.unidade || ""),
    precoTotal: Number(map["preco total"] || 0),
    bdi: Number(map["bdi(%)"] || map.bdi || 0),
  };
}

export function getWeekday(dateStr) {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("pt-BR", { weekday: "long" });
}

export function formatNumber(value, digits = 2) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(Number(value || 0));
}

export function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));
}

export function formatShortDate(dateStr) {
  if (!dateStr) return "-";
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}

export function getClimaLabel(clima) {
  const map = {
    bom: "Bom",
    instavel: "Instavel",
    chuva: "Chuva",
    impraticavel: "Impraticavel",
  };
  return map[clima] || "-";
}

export function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function countLines(text) {
  return String(text || "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean).length;
}

export function joinLines(text) {
  return String(text || "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
    .join("; ");
}

export function clampPercentage(value) {
  return Math.max(0, Math.min(100, Number(value || 0)));
}

export function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
