const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn, spawnSync } = require("child_process");

const isDev = !app.isPackaged;
const DEV_URL = process.env.SMART_MIRROR_UI_URL || "http://127.0.0.1:5173";

let mainWindow = null;

if (process.platform === "linux") {
  // Avoid GBM/Ozone GPU crashes on Pi images missing matching Mesa/GBM stack.
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("disable-software-rasterizer");
  app.commandLine.appendSwitch("in-process-gpu");
  app.commandLine.appendSwitch("use-gl", "swiftshader");
}

function findCommand(cmd) {
  const probe = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(probe, [cmd], { encoding: "utf8" });
  return result.status === 0;
}

function hasPicamera2() {
  const res = spawnSync("python3", ["-c", "import picamera2; print('ok')"], { encoding: "utf8" });
  if (res.status === 0) return true;
  const resAlt = spawnSync("python", ["-c", "import picamera2; print('ok')"], { encoding: "utf8" });
  return resAlt.status === 0;
}

function preferredSource() {
  if (hasPicamera2()) return "picamera2";
  if (findCommand("rpicam-still")) return "rpicam";
  return "none";
}

function stopPreview() {}
function startPreview() {}

function captureViaRpicam(targetPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn("rpicam-still", [
      "-n",
      "--immediate",
      "--quality",
      "92",
      "-o",
      targetPath,
    ]);
    let err = "";
    proc.stderr.on("data", (d) => (err += String(d)));
    proc.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err || `rpicam-still failed (${code})`));
    });
  });
}

function captureViaPicamera2(targetPath) {
  return new Promise((resolve, reject) => {
    const script = path.join(__dirname, "picamera_capture.py");
    const py = spawn("python3", [script, targetPath], { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    py.stderr.on("data", (d) => (err += String(d)));
    py.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err || `picamera2 capture failed (${code})`));
    });
  });
}

function capturePreviewViaRpicam(targetPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn("rpicam-still", [
      "-n",
      "--immediate",
      "--width",
      "960",
      "--height",
      "540",
      "--quality",
      "80",
      "-o",
      targetPath,
    ]);
    let err = "";
    proc.stderr.on("data", (d) => (err += String(d)));
    proc.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err || `rpicam preview failed (${code})`));
    });
  });
}

function capturePreviewViaPicamera2(targetPath) {
  return new Promise((resolve, reject) => {
    const script = path.join(__dirname, "picamera_preview.py");
    const py = spawn("python3", [script, targetPath], { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    py.stderr.on("data", (d) => (err += String(d)));
    py.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err || `picamera2 preview failed (${code})`));
    });
  });
}

ipcMain.handle("smartMirrorCamera:getStatus", async () => {
  const source = preferredSource();
  return {
    available: source !== "none",
    preferredSource: source,
  };
});

ipcMain.handle("smartMirrorCamera:startPreview", async () => {
  startPreview();
  return { ok: true };
});

ipcMain.handle("smartMirrorCamera:stopPreview", async () => {
  stopPreview();
  return { ok: true };
});

ipcMain.handle("smartMirrorCamera:capturePhoto", async () => {
  const source = preferredSource();
  if (source === "none") throw new Error("No native Pi camera runtime available");
  const outPath = path.join(os.tmpdir(), `smart-mirror-capture-${Date.now()}.jpg`);
  if (source === "picamera2") await captureViaPicamera2(outPath);
  else await captureViaRpicam(outPath);
  const file = fs.readFileSync(outPath);
  fs.rmSync(outPath, { force: true });
  return file;
});

ipcMain.handle("smartMirrorCamera:getPreviewFrame", async () => {
  const source = preferredSource();
  if (source === "none") throw new Error("No native Pi camera runtime available");
  const outPath = path.join(os.tmpdir(), `smart-mirror-preview-${Date.now()}.jpg`);
  if (source === "picamera2") await capturePreviewViaPicamera2(outPath);
  else await capturePreviewViaRpicam(outPath);
  const file = fs.readFileSync(outPath);
  fs.rmSync(outPath, { force: true });
  return file;
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (isDev) mainWindow.loadURL(DEV_URL);
  else mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
