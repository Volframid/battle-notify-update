'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
let catalog;
const packs = new Map();
// Metadata is loaded once; only four texture packs stay in memory at a time.
function resolve(key) {
  if (!key) return null;
  if (!catalog) catalog = require('../ui/icons.json');
  let name = catalog.map[key];
  if (!name && key.startsWith('skill__')) {
    const bits = key.split('__'), job = Number(bits[2]) % 100 - 1;
    name = catalog.map['skill_' + job + '_' + bits[3]] || catalog.map['skill_common_' + bits[3]];
  }
  if (!name) return null;
  if (catalog.images[name]) return catalog.images[name];
  if (catalog.packs !== 1 || !/^[0-9a-f]{20}$/.test(name)) return null;
  const prefix = name[0];
  let pack = packs.get(prefix);
  if (!pack) {
    pack = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, '../ui/icon-packs', prefix + '.json.gz'))));
  }
  packs.delete(prefix); packs.set(prefix, pack);
  if (packs.size > 4) packs.delete(packs.keys().next().value);
  return pack[name] || null;
}
module.exports = { resolve };
