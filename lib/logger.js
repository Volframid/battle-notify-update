'use strict';

const fs = require('fs');
const path = require('path');

// One opt-in JSONL session for every notification component. Packet observers
// neither modify nor suppress traffic, and never activate gameplay skills.
module.exports = class BattleLogger {
  constructor(mod, { io = fs, now = Date.now, directory = path.join(__dirname, '..', 'logs') } = {}) {
    Object.assign(this, { mod, io, now, directory });
    this.file = null;
    this.sequence = 0;
    this.serial = 0;
    this.action = null;
    const native = { order: -9000010, filter: { fake: false, modified: null, silenced: null } };
    const own = packet => packet.gameId === mod.game.me.gameId;
    const observe = (name, version, select = () => true) => mod.hook(name, version, native, packet => {
      if (!this.active || !select(packet)) return;
      let metadata;
      if (name.startsWith('S_ABNORMALITY')) {
        const data = mod.game.data?.abnormalities?.get(packet.id);
        metadata = { name: data?.name, tooltip: data?.tooltip };
      } else if (name === 'S_SYSTEM_MESSAGE') {
        try { metadata = { parsed: mod.parseSystemMessage(packet.message) }; } catch (_) {}
      }
      this.record('packets', name, { packet, ...metadata });
    });
    for (const [name, version] of [
      ['S_ABNORMALITY_BEGIN', mod.majorPatchVersion <= 106 ? 4 : 5], ['S_ABNORMALITY_REFRESH', 2],
      ['S_ABNORMALITY_END', 1], ['S_START_COOLTIME_SKILL', 3], ['S_DECREASE_COOLTIME_SKILL', 3],
      ['S_START_COOLTIME_ITEM', 1], ['S_CREST_MESSAGE', 2], ['S_CANNOT_START_SKILL', 4],
      ['S_SYSTEM_MESSAGE', 1], ['S_SKILL_LIST', 2], ['S_NPC_STATUS', 2], ['S_BOSS_GAGE_INFO', 3],
      ['S_CREATURE_LIFE', 3], ['S_PREMIUM_SLOT_DATALIST', 2]
    ]) observe(name, version);
    observe('S_USER_STATUS', 3, own);
    observe('S_EACH_SKILL_RESULT', mod.majorPatchVersion >= 86 ? 14 : 13,
      packet => packet.source === mod.game.me.gameId || packet.target === mod.game.me.gameId);
    for (const [name, version] of [['C_START_SKILL', 7], ['C_START_TARGETED_SKILL', 7],
      ['C_START_INSTANCE_SKILL', 7], ['C_PRESS_SKILL', 4], ['C_CANCEL_SKILL', 3],
      ['C_USE_ITEM', 3], ['C_USE_PREMIUM_SLOT', 1]]) {
      mod.hook(name, version, native, packet => {
        this.record('packets', 'CLIENT_INPUT', { name, packet, currentAction: this.action });
      });
      mod.hook(name, version, { order: 9000001, filter: { fake: null, modified: null, silenced: false } }, packet => {
        this.record('packets', 'CLIENT_FORWARDED', { name, packet, synthetic: packet.$fake === true });
      });
    }
    mod.hook('S_ACTION_STAGE', 9, native, packet => {
      if (!own(packet)) return;
      this.action = { id: packet.id, skill: packet.skill?.id ?? packet.skill, stage: packet.stage, at: this.now() };
      this.record('packets', 'S_ACTION_STAGE', { packet });
    });
    mod.hook('S_ACTION_END', 5, native, packet => {
      if (!own(packet)) return;
      if (this.action?.id === packet.id) this.action = null;
      this.record('packets', 'S_ACTION_END', { packet });
    });
    mod.hook('S_LOGIN', mod.majorPatchVersion >= 86 ? 14 : 13, native, packet => {
      this.action = null;
      this.record('session', 'CHARACTER_LOGIN', { playerId: packet.playerId, serverId: packet.serverId });
    });
    mod.hook('S_LOAD_TOPO', 'event', native, () => { this.action = null; this.record('session', 'ZONE_CHANGE'); });
    this.listeners = [
      [mod.game, 'leave_game', () => { this.action = null; this.record('session', 'CHARACTER_LEAVE'); }],
      [mod.game, 'enter_loading_screen', () => this.record('session', 'LOADING')],
      [mod.game, 'leave_loading_screen', () => this.record('session', 'LOAD_COMPLETE')],
      [mod.game.me, 'enter_combat', () => this.record('session', 'COMBAT_ENTER')],
      [mod.game.me, 'leave_combat', () => this.record('session', 'COMBAT_LEAVE')]
    ];
    for (const [emitter, event, fn] of this.listeners) emitter.on(event, fn);
  }
  get active() { return this.file !== null; }
  record(scope, stage, data = {}) {
    if (!this.active) return false;
    try {
      const row = { ...data, utc: new Date(this.now()).toISOString(), sequence: ++this.sequence,
        scope, stage, character: { gameId: this.mod.game.me.gameId,
          playerId: this.mod.game.me.playerId, serverId: this.mod.serverId, class: this.mod.game.me.class } };
      this.io.appendFileSync(this.file, JSON.stringify(row,
        (_, value) => typeof value === 'bigint' ? value.toString() : value) + '\n');
      return true;
    } catch (error) {
      this.file = null;
      this.mod.error(`Battle log stopped: ${error.message}`);
      return false;
    }
  }
  start(snapshot = () => ({})) {
    if (this.active) return true;
    try {
      this.io.mkdirSync(this.directory, { recursive: true });
      const name = `battle-${new Date(this.now()).toISOString().replace(/[:.]/g, '-')}-${process.pid}`;
      // Exclusive creation also preserves recordings across rapid reloads.
      for (let attempts = 0; attempts < 100; attempts++) {
        const file = path.join(this.directory, `${name}-${++this.serial}.jsonl`);
        try { this.io.writeFileSync(file, '', { flag: 'wx' }); this.file = file; break; }
        catch (error) { if (error.code !== 'EEXIST') throw error; }
      }
      if (!this.file) throw new Error('Cannot create a unique log file.');
      this.sequence = 0;
      if (!this.record('session', 'SESSION_START', { state: snapshot() })) return false;
      for (const buff of Object.values(this.mod.game.me.abnormalities || {})) {
        const data = this.mod.game.data?.abnormalities?.get(buff.id);
        if (!this.record('session', 'BUFF_SNAPSHOT', { id: buff.id, remaining: buff.remaining,
          name: data?.name, tooltip: data?.tooltip })) return false;
      }
      return true;
    } catch (error) {
      this.file = null; this.mod.error(`Battle log could not start: ${error.message}`); return false;
    }
  }
  stop(reason = 'command') {
    if (!this.active) return;
    this.record('session', 'SESSION_END', { reason }); this.file = null;
  }
  status() { return { active: this.active, file: this.file && path.basename(this.file), sequence: this.sequence }; }
  destructor() {
    this.stop('module-unload'); this.action = null;
    for (const [emitter, event, fn] of this.listeners) emitter.removeListener(event, fn);
  }
};
