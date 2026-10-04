'use strict';

const fs = require('fs');
const path = require('path');
const icons = require('./icons');

// Native blessing expiry, not the short visual aura or skill reuse cooldown.
// This monitor sends notifications only; no automatic Lotus cast is enabled.
module.exports = function LotusMonitor(mod, notify, { now = Date.now, logger } = {}) {
  mod.game.initialize('me.abnormalities');
  const file = path.join(__dirname, '..', 'lotus.json');
  const buffs = new Map(), cooldowns = new Map(), cycles = new Map();
  const pendingEnds = new Map();
  const removalConfirmMs = 250, transitionResyncMs = 1000;
  let config = load(), timer = null;
  const record = (stage, data = {}) => logger?.record('lotus', stage, data);
  let endTimer = null, transitionLoading = mod.game.isInLoadingScreen, resyncUntil = 0;
  const native = { order: -9000005, filter: { fake: false, modified: null, silenced: null } };
  const message = text => mod.command.message(`[Lotus] ${text}`);
  const safeName = text => String(text).replace(/[<>{}]/g, '').slice(0, 80);

  function load() {
    const data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    data.warningTimes ??= [5, 3]; data.notifyEnded ??= true;
    if (typeof data.enabled !== 'boolean' || typeof data.notifyEnded !== 'boolean' || !Array.isArray(data.warningTimes) ||
        data.warningTimes.some(seconds => !Number.isInteger(seconds) || seconds < 1 || seconds > 30) ||
        new Set(data.warningTimes).size !== data.warningTimes.length || !Array.isArray(data.effects))
      throw new Error('Invalid lotus.json');
    const keys = new Set(), ids = new Set();
    for (const effect of data.effects) {
      if (typeof effect.key !== 'string' || !effect.key || keys.has(effect.key) ||
          typeof effect.name !== 'string' || !effect.name) throw new Error('Invalid Lotus effect');
      keys.add(effect.key);
      for (const field of ['skillIds', 'buffIds', 'cooldownBuffIds']) {
        if (!Array.isArray(effect[field]) || !effect[field].length) throw new Error(`Invalid ${field}`);
        for (const id of effect[field]) {
          if (!Number.isInteger(id) || id <= 0 || ids.has(id)) throw new Error('Invalid/duplicate Lotus ID');
          ids.add(id);
        }
      }
    }
    return data;
  }
  function cancelTimer() {
    if (timer !== null) mod.clearTimeout(timer);
    timer = null;
  }
  function schedule() {
    cancelTimer();
    if (!config.enabled || !mod.game.isIngame || mod.game.isInLoadingScreen || transitionLoading) return;
    const time = now();
    let next = Infinity;
    for (const effect of config.effects) {
      const until = Math.max(0, ...effect.buffIds.map(id => buffs.get(id) || 0));
      let cycle = cycles.get(effect.key);
      if (until > time && (!cycle || cycle.until !== until)) {
        const buffId = effect.buffIds.find(id => buffs.get(id) === until);
        const sameRebound = resyncUntil > time && cycle && !cycle.ended && cycle.buffId === buffId &&
          Math.abs(until - cycle.until) <= transitionResyncMs;
        cycle = { until, buffId, warned: sameRebound ? cycle.warned : new Set(), ended: false };
        cycles.set(effect.key, cycle);
      }
      if (!cycle) continue;
      const removalPending = effect.buffIds.some(id => pendingEnds.has(id));
      if (until <= time) {
        // Zone cleanup can precede LOADING and restored buffs can arrive after SPAWN.
        // Do not announce an expiry until the pending removal/resynchronization settles.
        if (removalPending || resyncUntil > time) continue;
        if (!cycle.ended && config.notifyEnded) {
          record('LOTUS_ENDED_NOTIFICATION', { key: effect.key, id: cycle.buffId, until: cycle.until });
          notify.notify(`{alert}{yellow}${icons.abnormality(cycle.buffId)} ${safeName(effect.name)}: Ended`);
        }
        cycle.ended = true;
        continue;
      }
      const seconds = Math.ceil((until - time) / 1000);
      if (!removalPending && config.warningTimes.includes(seconds) && !cycle.warned.has(seconds)) {
        cycle.warned.add(seconds);
        record('LOTUS_WARNING', { key: effect.key, id: cycle.buffId, seconds, until });
        notify.notify(`{alert}{yellow}${icons.abnormality(cycle.buffId)} ${safeName(effect.name)}: ${seconds}`);
      }
      next = Math.min(next, until, ...config.warningTimes.map(seconds => until - seconds * 1000).filter(deadline => deadline > time));
    }
    if (Number.isFinite(next)) timer = mod.setTimeout(schedule, Math.max(1, next - now()));
  }
  function cancelEndTimer() {
    if (endTimer !== null) mod.clearTimeout(endTimer);
    endTimer = null;
  }
  function queueEndConfirmation() {
    cancelEndTimer();
    if (!mod.game.isIngame || transitionLoading || mod.game.isInLoadingScreen) return;
    const deadlines = [...pendingEnds.values()].map(entry => entry.at + removalConfirmMs);
    if (resyncUntil > now()) deadlines.push(resyncUntil);
    if (!deadlines.length) return;
    const deadline = Math.max(resyncUntil, Math.min(...deadlines));
    endTimer = mod.setTimeout(confirmEnds, Math.max(1, deadline - now()));
  }
  function confirmEnds() {
    endTimer = null;
    if (transitionLoading || mod.game.isInLoadingScreen || !mod.game.isIngame) return;
    if (now() < resyncUntil) { queueEndConfirmation(); return; }
    resyncUntil = 0;
    syncBuffSnapshot();
    for (const [id, entry] of pendingEnds) {
      if (entry.at + removalConfirmMs > now()) continue;
      const cached = Object.values(mod.game.me.abnormalities || {}).find(buff => buff.id === id);
      const remaining = Number(cached?.remaining);
      const stillActive = Number.isFinite(remaining) && remaining > 0 && remaining <= 86400000;
      if (!stillActive) (entry.speedBuff ? buffs : cooldowns).delete(id);
      pendingEnds.delete(id);
      record('LOTUS_REMOVAL_CONFIRMED', { id, stillActive, fromEndMs: now() - entry.at });
    }
    queueEndConfirmation(); schedule();
  }
  function update(name, packet) {
    if (packet.target !== mod.game.me.gameId) return;
    const effect = config.effects.find(entry => entry.buffIds.includes(packet.id) || entry.cooldownBuffIds.includes(packet.id));
    if (!effect) return;
    const map = effect.buffIds.includes(packet.id) ? buffs : cooldowns;
    if (name === 'S_ABNORMALITY_END') {
      // Keep the existing deadline while distinguishing a real removal from
      // zone teardown. Repeated END packets never extend the confirmation delay.
      if (map.has(packet.id) && !pendingEnds.has(packet.id))
        pendingEnds.set(packet.id, { at: now(), speedBuff: map === buffs });
    }
    else {
      const duration = Number(packet.duration);
      if (!Number.isFinite(duration) || duration <= 0 || duration > 86400000) return;
      map.set(packet.id, now() + duration);
      if (pendingEnds.delete(packet.id))
        record('LOTUS_REMOVAL_REBOUND', { id: packet.id, duration });
    }
    queueEndConfirmation(); schedule();
  }
  mod.hook('S_ABNORMALITY_BEGIN', mod.majorPatchVersion <= 106 ? 4 : 5, native, packet => update('S_ABNORMALITY_BEGIN', packet));
  mod.hook('S_ABNORMALITY_REFRESH', 2, native, packet => update('S_ABNORMALITY_REFRESH', packet));
  mod.hook('S_ABNORMALITY_END', 1, native, packet => update('S_ABNORMALITY_END', packet));
  function reset() {
    cancelTimer(); cancelEndTimer(); pendingEnds.clear(); resyncUntil = 0;
    transitionLoading = mod.game.isInLoadingScreen;
    buffs.clear(); cooldowns.clear(); cycles.clear();
  }
  function syncBuffSnapshot() {
    for (const buff of Object.values(mod.game.me.abnormalities || {})) {
      const effect = config.effects.find(entry => entry.buffIds.includes(buff.id) || entry.cooldownBuffIds.includes(buff.id));
      const remaining = Number(buff.remaining);
      if (!effect || !Number.isFinite(remaining) || remaining <= 0 || remaining > 86400000) continue;
      (effect.buffIds.includes(buff.id) ? buffs : cooldowns).set(buff.id, now() + remaining);
    }
  }
  function snapshot() { syncBuffSnapshot(); schedule(); }
  mod.hook('S_LOGIN', 'event', reset);
  const leave = () => { record('CHARACTER_LEAVE'); reset(); };
  const loading = () => {
    transitionLoading = true; resyncUntil = 0;
    cancelTimer(); cancelEndTimer(); record('LOADING');
  };
  const ready = () => {
    transitionLoading = false; resyncUntil = now() + transitionResyncMs;
    record('LOAD_COMPLETE'); syncBuffSnapshot(); queueEndConfirmation(); schedule();
  };
  // Enter before the game-state flag changes; quick/repeated zone loads use the
  // same guard. The late spawn hook observes the updated native buff cache.
  mod.hook('S_LOAD_TOPO', 'event', native, loading);
  mod.hook('S_SPAWN_ME', 3, { order: 9000000, filter: { fake: false, modified: null, silenced: null } }, () => {
    if (transitionLoading) ready(); else snapshot();
  });
  mod.game.on('leave_game', leave);
  mod.game.on('enter_loading_screen', loading);
  mod.game.on('leave_loading_screen', ready);
  // Blessings survive death and keep counting offline; do not reset on death/zone change.
  snapshot();
  mod.command.add('lotus', (command = 'status') => {
    if (command.toLowerCase() === 'log') message('Use battle log.');
    else if (command.toLowerCase() === 'reload') {
      try { config = load(); reset(); snapshot(); record('CONFIG_RELOADED', this.snapshot()); message('Configuration reloaded.'); }
      catch (error) { record('CONFIG_ERROR', { message: error.message }); message(error.message); }
    } else if (command.toLowerCase() === 'status') {
      record('STATUS_QUERY', this.snapshot());
      for (const effect of config.effects) {
        const until = Math.max(0, ...effect.buffIds.map(id => buffs.get(id) || 0));
        const recharge = Math.max(0, ...effect.cooldownBuffIds.map(id => cooldowns.get(id) || 0));
        message(`${safeName(effect.name)}: buff ${until > now() ? Math.ceil((until - now()) / 1000) + 's' : 'not observed active'} | ` +
          `blessing cooldown ${recharge ? Math.max(0, Math.ceil((recharge - now()) / 1000)) + 's' : 'unknown'}`);
      }
    } else message('lotus status/reload | battle log');
  });
  this.snapshot = () => ({ config, buffs: Object.fromEntries(buffs), cooldowns: Object.fromEntries(cooldowns),
    transitionLoading, resyncUntil, pendingEnds: Object.fromEntries(pendingEnds) });
  this.destructor = () => {
    reset(); record('MODULE_UNLOAD');
    mod.game.removeListener('leave_game', leave);
    mod.game.removeListener('enter_loading_screen', loading);
    mod.game.removeListener('leave_loading_screen', ready);
    mod.command.remove('lotus');
  };
};
