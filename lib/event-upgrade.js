'use strict';

// Apply targeted new behavior to preserved user configs without rewriting them.
// Only known old/default wording is renamed; custom labels and unrelated rules stay.
module.exports = function upgrade(rule, group) {
  const r = { ...rule }, ids = [].concat(r.abnormalities || []);
  const has = id => ids.includes(id), type = String(r.type || '').toLowerCase();
  if (has(200302)) r.abnormalities = [...new Set([...ids, 200300, 200301, 3012020])];
  if (group === 'common' && type === 'added') {
    const name = has(701700) ? 'Infection' : has(200701) ? 'Adrenaline Rush' :
      has(805803) ? 'Edict of Judgment' : has(702004) ? 'Elemental: Thrall of Wrath' : null;
    if (name && /^\{icon\}\s*\{duration\}\s*$/.test(r.message)) r.message = `{icon} ${name} {duration}`;
    const shield = has(800300) ? "Kaia's Shield" : has(702001) ? 'Elemental: Thrall of Protection' : null;
    if (shield && r.message === '{icon} on') r.message = `{icon} ${shield}`;
  }
  if (has(31083063) && type === 'removed' && r.message === '{icon} 4!!!!!!') r.message = '{icon} 4! Dodge';
  if (group === 'lancer') {
    if (type === 'expiring' && (has(200302) || has(201701))) {
      r.type = 'Countdown'; r.countdownStart = 10;
      r.message = has(201701) ? '{icon} Line Held {duration}' : '{icon} Debilitate {duration}';
      delete r.time_remaining;
    }
    if (has(22010) && /^\{icon\}\s*\{duration\}\s*$/.test(r.message)) r.message = '{icon} Glyph of the Pump {duration}';
    if (r.message === 'DEBILITATE RETARD') r.message = 'DEBILITATE missing';
  }
  return r;
};
