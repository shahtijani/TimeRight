const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('timeright', { platform: process.platform });
