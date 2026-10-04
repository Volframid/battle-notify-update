'use strict'


module.exports = function PartyManager(mod){
    const party = new Map()
    mod.game.initialize('party')
    mod.game.party.on('list', processPartyList)
    const memberLeave = event => party.delete(event.playerId.toString())
    const leave = () => party.clear()
    mod.game.party.on('member_leave', memberLeave)
    mod.hook('S_LOGOUT_PARTY_MEMBER', 1, event => {
        party.delete(event.playerId.toString())
    })
    mod.game.party.on('leave', leave)
    processPartyList(mod.game.party.partyMembers || [])
    function processPartyList(members) {
        party.clear()
        members.forEach(member => {
            party.set(
                member.playerId.toString(),
                member.gameId.toString()
            )
        })
    }
    this.destructor = () => {
        for (const [event, fn] of [['list', processPartyList], ['member_leave', memberLeave], ['leave', leave]])
            mod.game.party.removeListener(event, fn)
        party.clear()
    }
    this.members = function(){
        return Array.from(party.values())
    }
    this.isMember = function(id){
        id = id.toString()
        return [...party.values()].includes(id) || party.has(id)
    }
}
