'use strict';
const root = document.documentElement, list = document.getElementById('notifications');
window.battle.state(state => {
  const s = state.settings;
  // Hidden/transparent Windows surfaces can briefly retain an older viewport.
  // Lay out against the exact content size supplied with this update instead.
  const viewport = state.viewport;
  if (viewport && Number.isFinite(viewport.width) && viewport.width > 0 && Number.isFinite(viewport.height) && viewport.height > 0) {
    root.style.width = viewport.width + 'px'; root.style.height = viewport.height + 'px';
    document.getElementById('drag-label').textContent = viewport.width < 300 ? '✥ Drag' : '✥ Drag to position';
    requestAnimationFrame(() => window.battle.send('layout', viewport));
  }
  root.style.setProperty('--font', s.fontSize + 'px'); root.style.setProperty('--icon', s.iconSize + 'px');
  root.style.setProperty('--background', 'rgba(20,23,31,' + s.opacity / 100 + ')');
  document.body.classList.toggle('editing', state.editing);
  list.replaceChildren();
  for (const entry of state.entries) {
    const row = document.createElement('section'); row.className = 'notification';
    let icon;
    if (entry.image && /^data:image\/png;base64,/.test(entry.image)) { icon = document.createElement('img'); icon.src = entry.image; icon.alt = ''; }
    else { icon = document.createElement('span'); icon.textContent = '◆'; icon.className = 'fallback'; }
    icon.classList.add('icon'); row.append(icon);
    const text = document.createElement('div'); text.className = 'text';
    for (const run of entry.runs) { const span = document.createElement('span'); span.textContent = run.text; if (/^#[0-9a-f]{6}$/i.test(run.color)) span.style.color = run.color; text.append(span); }
    row.append(text); list.append(row);
  }
});
document.getElementById('lock').onclick = () => window.battle.send('lock');
window.addEventListener('keydown', e => { if (e.key === 'Escape') window.battle.send('lock'); });
window.battle.send('init');
