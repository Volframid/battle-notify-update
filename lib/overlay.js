'use strict';
const path = require('path');
const settings = require('./overlay-settings');
const { parse } = require('./overlay-message');
const NativeOverlay = require('./native-overlay');
let serial = 0;
module.exports = function Overlay(mod) {
  const root = mod.path || (mod.info && mod.info.path) || path.resolve(__dirname, '..');
  const channel = 'battle-notify-overlay-' + process.pid + '-' + (++serial);
  const warn = text => mod.warn('[Battle Notify] ' + text);
  const config = settings.store(root, warn);
  let electron = null, window = null, panel = null, ready = false, editing = false, disposed = false;
  let entries = [], nextId = 0, expiry = null, moveTimer = null, retryAt = 0, applying = false, icons = null;
  let presentation = 0, panelInteracted = false;
  let native = null, surface = null, surfaceReady = false, lastBitmap = null;
  let surfaceSize = null;
  function runtime() {
    if (electron) return electron;
    if (!process.versions || !process.versions.electron) return null;
    try { const value = require('electron'); if (value.BrowserWindow && value.ipcMain) electron = value; } catch (_) {}
    return electron;
  }
  const alive = w => w && !w.isDestroyed();
  function ghost(w) {
    if (!alive(w)) return;
    w.setFocusable(false);
    // Do not forward mouse motion to Chromium while locked. The display must
    // have no hover, caption or input ownership over the application below it.
    w.setIgnoreMouseEvents(true);
  }
  function showLocked() {
    if (!alive(window)) return;
    ghost(window); window.showInactive();
  }
  function resolveIcon(key) {
    if (!key) return null;
    try {
      if (!icons) icons = require('./icon-archive');
      return icons.resolve(key);
    } catch (_) { return null; }
  }
  function message(text) { const p = parse(text); return { runs: p.runs, image: resolveIcon(p.icon) }; }
  function inGame() { return !!(native && native.status().ready && surfaceReady && lastBitmap && config.get().enabled); }
  function snapshot() { const value = config.get(); let visibleRows = value.rows;
    if (alive(window)) { const bounds = window.getBounds(); value.x = bounds.x; value.y = bounds.y;
      const height = inGame() && alive(surface) ? surface.getBounds().height : bounds.height;
      visibleRows = Math.max(1, Math.min(value.rows, Math.floor((height - 44) / (Math.max(value.iconSize, value.fontSize * 2.6) + 20)))); }
    return { settings: value, editing, available: !!runtime(), ready, renderer: inGame() ? 'in-game' : 'desktop',
    entries: editing ? [{ id: 'preview', ...message("<FONT COLOR='#ffffff'>Battle Notify · Preview</FONT>"), preview: true }] : entries.slice(-visibleRows) }; }
  function update() {
    const state = snapshot();
    for (const w of [window, panel, surface]) if (alive(w) && !w.webContents.isDestroyed()) {
      const bounds = w === surface && surfaceSize ? surfaceSize : w.getContentBounds();
      w.webContents.send(channel, { ...state, viewport: { width: bounds.width, height: bounds.height } });
    }
    if (!entries.length && !editing && native) native.hide();
  }
  function schedule() {
    if (expiry !== null) mod.clearTimeout(expiry); expiry = null;
    if (!entries.length) { if (!editing && alive(window)) window.hide(); return; }
    expiry = mod.setTimeout(() => {
      expiry = null; entries = entries.filter(e => e.until > Date.now()); update(); schedule();
    }, Math.max(1, Math.min(...entries.map(e => e.until)) - Date.now()));
  }
  function placement() { return settings.place(config.get(), electron.screen.getAllDisplays(), electron.screen.getPrimaryDisplay()); }
  function applyBounds() {
    if (!alive(window)) return;
    const p = placement(); applying = true;
    try { window.setBounds({ x: p.x, y: p.y, width: p.width, height: p.height }); } finally { applying = false; }
    applySurfaceBounds();
  }
  function applySurfaceBounds() {
    if (!alive(surface) || !native || !native.status().canvas) return;
    const c = native.status().canvas, size = settings.dimensions(config.get());
    const width = Math.max(1, Math.min(1024, size.width, c.width));
    const height = Math.max(1, Math.min(2048, Math.ceil(size.height), c.height));
    if (!surfaceSize || surfaceSize.width !== width || surfaceSize.height !== height) {
      // Electron 11's hidden offscreen window may keep its old compositor size
      // after setSize, especially with fractional Windows scaling. Recreate only
      // this hidden surface; position, entries and the settings panel stay intact.
      const previous = surface; surface = null; surfaceReady = false; lastBitmap = null; surfaceSize = null;
      native.hide(); previous.destroy(); ensureSurface();
    }
  }
  function sendSurface() {
    if (!inGame() || !alive(window) || !native.status().canvas) return;
    if (!entries.length && !editing) { native.hide(); return; }
    const c = native.status().canvas, b = window.getBounds();
    const point = typeof electron.screen.dipToScreenPoint === 'function' ? electron.screen.dipToScreenPoint({ x: b.x, y: b.y }) : b;
    native.send(lastBitmap.buffer, lastBitmap.width, lastBitmap.height, (point.x - c.left) * c.width / c.clientWidth, (point.y - c.top) * c.height / c.clientHeight, editing ? 3 : 1);
  }
  function ensureSurface() {
    if (disposed || !runtime() || !native || !native.status().ready || alive(surface)) return;
    const c = native.status().canvas, size = settings.dimensions(config.get());
    const width = Math.max(1, Math.min(1024, size.width, c.width));
    const height = Math.max(1, Math.min(2048, Math.ceil(size.height), c.height));
    const w = new electron.BrowserWindow({ title: 'Battle Notify — In-game Surface', width, height,
      show: false, frame: false, transparent: true, backgroundColor: '#00000000', focusable: false, skipTaskbar: true,
      webPreferences: { ...preferences('overlay'), offscreen: true } });
    surface = w; surfaceSize = { width, height }; surfaceReady = false; lastBitmap = null; secure(w);
    ghost(w);
    w.webContents.setFrameRate(editing ? 30 : 10);
    w.webContents.on('did-finish-load', () => { if (surface !== w || disposed) return; surfaceReady = true; update(); });
    w.webContents.on('paint', (_, dirty, image) => {
      if (surface !== w || disposed || !surfaceReady) return;
      const b = w.getBounds(), size = image.getSize();
      const scale = electron.screen.getDisplayMatching(b).scaleFactor;
      const target = surfaceSize;
      // A resize can deliver an old-size paint before Chromium finishes layout.
      // Do not turn that old image into the new notification by stretching it.
      if (!target || !size.width || !size.height || Math.abs(size.width - target.width * scale) > Math.ceil(scale * 2) || Math.abs(size.height - target.height * scale) > Math.ceil(scale * 2)) return;
      if (size.width !== target.width || size.height !== target.height) image = image.resize(target);
      const first = !lastBitmap; lastBitmap = { buffer: image.toBitmap(), width: target.width, height: target.height };
      if (inGame()) { if (alive(window)) window.hide(); sendSurface(); if (first) update(); }
    });
    w.on('closed', () => { if (surface === w) { surface = null; surfaceReady = false; lastBitmap = null; surfaceSize = null; } });
    w.webContents.on('render-process-gone', () => { if (native) native.hide(); if (alive(w)) w.destroy(); update(); });
    w.loadFile(path.join(__dirname, '../ui/overlay.html')).catch(e => { if (!disposed && surface === w && alive(w)) { warn('In-game display unavailable: ' + e.message); w.destroy(); } });
  }
  function nativeMove(value) {
    if (disposed || !editing || !native || !native.status().canvas) return;
    const c = native.status().canvas, point = { x: Math.round(c.left + value.x * c.clientWidth / c.width), y: Math.round(c.top + value.y * c.clientHeight / c.height) };
    const dip = typeof electron.screen.screenToDipPoint === 'function' ? electron.screen.screenToDipPoint(point) : point;
    const area = electron.screen.getDisplayNearestPoint(dip).workArea;
    try { config.save({ ...config.get(), x: dip.x, y: dip.y, display: area }); applyBounds(); update(); } catch (e) { notice(e.message); }
  }
  function rememberPosition() {
    moveTimer = null; if (disposed || !editing || !alive(window)) return;
    const b = window.getBounds(), value = config.get(), area = electron.screen.getDisplayMatching(b).workArea;
    if (b.x === value.x && b.y === value.y && JSON.stringify(area) === JSON.stringify(value.display)) return;
    try { config.save({ ...value, x: b.x, y: b.y, display: area }); update(); } catch (e) { notice(e.message); }
  }
  function notice(text) {
    if (alive(panel)) panel.webContents.send(channel + '-notice', text);
    else mod.command.message('[Battle Notify] ' + text);
  }
  function secure(w) {
    w.webContents.on('will-navigate', e => e.preventDefault());
    w.webContents.on('new-window', e => e.preventDefault());
  }
  function preferences(role) {
    return { preload: path.join(__dirname, '../ui/preload.js'), nodeIntegration: false, contextIsolation: true,
      enableRemoteModule: false, backgroundThrottling: false, additionalArguments: ['--battle-channel=' + channel, '--battle-role=' + role] };
  }
  function fail(w, error) {
    if (window !== w) return;
    ready = false; editing = false; entries = []; retryAt = Date.now() + 15000; schedule();
    if (alive(w)) w.destroy();
    warn('Movable notifications unavailable; using in-game alerts. ' + String(error || '').slice(0, 180)); update();
  }
  function ensure() {
    if (disposed || !runtime() || Date.now() < retryAt) return false;
    if (alive(window)) return true;
    try {
      const p = placement();
      const w = new electron.BrowserWindow({ title: 'Battle Notify — Notifications', x: p.x, y: p.y, width: p.width, height: p.height,
        show: false, frame: false, transparent: true, backgroundColor: '#00000000', resizable: false,
        maximizable: false, minimizable: false, skipTaskbar: true, focusable: false, hasShadow: false,
        webPreferences: preferences('overlay') });
      window = w; ready = false; secure(w);
      w.setAlwaysOnTop(true, 'pop-up-menu'); ghost(w);
      w.once('ready-to-show', () => { if (window !== w || disposed) return; ready = true; update(); if (editing) showEdit(); });
      w.on('move', () => {
        if (!editing || applying) return;
        if (moveTimer !== null) mod.clearTimeout(moveTimer);
        moveTimer = mod.setTimeout(rememberPosition, 150);
      });
      w.on('closed', () => { if (window === w) { window = null; ready = false; } });
      w.webContents.on('render-process-gone', (_, detail) => fail(w, detail.reason));
      w.loadFile(path.join(__dirname, '../ui/overlay.html')).catch(e => fail(w, e.message));
      return true;
    } catch (e) { if (alive(window)) window.destroy(); window = null; ready = false; retryAt = Date.now() + 15000; warn('Overlay could not start; native alerts remain active.'); return false; }
  }
  function showEdit() {
    if (!alive(window) || !ready) return;
    if (alive(surface)) surface.webContents.setFrameRate(30);
    if (inGame()) { window.hide(); update(); return; }
    window.setFocusable(true); window.setIgnoreMouseEvents(false); window.show(); update();
  }
  function edit() { editing = true; if (!ensure()) { editing = false; notice('Movable notifications need the graphical Toolbox.'); return false; } showEdit(); return true; }
  function lock() {
    if (disposed) return;
    if (moveTimer !== null) { mod.clearTimeout(moveTimer); moveTimer = null; }
    rememberPosition(); editing = false;
    if (alive(surface)) surface.webContents.setFrameRate(10);
    if (alive(window)) { ghost(window); window.blur(); }
    // Drop native edit flags immediately, even if Chromium produces no new paint.
    update(); schedule(); sendSurface();
  }
  function clear() { entries = []; lock(); schedule(); }
  function remove(key) {
    const length = entries.length;
    entries = entries.filter(e => e.key !== key);
    if (length !== entries.length) { update(); schedule(); }
  }
  function send(text, options = {}) {
    if (!config.get().enabled || disposed) return false;
    ensure(); if (!ready || !alive(window)) return false; // caller falls back once; no replay/duplicates
    const canvas = native && native.status().canvas;
    if (canvas && canvas.exclusive && !inGame()) return false;
    const s = config.get(); entries = entries.filter(e => e.until > Date.now());
    const existing = options.key && entries.find(e => e.key === options.key);
    const until = Number.isFinite(options.until) ? options.until : Date.now() + s.seconds * 1000;
    if (existing) Object.assign(existing, message(text), { until });
    else entries.push({ id: ++nextId, key: options.key, ...message(text), until });
    // Keep active keyed rows even when the visible row limit temporarily hides them.
    // Updating a countdown never changes its identity or position in the list.
    entries = entries.slice(-64); update(); schedule();
    if (!editing && !inGame()) showLocked();
    return true;
  }
  function presentPanel(w) {
    if (disposed || !alive(w)) return;
    panelInteracted = false; presentation++;
    w.webContents.send(channel + '-presentation', presentation);
    if (w.isMinimized()) w.restore();
    // Raise only on the explicit open command, matching Game Utils' window policy.
    w.setAlwaysOnTop(true, process.platform === 'win32' ? 'pop-up-menu' : 'floating');
    w.show();
    if (typeof w.moveTop === 'function') w.moveTop();
    w.focus();
  }
  function open() {
    if (disposed || !runtime()) { notice('Open the graphical Toolbox to use notification settings.'); return false; }
    ensure();
    if (alive(panel)) { presentPanel(panel); update(); return true; }
    const area = electron.screen.getPrimaryDisplay().workArea;
    const width = Math.min(640, area.width), height = Math.min(900, area.height - 40);
    const w = new electron.BrowserWindow({ title: 'Battle Notify — Settings', width, height, minWidth: Math.min(540, width), minHeight: Math.min(620, height),
      show: false, frame: false, backgroundColor: '#14171f', autoHideMenuBar: true, webPreferences: preferences('settings') });
    panel = w; secure(w);
    w.once('ready-to-show', () => { if (panel === w && !disposed) { update(); presentPanel(w); } });
    w.on('blur', () => { if (panelInteracted && alive(w)) w.setAlwaysOnTop(false); });
    for (const name of ['minimize', 'hide']) w.on(name, () => { if (alive(w)) w.setAlwaysOnTop(false); });
    w.on('closed', () => { if (panel === w) { panel = null; lock(); } });
    w.loadFile(path.join(__dirname, '../ui/settings.html')).catch(e => { notice('Could not open settings: ' + e.message); if (alive(w)) w.destroy(); });
    return true;
  }
  function change(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return;
    const allowed = ['enabled', 'x', 'y', ...Object.keys(settings.ranges)], value = config.get();
    for (const key of allowed) if (Object.prototype.hasOwnProperty.call(patch, key)) value[key] = patch[key];
    if (runtime() && (Object.prototype.hasOwnProperty.call(patch, 'x') || Object.prototype.hasOwnProperty.call(patch, 'y'))) {
      const normalized = settings.normalize(value);
      if (normalized.x !== null && normalized.y !== null)
        value.display = electron.screen.getDisplayMatching({ x: normalized.x, y: normalized.y, width: 1, height: 1 }).workArea;
    }
    config.save(value);
    if (config.get().enabled && native) native.start();
    applyBounds(); update(); schedule(); if (!config.get().enabled) clear();
  }
  function receive(event, action, value) {
    const fromPanel = alive(panel) && event.sender === panel.webContents;
    const fromOverlay = (alive(window) && event.sender === window.webContents) || (alive(surface) && event.sender === surface.webContents);
    if (!fromPanel && !fromOverlay) return;
    try {
      if (action === 'init') return update();
      if (action === 'layout') {
        if (alive(surface) && event.sender === surface.webContents && value) {
          const bounds = surfaceSize;
          if (value.width === bounds.width && value.height === bounds.height) surface.webContents.invalidate();
        }
        return;
      }
      if (action === 'lock') return lock();
      if (!fromPanel) return;
      if (action === 'interacted') { if (value === presentation) panelInteracted = true; }
      else if (action === 'minimize') panel.minimize();
      else if (action === 'settings') change(value);
      else if (action === 'edit') edit();
      else if (action === 'test') { if (!send("<FONT COLOR='#40fb40'>Battle Notify is ready</FONT>")) notice('Enable movable notifications and wait for the overlay to load.'); }
      else if (action === 'reset') { config.save({ ...settings.defaults }, true); applyBounds(); update(); }
      else if (action === 'close') panel.close();
    } catch (e) { notice(e.message); update(); }
  }
  function screenChanged() { if (alive(window)) { applyBounds(); update(); } }
  if (runtime()) {
    native = NativeOverlay.create(mod, {
      ready: () => { ensureSurface(); update(); },
      canvas: () => { applySurfaceBounds(); update(); sendSurface(); },
      move: nativeMove, lock,
      lost: () => { if (alive(surface)) surface.destroy(); if (alive(window) && (entries.length || editing)) { if (editing) showEdit(); else showLocked(); } update(); },
      error: text => warn(text)
    });
    electron.ipcMain.on(channel, receive);
    for (const name of ['display-added', 'display-removed', 'display-metrics-changed']) electron.screen.on(name, screenChanged);
    if (config.get().enabled) { ensure(); native.start(); }
  }
  return { open, edit, lock, send, remove, clear, status: () => ({ ...config.get(), ready, editing, renderer: inGame() ? 'in-game' : 'desktop', native: native && native.status() }),
    command(action = 'settings') {
      try {
        if (action === 'settings') return open();
        if (action === 'move') return edit();
        if (action === 'lock') return lock();
        if (action === 'on' || action === 'off') { change({ enabled: action === 'on' }); if (action === 'on') ensure(); return notice('Movable notifications ' + action.toUpperCase()); }
        if (action === 'test') { if (!send('Battle Notify · Test')) notice('Overlay not ready; open battle ui to configure it.'); return; }
        notice('battle ui | battle overlay move/lock/on/off/test');
      } catch (e) { notice(e.message); }
    },
    destructor() {
      if (moveTimer !== null) mod.clearTimeout(moveTimer);
      rememberPosition();
      disposed = true;
      for (const timer of [expiry, moveTimer]) if (timer !== null) mod.clearTimeout(timer);
      expiry = moveTimer = null;
      if (electron) { electron.ipcMain.removeListener(channel, receive); for (const name of ['display-added','display-removed','display-metrics-changed']) electron.screen.removeListener(name, screenChanged); }
      entries = [];
      if (native) native.close();
      for (const w of [panel, window, surface]) if (alive(w)) w.destroy();
      panel = window = null; entries = []; icons = null;
    }
  };
};
