const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    saveSession: (data) => ipcRenderer.invoke('save-file-dialog', data),
    loadSession: () => ipcRenderer.invoke('open-file-dialog'),
    exportCSV: (csvContent) => ipcRenderer.invoke('export-csv-dialog', csvContent),
    
    onSaveSession: (callback) => ipcRenderer.on('save-session', callback),
    onLoadSession: (callback) => ipcRenderer.on('load-session', callback),
    onUndoSpin: (callback) => ipcRenderer.on('undo-spin', callback),
    onExportCSV: (callback) => ipcRenderer.on('export-csv', callback),
    
    platform: process.platform
});
