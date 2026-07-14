import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const nodeModulesBin = path.join(rootDir, "node_modules", "vite", "bin", "vite.js");

const children = [];

function startProcess(label, command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: false,
    env: {
      ...process.env,
      ...env,
    },
  });

  child.on("exit", (code) => {
    if (code !== 0) {
      console.error(`${label} finalizou com codigo ${code}`);
    }
    shutdown(code || 0);
  });

  children.push(child);
  return child;
}

function shutdown(code = 0) {
  while (children.length) {
    const child = children.pop();
    if (child && !child.killed) {
      child.kill();
    }
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

if (!existsSync(nodeModulesBin)) {
  console.error("Dependencias nao instaladas. Rode `npm install` antes de `npm run dev:all`.");
  process.exit(1);
}

startProcess("API", process.execPath, [path.join(__dirname, "server.mjs")], { PORT: "3001" });
startProcess("Vite", process.execPath, [nodeModulesBin, "--host", "0.0.0.0", "--port", "5173"]);
