'use strict';

// The internal cooldown is configured/verified separately from buff duration.
// No artificial abnormality or cooldown is injected into the game.
module.exports = class CardClock {
  constructor({ now, effects, record }) {
    Object.assign(this, { now, effects, record });
    this.states = new Map();
  }
  observe(name, packet) {
    const effect = this.effects.find(effect => effect.abnormalityIds.includes(packet.id));
    if (!effect) return null;
    const now = this.now(), state = this.states.get(effect.key);
    const knownCooldown = Number.isFinite(effect.cooldownSeconds) && effect.cooldownSeconds > 0;
    // Late client metadata may identify a cooldown; keep the real proc timestamp.
    if (state && !Number.isFinite(state.readyAt) && knownCooldown) {
      state.readyAt = state.procAt + effect.cooldownSeconds * 1000;
      state.notified = false;
      this.record('CARD_COOLDOWN_IDENTIFIED', {
        key: effect.key, id: packet.id, cooldownSeconds: effect.cooldownSeconds, readyAt: state.readyAt
      });
    }
    if (name === 'S_ABNORMALITY_END') {
      if (state) state.activeIds.delete(packet.id);
      return null;
    }
    const duration = Number(packet.duration);
    const activeUntil = Number.isFinite(duration) && duration > 0 ? now + duration : now;
    // Refresh and additional components of the same active proc are not new procs.
    if (name === 'S_ABNORMALITY_REFRESH' || state &&
        [...state.activeIds.values()].some(until => until > now)) {
      if (state) state.activeIds.set(packet.id, activeUntil);
      return null;
    }
    const next = { name: effect.name, abnormalityId: packet.id, procAt: now,
      readyAt: knownCooldown ? now + effect.cooldownSeconds * 1000 : null,
      activeIds: new Map([[packet.id, activeUntil]]), notified: !knownCooldown };
    if (state && Number.isFinite(state.readyAt) && state.readyAt > now) this.record('CARD_EARLY_PROC', {
      key: effect.key, id: packet.id, configuredRemainingMs: state.readyAt - now
    });
    this.states.set(effect.key, next);
    this.record('CARD_PROC', { key: effect.key, id: packet.id, cooldownSeconds: effect.cooldownSeconds });
    return next;
  }
  ready() {
    const ready = [];
    for (const state of this.states.values()) {
      if (!state.notified && Number.isFinite(state.readyAt) && state.readyAt <= this.now()) {
        state.notified = true; ready.push(state);
      }
    }
    return ready;
  }
  nextDeadline() {
    return Math.min(Infinity, ...[...this.states.values()]
      .filter(state => !state.notified && Number.isFinite(state.readyAt)).map(state => state.readyAt));
  }
  reset() { this.states.clear(); }
};
