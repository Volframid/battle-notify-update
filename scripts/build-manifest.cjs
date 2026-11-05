'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const files = {};
function add(relative) {
  const data = fs.readFileSync(path.join(root, relative));
  const hash = crypto.createHash('sha256').update(data).digest('hex').toUpperCase();
  const preserve = relative === 'config.json' || relative === 'card-effects.json' ||
    relative === 'lotus.json' || relative.startsWith('config/');
  files[relative] = preserve ? { hash, overwrite: false } : hash;
}
function walk(relative) {
  for (const name of fs.readdirSync(path.join(root, relative)).sort()) {
    const entry = relative + '/' + name;
    const stat = fs.lstatSync(path.join(root, entry));
    if (stat.isDirectory()) walk(entry);
    else if (stat.isFile() && /\.(js|json)$/.test(name)) add(entry);
  }
}
for (const file of ['.gitignore', 'README.md', 'card-effects.json', 'config.json', 'index.js', 'lotus.json', 'module.json']) {
  if (fs.existsSync(path.join(root, file))) add(file);
}
for (const directory of ['config', 'lib']) {
  if (fs.existsSync(path.join(root, directory))) walk(directory);
}
// Explicit UI assets: never include user data, diagnostics or working journals.
for (const file of ['preload.js', 'overlay.html', 'overlay.css', 'overlay-renderer.js',
  'settings.html', 'settings.css', 'settings-renderer.js', 'icons.json', 'ICONS.md', 'ICON-LICENSE.txt']) {
  add('ui/' + file);
}
// The updater fetches these prebuilt components with the rest of the mod.
// Select only the current hashed binaries: never ship build tools or old DLLs.
const renderer = JSON.parse(fs.readFileSync(path.join(root, 'native/renderer.json'), 'utf8'));
if (renderer.protocol !== 1 || !/^[0-9a-f]{16}$/.test(renderer.buildId)) throw Error('Invalid renderer metadata');
for (const arch of ['x64', 'ia32']) {
  const item = renderer.architectures[arch];
  if (!item || !new RegExp('^native/bin/battle-render-[0-9a-f]{12}-' + arch + '\\.dll$').test(item.file)) throw Error('Invalid renderer path');
  add(item.file);
  if (files[item.file] !== item.sha256.toUpperCase()) throw Error('Renderer checksum mismatch: ' + arch);
}
add('native/renderer.json');
add('native/README.md');
for (const name of ['MinHook.txt', 'LLVM.txt', 'MinGW-runtime.txt', 'MinGW.txt', 'Winpthreads.txt']) add('native/licenses/' + name);
fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ files }, null, 2) + '\n');
console.log('Update manifest generated for ' + Object.keys(files).length + ' files.');
