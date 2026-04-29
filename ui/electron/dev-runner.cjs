const { spawn } = require("child_process");
const path = require("path");

const uiRoot = path.resolve(__dirname, "..");
const viteCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const electronCmd = process.platform === "win32" ? "npx.cmd" : "npx";

const vite = spawn(viteCmd, ["run", "dev", "--", "--host", "127.0.0.1", "--port", "5173"], {
  cwd: uiRoot,
  stdio: ["inherit", "pipe", "pipe"],
});

let electron = null;
let startingElectron = false;

function startElectronOnce() {
  if (electron || startingElectron) return;
  startingElectron = true;
  electron = spawn(electronCmd, ["electron", "./electron/main.cjs"], {
    cwd: uiRoot,
    stdio: "inherit",
  });
  electron.on("exit", (code) => {
    electron = null;
    shutdown(code ?? 0);
  });
}

vite.stdout?.on("data", (buf) => {
  const line = String(buf);
  process.stdout.write(line);
  if (line.includes("Local:") || line.includes("ready in")) startElectronOnce();
});

vite.stderr?.on("data", (buf) => {
  const line = String(buf);
  process.stderr.write(line);
  if (line.includes("Local:") || line.includes("ready in")) startElectronOnce();
});

setTimeout(() => {
  startElectronOnce();
}, 2500);

vite.on("exit", (code) => shutdown(code ?? 0));

function shutdown(code) {
  try {
    if (electron && !electron.killed) electron.kill("SIGTERM");
  } catch {}
  try {
    if (vite && !vite.killed) vite.kill("SIGTERM");
  } catch {}
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
