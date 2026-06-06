const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("voiceAPI", {
  copy: (text) => ipcRenderer.invoke("clipboard:write", text),
  paste: (text) => ipcRenderer.invoke("clipboard:paste", text),
  transcribe: (audio, language, profile) => ipcRenderer.invoke("transcription:run", audio, language, profile),
  overlay: (state) => ipcRenderer.invoke("overlay:set-state", state),
  diagnostics: () => ipcRenderer.invoke("app:diagnostics"),
  minimize: () => ipcRenderer.invoke("window:minimize"),
  hide: () => ipcRenderer.invoke("window:hide"),
  onShortcutToggle: (callback) => ipcRenderer.on("shortcut:toggle", callback),
  onReprocess: (callback) => ipcRenderer.on("shortcut:reprocess", callback),
  onShortcutError: (callback) => ipcRenderer.on("shortcut:error", callback),
  onModelProgress: (callback) => ipcRenderer.on("model:progress", (_event, progress) => callback(progress))
});
