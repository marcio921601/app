import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, "data");
const dataFile = path.join(dataDir, "diarios.json");
const distDir = path.join(rootDir, "dist");
const apiPrefix = "/api";
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dataFile);
  } catch {
    const initial = {
      draft: null,
      snapshots: [],
      updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(dataFile, JSON.stringify(initial, null, 2), "utf8");
  }
}

async function readStore() {
  await ensureStore();
  const raw = await fs.readFile(dataFile, "utf8");
  const parsed = JSON.parse(raw);
  return {
    draft: parsed.draft || null,
    snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : [],
    updatedAt: parsed.updatedAt || new Date().toISOString(),
  };
}

async function writeStore(data) {
  const payload = {
    ...data,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(dataFile, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end(text);
}

async function handleApi(request, response, pathname) {
  if (request.method === "GET" && pathname === `${apiPrefix}/health`) {
    return sendJson(response, 200, {
      status: "ok",
      runtime: "node",
      now: new Date().toISOString(),
    });
  }

  if (request.method === "GET" && pathname === `${apiPrefix}/diarios`) {
    const store = await readStore();
    return sendJson(response, 200, {
      draft: store.draft,
      snapshots: store.snapshots,
      updatedAt: store.updatedAt,
    });
  }

  if (request.method === "GET" && pathname === `${apiPrefix}/diarios/latest`) {
    const store = await readStore();
    const latestSnapshot = [...store.snapshots].sort((a, b) => {
      const ad = new Date(a.createdAt || a.updatedAt || 0).getTime();
      const bd = new Date(b.createdAt || b.updatedAt || 0).getTime();
      return bd - ad;
    })[0] || null;

    return sendJson(response, 200, {
      draft: store.draft,
      latestSnapshot,
      updatedAt: store.updatedAt,
    });
  }

  if (request.method === "POST" && pathname === `${apiPrefix}/diarios/draft`) {
    const body = await readJsonBody(request);
    const store = await readStore();
    const next = await writeStore({
      ...store,
      draft: {
        ...body,
        savedAt: new Date().toISOString(),
      },
    });

    return sendJson(response, 200, {
      message: "Draft salvo com sucesso.",
      updatedAt: next.updatedAt,
    });
  }

  if (request.method === "POST" && pathname === `${apiPrefix}/diarios/snapshot`) {
    const body = await readJsonBody(request);
    const store = await readStore();
    const snapshots = [
      body,
      ...store.snapshots.filter((item) => item.id !== body.id),
    ].sort((a, b) => {
      const ad = new Date(a.createdAt || 0).getTime();
      const bd = new Date(b.createdAt || 0).getTime();
      return bd - ad;
    });

    const next = await writeStore({
      ...store,
      snapshots,
    });

    return sendJson(response, 200, {
      message: "Snapshot salvo com sucesso.",
      totalSnapshots: next.snapshots.length,
      updatedAt: next.updatedAt,
    });
  }

  return sendJson(response, 404, {
    message: "Endpoint nao encontrado.",
  });
}

async function tryServeStatic(response, pathname) {
  let relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  relativePath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  let fullPath = path.join(distDir, relativePath);

  if (!fullPath.startsWith(distDir)) {
    return false;
  }

  try {
    const stat = await fs.stat(fullPath);
    if (stat.isDirectory()) {
      fullPath = path.join(fullPath, "index.html");
    }
    const ext = path.extname(fullPath);
    const content = await fs.readFile(fullPath);
    response.writeHead(200, {
      "Content-Type": contentTypes[ext] || "application/octet-stream",
    });
    response.end(content);
    return true;
  } catch {
    return false;
  }
}

function renderDevHint() {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Diario de Obras Itauba</title>
    <style>
      body { font-family: Segoe UI, Arial, sans-serif; margin: 0; padding: 32px; background: #f7f4ee; color: #1d2430; }
      .card { max-width: 760px; margin: 0 auto; padding: 24px; background: white; border-radius: 18px; box-shadow: 0 18px 40px -28px rgba(0,0,0,.35); }
      code { background: #f1ede6; padding: 2px 6px; border-radius: 6px; }
      pre { background: #1d2430; color: #f8fafc; padding: 14px; border-radius: 12px; overflow: auto; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Backend Node.js ativo</h1>
      <p>A API local esta rodando, mas o front ainda nao foi gerado em <code>dist</code>.</p>
      <p>Use um destes fluxos:</p>
      <pre>npm run dev:all</pre>
      <pre>npm run build
npm run start</pre>
    </div>
  </body>
</html>`;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname.startsWith(apiPrefix)) {
      await handleApi(request, response, pathname);
      return;
    }

    const served = await tryServeStatic(response, pathname);
    if (served) return;

    const hasDist = await fs.access(distDir).then(() => true).catch(() => false);
    if (!hasDist) {
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
      });
      response.end(renderDevHint());
      return;
    }

    const fallback = await fs.readFile(path.join(distDir, "index.html"));
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
    });
    response.end(fallback);
  } catch (error) {
    console.error(error);
    sendText(response, 500, "Erro interno no servidor Node.js.");
  }
});

server.listen(port, host, () => {
  console.log(`Servidor Node ativo em http://${host}:${port}`);
  console.log(`Dados da API em ${dataFile}`);
});
