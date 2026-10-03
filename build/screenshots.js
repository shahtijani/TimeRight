// Captures README screenshots from the real renderer. Run: npx electron build/screenshots.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs'); const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1420, height: 900, show: false, useContentSize: true, webPreferences: { offscreen: true } });
  await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  const js = c => win.webContents.executeJavaScript(c);
  const shot = async name => { await sleep(500); fs.writeFileSync(path.join(__dirname, '..', 'docs', name), (await win.webContents.capturePage()).toPNG()); };
  await js(`localStorage.clear(); location.reload()`); await sleep(800);
  await js(`(() => { const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('change', {bubbles: true})); }; })()`);
  await shot('screenshot-home.png');
  await js(`document.querySelector('[data-view="planner"]').click(); const q = document.getElementById('quick'); q.value = '3:50 PM Sydney 5 oct'; q.dispatchEvent(new Event('input', {bubbles: true}));
    document.querySelector('#pmAddPicker .pk-btn').click(); const i = document.querySelector('#pmAddPicker .pk-search'); i.value = 'london'; i.dispatchEvent(new Event('input', {bubbles: true})); i.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
    document.querySelector('#pmAddPicker .pk-btn').click(); const j = document.querySelector('#pmAddPicker .pk-search'); j.value = 'new york'; j.dispatchEvent(new Event('input', {bubbles: true})); j.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
    document.body.click(); 1`);
  await shot('screenshot-planner.png');
  app.quit();
});
