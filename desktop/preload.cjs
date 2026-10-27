const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld(
  'desktopLedger',
  Object.freeze({
    scope: () => ipcRenderer.invoke('ledger:scope'),
    request: (payload) => ipcRenderer.invoke('ledger:request', payload),
    newToken: () => ipcRenderer.invoke('ledger:new-token'),
    hashToken: (token) => ipcRenderer.invoke('ledger:hash-token', token),
  }),
)
