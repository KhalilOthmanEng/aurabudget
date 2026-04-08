/**
 * AuraBudget Desktop — Preload Script
 * Exposes a safe API bridge between the Electron main process and the React frontend.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("auraDesktop", {
  // Settings
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (settings) => ipcRenderer.invoke("save-settings", settings),

  // App info
  getBackendPort: () => ipcRenderer.invoke("get-backend-port"),
  getAppInfo: () => ipcRenderer.invoke("get-app-info"),

  // Backend control
  restartBackend: () => ipcRenderer.invoke("restart-backend"),

  // Data management
  exportDatabase: () => ipcRenderer.invoke("export-database"),
  importDatabase: () => ipcRenderer.invoke("import-database"),

  // Utilities
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  openDataFolder: () => ipcRenderer.invoke("open-data-folder"),

  // Event listeners
  onBackendStatus: (callback) => {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on("backend-status", handler);
    return () => ipcRenderer.removeListener("backend-status", handler);
  },

  // Platform info
  isDesktop: true,
  platform: process.platform,
});
