const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aiofficeDesktop', Object.freeze({
  getStatus: () => ipcRenderer.invoke('desktop:get-status'),
  checkForUpdates: () => ipcRenderer.invoke('desktop:check-updates'),
  getUpdateState: () => ipcRenderer.invoke('desktop:get-update-state'),
  onUpdateState: (listener) => {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function');
    const wrapped = (_event, state) => listener(state);
    ipcRenderer.on('desktop:update-state', wrapped);
    return () => ipcRenderer.removeListener('desktop:update-state', wrapped);
  },
}));
