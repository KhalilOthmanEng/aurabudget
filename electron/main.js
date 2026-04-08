/**
 * AuraBudget Desktop — Electron Main Process
 *
 * Responsibilities:
 *   1. Spawn the bundled Python backend as a child process
 *   2. Serve the built React frontend
 *   3. Manage window lifecycle, system tray, and auto-updates
 *   4. Provide IPC bridge for settings management
 */

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  dialog,
  shell,
  nativeImage,
} = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");
const http = require("http");

// ── Performance & Memory Optimizations ──────────────────────────
// Limit V8 renderer heap to reduce RAM footprint
app.commandLine.appendSwitch("js-flags", "--max-old-space-size=256");
// Disable background features that waste RAM/CPU
app.commandLine.appendSwitch(
  "disable-features",
  "TranslateUI,AutofillServerCommunication,OptimizationGuideModelDownloading,OptimizationHints,CalculateNativeWinOcclusion"
);
// Reduce disk cache size (this app loads from localhost, no benefit from disk cache)
app.commandLine.appendSwitch("disk-cache-size", "1");

// ── Paths ────────────────────────────────────────────────────────
const IS_DEV = !app.isPackaged;
const APP_ROOT = IS_DEV
  ? path.join(__dirname, "..")
  : path.join(process.resourcesPath);

const USER_DATA = app.getPath("userData");
const SETTINGS_PATH = path.join(USER_DATA, "settings.json");
const DB_DIR = path.join(USER_DATA, "data");
const RECEIPTS_DIR = path.join(USER_DATA, "receipts");
const LOG_PATH = path.join(USER_DATA, "backend.log");

// Ensure directories exist
[DB_DIR, RECEIPTS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const BACKEND_PORT = 48732; // High port unlikely to conflict
let backendProcess = null;
let mainWindow = null;
let tray = null;
let isQuitting = false;

// ── Settings Management ──────────────────────────────────────────

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
    }
  } catch (e) {
    console.error("Failed to load settings:", e);
  }
  return {
    gemini_api_key: "",
    telegram_bot_token: "",
    telegram_allowed_user_id: "",
    gocardless_secret_id: "",
    gocardless_secret_key: "",
    monthly_budget: 2000,
    currency: "EUR",
    launch_at_startup: false,
    minimize_to_tray: false,
  };
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");
    return true;
  } catch (e) {
    console.error("Failed to save settings:", e);
    return false;
  }
}

// ── Backend Lifecycle ────────────────────────────────────────────

function getBackendExecutable() {
  if (IS_DEV) {
    // In dev mode, use the Python from venv or system
    const venvPython =
      process.platform === "win32"
        ? path.join(APP_ROOT, "backend", "venv", "Scripts", "python.exe")
        : path.join(APP_ROOT, "backend", "venv", "bin", "python");
    if (fs.existsSync(venvPython)) return { exe: venvPython, args: ["-m", "uvicorn", "app.main:app", "--port", String(BACKEND_PORT)] };
    return { exe: "python", args: ["-m", "uvicorn", "app.main:app", "--port", String(BACKEND_PORT)] };
  }
  // In production, use the PyInstaller-bundled executable
  const ext = process.platform === "win32" ? ".exe" : "";
  const bundled = path.join(process.resourcesPath, "backend", `aurabudget-server${ext}`);
  return { exe: bundled, args: [] };
}

function buildBackendEnv() {
  // Use forward slashes for SQLite URLs — backslashes break aiosqlite path parsing on Windows
  const dbPath = path.join(DB_DIR, "aurabudget.db").replace(/\\/g, "/");
  const receiptsPath = RECEIPTS_DIR.replace(/\\/g, "/");
  return {
    ...process.env,
    DATABASE_URL: `sqlite+aiosqlite:///${dbPath}`,
    RECEIPTS_DIR: receiptsPath,
    CORS_ORIGINS: `http://localhost:${BACKEND_PORT}`,
    SETTINGS_PATH: SETTINGS_PATH,
    AURABUDGET_PORT: String(BACKEND_PORT),
    AURABUDGET_DESKTOP: "1",
    PYTHONUTF8: "1",
  };
}

function killPort(port) {
  try {
    if (process.platform === "win32") {
      const res = spawnSync(
        "powershell",
        ["-Command", `(Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue).OwningProcess`],
        { encoding: "utf8", windowsHide: true }
      );
      if (res.stdout) {
        for (const line of res.stdout.trim().split("\n")) {
          const pid = parseInt(line.trim());
          if (!isNaN(pid) && pid > 0) {
            spawnSync("powershell", ["-Command", `Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue`], { windowsHide: true });
          }
        }
      }
    } else {
      spawnSync("sh", ["-c", `lsof -ti:${port} | xargs kill -9`], { windowsHide: true });
    }
  } catch (_) {
    // Ignore — no process on port
  }
}

function checkBackendRunning() {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${BACKEND_PORT}/health`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1000, () => { req.destroy(); resolve(false); });
  });
}

function startBackend() {
  return new Promise(async (resolve, reject) => {
    // In dev mode, kill any stale backend so we always own the process with correct env vars
    if (IS_DEV) {
      const alreadyRunning = await checkBackendRunning();
      if (alreadyRunning) {
        console.log("Killing existing backend to take over with correct env vars...");
        killPort(BACKEND_PORT);
        await new Promise((r) => setTimeout(r, 800));
      }
    }

    const { exe, args } = getBackendExecutable();
    const cwd = IS_DEV ? path.join(APP_ROOT, "backend") : path.join(process.resourcesPath, "backend");

    console.log(`Starting backend: ${exe} ${args.join(" ")} in ${cwd}`);

    const logStream = fs.createWriteStream(LOG_PATH, { flags: "a" });
    logStream.write(`\n--- Backend started at ${new Date().toISOString()} ---\n`);

    backendProcess = spawn(exe, args, {
      cwd,
      env: buildBackendEnv(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    backendProcess.stdout.pipe(logStream);
    backendProcess.stderr.pipe(logStream);

    backendProcess.stdout.on("data", (data) => {
      const text = data.toString();
      console.log("[backend]", text.trim());
    });

    backendProcess.stderr.on("data", (data) => {
      console.error("[backend:err]", data.toString().trim());
    });

    backendProcess.on("error", (err) => {
      console.error("Backend failed to start:", err);
      reject(err);
    });

    backendProcess.on("exit", (code) => {
      console.log(`Backend exited with code ${code}`);
      backendProcess = null;
      if (!isQuitting) {
        if (mainWindow) {
          mainWindow.webContents.send("backend-status", {
            running: false,
            error: `Backend stopped unexpectedly (code ${code}). Check logs.`,
          });
        }
      }
    });

    // Poll health endpoint until backend is ready
    let attempts = 0;
    let settled = false;
    const maxAttempts = 80;
    const check = () => {
      if (settled) return;
      attempts++;
      const req = http.get(`http://localhost:${BACKEND_PORT}/health`, (res) => {
        if (!settled && res.statusCode === 200) {
          settled = true;
          console.log("Backend is ready!");
          resolve();
        } else if (!settled) {
          retry();
        }
      });
      req.on("error", () => { if (!settled) retry(); });
      req.setTimeout(1000, () => { req.destroy(); if (!settled) retry(); });
    };
    const retry = () => {
      if (settled) return;
      if (attempts >= maxAttempts) {
        settled = true;
        reject(new Error("Backend failed to start within 40 seconds"));
        return;
      }
      setTimeout(check, 500);
    };
    check();
  });
}

function stopBackend() {
  if (backendProcess) {
    console.log("Stopping backend...");
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(backendProcess.pid), "/f", "/t"], { windowsHide: true });
    } else {
      backendProcess.kill("SIGTERM");
      setTimeout(() => {
        if (backendProcess) backendProcess.kill("SIGKILL");
      }, 3000);
    }
    backendProcess = null;
  }
}

async function restartBackend() {
  stopBackend();
  killPort(BACKEND_PORT); // also kill any externally-started backend
  await new Promise((r) => setTimeout(r, 1000));
  await startBackend();
}

// ── Frontend URL Loading ────────────────────────────────────────

async function checkURL(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => { resolve(res.statusCode >= 200 && res.statusCode < 400); });
    req.on("error", () => resolve(false));
    req.setTimeout(1000, () => { req.destroy(); resolve(false); });
  });
}

async function loadFrontendURL() {
  if (!mainWindow) return;

  if (IS_DEV) {
    // Try Vite dev server first
    const viteURL = "http://localhost:5173";
    if (await checkURL(viteURL)) {
      console.log("Loading frontend from Vite dev server");
      mainWindow.loadURL(viteURL);
      return;
    }
  }

  // Fall back to backend serving the built frontend
  console.log("Loading frontend from backend at port", BACKEND_PORT);
  mainWindow.loadURL(`http://localhost:${BACKEND_PORT}`);
}

// ── Window Management ────────────────────────────────────────────

function createWindow() {
  const iconPath = path.join(__dirname, "icon.png");

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "AuraBudget",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    backgroundColor: "#080b14",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,          // save RAM — no spell-check needed in a budget app
      backgroundThrottling: true, // throttle timers/animations when window is hidden
    },
    show: false,
  });

  // Show a local loading page immediately (no external dependency)
  mainWindow.loadURL(`data:text/html,<html><body style="background:#080b14;color:#7a8aa8;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><p>Starting AuraBudget...</p></body></html>`);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("close", (e) => {
    const settings = loadSettings();
    if (!isQuitting && settings.minimize_to_tray) {
      e.preventDefault();
      mainWindow.hide();
    } else {
      // Fully quit — don't leave process running in background
      isQuitting = true;
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createTray() {
  // Create a simple 16x16 tray icon
  const iconPath = path.join(__dirname, "icon.png");
  let trayIcon;
  if (fs.existsSync(iconPath)) {
    trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } else {
    // Fallback: create a tiny green square
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip("AuraBudget");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Open AuraBudget",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: "separator" },
    {
      label: "View Logs",
      click: () => shell.openPath(LOG_PATH),
    },
    {
      label: "Open Data Folder",
      click: () => shell.openPath(USER_DATA),
    },
    { type: "separator" },
    {
      label: "Quit AuraBudget",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on("double-click", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ── IPC Handlers ─────────────────────────────────────────────────

function setupIPC() {
  ipcMain.handle("get-settings", () => loadSettings());

  ipcMain.handle("save-settings", async (_event, newSettings) => {
    const ok = saveSettings(newSettings);
    if (!ok) return { success: false, error: "Failed to write settings file" };

    // Tell the running backend to re-read settings.json (no restart needed)
    try {
      const result = await new Promise((resolve, reject) => {
        const req = http.request(
          {
            hostname: "localhost",
            port: BACKEND_PORT,
            path: "/api/settings/reload",
            method: "POST",
            headers: { "Content-Length": 0 },
          },
          (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => {
              try { resolve(JSON.parse(body)); }
              catch { resolve({ status: "ok" }); }
            });
          }
        );
        req.on("error", reject);
        req.setTimeout(5000, () => { req.destroy(); reject(new Error("Reload timed out")); });
        req.end();
      });
      return { success: true, reloadResult: result };
    } catch (e) {
      // Fallback: if reload fails, try restarting
      console.error("Reload failed, falling back to restart:", e);
      try {
        await restartBackend();
        return { success: true, fallback: true };
      } catch (restartErr) {
        return { success: false, error: `Reload failed: ${e.message}` };
      }
    }
  });

  ipcMain.handle("get-backend-port", () => BACKEND_PORT);

  ipcMain.handle("get-app-info", () => ({
    version: app.getVersion(),
    dataPath: USER_DATA,
    dbPath: path.join(DB_DIR, "aurabudget.db"),
    logsPath: LOG_PATH,
    isDev: IS_DEV,
    platform: process.platform,
  }));

  ipcMain.handle("restart-backend", async () => {
    try {
      await restartBackend();
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle("open-external", (_event, url) => {
    shell.openExternal(url);
  });

  ipcMain.handle("open-data-folder", () => {
    shell.openPath(USER_DATA);
  });

  ipcMain.handle("export-database", async () => {
    const dbPath = path.join(DB_DIR, "aurabudget.db");
    if (!fs.existsSync(dbPath)) return { success: false, error: "No database found" };

    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Export Database",
      defaultPath: `aurabudget-backup-${new Date().toISOString().split("T")[0]}.db`,
      filters: [{ name: "SQLite Database", extensions: ["db"] }],
    });

    if (result.canceled) return { success: false, error: "Cancelled" };

    try {
      fs.copyFileSync(dbPath, result.filePath);
      return { success: true, path: result.filePath };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle("import-database", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Import Database Backup",
      filters: [{ name: "SQLite Database", extensions: ["db"] }],
      properties: ["openFile"],
    });

    if (result.canceled || result.filePaths.length === 0)
      return { success: false, error: "Cancelled" };

    const dbPath = path.join(DB_DIR, "aurabudget.db");
    try {
      stopBackend();
      await new Promise((r) => setTimeout(r, 500));

      // Backup current
      if (fs.existsSync(dbPath)) {
        fs.copyFileSync(dbPath, dbPath + ".bak");
      }
      fs.copyFileSync(result.filePaths[0], dbPath);

      await startBackend();
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
}

// ── App Lifecycle ────────────────────────────────────────────────

app.whenReady().then(async () => {
  setupIPC();

  // Show splash/loading while backend starts
  createWindow();
  createTray();

  try {
    await startBackend();
    if (mainWindow) {
      mainWindow.webContents.send("backend-status", { running: true });
      await loadFrontendURL();
    }
  } catch (err) {
    console.error("Backend startup timed out:", err);
    const stillRunning = await checkBackendRunning();
    if (stillRunning) {
      console.log("Backend recovered — it was just slow to start.");
      if (mainWindow) {
        mainWindow.webContents.send("backend-status", { running: true });
        await loadFrontendURL();
      }
    } else {
      if (mainWindow) {
        mainWindow.webContents.send("backend-status", {
          running: false,
          error: err.message,
        });
        // Show error in the window
        mainWindow.loadURL(`data:text/html,<html><body style="background:#080b14;color:#ff4d6d;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column"><h2>Backend failed to start</h2><p style="color:#7a8aa8">${err.message}</p><p style="color:#7a8aa8;margin-top:1em">Check logs at: ${LOG_PATH.replace(/\\/g, "/")}</p></body></html>`);
      }
    }
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else if (mainWindow) mainWindow.show();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    isQuitting = true;
    app.quit();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  stopBackend();
});

app.on("will-quit", () => {
  stopBackend();
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}
