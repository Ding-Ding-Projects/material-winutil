import { contextBridge, ipcRenderer } from 'electron';
import type { Bridge } from '../shared/types';

/**
 * The only surface the renderer can reach. Context isolation stays on and no
 * Node primitive is forwarded; every call is an explicit, named channel.
 */
const bridge: Bridge = {
  platform: process.platform,
  isElevated: () => ipcRenderer.invoke('system:elevated'),
  loadCatalog: () => ipcRenderer.invoke('catalog:load'),
  window: (action) => ipcRenderer.send('window:action', action),
  run: (kind, ids) => ipcRenderer.invoke('winutil:run', kind, ids),
  installed: () => ipcRenderer.invoke('winutil:installed'),
  ensureDeps: () => ipcRenderer.invoke('deps:ensure'),
  onProgress: (cb) => { ipcRenderer.on('winutil:progress', (_e, p) => cb(p)); },
  openExternal: () => undefined,
  exportView: (payload) => ipcRenderer.invoke('view:export', payload),
  readPrefs: () => ipcRenderer.invoke('prefs:read'),
  writePrefs: (prefs) => ipcRenderer.invoke('prefs:write', prefs),
  history: () => ipcRenderer.invoke('history:read'),
  appendHistory: (entry) => ipcRenderer.invoke('history:append', entry),
  updateStatus: () => ipcRenderer.invoke('update:status'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  restartToUpdate: () => ipcRenderer.send('update:restart'),
  onUpdateStatus: (cb) => { ipcRenderer.on('update:status', (_e, status) => cb(status)); },
  authenticatorBegin: (request) => ipcRenderer.invoke('authenticator:begin', request),
  authenticatorConfirm: (registrationId, code) => ipcRenderer.invoke('authenticator:confirm', registrationId, code),
  authenticatorCancel: (registrationId) => ipcRenderer.invoke('authenticator:cancel', registrationId),
  authenticatorList: () => ipcRenderer.invoke('authenticator:list'),
  authenticatorCodes: (id) => ipcRenderer.invoke('authenticator:codes', id),
  authenticatorRemove: (id) => ipcRenderer.invoke('authenticator:remove', id),
};

contextBridge.exposeInMainWorld('winutil', bridge);
