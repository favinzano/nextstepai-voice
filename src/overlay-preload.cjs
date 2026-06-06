const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("overlayAPI", {
  onState: (callback) => ipcRenderer.on("overlay:state", (_event, state) => callback(state))
});
