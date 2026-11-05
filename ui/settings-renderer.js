'use strict';
const controls = [['width','Width',240,900],['fontSize','Text size',12,40],['iconSize','Icon size',20,72],['opacity','Background opacity (%)',0,100],['seconds','Display time (seconds)',1,12],['rows','Visible notifications',1,8]];
const fields = {}, root = document.getElementById('controls');
for (const [name, label, min, max] of controls) {
  const row = document.createElement('div'); row.className = 'control';
  const title = document.createElement('label'); title.textContent = label; title.htmlFor = name;
  const range = document.createElement('input'); range.type = 'range'; range.min = min; range.max = max; range.step = 1;
  range.setAttribute('aria-label', label);
  const number = document.createElement('input'); number.type = 'number'; number.min = min; number.max = max; number.step = 1; number.id = name;
  function commit(value) { if (value === '' || !Number.isFinite(Number(value))) return; window.battle.send('settings', { [name]: Number(value) }); }
  range.oninput = () => { number.value = range.value; }; range.onchange = () => commit(range.value);
  number.onchange = () => commit(number.value); number.onkeydown = e => { if (e.key === 'Enter') { commit(number.value); number.blur(); } };
  row.append(title, range, number); root.append(row); fields[name] = [range, number];
}
for (const name of ['x','y']) { const el = document.getElementById(name); el.onchange = () => { if (el.value !== '' && Number.isFinite(Number(el.value))) window.battle.send('settings', { [name]: Number(el.value) }); }; }
document.getElementById('enabled').onchange = e => window.battle.send('settings', { enabled: e.target.checked });
for (const name of ['edit','lock','test','reset','close']) document.getElementById(name).onclick = () => window.battle.send(name);
document.getElementById('window-close').onclick = () => window.battle.send('close');
document.getElementById('window-minimize').onclick = () => window.battle.send('minimize');
window.battle.state(state => {
  document.getElementById('enabled').checked = state.settings.enabled;
  document.getElementById('status').textContent = state.editing ? 'Position unlocked' : !state.settings.enabled ? 'Original game alerts' : state.ready ? 'Locked · ' + (state.renderer === 'in-game' ? 'In-game display' : 'Desktop display') : 'Starting / native fallback';
  for (const [name, inputs] of Object.entries(fields)) for (const input of inputs) if (document.activeElement !== input) input.value = state.settings[name];
  for (const name of ['x','y']) { const input = document.getElementById(name); if (document.activeElement !== input) input.value = state.settings[name] === null ? '' : state.settings[name]; }
});
window.battle.notice(text => { document.getElementById('notice').textContent = text; });
window.battle.send('init');
