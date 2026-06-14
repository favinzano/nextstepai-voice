const { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, Menu, nativeImage, session, screen, shell, Tray } = require("electron");
const { autoUpdater } = require("electron-updater");
const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const { execFile, spawn } = require("child_process");
const {
  DEFAULT_SHORTCUTS,
  getAutoStartEnabled,
  getCloseBehavior,
  getShortcutMode,
  getShortcuts,
  hasAutoStartPreference,
  setAutoStartEnabled,
  setCloseBehavior,
  setShortcutMode,
  setShortcuts
} = require("./app-preferences.cjs");
const { resolveWhisperProfile } = require("./whisper-profiles.cjs");
const { migrateLegacyState, readState, STATE_SCHEMA_VERSION, statePath, writeState } = require("./local-state.cjs");
const {
  clearModelCache,
  directorySize,
  ensureModelCache,
  getModelCacheDir
} = require("./model-storage.cjs");

let mainWindow;
let overlayWindow;
let transcriber;
let transcriberProfile;
let transcriberDevice;
let transcriberRequestedDevice;
let transcriberPromise;
let loadingProfile;
let loadingDevice;
let pasteTarget;
let shortcutRecording = false;
let tray;
let isQuitting = false;
let closeDialogOpen = false;
let manualUpdateCheck = false;
let activeShortcuts;
let activeShortcutMode = "toggle";
let shortcutMonitor;
let shortcutMonitorBuffer = "";
let requestedTaskbarState = "idle";
let modelDownloadActive = false;
let taskbarPulseTimer;
let taskbarIcons;
let lastModelLoadMs;
let lastTranscriptionMetrics;
let lastDeviceFallback;
const startHidden = process.argv.includes("--hidden");
const allowTestInstance = process.argv.includes("--allow-test-instance");

app.setName("NextStepAI Voice");
if (!app.isPackaged) {
  app.setPath("userData", path.join(app.getPath("appData"), "NextStepAI Voice Development"));
}
if (process.platform === "win32") app.setAppUserModelId("com.nextstepai.voice");
const hasSingleInstanceLock = allowTestInstance || app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

app.on("second-instance", () => {
  showMainWindow();
});

function sendToMainWindow(channel, ...args) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const send = () => mainWindow?.webContents.send(channel, ...args);
  if (mainWindow.webContents.isLoading()) mainWindow.webContents.once("did-finish-load", send);
  else send();
}

function createTaskbarBadge(draw) {
  const size = 16;
  const bitmap = Buffer.alloc(size * size * 4);
  const setPixel = (x, y, red, green, blue, alpha = 255) => {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const offset = (y * size + x) * 4;
    bitmap[offset] = blue;
    bitmap[offset + 1] = green;
    bitmap[offset + 2] = red;
    bitmap[offset + 3] = alpha;
  };
  const circle = (centerX, centerY, radius, color) => {
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if ((x - centerX) ** 2 + (y - centerY) ** 2 <= radius ** 2) setPixel(x, y, ...color);
      }
    }
  };
  draw({ circle, setPixel });
  return nativeImage.createFromBitmap(bitmap, { width: size, height: size, scaleFactor: 1 });
}

function getTaskbarIcons() {
  if (taskbarIcons) return taskbarIcons;
  taskbarIcons = {
    downloading: createTaskbarBadge(({ circle, setPixel }) => {
      circle(8, 8, 7, [245, 183, 44, 255]);
      for (let y = 3; y <= 9; y += 1) {
        setPixel(7, y, 45, 52, 59);
        setPixel(8, y, 45, 52, 59);
      }
      for (let offset = 0; offset <= 3; offset += 1) {
        setPixel(8 - offset, 9 + offset, 45, 52, 59);
        setPixel(8 + offset, 9 + offset, 45, 52, 59);
      }
    }),
    recording: createTaskbarBadge(({ circle }) => {
      circle(8, 8, 7, [255, 255, 255, 255]);
      circle(8, 8, 5, [235, 48, 63, 255]);
    }),
    processing: createTaskbarBadge(({ circle, setPixel }) => {
      circle(8, 8, 7, [42, 126, 211, 255]);
      circle(8, 8, 3, [244, 248, 252, 255]);
      circle(8, 8, 1, [42, 126, 211, 255]);
      for (const [x, y] of [[8, 1], [8, 15], [1, 8], [15, 8], [3, 3], [13, 3], [3, 13], [13, 13]]) {
        setPixel(x, y, 244, 248, 252);
      }
    })
  };
  return taskbarIcons;
}

function clearTaskbarPulse() {
  clearInterval(taskbarPulseTimer);
  taskbarPulseTimer = undefined;
}

function applyTaskbarState() {
  if (process.platform !== "win32" || !mainWindow || mainWindow.isDestroyed()) return;
  const state = modelDownloadActive ? "downloading" : requestedTaskbarState;
  clearTaskbarPulse();
  try {
    if (state === "downloading") {
      mainWindow.setOverlayIcon(getTaskbarIcons().downloading, "Descargando modelo de Whisper");
      mainWindow.setProgressBar(0.5);
      let visible = true;
      taskbarPulseTimer = setInterval(() => {
        if (!mainWindow || mainWindow.isDestroyed()) return clearTaskbarPulse();
        try {
          visible = !visible;
          mainWindow.setProgressBar(visible ? 0.5 : -1);
        } catch (error) {
          clearTaskbarPulse();
          console.error("Could not pulse Windows taskbar progress:", error);
        }
      }, 650);
      taskbarPulseTimer.unref?.();
      return;
    }
    if (state === "recording") {
      mainWindow.setOverlayIcon(getTaskbarIcons().recording, "Grabando audio");
      mainWindow.setProgressBar(-1);
      return;
    }
    if (state === "processing") {
      mainWindow.setOverlayIcon(getTaskbarIcons().processing, "Procesando inferencia de Whisper");
      mainWindow.setProgressBar(2);
      return;
    }
    mainWindow.setProgressBar(-1);
    mainWindow.setOverlayIcon(null, "");
  } catch (error) {
    console.error("Could not update Windows taskbar state:", error);
  }
}

function setRequestedTaskbarState(state) {
  const nextState = ["idle", "recording", "processing"].includes(state) ? state : "idle";
  if (requestedTaskbarState === nextState) return;
  requestedTaskbarState = nextState;
  applyTaskbarState();
}

function setModelDownloadActive(active) {
  const nextActive = Boolean(active);
  if (modelDownloadActive === nextActive) return;
  modelDownloadActive = nextActive;
  applyTaskbarState();
}

function showMainWindow(panel) {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  if (panel) sendToMainWindow("app:navigate", panel);
}

function hideToTray() {
  mainWindow?.hide();
}

function configureAutoStart(enabled) {
  const shouldEnable = Boolean(enabled);
  if (process.platform !== "win32" || !app.isPackaged) return false;

  app.setLoginItemSettings({
    openAtLogin: shouldEnable,
    path: app.getPath("exe"),
    args: ["--hidden"]
  });
  return app.getLoginItemSettings({ path: app.getPath("exe"), args: ["--hidden"] }).openAtLogin;
}

function initializeAutoStart() {
  const userDataPath = app.getPath("userData");
  const isFirstLaunch = !hasAutoStartPreference(userDataPath);
  const enabled = getAutoStartEnabled(userDataPath);
  const applied = configureAutoStart(enabled);
  if (isFirstLaunch && app.isPackaged && process.platform === "win32") {
    setAutoStartEnabled(userDataPath, applied);
  }
}

async function handleRecordShortcut() {
  if (!shortcutRecording) {
    try {
      await capturePasteTarget();
    } catch (error) {
      console.error("Could not capture paste target:", error);
    }
  }
  shortcutRecording = !shortcutRecording;
  sendToMainWindow("shortcut:toggle");
}

function handleHoldShortcutPressed() {
  if (shortcutRecording) return;
  shortcutRecording = true;
  capturePasteTarget().catch((error) => console.error("Could not capture paste target:", error));
  sendToMainWindow("shortcut:pressed");
}

function handleHoldShortcutReleased() {
  if (!shortcutRecording) return;
  shortcutRecording = false;
  sendToMainWindow("shortcut:released");
}

async function handleReprocessShortcut() {
  try {
    await capturePasteTarget();
  } catch (error) {
    console.error("Could not capture paste target:", error);
  }
  sendToMainWindow("shortcut:reprocess");
}

function stopShortcutMonitor() {
  const monitor = shortcutMonitor;
  shortcutMonitor = undefined;
  shortcutMonitorBuffer = "";
  if (monitor && !monitor.killed) monitor.kill();
  if (monitor || activeShortcutMode === "hold") handleHoldShortcutReleased();
}

function startShortcutMonitor(accelerator) {
  if (process.platform !== "win32") throw new Error("El modo mantener solo esta disponible en Windows.");
  const helper = pasteHelperPath();
  if (!fsSync.existsSync(helper)) throw new Error("Falta el helper nativo requerido para el modo mantener.");

  const monitor = spawn(helper, ["monitor-shortcut", "--accelerator", accelerator], {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  shortcutMonitor = monitor;
  monitor.stdout.setEncoding("utf8");
  monitor.stdout.on("data", (chunk) => {
    shortcutMonitorBuffer += chunk;
    const lines = shortcutMonitorBuffer.split(/\r?\n/);
    shortcutMonitorBuffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (event.type === "pressed") handleHoldShortcutPressed();
        if (event.type === "released") handleHoldShortcutReleased();
        if (event.type === "error") console.error("Shortcut monitor hook error:", event.error);
      } catch (error) {
        console.error("Invalid shortcut monitor event:", error);
      }
    }
  });
  monitor.stderr.on("data", (chunk) => console.error("Shortcut monitor:", chunk.toString().trim()));
  monitor.on("error", (error) => {
    if (shortcutMonitor !== monitor) return;
    shortcutMonitor = undefined;
    handleHoldShortcutReleased();
    console.error("Shortcut monitor failed:", error);
    sendToMainWindow("shortcut:error");
  });
  monitor.on("exit", (code) => {
    if (shortcutMonitor !== monitor) return;
    shortcutMonitor = undefined;
    handleHoldShortcutReleased();
    console.error(`Shortcut monitor exited unexpectedly with code ${code}.`);
    sendToMainWindow("shortcut:error");
  });
}

function registerGlobalShortcuts(shortcuts, mode = activeShortcutMode) {
  if (!shortcuts || shortcuts.record === shortcuts.reprocess) {
    throw new Error("Los atajos deben ser diferentes.");
  }

  if (!["toggle", "hold"].includes(mode)) throw new Error(`Unsupported shortcut mode: ${mode}`);

  const previous = activeShortcuts;
  const previousMode = activeShortcutMode;
  stopShortcutMonitor();
  globalShortcut.unregisterAll();
  let recordRegistered = false;
  let reprocessRegistered = false;
  try {
    if (mode === "hold") {
      startShortcutMonitor(shortcuts.record);
      recordRegistered = true;
    } else {
      recordRegistered = globalShortcut.register(shortcuts.record, handleRecordShortcut);
    }
    reprocessRegistered = recordRegistered && globalShortcut.register(shortcuts.reprocess, handleReprocessShortcut);
  } catch (error) {
    console.error("Invalid global shortcut:", error);
  }

  if (recordRegistered && reprocessRegistered) {
    activeShortcuts = { ...shortcuts };
    activeShortcutMode = mode;
    return activeShortcuts;
  }

  stopShortcutMonitor();
  globalShortcut.unregisterAll();
  if (previous) {
    if (previousMode === "hold") startShortcutMonitor(previous.record);
    else globalShortcut.register(previous.record, handleRecordShortcut);
    globalShortcut.register(previous.reprocess, handleReprocessShortcut);
    activeShortcuts = previous;
    activeShortcutMode = previousMode;
  }
  throw new Error("Windows rechazó uno de los atajos. Puede estar en uso por otra aplicación.");
}

function createTray() {
  const trayImage = nativeImage.createFromPath(path.join(__dirname, "..", "assets", "app-icon-32.png"));
  tray = new Tray(trayImage.resize({ width: 16, height: 16 }));
  tray.setToolTip("NextStepAI Voice");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `NextStepAI Voice v${app.getVersion()}`, enabled: false },
    { type: "separator" },
    { label: "Inicio", click: () => showMainWindow("home") },
    { label: "Buscar actualizaciones...", click: () => checkForUpdates(true) },
    { label: "Pegar última transcripción", click: () => sendToMainWindow("tray:paste-last") },
    { type: "separator" },
    {
      label: "Enviar comentarios...",
      click: () => shell.openExternal("https://github.com/favinzano/nextstepai-voice/issues")
    },
    { type: "separator" },
    {
      label: "Salir",
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]));
  tray.on("click", async () => {
    await capturePasteTarget().catch(() => {});
    tray?.popUpContextMenu();
  });
  tray.on("right-click", () => capturePasteTarget().catch(() => {}));
  tray.on("double-click", () => showMainWindow());
}

function configureAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-not-available", () => {
    if (!manualUpdateCheck) return;
    manualUpdateCheck = false;
    dialog.showMessageBox({
      type: "info",
      title: "NextStepAI Voice está actualizado",
      message: `Ya tienes la versión más reciente (${app.getVersion()}).`
    });
  });
  autoUpdater.on("update-available", () => {
    if (manualUpdateCheck) {
      dialog.showMessageBox({
        type: "info",
        title: "Actualización encontrada",
        message: "La nueva versión se está descargando y se instalará automáticamente."
      });
    }
    manualUpdateCheck = false;
  });
  autoUpdater.on("update-downloaded", () => {
    isQuitting = true;
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
  });
  autoUpdater.on("error", (error) => {
    console.error("Update check failed:", error);
    if (!manualUpdateCheck) return;
    manualUpdateCheck = false;
    dialog.showMessageBox({
      type: "error",
      title: "No se pudo buscar actualizaciones",
      message: "Revisa tu conexión e inténtalo nuevamente."
    });
  });
}

function checkForUpdates(interactive = false) {
  if (!app.isPackaged) {
    if (interactive) {
      dialog.showMessageBox({
        type: "info",
        title: "Actualizaciones",
        message: "La búsqueda de actualizaciones está disponible en la aplicación instalada."
      });
    }
    return;
  }
  manualUpdateCheck = interactive;
  autoUpdater.checkForUpdates().catch((error) => {
    console.error("Could not start update check:", error);
  });
}

async function handleWindowClose(event) {
  if (isQuitting) return;
  event.preventDefault();
  if (closeDialogOpen) return;

  const behavior = getCloseBehavior(app.getPath("userData"));
  if (behavior === "tray") {
    hideToTray();
    return;
  }
  if (behavior === "exit") {
    isQuitting = true;
    app.quit();
    return;
  }

  closeDialogOpen = true;
  try {
    const choice = await dialog.showMessageBox(mainWindow, {
      type: "question",
      title: "Cerrar NextStepAI Voice",
      message: "¿Qué quieres hacer al cerrar la ventana?",
      detail: "Ocultarla en la bandeja mantiene disponibles el dictado y los atajos globales.",
      buttons: ["Ocultar en la bandeja", "Salir de NextStepAI Voice", "Cancelar"],
      defaultId: 0,
      cancelId: 2,
      checkboxLabel: "Recordar mi elección",
      checkboxChecked: false
    });
    if (choice.response === 2) return;
    const selectedBehavior = choice.response === 0 ? "tray" : "exit";
    if (choice.checkboxChecked) setCloseBehavior(app.getPath("userData"), selectedBehavior);
    if (selectedBehavior === "tray") hideToTray();
    else {
      isQuitting = true;
      app.quit();
    }
  } finally {
    closeDialogOpen = false;
  }
}

function normalizeInferenceDevice(device) {
  return device === "dml" && process.platform === "win32" ? "dml" : "cpu";
}

async function getTranscriber(profileId, requestedDevice = "cpu") {
  const profile = resolveWhisperProfile(profileId);
  const device = normalizeInferenceDevice(requestedDevice);
  if (transcriber && transcriberProfile === profile.id && transcriberRequestedDevice === device) return transcriber;
  if (transcriberPromise && loadingProfile === profile.id && loadingDevice === device) return transcriberPromise;
  if (transcriberPromise) {
    await transcriberPromise;
    return getTranscriber(profile.id, device);
  }

  loadingProfile = profile.id;
  loadingDevice = device;
  transcriberPromise = (async () => {
    const modelLoadStartedAt = performance.now();
    const { pipeline, env } = await import("@huggingface/transformers");
    env.cacheDir = await ensureModelCache(app.getPath("userData"), profile.id);
    env.allowLocalModels = true;
    env.allowRemoteModels = true;

    if (transcriber && typeof transcriber.dispose === "function") await transcriber.dispose();
    transcriber = undefined;
    transcriberProfile = undefined;
    transcriberDevice = undefined;
    transcriberRequestedDevice = undefined;

    const pipelineOptions = {
      dtype: profile.dtype,
      progress_callback: (progress) => {
        if (["initiate", "download", "progress"].includes(progress.status)) setModelDownloadActive(true);
        if (progress.status === "ready") setModelDownloadActive(false);
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.webContents.send("model:progress", {
          profile: profile.id,
          label: profile.shortLabel,
          status: progress.status,
          progress: Number.isFinite(progress.progress) ? progress.progress : null
        });
      }
    };
    let activeDevice = device;
    let nextTranscriber;
    try {
      nextTranscriber = await pipeline("automatic-speech-recognition", profile.model, {
        ...pipelineOptions,
        device
      });
      lastDeviceFallback = undefined;
    } catch (error) {
      if (device !== "dml") throw error;
      console.warn("DirectML initialization failed; falling back to CPU:", error);
      activeDevice = "cpu";
      lastDeviceFallback = String(error?.message || error);
      nextTranscriber = await pipeline("automatic-speech-recognition", profile.model, {
        ...pipelineOptions,
        device: "cpu"
      });
    }
    transcriber = nextTranscriber;
    transcriberProfile = profile.id;
    transcriberDevice = activeDevice;
    transcriberRequestedDevice = device;
    lastModelLoadMs = Math.round(performance.now() - modelLoadStartedAt);
    return nextTranscriber;
  })();

  try {
    return await transcriberPromise;
  } catch (error) {
    transcriber = undefined;
    transcriberProfile = undefined;
    transcriberDevice = undefined;
    transcriberRequestedDevice = undefined;
    throw error;
  } finally {
    setModelDownloadActive(false);
    transcriberPromise = undefined;
    loadingProfile = undefined;
    loadingDevice = undefined;
  }
}

function friendlyModelError(error) {
  const message = String(error?.message || error || "");
  if (/espacio insuficiente/i.test(message)) return message;
  if (/ENOSPC|no space left/i.test(message)) return "No hay espacio suficiente para descargar o preparar el modelo.";
  if (/fetch|network|ENOTFOUND|ECONN|HTTP|offline/i.test(message)) {
    return "No fue posible descargar el modelo. Revisa tu conexión e inténtalo nuevamente.";
  }
  return "No fue posible preparar el modelo local. Usa “Reparar modelos” desde Soporte e inténtalo nuevamente.";
}

function createWindow() {
  mainWindow = new BrowserWindow({
    show: !startHidden,
    width: 1060,
    height: 720,
    minWidth: 860,
    minHeight: 620,
    title: "NextStepAI Voice",
    icon: path.join(__dirname, "..", "assets", "app-icon.png"),
    backgroundColor: "#F4F1EB",
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#F4F1EB",
      symbolColor: "#0D1B2A",
      height: 48
    },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "..", "index.html"));
  applyTaskbarState();
  mainWindow.on("close", handleWindowClose);
  mainWindow.on("closed", () => {
    clearTaskbarPulse();
    mainWindow = null;
    if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.close();
  });
}

function positionOverlay() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, width, height } = display.workArea;
  const [overlayWidth, overlayHeight] = overlayWindow.getSize();
  overlayWindow.setPosition(
    Math.round(x + (width - overlayWidth) / 2),
    Math.round(y + height - overlayHeight - 34),
    false
  );
}

function createOverlayWindow() {
  overlayWindow = new BrowserWindow({
    width: 360,
    height: 112,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, "overlay-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.setIgnoreMouseEvents(true);
  overlayWindow.loadFile(path.join(__dirname, "..", "overlay.html"));
}

function updateOverlay(state) {
  if (!overlayWindow || overlayWindow.isDestroyed()) createOverlayWindow();
  const sendState = () => overlayWindow?.webContents.send("overlay:state", state);
  if (overlayWindow.webContents.isLoading()) overlayWindow.webContents.once("did-finish-load", sendState);
  else sendState();
  if (state.status === "idle") {
    overlayWindow.hide();
    return;
  }
  positionOverlay();
  overlayWindow.showInactive();
}

function pasteHelperPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "native", "win32-x64", "NextStepAI.PasteHelper.exe")
    : path.join(__dirname, "..", "native", "win32-x64", "NextStepAI.PasteHelper.exe");
}

function runPasteHelper(args) {
  return new Promise((resolve, reject) => {
    execFile(pasteHelperPath(), args, { windowsHide: true }, (error, stdout) => {
      let result;
      try {
        result = JSON.parse(stdout.trim());
      } catch {
        result = { ok: false, error: error?.message || "invalid_helper_response" };
      }
      if (error || !result.ok) reject(new Error(result.error || error.message));
      else resolve(result);
    });
  });
}

async function capturePasteTarget() {
  if (process.platform !== "win32") return;
  const result = await runPasteHelper(["capture"]);
  pasteTarget = { handle: result.handle, processId: result.processId };
}

async function pasteIntoActiveApp(text) {
  clipboard.writeText(text);

  if (process.platform !== "win32") return true;

  if (!pasteTarget?.handle) return false;
  const target = pasteTarget;
  pasteTarget = undefined;
  try {
    await runPasteHelper(["paste", "--handle", String(target.handle), "--process", String(target.processId)]);
    return true;
  } catch (error) {
    console.error("Native paste helper could not inject Ctrl+V:", error);
    return false;
  }
}

async function runPackagedModelSelfTest() {
  const argument = process.argv.find((value) => value.startsWith("--self-test-model="));
  if (!argument) return false;
  const profileId = argument.split("=")[1];
  const profile = resolveWhisperProfile(profileId);
  const pipe = await getTranscriber(profile.id, "cpu");
  await pipe(new Float32Array(32000), {
    language: "spanish",
    task: "transcribe",
    chunk_length_s: 30,
    stride_length_s: 5,
    ...profile.generation
  });
  const reportArgument = process.argv.find((value) => value.startsWith("--self-test-report="));
  if (reportArgument) {
    const cacheDir = getModelCacheDir(app.getPath("userData"));
    const reportPath = path.resolve(reportArgument.slice("--self-test-report=".length));
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify({
      cacheBytes: await directorySize(cacheDir),
      cacheDir,
      device: transcriberDevice,
      dtype: profile.dtype,
      model: profile.model,
      profile: profile.id
    }, null, 2), "utf8");
  }
  return true;
}

async function runAudioWorkletSelfTest() {
  if (!process.argv.includes("--self-test-audio-worklet")) return false;
  const testWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  try {
    await testWindow.loadFile(path.join(__dirname, "..", "index.html"));
    const result = await testWindow.webContents.executeJavaScript(`
      (async () => {
        const context = new AudioContext({ sampleRate: 16000 });
        try {
          await context.audioWorklet.addModule("src/pcm-capture-worklet.js");
          const node = new AudioWorkletNode(context, "nextstepai-pcm-capture");
          node.disconnect();
          return { sampleRate: context.sampleRate, state: context.state };
        } finally {
          await context.close();
        }
      })()
    `);
    if (result.sampleRate !== 16000) throw new Error(`Unexpected audio sample rate: ${result.sampleRate}`);
  } finally {
    testWindow.destroy();
  }
  return true;
}

app.whenReady().then(async () => {
  try {
    if (await runAudioWorkletSelfTest()) {
      app.exit(0);
      return;
    }
    if (await runPackagedModelSelfTest()) {
      app.exit(0);
      return;
    }
  } catch (error) {
    console.error("Packaged model self-test failed:", error);
    app.exit(1);
    return;
  }

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === "media";
  });
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "media");
  });

  createWindow();
  createOverlayWindow();
  createTray();
  initializeAutoStart();
  configureAutoUpdater();
  checkForUpdates();

  try {
    registerGlobalShortcuts(getShortcuts(app.getPath("userData")), getShortcutMode(app.getPath("userData")));
  } catch (error) {
    console.error("Could not register global shortcuts:", error);
    try {
      registerGlobalShortcuts(DEFAULT_SHORTCUTS);
      setShortcuts(app.getPath("userData"), DEFAULT_SHORTCUTS);
      setShortcutMode(app.getPath("userData"), "toggle");
    } catch (fallbackError) {
      console.error("Could not register default global shortcuts:", fallbackError);
    }
    mainWindow.webContents.once("did-finish-load", () => {
      mainWindow.webContents.send("shortcut:error");
    });
  }
});

ipcMain.handle("clipboard:write", (_event, text) => {
  clipboard.writeText(text);
  return true;
});

ipcMain.handle("clipboard:paste", async (_event, text) => {
  return pasteIntoActiveApp(text);
});

ipcMain.handle("history:export", async (_event, entries) => {
  if (!Array.isArray(entries)) throw new Error("History entries must be an array.");
  const safeEntries = entries.map((entry) => ({
    at: typeof entry?.at === "string" ? entry.at : "",
    text: typeof entry?.text === "string" ? entry.text : ""
  }));
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Exportar historial",
    defaultPath: `NextStepAI-Voice-History-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }]
  });
  if (result.canceled || !result.filePath) return false;
  await fs.writeFile(result.filePath, JSON.stringify({ version: 1, entries: safeEntries }, null, 2), "utf8");
  return true;
});
ipcMain.handle("state:get", () => readState(app.getPath("userData")));
ipcMain.handle("state:migrate-legacy", (_event, legacyState) => migrateLegacyState(app.getPath("userData"), legacyState));
ipcMain.handle("state:write", (_event, state) => writeState(app.getPath("userData"), state));

ipcMain.handle("transcription:run", async (_event, audio, language, profileId, device) => {
  try {
    const startedAt = performance.now();
    const pipe = await getTranscriber(profileId, device);
    const inferenceStartedAt = performance.now();
    const samples = audio instanceof Float32Array ? audio : new Float32Array(audio);
    const output = await pipe(samples, {
      language,
      task: "transcribe",
      chunk_length_s: 30,
      stride_length_s: 5,
      ...resolveWhisperProfile(profileId).generation
    });
    const inferenceMs = Math.round(performance.now() - inferenceStartedAt);
    const totalMs = Math.round(performance.now() - startedAt);
    const audioSeconds = samples.length / 16000;
    lastTranscriptionMetrics = {
      audioSeconds: Number(audioSeconds.toFixed(1)),
      inferenceMs,
      modelLoadMs: totalMs - inferenceMs,
      realtimeFactor: Number((inferenceMs / 1000 / Math.max(audioSeconds, 0.1)).toFixed(2)),
      totalMs
    };
    return { text: output.text.trim(), metrics: lastTranscriptionMetrics, device: transcriberDevice };
  } catch (error) {
    throw new Error(friendlyModelError(error));
  }
});

ipcMain.handle("models:clear", async () => {
  if (transcriber && typeof transcriber.dispose === "function") await transcriber.dispose();
  transcriber = undefined;
  transcriberProfile = undefined;
  transcriberDevice = undefined;
  transcriberRequestedDevice = undefined;
  transcriberPromise = undefined;
  loadingProfile = undefined;
  await clearModelCache(app.getPath("userData"));
  return true;
});

ipcMain.handle("overlay:set-state", (_event, state) => {
  updateOverlay(state);
  if (state.status === "idle" && activeShortcutMode === "toggle") shortcutRecording = false;
  return true;
});
ipcMain.handle("taskbar:set-state", (_event, state) => {
  setRequestedTaskbarState(state?.status);
  return true;
});

ipcMain.handle("app:diagnostics", async () => {
  const cacheDir = getModelCacheDir(app.getPath("userData"));
  const memory = process.memoryUsage();
  return {
    platform: `${process.platform} ${process.arch}`,
    version: app.getVersion(),
    loadedWhisperProfile: transcriberProfile || loadingProfile || "none",
    inferenceDevice: transcriberDevice || loadingDevice || "none",
    requestedInferenceDevice: transcriberRequestedDevice || loadingDevice || "none",
    lastDeviceFallback,
    shortcuts: activeShortcuts || getShortcuts(app.getPath("userData")),
    shortcutMode: activeShortcutMode,
    memoryRssMb: Math.round(memory.rss / 1024 / 1024),
    heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
    lastModelLoadMs,
    lastTranscriptionMetrics,
    stateSchemaVersion: STATE_SCHEMA_VERSION,
    statePath: statePath(app.getPath("userData")),
    modelCacheMb: Math.round(await directorySize(cacheDir) / 1024 / 1024),
    modelCacheDir: cacheDir
  };
});
ipcMain.handle("app:get-close-behavior", () => getCloseBehavior(app.getPath("userData")));
ipcMain.handle("app:set-close-behavior", (_event, behavior) => setCloseBehavior(app.getPath("userData"), behavior));
ipcMain.handle("preferences:get-shortcuts", () => activeShortcuts || getShortcuts(app.getPath("userData")));
ipcMain.handle("preferences:set-shortcuts", (_event, shortcuts) => {
  const registered = registerGlobalShortcuts(shortcuts, activeShortcutMode);
  setShortcuts(app.getPath("userData"), registered);
  return registered;
});
ipcMain.handle("preferences:get-shortcut-mode", () => activeShortcutMode);
ipcMain.handle("preferences:set-shortcut-mode", (_event, mode) => {
  const shortcuts = activeShortcuts || getShortcuts(app.getPath("userData"));
  const previousMode = activeShortcutMode;
  registerGlobalShortcuts(shortcuts, mode);
  try {
    return setShortcutMode(app.getPath("userData"), mode);
  } catch (error) {
    registerGlobalShortcuts(shortcuts, previousMode);
    throw error;
  }
});
ipcMain.handle("preferences:get-autostart", () => {
  if (process.platform !== "win32" || !app.isPackaged) return false;
  const enabled = app.getLoginItemSettings({ path: app.getPath("exe"), args: ["--hidden"] }).openAtLogin;
  setAutoStartEnabled(app.getPath("userData"), enabled);
  return enabled;
});
ipcMain.handle("preferences:set-autostart", (_event, enabled) => {
  if (typeof enabled !== "boolean") throw new Error("Auto-start preference must be a boolean.");
  const applied = configureAutoStart(enabled);
  setAutoStartEnabled(app.getPath("userData"), applied);
  return applied;
});

ipcMain.handle("window:minimize", () => mainWindow?.minimize());
ipcMain.handle("window:hide", () => mainWindow?.hide());

app.on("activate", () => {
  showMainWindow();
  if (!overlayWindow || overlayWindow.isDestroyed()) createOverlayWindow();
});

app.on("before-quit", () => {
  isQuitting = true;
});
app.on("will-quit", () => {
  clearTaskbarPulse();
  stopShortcutMonitor();
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && isQuitting) app.quit();
});
