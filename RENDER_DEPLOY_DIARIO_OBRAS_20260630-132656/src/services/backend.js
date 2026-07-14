const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Falha na requisicao ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export const backendClient = {
  enabled: Boolean(API_BASE),

  async ping() {
    if (!API_BASE) return { enabled: false, skipped: true };
    return request("/health");
  },

  async loadLatest() {
    if (!API_BASE) return { enabled: false, skipped: true };
    return request("/diarios/latest");
  },

  async saveDraft(payload) {
    if (!API_BASE) return { enabled: false, skipped: true };
    return request("/diarios/draft", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async saveSnapshot(payload) {
    if (!API_BASE) return { enabled: false, skipped: true };
    return request("/diarios/snapshot", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};
