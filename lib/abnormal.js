'use strict'

const ID_ENRAGE = 8888888
const hookOptions = { filter: { fake: null, silenced: null }, order: -1E4 }

module.exports = function AbnormalManager(mod){
    const entities = new Map()
    mod.hook('S_ABNORMALITY_BEGIN', mod.majorPatchVersion <= 106 ? 4 : 5, hookOptions, addAbnormal)
    mod.hook('S_ABNORMALITY_REFRESH', 2, hookOptions, refreshAbnormal)
    mod.hook('S_ABNORMALITY_END', 1, hookOptions, removeAbnormal)

    mod.hook('S_LOAD_TOPO', 'event', () => {
        entities.clear()
    })

    mod.hook('S_NPC_STATUS', 2, (event) => {
        const entity = getEntity(event.gameId)
        if(event.enraged) {
            if(!entity.get('enraged'))
                addAbnormal({
                    target: event.gameId,
                    source: 0n,
                    id: ID_ENRAGE,
                    duration: BigInt(event.remainingEnrageTime),
                    stacks: 1
                })
            entity.set('enraged', true)
        } else {
            if(entity.get('enraged'))
                removeAbnormal({
                    target: event.gameId,
                    id: ID_ENRAGE
                })
            entity.set('enraged', false)
        }
    })

    function abnormalIcon(id){
        let icon
        if(id === ID_ENRAGE){
            icon = `<img src='img://item__8626' width='48' height='48' vspace='-7' />`
        } else {
            icon = `<img src='img://abonormality__${id}' width='48' height='48' vspace='-7' />`
        }
        return icon
    }
    function getEntity(id){
        if(!id) return false
        id = id.toString()
        if(!entities.has(id)) entities.set(id, new Map())
        return entities.get(id)
    }
    function getAbnormal(entityId, abnormalId){
        const entity = getEntity(entityId)
        if(!entity.has(abnormalId)) entity.set(abnormalId, {})
        const abnormal = entity.get(abnormalId)
        if(!abnormal.icon) abnormal.icon = abnormalIcon(abnormalId)
        return abnormal
    }
    function addAbnormal(event){
        const nowMs = Date.now()
        const abnormal = getAbnormal(event.target, event.id)
        abnormal.added = BigInt(nowMs)
        abnormal.expires = BigInt(nowMs) + event.duration
        abnormal.stacks = event.stacks
        delete abnormal.refreshed
        delete abnormal.removed
    }
    function refreshAbnormal(event){
        const nowMs = Date.now()
        const abnormal = getAbnormal(event.target, event.id)
        if(!abnormal.added)
            abnormal.added = BigInt(nowMs)
            abnormal.refreshed = BigInt(nowMs)
        abnormal.expires = BigInt(nowMs) + event.duration
        abnormal.stacks = event.stacks
        delete abnormal.removed
    }
    function removeAbnormal(event){
        const nowMs = Date.now()
        const abnormal = getAbnormal(event.target, event.id)
        abnormal.removed = BigInt(nowMs)
        delete abnormal.added
        delete abnormal.refreshed
        delete abnormal.expires
        delete abnormal.stacks
    }

    this.get = getAbnormal
    this.destructor = () => entities.clear()
}
