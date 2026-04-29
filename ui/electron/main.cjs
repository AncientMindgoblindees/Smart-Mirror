const { app, BrowserWindow, ipcMain } = require("electron");
const http = require("http");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn, spawnSync } = require("child_process");

const isDev = !app.isPackaged;
const DEV_URL = process.env.SMART_MIRROR_UI_URL || "http://127.0.0.1:5173";
const PREVIEW_WIDTH = Number(process.env.MIRROR_NATIVE_PREVIEW_WIDTH || 640);
const PREVIEW_HEIGHT = Number(process.env.MIRROR_NATIVE_PREVIEW_HEIGHT || 360);
const PREVIEW_QUALITY = Number(process.env.MIRROR_NATIVE_PREVIEW_QUALITY || 65);

let mainWindow = null;
let previewProc = null;
let previewServer = null;
let previewServerPort = 0;
let previewServerReadyPromise = null;
const previewClients = new Set();
let previewBuffer = Buffer.alloc(0);
let latestPreviewFrame = null;

if (process.platform === "linux") {
  const mode = (process.env.MIRROR_ELECTRON_GPU_MODE || "auto").toLowerCase();
  // Modes:
  // auto         -> no forced GPU flags (best performance if stack is healthy)
  // safe-gpu     -> keep GPU on, but avoid problematic Ozone path
  // software     -> force software GL only (last-resort stability mode)
  if (mode === "safe-gpu") {
    app.commandLine.appendSwitch("disable-features", "UseOzonePlatform");
    app.commandLine.appendSwitch("ozone-platform", "x11");
  } else if (mode === "software") {
    app.commandLine.appendSwitch("disable-gpu");
    app.commandLine.appendSwitch("use-gl", "swiftshader");
  }
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
  // Preview stream is backed by rpicam-vid; prefer reporting that runtime first.
  if (findCommand("rpicam-vid")) return "rpicam";
  if (hasPicamera2()) return "picamera2";
  if (findCommand("rpicam-still")) return "rpicam";
  return "none";
}

function stopPreview() {}
function stopPreview() {
  if (previewProc) {
    try {
      previewProc.kill("SIGTERM");
    } catch {}
    previewProc = null;
  }
  previewBuffer = Buffer.alloc(0);
  latestPreviewFrame = null;
  for (const res of previewClients) {
    try {
      res.end();
    } catch {}
  }
  previewClients.clear();
}

function extractJpegFramesFromBuffer() {
  while (true) {
    const soi = previewBuffer.indexOf(Buffer.from([0xff, 0xd8]));
    if (soi < 0) return;
    const eoi = previewBuffer.indexOf(Buffer.from([0xff, 0xd9]), soi + 2);
    if (eoi < 0) {
      if (soi > 0) previewBuffer = previewBuffer.subarray(soi);
      return;
    }
    latestPreviewFrame = Buffer.from(previewBuffer.subarray(soi, eoi + 2));
    previewBuffer = previewBuffer.subarray(eoi + 2);
  }
}

function startPreview() {
  if (previewProc) return;
  if (!findCommand("rpicam-vid")) return;
  previewProc = spawn("rpicam-vid", [
    "-n",
    "-t",
    "0",
    "--codec",
    "libav",
    "--libav-format",
    "mpegts",
    "--width",
    String(PREVIEW_WIDTH),
    "--height",
    String(PREVIEW_HEIGHT),
    "--framerate",
    "30",
    "-o",
    "-",
  ], { stdio: ["ignore", "pipe", "pipe"] });
  previewProc.stdout.on("data", (chunk) => {
    for (const res of previewClients) {
      try {
        res.write(chunk);
      } catch {}
    }
  });
  previewProc.on("exit", () => {
    previewProc = null;
  });
}

function ensurePreviewServer() {
  if (previewServer) return previewServerReadyPromise ?? Promise.resolve();
  previewServer = http.createServer((req, res) => {
    if (req.url !== "/native-preview.ts") {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    startPreview();
    res.writeHead(200, {
      "Content-Type": "video/mp2t",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Connection: "keep-alive",
    });
    previewClients.add(res);
    req.on("close", () => {
      previewClients.delete(res);
    });
  });
  previewServerReadyPromise = new Promise((resolve, reject) => {
    previewServer.listen(0, "127.0.0.1", () => {
      const addr = previewServer.address();
      previewServerPort = typeof addr === "object" && addr ? addr.port : 0;
      if (!previewServerPort) {
        reject(new Error("Preview server failed to bind a port"));
        return;
      }
      resolve();
    });
    previewServer.on("error", (err) => reject(err));
  });
  return previewServerReadyPromise;
}

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


ipcMain.handle("smartMirrorCamera:getStatus", async () => {
  const source = preferredSource();
  return {
    available: source !== "none",
    preferredSource: source,
  };
});

ipcMain.handle("smartMirrorCamera:startPreview", async () => {
  await ensurePreviewServer();
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

ipcMain.handle("smartMirrorCamera:getPreviewStreamUrl", async () => {
  await ensurePreviewServer();
  if (!previewServerPort) throw new Error("Preview server not ready");
  return `http://127.0.0.1:${previewServerPort}/native-preview.ts`;
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
  stopPreview();
  if (previewServer) {
    try {
      previewServer.close();
    } catch {}
    previewServer = null;
  }
  if (process.platform !== "darwin") app.quit();
});
