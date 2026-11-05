'use strict';
const fs = require('fs'), path = require('path');
const defaults = { version: 1, enabled: true, width: 440, fontSize: 22, iconSize: 40,
  opacity: 50, seconds: 4, rows: 4, x: null, y: null, display: null };
const ranges = { width: [240, 900], fontSize: [12, 40], iconSize: [20, 72],
  opacity: [0, 100], seconds: [1, 12], rows: [1, 8] };
function normalize(input = {}) {
  const result = { ...defaults };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return result;
  if (typeof input.enabled === 'boolean') result.enabled = input.enabled;
  for (const [name, [min, max]] of Object.entries(ranges))
    if (typeof input[name] === 'number' && Number.isFinite(input[name]))
      result[name] = Math.round(Math.max(min, Math.min(max, input[name])));
  for (const name of ['x', 'y'])
    if (Number.isFinite(input[name]) && Math.abs(input[name]) <= 100000) result[name] = Math.round(input[name]);
  const d = input.display;
  if (d && ['x','y','width','height'].every(k => Number.isFinite(d[k])) && d.width > 0 && d.height > 0)
    result.display = { x: d.x, y: d.y, width: d.width, height: d.height };
  return result;
}
function dimensions(settings) {
  return { width: settings.width, height: 44 + settings.rows * (Math.max(settings.iconSize, settings.fontSize * 2.6) + 20) };
}
function place(settings, displays, primary) {
  const d = dimensions(settings), areas = displays.map(v => v.workArea);
  let area = (primary || displays[0]).workArea;
  if (settings.x !== null && settings.y !== null) {
    const old = settings.display;
    area = areas.find(a => old && a.x === old.x && a.y === old.y) ||
      areas.find(a => settings.x >= a.x && settings.x < a.x + a.width && settings.y >= a.y && settings.y < a.y + a.height) || area;
  }
  const width = Math.min(d.width, area.width), height = Math.min(Math.ceil(d.height), area.height);
  let x = settings.x === null ? area.x + (area.width - width) / 2 : settings.x;
  let y = settings.y === null ? area.y + area.height * .2 : settings.y;
  const old = settings.display;
  if (old && (old.width !== area.width || old.height !== area.height || old.x !== area.x || old.y !== area.y)) {
    x = area.x + Math.max(0, Math.min(1, (x - old.x) / Math.max(1, old.width - width))) * (area.width - width);
    y = area.y + Math.max(0, Math.min(1, (y - old.y) / Math.max(1, old.height - height))) * (area.height - height);
  }
  return { x: Math.round(Math.max(area.x, Math.min(area.x + area.width - width, x))),
    y: Math.round(Math.max(area.y, Math.min(area.y + area.height - height, y))), width, height, display: { ...area } };
}
function store(root, warn) {
  const file = path.join(root, 'data', 'overlay.json');
  let value = { ...defaults }, blocked = false;
  try {
    const raw = fs.readFileSync(file, 'utf8');
    if (raw.length > 16384) throw Error('Settings file is too large');
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || Array.isArray(parsed)) throw Error('Unsupported settings file');
    value = normalize(parsed);
  } catch (error) {
    if (error.code !== 'ENOENT') { blocked = true; warn('Overlay settings could not be read; the original file was preserved. Use Reset in settings to recover.'); }
  }
  function save(next, reset = false) {
    if (blocked && !reset) throw Error('Use Reset first; the unreadable settings file is preserved.');
    const safe = normalize(next), temporary = file + '.' + process.pid + '.tmp';
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (blocked && reset) fs.copyFileSync(file, file + '.unreadable-' + Date.now() + '.bak');
    let owned = false;
    try {
      fs.writeFileSync(temporary, JSON.stringify(safe, null, 2) + '\n', { flag: 'wx' }); owned = true;
      fs.renameSync(temporary, file); value = safe; blocked = false;
    } finally { if (owned && fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    return value;
  }
  return { get: () => ({ ...value }), save };
}
module.exports = { defaults, ranges, normalize, dimensions, place, store };
