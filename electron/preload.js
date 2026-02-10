const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Whether we're running inside Electron
  isElectron: true,

  // Get the backend port (for debugging/info)
  getBackendPort: () => ipcRenderer.invoke('get-backend-port'),

  // Get the app version
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Get the MCP server binary path (for editor integration)
  getMcpBinaryPath: () => ipcRenderer.invoke('get-mcp-binary-path'),
});
