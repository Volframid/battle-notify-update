'use strict';

const icons = require('./icons');

// Shadow Rest carries the real recharge; the item event can be only a short use lock.
// Observe both native sources and only send screen notifications.
module.exports = function BroochCountdown(mod, notify, { now = Date.now, logger } = {}) {
  mod.game.initialize('inventory');
  const deadlines = new Map(), shown = new Map();
  const record = (stage, data = {}) => logger?.record('brooch', stage, data);
  let timer = null, trackedId = null, trackedUntil = 0, rechargeUntil = 0;
  function cancelTimer() {
    if (timer !== null) mod.clearTimeout(timer);
    timer = null;
  }
  function tick() {
    timer = null;
    if (!mod.game.isIngame || trackedId === null) return;
    const remaining = trackedUntil - now();
    if (remaining <= 0) return;
    const seconds = Math.ceil(remaining / 1000);
    const previous = shown.get(trackedId);
    if (seconds <= 5 && !mod.game.isInLoadingScreen &&
        (previous?.until !== trackedUntil || previous.seconds !== seconds)) {
      shown.set(trackedId, { until: trackedUntil, seconds });
      record('BROOCH_WARNING', { id: trackedId, seconds, until: trackedUntil });
      notify.notify(`{alert}{yellow}${icons.item(trackedId)} Brooch: ${seconds}`);
    }
    // Late callbacks skip elapsed numbers instead of emitting a burst of old alerts.
    const next = seconds > 5 ? trackedUntil - 5000 : trackedUntil - (seconds - 1) * 1000;
    timer = mod.setTimeout(tick, Math.max(1, next - now()));
  }
  function sync() {
    const brooch = mod.game.inventory.equipmentItems.find(item => item.slot === 20);
    const id = brooch?.id ?? null, until = id === null ? 0 : Math.max(deadlines.get(id) || 0, rechargeUntil);
    if (id === trackedId && until === trackedUntil) return;
    cancelTimer(); trackedId = id; trackedUntil = until;
    record('BROOCH_COOLDOWN_UPDATED', { id, until, rechargeUntil });
    if (mod.game.isIngame && until > now())
      timer = mod.setTimeout(tick, Math.max(1, until - 5000 - now()));
  }
  function reset() {
    cancelTimer(); deadlines.clear(); shown.clear(); trackedId = null; trackedUntil = 0; rechargeUntil = 0;
  }
  const options = { order: -9000004, filter: { fake: false, modified: null, silenced: null } };
  function recharge(packet, ended = false) {
    if (packet.target !== mod.game.me.gameId || packet.id !== 301807) return;
    const duration = Number(packet.duration);
    if (ended) rechargeUntil = 0;
    else if (Number.isFinite(duration) && duration > 0 && duration <= 3600000)
      rechargeUntil = now() + duration;
    else return;
    sync();
  }
  mod.hook('S_ABNORMALITY_BEGIN', mod.majorPatchVersion <= 106 ? 4 : 5, options, packet => recharge(packet));
  mod.hook('S_ABNORMALITY_REFRESH', 2, options, packet => recharge(packet));
  mod.hook('S_ABNORMALITY_END', 1, options, packet => recharge(packet, true));
  mod.hook('S_START_COOLTIME_ITEM', 1, {
    order: -9000004, filter: { fake: false, modified: null, silenced: null }
  }, packet => {
    const seconds = Number(packet.cooldown);
    if (!Number.isFinite(seconds) || seconds < 0) return;
    deadlines.set(packet.item, now() + seconds * 1000);
    sync();
  });
  mod.hook('S_LOGIN', 'event', reset);
  mod.game.on('leave_game', reset);
  mod.game.inventory.on('update', sync);
  this.snapshot = () => ({ trackedId, trackedUntil, rechargeUntil, itemCooldowns: Object.fromEntries(deadlines) });
  this.destructor = () => {
    reset(); mod.game.removeListener('leave_game', reset);
    mod.game.inventory.removeListener('update', sync);
  };
};
