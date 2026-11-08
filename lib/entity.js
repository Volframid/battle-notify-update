'use strict'

const jobs = [
    'warrior',
    'lancer',
    'slayer',
    'berserker',
    'sorcerer',
    'archer',
    'priest',
    'mystic',
    'reaper',
    'gunner',
    'brawler',
    'ninja',
    'valkyrie'
]


module.exports = function EntityManager(mod){
    const changed = (kind, id) => this.onChange?.(kind, id.toString())
    function updateHp(entity, id, current, maximum) {
        if (typeof current !== 'bigint' || typeof maximum !== 'bigint' || maximum <= 0n) return
        const previous = entity.hp
        entity.hp = Number(current * 100n / maximum)
        if (entity.boss && previous < 100 && current === maximum) changed('boss-reset', id)
    }
    const self = {
        cid: -1n,
        class: 'Default.Class',
        name: 'Default.Name'
    }
    const entities = new Map()
    const offscreenParty = new Set()
    const isPartyMember = id => (mod.game.party.partyMembers || []).some(member => member.gameId.toString() === id)
    function forget(id) {
        id = id.toString()
        const entity = entities.get(id)
        if (entity) {
            entity.dead = true
            changed('despawn', id)
        }
        const player = entities.get(self.cid.toString())
        if (player && player.target && player.target.toString() === id) delete player.target
        entities.delete(id)
        offscreenParty.delete(id)
        thisManager.onForget?.(id)
    }
    const thisManager = this
    if (mod.game.isIngame && mod.game.me.gameId) {
        self.cid = mod.game.me.gameId
        self.class = mod.game.me.class
        self.name = mod.game.me.name
        Object.assign(getEntity(self.cid), { name: self.name, class: self.class,
            dead: !mod.game.me.alive, combat: mod.game.me.status === 1 })
    }
    mod.game.initialize('party')
    mod.hook('S_BOSS_GAGE_INFO', 3, (event) => {
        const entity = getEntity(event.id)
        entity.boss = true
        if(!entity.name) entity.name = `{@Creature:${event.huntingZoneId}#${event.templateId}}`
        const player = getEntity(self.cid)
        if(!player.target) player.target = event.id
        updateHp(entity, event.id, event.curHp, event.maxHp)
    })
    mod.hook('S_EACH_SKILL_RESULT', mod.majorPatchVersion >= 86 ? 14 : 13, (event) => {
        const entity = getEntity(event.target)
        if(!entity.boss) return
        const player = getEntity(event.source)
        player.target = event.target
    })
    mod.hook('S_CREATURE_CHANGE_HP', 6, (event) => {
        const entity = getEntity(event.target)
        updateHp(entity, event.target, event.curHp, event.maxHp)
    })
    mod.hook('S_CREATURE_LIFE', 3, (event) => {
        const entity = getEntity(event.gameId)
        entity.dead = !event.alive
        changed('life', event.gameId)
    })
    mod.hook('S_NPC_STATUS', 2, (event) => {
        const entity = getEntity(event.gameId)
        if(event.enraged) {
            entity.enraged = true
        } else {
            if(entity.enraged && entity.hp > 0) {
                entity.nextEnrage = entity.hp - 10
                if(entity.nextEnrage < 0) entity.nextEnrage = 0
            }
            entity.enraged = false
        }
    })
    mod.hook('S_DESPAWN_NPC', 3, (event) => {
        forget(event.gameId)
    })
    mod.hook('S_DESPAWN_USER', 3, (event) => {
        const id = event.gameId.toString()
        if (id === self.cid.toString()) return
        // Keep real party buffs available when a member moves out of range.
        if (isPartyMember(id)) offscreenParty.add(id)
        else forget(id)
    })
    mod.hook('S_SPAWN_ME', 3, (event) => {
        const entity = getEntity(event.gameId)
        entity.dead = !event.alive
        entity.name = self.name
        entity.class = self.class
        changed('life', event.gameId)
    })
    mod.hook('S_SPAWN_USER', 17, (event) => {
        offscreenParty.delete(event.gameId.toString())
        const entity = getEntity(event.gameId)
        const job = (event.templateId - 10101) % 100
        entity.name = event.name
        entity.class = jobs[job]
        entity.dead = !event.alive
    })
    mod.hook('S_USER_STATUS', 3, (event) => {
        const entity = getEntity(event.gameId)
        entity.combat = (event.status === 1)
        changed('combat', event.gameId)
    })
    mod.game.party.on('list', processPartyList)
    const leaveParty = () => { for (const id of offscreenParty) forget(id) }
    mod.game.party.on('leave', leaveParty)

    function processPartyList(members) {
        for (const id of offscreenParty) if (!members.some(member => member.gameId.toString() === id)) forget(id)
        members.forEach(member => {
            const entity = getEntity(member.gameId)
            if (entity) entity.name = member.name
        })
    }

    function getEntity(id){
        if(!id) return false
        id = id.toString()
        if(!entities.has(id)) entities.set(id, {})
        return entities.get(id)
    }

    mod.hook('S_LOGIN', mod.majorPatchVersion >= 86 ? 14 : 13, (event) => {
        const entity = getEntity(event.gameId)
        const job = (event.templateId - 10101) % 100
        entity.name = event.name
        entity.class = jobs[job]
        entity.dead = !event.alive

        self.cid = event.gameId
        self.name = event.name
        self.class = jobs[job]
    })
    mod.hook('S_LOAD_TOPO', 3, (event) => {
        entities.clear()
        offscreenParty.clear()
    })
    this.destructor = () => {
        mod.game.party.removeListener('list', processPartyList)
        mod.game.party.removeListener('leave', leaveParty)
        entities.clear()
        offscreenParty.clear()
    }
    this.get = getEntity
    this.myCid = function(){
        return self.cid.toString()
    }
    this.myEntity = function(){
        return getEntity(self.cid)
    }
    this.myBoss = function(){
        return getEntity(this.myBossId())
    }
    this.myBossId = function(){
        const entity = this.myEntity()
        return (entity.target || 0n).toString()
    }
    this.self = function(){
        return self
    }
}
