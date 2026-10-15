const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aiofficeDesktop', Object.freeze({
  getStatus: () => ipcRenderer.invoke('desktop:get-status'),
  checkForUpdates: () => ipcRenderer.invoke('desktop:check-updates'),
  getUpdateState: () => ipcRenderer.invoke('desktop:get-update-state'),
  getProviderTools: () => ipcRenderer.invoke('desktop:get-provider-tools'),
  installProviderTool: (id) => ipcRenderer.invoke('desktop:install-provider-tool', id),
  cancelProviderInstall: () => ipcRenderer.invoke('desktop:cancel-provider-install'),
  openProviderLogin: (id) => ipcRenderer.invoke('desktop:open-provider-login', id),
  restartAfterProviderInstall: () => ipcRenderer.invoke('desktop:restart-after-provider-install'),
  onUpdateState: (listener) => {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function');
    const wrapped = (_event, state) => listener(state);
    ipcRenderer.on('desktop:update-state', wrapped);
    return () => ipcRenderer.removeListener('desktop:update-state', wrapped);
  },
  onProviderToolsState: (listener) => {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function');
    const wrapped = (_event, state) => listener(state);
    ipcRenderer.on('desktop:provider-tools-state', wrapped);
    return () => ipcRenderer.removeListener('desktop:provider-tools-state', wrapped);
  },
}));
