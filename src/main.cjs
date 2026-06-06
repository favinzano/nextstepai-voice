const { app, BrowserWindow, clipboard, globalShortcut, ipcMain, session, screen } = require("electron");
const path = require("path");
const { execFile } = require("child_process");
const { resolveWhisperProfile } = require("./whisper-profiles.cjs");

let mainWindow;
let overlayWindow;
let transcriber;
let transcriberProfile;
let transcriberPromise;
let loadingProfile;
let pasteTarget;
let shortcutRecording = false;

app.setName("NextStepAI Voice");
if (process.platform === "win32") app.setAppUserModelId("com.nextstepai.voice");
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

app.on("second-instance", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

async function getTranscriber(profileId) {
  const profile = resolveWhisperProfile(profileId);
  if (transcriber && transcriberProfile === profile.id) return transcriber;
  if (transcriberPromise && loadingProfile === profile.id) return transcriberPromise;
  if (transcriberPromise) {
    await transcriberPromise;
    return getTranscriber(profile.id);
  }

  loadingProfile = profile.id;
  transcriberPromise = (async () => {
    const { pipeline, env } = await import("@huggingface/transformers");
    env.cacheDir = path.join(__dirname, "..", "node_modules", "@huggingface", "transformers", ".cache");
    env.allowLocalModels = true;
    env.allowRemoteModels = true;

    if (transcriber && typeof transcriber.dispose === "function") await transcriber.dispose();
    transcriber = undefined;
    transcriberProfile = undefined;

    const nextTranscriber = await pipeline("automatic-speech-recognition", profile.model, {
      device: "cpu",
      dtype: profile.dtype,
      progress_callback: (progress) => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.webContents.send("model:progress", {
          profile: profile.id,
          label: profile.shortLabel,
          status: progress.status,
          progress: Number.isFinite(progress.progress) ? progress.progress : null
        });
      }
    });
    transcriber = nextTranscriber;
    transcriberProfile = profile.id;
    return nextTranscriber;
  })();

  try {
    return await transcriberPromise;
  } catch (error) {
    transcriber = undefined;
    transcriberProfile = undefined;
    throw error;
  } finally {
    transcriberPromise = undefined;
    loadingProfile = undefined;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
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
  mainWindow.on("closed", () => {
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

function runPowerShell(script) {
  return new Promise((resolve, reject) => {
    const encodedScript = Buffer.from(script, "utf16le").toString("base64");
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-EncodedCommand", encodedScript],
      { windowsHide: true },
      (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout.trim());
      }
    );
  });
}

async function capturePasteTarget() {
  if (process.platform !== "win32") return;
  const script = [
    "Add-Type @'",
    "using System;",
    "using System.Runtime.InteropServices;",
    "public static class FocusCapture {",
    "  [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow();",
    "  [DllImport(\"user32.dll\")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);",
    "}",
    "'@",
    "$h = [FocusCapture]::GetForegroundWindow()",
    "[uint32]$pidValue = 0",
    "[FocusCapture]::GetWindowThreadProcessId($h, [ref]$pidValue) | Out-Null",
    "Write-Output ($h.ToInt64().ToString() + '|' + $pidValue.ToString())"
  ].join("\n");
  const output = await runPowerShell(script);
  const [handle, processId] = output.split("|").map(Number);
  if (handle && processId) pasteTarget = { handle, processId };
}

async function pasteIntoActiveApp(text) {
  clipboard.writeText(text);

  if (process.platform !== "win32") return true;

  const script = [
    "$targetHandle = [IntPtr]" + (pasteTarget?.handle || 0),
    "$targetProcess = " + (pasteTarget?.processId || 0),
    "Add-Type -AssemblyName System.Windows.Forms",
    "Add-Type @'",
    "using System;",
    "using System.Runtime.InteropServices;",
    "public static class FocusRestore {",
    "  [DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr hWnd);",
    "  [DllImport(\"user32.dll\")] public static extern bool ShowWindowAsync(IntPtr hWnd, int command);",
    "}",
    "'@",
    "if ($targetHandle -ne [IntPtr]::Zero) {",
    "  [FocusRestore]::ShowWindowAsync($targetHandle, 9) | Out-Null",
    "  [FocusRestore]::SetForegroundWindow($targetHandle) | Out-Null",
    "}",
    "if ($targetProcess -gt 0) {",
    "  $shell = New-Object -ComObject WScript.Shell",
    "  $shell.AppActivate($targetProcess) | Out-Null",
    "}",
    "Start-Sleep -Milliseconds 320",
    "[System.Windows.Forms.SendKeys]::SendWait('^v')",
    "Start-Sleep -Milliseconds 120",
    "Write-Output 'PASTED'"
  ].join("\n");

  const output = await runPowerShell(script);
  pasteTarget = undefined;
  return output.includes("PASTED");
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === "media";
  });
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "media");
  });

  createWindow();
  createOverlayWindow();

  const registered = globalShortcut.register("CommandOrControl+Shift+Space", async () => {
    if (!shortcutRecording) {
      try {
        await capturePasteTarget();
      } catch (error) {
        console.error("Could not capture paste target:", error);
      }
    }
    shortcutRecording = !shortcutRecording;
    mainWindow?.webContents.send("shortcut:toggle");
  });
  const reprocessRegistered = globalShortcut.register("CommandOrControl+Alt+Space", async () => {
    try {
      await capturePasteTarget();
    } catch (error) {
      console.error("Could not capture paste target:", error);
    }
    mainWindow?.webContents.send("shortcut:reprocess");
  });

  if (!registered || !reprocessRegistered) {
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

ipcMain.handle("transcription:run", async (_event, audio, language, profileId) => {
  const pipe = await getTranscriber(profileId);
  const samples = audio instanceof Float32Array ? audio : new Float32Array(audio);
  const output = await pipe(samples, {
    language,
    task: "transcribe",
    chunk_length_s: 30,
    stride_length_s: 5
  });
  return output.text.trim();
});

ipcMain.handle("overlay:set-state", (_event, state) => {
  updateOverlay(state);
  if (state.status === "idle") shortcutRecording = false;
  return true;
});

ipcMain.handle("app:diagnostics", () => ({
  platform: `${process.platform} ${process.arch}`,
  version: app.getVersion(),
  loadedWhisperProfile: transcriberProfile || loadingProfile || "none"
}));

ipcMain.handle("window:minimize", () => mainWindow?.minimize());
ipcMain.handle("window:hide", () => mainWindow?.hide());

app.on("activate", () => {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  if (!overlayWindow || overlayWindow.isDestroyed()) createOverlayWindow();
});

app.on("will-quit", () => globalShortcut.unregisterAll());

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
