'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const channel = (process.argv.find(v => v.startsWith('--battle-channel=')) || '').slice(17);
const allowed = new Set(['init','layout','settings','edit','lock','test','reset','close','minimize']);
const role = (process.argv.find(v => v.startsWith('--battle-role=')) || '').slice(14);
let presentation = 0, reported = false;
ipcRenderer.on(channel + '-presentation', (_, value) => { presentation = value; reported = false; });
if (role === 'settings') for (const type of ['pointerdown','keydown','wheel'])
  window.addEventListener(type, event => {
    if (!event.isTrusted || reported) return;
    reported = true; ipcRenderer.send(channel, 'interacted', presentation);
  }, { capture: true, passive: true });
contextBridge.exposeInMainWorld('battle', {
  send(action, value) { if (channel && allowed.has(action)) ipcRenderer.send(channel, action, value); },
  state(callback) { ipcRenderer.on(channel, (_, value) => callback(value)); },
  notice(callback) { ipcRenderer.on(channel + '-notice', (_, value) => callback(String(value))); }
});
