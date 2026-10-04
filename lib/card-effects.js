'use strict';

const fs = require('fs');
const path = require('path');
const CardClock = require('./card-clock');
const { discoverCard, cardLabel } = require('./card-catalog');
const icons = require('./icons');

module.exports = function CardEffects(mod, notify, { logger } = {}) {
  mod.game.initialize('me.abnormalities');
  const file = path.join(__dirname, '..', 'card-effects.json');
  let config = load(), timer = null, pendingCombatSummary = false;
  const record = (stage, data = {}) => logger?.record('cards', stage, data);
  const clock = new CardClock({ now: Date.now, effects: config.effects, record });
  const countdowns = new WeakMap();
  const readyNotifications = new WeakSet();
  const options = { order: -9000003, filter: { fake: false, modified: null, silenced: null } };
  function message(text) { mod.command.message(`[Cards] ${text}`); }
  function label(state) {
    return cardLabel(clock.effects.find(effect => effect.abnormalityIds.includes(state.abnormalityId)) || state);
  }
  function inCombat() { return mod.game.me.status === 1; }
  function readyNotice(state) {
    notify.notify(`{alert}{green}${icons.abnormality(state.abnormalityId)} ${label(state)}: Ready`);
    readyNotifications.add(state);
    record('CARD_READY_NOTIFICATION', { id: state.abnormalityId, readyAt: state.readyAt, combat: inCombat() });
  }
  function remainingText(seconds) {
    return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }
  function load() {
    const data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    if (typeof data.enabled !== 'boolean' || typeof data.notifyReady !== 'boolean' ||
        typeof data.showOnProc !== 'boolean' || !Array.isArray(data.effects)) throw new Error('Invalid card-effects.json');
    data.warningTimes ??= [5, 3];
    if (!Array.isArray(data.warningTimes) || data.warningTimes.some(seconds =>
        !Number.isInteger(seconds) || seconds < 1 || seconds > 30) ||
        new Set(data.warningTimes).size !== data.warningTimes.length)
      throw new Error('Invalid warningTimes: unique seconds in 1..30 required.');
    data.outOfCombat ??= { showRemainingOnExit: true, notifyReady: true };
    if (!data.outOfCombat || typeof data.outOfCombat !== 'object' || Array.isArray(data.outOfCombat) ||
        typeof data.outOfCombat.showRemainingOnExit !== 'boolean' || typeof data.outOfCombat.notifyReady !== 'boolean')
      throw new Error('Invalid outOfCombat settings.');
    data.outOfCombat.milestoneTimes ??= [120, 90, 60, 30];
    if (!Array.isArray(data.outOfCombat.milestoneTimes) || data.outOfCombat.milestoneTimes.some(seconds =>
        !Number.isInteger(seconds) || seconds < 1 || seconds > 86400) ||
        new Set(data.outOfCombat.milestoneTimes).size !== data.outOfCombat.milestoneTimes.length)
      throw new Error('Invalid outOfCombat.milestoneTimes: unique seconds in 1..86400 required.');
    data.autoDiscover ??= { enabled: false, minId: 30000000, maxIdExclusive: 30000100 };
    if (typeof data.autoDiscover.enabled !== 'boolean' || !Number.isInteger(data.autoDiscover.minId) ||
        !Number.isInteger(data.autoDiscover.maxIdExclusive) || data.autoDiscover.minId <= 0 ||
        data.autoDiscover.maxIdExclusive <= data.autoDiscover.minId) throw new Error('Invalid card effect range.');
    const keys = new Set(), ids = new Set();
    for (const effect of data.effects) {
      if (typeof effect.key !== 'string' || !effect.key || keys.has(effect.key) ||
          typeof effect.name !== 'string' || !effect.name || !Array.isArray(effect.abnormalityIds) ||
          !effect.abnormalityIds.length || effect.cooldownSeconds !== null &&
          (!Number.isFinite(effect.cooldownSeconds) || effect.cooldownSeconds <= 0 ||
          effect.cooldownSeconds > 86400)) throw new Error('Invalid/duplicate card effect');
      keys.add(effect.key);
      if (effect.displayName !== undefined && (typeof effect.displayName !== 'string' ||
          !effect.displayName.trim() || effect.displayName.length > 40))
        throw new Error('Invalid card displayName: a nonempty name of at most 40 characters is required.');
      for (const id of effect.abnormalityIds) {
        if (!Number.isInteger(id) || id <= 0 || ids.has(id)) throw new Error('Invalid/duplicate card abnormality ID');
        ids.add(id);
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
    if (!config.enabled || !mod.game.isIngame || mod.game.isInLoadingScreen) return;
    const time = Date.now();
    const milestones = inCombat() ? [] : config.outOfCombat.milestoneTimes;
    let next = Infinity;
    for (const state of clock.states.values()) {
      if (!Number.isFinite(state.readyAt) || state.notified || state.readyAt <= time) continue;
      const warningTimes = [...new Set([...config.warningTimes, ...milestones.filter(seconds =>
        seconds * 1000 < state.readyAt - state.procAt)])];
      const seconds = Math.ceil((state.readyAt - time) / 1000);
      const warned = countdowns.get(state) || new Set();
      if (warningTimes.includes(seconds) && !warned.has(seconds)) {
        warned.add(seconds); countdowns.set(state, warned);
        notify.notify(`{alert}{yellow}${icons.abnormality(state.abnormalityId)} ${label(state)}: CD ${remainingText(seconds)}`);
        record('CARD_COOLDOWN_WARNING', { id: state.abnormalityId, seconds, readyAt: state.readyAt,
          combat: inCombat(), milestone: !config.warningTimes.includes(seconds) });
      }
      next = Math.min(next, state.readyAt, ...warningTimes
        .map(seconds => state.readyAt - seconds * 1000).filter(deadline => deadline > time));
    }
    for (const state of clock.ready()) {
      record('CARD_COOLDOWN_READY', { id: state.abnormalityId, readyAt: state.readyAt });
    }
    // A cooldown that ended during combat still needs its first outside-combat ready alert.
    if (config.notifyReady || !inCombat() && config.outOfCombat.notifyReady) {
      for (const state of clock.states.values())
        if (Number.isFinite(state.readyAt) && state.readyAt <= time && !readyNotifications.has(state)) readyNotice(state);
    }
    if (pendingCombatSummary && !inCombat() && config.outOfCombat.showRemainingOnExit) {
      for (const state of clock.states.values()) {
        if (!Number.isFinite(state.readyAt)) continue;
        const seconds = Math.ceil((state.readyAt - time) / 1000);
        if (seconds <= 0 || countdowns.get(state)?.has(seconds)) continue;
        notify.notify(`{alert}{yellow}${icons.abnormality(state.abnormalityId)} ${label(state)}: CD ${remainingText(seconds)}`);
        record('CARD_COOLDOWN_SNAPSHOT', { id: state.abnormalityId, seconds, readyAt: state.readyAt });
      }
    }
    pendingCombatSummary = false;
    if (Number.isFinite(next)) timer = mod.setTimeout(schedule, Math.max(1, next - Date.now()));
  }
  function observe(name, packet) {
    if (packet.target !== mod.game.me.gameId) return;
    const data = mod.game.data?.abnormalities?.get(packet.id);
    if (!config.enabled) return;
    const existing = clock.effects.find(effect => effect.abnormalityIds.includes(packet.id));
    if (!existing) {
      const discovered = discoverCard(packet.id, data, config.autoDiscover);
      if (discovered) {
        clock.effects.push(discovered);
        record('CARD_DISCOVERED', discovered);
      } else return;
    } else if (existing.cooldownSource === 'unknown') {
      const discovered = discoverCard(packet.id, data, config.autoDiscover);
      if (discovered && Number.isFinite(discovered.cooldownSeconds)) Object.assign(existing, discovered);
    }
    const state = clock.observe(name, packet);
    if (state && config.showOnProc)
      notify.notify(`{alert}{blue}${icons.abnormality(state.abnormalityId)} ${label(state)}`);
    schedule();
  }
  mod.hook('S_ABNORMALITY_BEGIN', mod.majorPatchVersion <= 106 ? 4 : 5, options,
    packet => observe('S_ABNORMALITY_BEGIN', packet));
  mod.hook('S_ABNORMALITY_REFRESH', 2, options, packet => observe('S_ABNORMALITY_REFRESH', packet));
  mod.hook('S_ABNORMALITY_END', 1, options, packet => observe('S_ABNORMALITY_END', packet));
  mod.hook('S_LOGIN', 'event', reset);
  function reset() {
    cancelTimer(); clock.reset(); pendingCombatSummary = false;
  }
  const onEnterCombat = () => { pendingCombatSummary = false; schedule(); };
  const onLeaveCombat = () => { pendingCombatSummary = true; schedule(); };
  const onLeave = () => { record('CHARACTER_LEAVE'); reset(); };
  mod.game.me.on('enter_combat', onEnterCombat);
  mod.game.me.on('leave_combat', onLeaveCombat);
  mod.game.on('leave_game', onLeave);
  mod.game.on('enter_loading_screen', cancelTimer);
  mod.game.on('leave_loading_screen', schedule);
  mod.command.add('cards', (action = 'show', ...arguments_) => {
    action = action.toLowerCase();
    if (action === 'log' || action === 'mark') message('Use battle log or battle mark description.');
    else if (action === 'show') {
      record('STATUS_QUERY', this.snapshot());
      if (!clock.states.size) message('No tracked card proc yet. Unobserved cooldowns are unknown.');
      for (const state of clock.states.values()) {
        if (!Number.isFinite(state.readyAt)) {
          message(`${label(state)}: proc tracked; cooldown unknown (not documented by client).`);
          continue;
        }
        const seconds = Math.max(0, Math.ceil((state.readyAt - Date.now()) / 1000));
        message(`${label(state)}: ${seconds === 0 ? 'Ready (waiting for proc conditions)' : `CD ${remainingText(seconds)}`}`);
      }
      if (!config.effects.length) message('Effect ID mapping is not configured yet; use battle log to identify server procs.');
    } else if (action === 'reload') {
      try {
        config = load(); clock.effects = config.effects; reset();
        record('CONFIG_RELOADED', this.snapshot());
        message('Configuration reloaded. Counters start at the next observed proc.');
      } catch (error) { record('CONFIG_ERROR', { message: error.message }); message(error.message); }
    } else if (action === 'clear') { reset(); record('COUNTERS_CLEARED'); message('Counters cleared; next proc will start them again.'); }
    else message('cards show/reload/clear | battle log | battle mark description');
  });
  this.snapshot = () => ({ config, effects: clock.effects,
    states: [...clock.states].map(([key, state]) => ({ ...state, key, activeIds: Object.fromEntries(state.activeIds) })) });
  this.destructor = () => {
    reset(); mod.game.removeListener('leave_game', onLeave);
    mod.game.removeListener('enter_loading_screen', cancelTimer);
    mod.game.removeListener('leave_loading_screen', schedule);
    mod.game.me.removeListener('enter_combat', onEnterCombat);
    mod.game.me.removeListener('leave_combat', onLeaveCombat);
    mod.command.remove('cards'); record('MODULE_UNLOAD');
  };
};
