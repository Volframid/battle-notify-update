'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), net = require('net');
const MAGIC = 0x314e4243, MAX_WIDTH = 1024, MAX_HEIGHT = 2048;
function frame(buffer, width, height, x, y, flags, moveAck = 0) {
  if (!Buffer.isBuffer(buffer) || !Number.isInteger(width) || !Number.isInteger(height) || width < 0 || height < 0 || width > MAX_WIDTH || height > MAX_HEIGHT || buffer.length !== width * height * 4)
    throw Error('Invalid notification frame');
  if (![x, y].every(v => Number.isFinite(v) && Math.abs(v) <= 100000) || ![0, 1, 2, 3].includes(flags)) throw Error('Invalid notification coordinates');
  const h = Buffer.alloc(36);
  h.writeUInt32LE(MAGIC, 0); h.writeUInt32LE(1, 4); h.writeUInt32LE(buffer.length, 8);
  h.writeUInt32LE(width, 12); h.writeUInt32LE(height, 16); h.writeInt32LE(Math.round(x), 20); h.writeInt32LE(Math.round(y), 24);
  h.writeUInt32LE(flags, 28); h.writeUInt32LE(moveAck >>> 0, 32);
  return Buffer.concat([h, buffer]);
}
function create(mod, callbacks = {}) {
  const client = mod.clientInterface, info = client && client.info;
  let server = null, socket = null, disposed = false, started = false, ready = false, authenticated = false;
  let latest = null, queued = null, writing = false, heartbeat = null, deadline = null, canvas = null, moveAck = 0;
  let buildId = null;
  const call = (name, value) => { if (!disposed && typeof callbacks[name] === 'function') callbacks[name](value); };
  function error(text) { call('error', String(text).slice(0, 240)); }
  function write(value) {
    if (!socket || socket.destroyed || !authenticated) return;
    if (writing) { queued = value; return; }
    writing = true;
    socket.write(value, () => { writing = false; if (queued) { const next = queued; queued = null; write(next); } });
  }
  function message(value) {
    call('diagnostic', value);
    if (!authenticated) {
      if (value.type !== 'hello' || value.version !== 1 || value.pid !== info.pid || value.build !== buildId) { socket.destroy(); return; }
      authenticated = true;
      // Verify drawing with an invisible frame before replacing desktop delivery.
      write(frame(Buffer.alloc(16), 2, 2, 0, 0, 1));
      return;
    }
    if (value.type === 'canvas') {
      if (!['d3d9', 'd3d11'].includes(value.api) || !Number.isInteger(value.width) || value.width < 1 || value.width > 32768 || !Number.isInteger(value.height) || value.height < 1 || value.height > 32768 || ![value.left, value.top].every(v => Number.isFinite(v) && Math.abs(v) < 100000)) return;
      if (![value.clientWidth,value.clientHeight].every(v => Number.isInteger(v) && v > 0 && v <= 32768)) return;
      canvas = value; call('canvas', value);
    } else if (value.type === 'rendered' && canvas && !ready) {
      ready = true; if (deadline) { clearTimeout(deadline); deadline = null; } call('ready', canvas);
    } else if (value.type === 'move' && ready && Number.isInteger(value.sequence) && value.sequence >= moveAck && [value.x,value.y].every(v => Number.isInteger(v) && v >= 0 && v <= 32768)) {
      moveAck = value.sequence; call('move', value);
    } else if (value.type === 'lock' && ready) call('lock');
  }
  function start() {
    if (started || disposed || process.platform !== 'win32' || !info || !Number.isInteger(info.pid) || info.pid <= 0 || !['x64','ia32'].includes(info.arch) || typeof client.injectDLL !== 'function') return false;
    let dll;
    try {
      const root = path.resolve(__dirname, '..'), manifest = JSON.parse(fs.readFileSync(path.join(root, 'native/renderer.json'), 'utf8'));
      if (!/^[0-9a-f]{16}$/.test(manifest.buildId)) throw Error('Fullscreen component build identifier is missing');
      buildId = manifest.buildId;
      const item = manifest.protocol === 1 && manifest.architectures[info.arch];
      if (!item || !/^native\/bin\/battle-render-[0-9a-f]{12}-(x64|ia32)\.dll$/.test(item.file)) throw Error('Fullscreen component metadata is missing');
      dll = path.join(root, item.file);
      if (crypto.createHash('sha256').update(fs.readFileSync(dll)).digest('hex') !== item.sha256) throw Error('Fullscreen component did not pass its file check');
    } catch (e) { error(e.message); return false; }
    started = true;
    server = net.createServer(connection => {
      if (socket && !socket.destroyed) { connection.destroy(); return; }
      socket = connection; authenticated = false; writing = false; queued = null; moveAck = 0;
      let text = '';
      connection.on('data', bytes => {
        text += bytes.toString('utf8');
        if (text.length > 65536) { connection.destroy(); return; }
        let end;
        while ((end = text.indexOf('\n')) >= 0) { const line = text.slice(0, end); text = text.slice(end + 1); try { message(JSON.parse(line)); } catch (_) { connection.destroy(); return; } }
      });
      connection.on('error', () => {});
      connection.on('close', () => { if (socket === connection) { socket = null; ready = false; authenticated = false; writing = false; queued = null; canvas = null; call('lost'); } });
    });
    server.on('error', e => { error(e.message); ready = false; call('lost'); });
    server.listen('\\\\.\\pipe\\CEM-BattleNotify-' + info.pid + '-' + buildId, () => {
      if (disposed) return;
      try { if (client.injectDLL(dll) === false) error('Toolbox could not load the fullscreen renderer'); } catch (e) { error(e.message); }
    });
    heartbeat = setInterval(() => { if (latest && ready) write(latest); }, 1000);
    deadline = setTimeout(() => { deadline = null; if (!ready) error('Fullscreen renderer has not confirmed drawing yet. Desktop notifications remain available.'); }, 15000);
    return true;
  }
  return {
    start,
    status: () => ({ started, ready, connected: authenticated, canvas }),
    send(buffer, width, height, x, y, flags) {
      latest = frame(buffer, width, height, x, y, flags, moveAck);
      if (ready) write(latest);
    },
    hide() { latest = frame(Buffer.alloc(0), 0, 0, 0, 0, 0, moveAck); if (ready) write(latest); },
    close() {
      if (disposed) return; disposed = true;
      if (heartbeat) clearInterval(heartbeat); if (deadline) clearTimeout(deadline); heartbeat = deadline = null;
      if (socket) socket.destroy(); if (server) server.close();
      socket = server = latest = queued = null; ready = false; authenticated = false; canvas = null;
    }
  };
}
module.exports = { create, frame };
