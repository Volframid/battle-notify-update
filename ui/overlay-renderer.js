'use strict';
const root = document.documentElement, list = document.getElementById('notifications');
let viewportWidth, viewportHeight;
const style = (name, value) => { if (root.style.getPropertyValue(name) !== value) root.style.setProperty(name, value); };
window.battle.state(state => {
  const s = state.settings;
  // Hidden/transparent Windows surfaces can briefly retain an older viewport.
  // Lay out against the exact content size supplied with this update instead.
  const viewport = state.viewport;
  if (viewport && Number.isFinite(viewport.width) && viewport.width > 0 && Number.isFinite(viewport.height) && viewport.height > 0 &&
      (viewportWidth !== viewport.width || viewportHeight !== viewport.height)) {
    viewportWidth = viewport.width; viewportHeight = viewport.height;
    root.style.width = viewport.width + 'px'; root.style.height = viewport.height + 'px';
    document.getElementById('drag-label').textContent = viewport.width < 300 ? '✥ Drag' : '✥ Drag to position';
    requestAnimationFrame(() => window.battle.send('layout', viewport));
  }
  style('--font', s.fontSize + 'px'); style('--icon', s.iconSize + 'px');
  style('--background', 'rgba(20,23,31,' + s.opacity / 100 + ')');
  document.body.classList.toggle('editing', state.editing);
  const previous = new Map([...list.children].map(row => [row.dataset.id, row]));
  const keep = new Set();
  let index = 0;
  for (const entry of state.entries) {
    const id = String(entry.id); keep.add(id);
    const row = previous.get(id) || document.createElement('section'); row.className = 'notification'; row.dataset.id = id;
    const image = entry.image || null;
    if (!row.firstChild || row._image !== image) {
      let icon;
      if (image && /^data:image\/png;base64,/.test(image)) { icon = document.createElement('img'); icon.src = image; icon.alt = ''; }
      else { icon = document.createElement('span'); icon.textContent = '◆'; icon.className = 'fallback'; }
      icon.classList.add('icon');
      if (row.firstChild) row.replaceChild(icon, row.firstChild); else row.append(icon);
      row._image = image;
    }
    const signature = JSON.stringify(entry.runs);
    if (!row._text || row._signature !== signature) {
      const text = row._text || document.createElement('div'); text.className = 'text'; text.replaceChildren();
      for (const run of entry.runs) { const span = document.createElement('span'); span.textContent = run.text; if (/^#[0-9a-f]{6}$/i.test(run.color)) span.style.color = run.color; text.append(span); }
      if (!row._text) row.append(text);
      row._text = text; row._signature = signature;
    }
    if (list.children[index] !== row) list.insertBefore(row, list.children[index] || null);
    index++;
  }
  for (const [id, row] of previous) if (!keep.has(id)) row.remove();
});
document.getElementById('lock').onclick = () => window.battle.send('lock');
window.addEventListener('keydown', e => { if (e.key === 'Escape') window.battle.send('lock'); });
window.battle.send('init');
