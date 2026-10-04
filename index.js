'use strict'

const BattleLogger = require('./lib/logger')
const AbnormalManager = require('./lib/abnormal')
const CooldownManager = require('./lib/cooldown')
const EntityManager = require('./lib/entity')
const PartyManager = require('./lib/party')
const Notify = require('./lib/notify')
const CardEffects = require('./lib/card-effects')
const BroochCountdown = require('./lib/brooch-countdown')
const LotusMonitor = require('./lib/lotus-monitor')

const isDefined = x => typeof x !== 'undefined'
const isArray = Array.isArray
const isError = x => x instanceof Error
const toArray = x => isArray(x) ? x : (isDefined(x) ? [x] : [])
const toSet = x => new Set(toArray(x))
const thisIfGreater = (x, y) => (x > y) ? x : false
const ceilFractionalBigIntMs = (uts) => (uts / 1000n) + ((uts % 1000n) !== 0n ? 1n : 0n)
const msRemainingBigInt = (uts, nowMs) => uts - BigInt(nowMs)
const sRemainingBigInt = (uts, nowMs) => ceilFractionalBigIntMs(msRemainingBigInt(uts, nowMs))
const matchExpiringBigInt = (set, uts, nowMs) => set.has(sRemainingBigInt(uts, nowMs))

const msRemaining = (uts, nowMs) => uts - nowMs
const sRemaining = (uts, nowMs) => Math.round(msRemaining(uts, nowMs) / 1000)
const matchExpiring = (set, uts, nowMs) => set.has(sRemaining(uts, nowMs))

function tryIt(func) {
    try {
        return func()
    } catch (e) {
        return e
    }
}

function BattleNotify(mod) {

    mod.game.initialize(['me.abnormalities', 'party', 'inventory'])
    const logger = new BattleLogger(mod)
    const logError = message => {
        const text = Array.isArray(message) ? message.join('\n') : message
        logger.record('errors', 'EVENT_ERROR', { message: text })
        mod.error(text)
    }
    const abMan = new AbnormalManager(mod)
    const cooldown = new CooldownManager(mod, logger)
    const entities = new EntityManager(mod)
    const party = new PartyManager(mod)
    const notify = new Notify(mod, logger)
    const cardEffects = new CardEffects(mod, notify, { logger })
    const broochCountdown = new BroochCountdown(mod, notify, { logger })
    const lotusMonitor = new LotusMonitor(mod, notify, { logger })
    const conditions = new Conditions()
    const targets = new Targets()
    const events = new Set()

    const combat = () => entities.myEntity()?.combat
    const enrage = () => entities.myBoss()?.enraged

    let interval = null

    function stopInterval() {
        if (interval !== null) mod.clearInterval(interval)
        interval = null
    }
    function start() {
        stopInterval()
        refreshConfig()
        interval = mod.setInterval(checkEvents, 500)
    }
    mod.hook('S_LOGIN', 'event', start)
    mod.hook('S_RETURN_TO_LOBBY', 'event', stopInterval)

    function Conditions() {
        function AbnormalConditions() {
            const checkAdded = (lastMatch, { added } = {}) => added
            const checkRemoved = (lastMatch, { removed } = {}) => removed

            function AddedOrRefreshed({ requiredStacks } = {}) {
                this.requiredStacks = requiredStacks
                return checkAddedOrRefreshed.bind(this)
            }
            function checkAddedOrRefreshed(lastMatch, { stacks = 0, added, refreshed } = {}) {
                if (stacks > this.requiredStacks)
                    return refreshed || added
            }

            function Refreshed({ requiredStacks } = {}) {
                this.requiredStacks = requiredStacks
                return checkRefreshed.bind(this)
            }
            function checkRefreshed(lastMatch, { stacks = 0, refreshed, added } = {}) {
                if (stacks > this.requiredStacks)
                    return refreshed || added
            }

            function Expiring({ timesToMatch } = {}) {
                this.timesToMatch = timesToMatch
                return checkExpiring.bind(this)
            }
            function checkExpiring(lastMatch, { expires = 0n, added, refreshed } = {}) {
                const nowMs = Date.now()
                if (matchExpiringBigInt(this.timesToMatch, expires, nowMs))
                    return (refreshed || added || 0n) + sRemainingBigInt(expires, nowMs)
            }

            function Missing({ rewarnTimeout } = {}) {
                this.rewarnTimeout = rewarnTimeout * 1000n
                return checkMissing.bind(this)
            }
            function checkMissing(lastMatch, { added, refreshed } = {}) {
                if (added || refreshed) return
                const nowMs = Date.now()
                return thisIfGreater(BigInt(nowMs), lastMatch + this.rewarnTimeout)
            }

            function MissingDuringCombat({ rewarnTimeout } = {}) {
                this.rewarnTimeout = rewarnTimeout * 1000n
                return checkMissingDuringCombat.bind(this)
            }
            function checkMissingDuringCombat(lastMatch, { added, refreshed } = {}) {
                if (added || refreshed || !combat()) return
                const nowMs = Date.now()
                return thisIfGreater(BigInt(nowMs), lastMatch + this.rewarnTimeout)
            }

            this.added = (x) => checkAdded
            this.removed = (x) => checkRemoved
            this.addedorrefreshed = (x) => new AddedOrRefreshed(x)
            this.refreshed = (x) => new Refreshed(x)
            this.expiring = (x) => new Expiring(x)
            this.missing = (x) => new Missing(x)
            this.missingduringcombat = (x) => new MissingDuringCombat(x)
        }

        function CooldownConditions() {

            function Expiring({ timesToMatch } = {}) {
                this.timesToMatch = timesToMatch
                return checkExpiring.bind(this)
            }
            function checkExpiring(lastMatch, { expires } = {}) {
                const nowMs = Date.now()
                if (matchExpiring(this.timesToMatch, expires, nowMs))
                    return expires - sRemaining(expires, nowMs)
            }

            function ExpiringDuringCombat({ timesToMatch } = {}) {
                this.timesToMatch = timesToMatch
                return checkExpiringDuringCombat.bind(this)
            }
            function checkExpiringDuringCombat(lastMatch, { expires = 0 } = {}) {
                if (combat())
                    return checkExpiring.call(this, ...arguments)
            }

            function ExpiringDuringEnrage({ timesToMatch } = {}) {
                this.timesToMatch = timesToMatch
                return checkExpiringDuringEnrage.bind(this)
            }
            function checkExpiringDuringEnrage(lastMatch, { expires = 0 } = {}) {
                if (enrage)
                    return checkExpiringDuringCombat.call(this, ...arguments)
            }

            function Ready({ rewarnTimeout } = {}) {
                this.rewarnTimeout = rewarnTimeout * 1000
                return checkReady.bind(this)
            }
            function checkReady(lastMatch, { expires = 0 } = {}) {
                const nowMs = Date.now()
                if (nowMs > expires)
                    return thisIfGreater(nowMs, lastMatch + this.rewarnTimeout)
            }

            function ReadyDuringCombat({ rewarnTimeout } = {}) {
                this.rewarnTimeout = rewarnTimeout * 1000
                return checkReadyDuringCombat.bind(this)
            }
            function checkReadyDuringCombat(lastMatch, { expires = 0 } = {}) {
                if (combat())
                    return checkReady.call(this, ...arguments)
            }

            function ReadyDuringEnrage({ rewarnTimeout } = {}) {
                this.rewarnTimeout = rewarnTimeout * 1000
                return checkReadyDuringEnrage.bind(this)
            }
            function checkReadyDuringEnrage(lastMatch, { expires = 0 } = {}) {
                if (enrage())
                    return checkReadyDuringCombat.call(this, ...arguments)
            }

            this.expiring = (x) => new Expiring(x)
            this.expiringduringcombat = (x) => new ExpiringDuringCombat(x)
            this.expiringduringenrage = (x) => new ExpiringDuringEnrage(x)
            this.ready = (x) => new Ready(x)
            this.readyduringcombat = (x) => new ReadyDuringCombat(x)
            this.readyduringenrage = (x) => new ReadyDuringEnrage(x)
        }

        this.cooldown = new CooldownConditions()
        this.abnormal = new AbnormalConditions()
    }

    function Targets() {
        function AbnormalTargets() {
            this.self = () => [entities.myCid()]
            this.myboss = () => [entities.myBossId()]
            this.party = () => party.members()
                .filter(cid => cid !== entities.myCid())
                .filter(cid => cid !== '0')
            this.partyincludingself = () => party.members()
                .filter(cid => cid !== '0')
        }
        function CooldownTargets(skills, items) {
            skills = Array.from(skills)
            items = Array.from(items)
            return () =>
                skills.map(id => cooldown.skill(id))
                    .concat(items.map(id => cooldown.item(id)))
        }
        this.cooldown = CooldownTargets
        this.abnormal = new AbnormalTargets()
    }

    function AbnormalEvent(data) {
        const type = data.type.toLowerCase()
        const target = data.target.toLowerCase()
        const getTargets = targets.abnormal[target]
        const event = {}
        const args = event.args = {
            timesToMatch: toSet((isDefined(data.time_remaining) && data.time_remaining !== 0) ? (isArray(data.time_remaining) ? data.time_remaining.map(el => BigInt(el)) : BigInt(data.time_remaining)) : 6n),
            rewarnTimeout: ((isDefined(data.rewarn_timeout) && data.rewarn_timeout !== 0) ? BigInt(data.rewarn_timeout) : 5n),
            requiredStacks: data.required_stacks || 1
        }
        event.abnormalities = toSet(data.abnormalities)
        event.condition = conditions.abnormal[type](args)
        event.message = data.message
        event.lastMatches = new Map()
        event.matchAll = type.includes('missing')

        this.check = function () {
            getTargets()
                .map(id => tryIt(() => checkAbnormalEvent(id, event)))
                .filter(isError)
                .forEach(err => logError([
                    `[battle-notify] AbnormalEvent.check: error while checking event`,
                    `event: ${JSON.stringify(event || {}, (k, v) => typeof v === 'bigint' ? `${v.toString()}n` : v)}`,
                    err.stack
                ]))
        }
    }
    function checkAbnormalEvent(entityId, event) {
        if (!entityId) return
        const entity = entities.get(entityId)
        if (entity.dead) return

        entityId = entityId.toString()
        if (!event.lastMatches.has(entityId))
            event.lastMatches.set(entityId, 0n)

        const results = new Set()
        let info
        let currentMatch = 0n

        for (const abnormal of event.abnormalities) {
            const lastMatch = event.lastMatches.get(entityId)
            const abnormalInfo = abMan.get(entityId, abnormal)
            const match = event.condition(lastMatch, abnormalInfo)

            if (match && match !== lastMatch) {
                currentMatch = match
                info = abnormalInfo
                results.add(true)
            } else results.add(false)
        }

        if (event.matchAll && results.has(false) || !results.has(true)) return
        notify.abnormal(event.message, entity, info)
        event.lastMatches.set(entityId, currentMatch)
    }

    function CooldownEvent(data) {
        data.skills = toArray(data.skills)
        data.items = toArray(data.items)
        const type = data.type.toLowerCase()
        const getTargets = targets.cooldown(data.skills, data.items)
        const event = {}
        const args = event.args = {
            timesToMatch: toSet(data.time_remaining || 6),
            rewarnTimeout: data.rewarn_timeout || 5
        }
        event.condition = conditions.cooldown[type](args)
        event.message = data.message
        event.lastMatches = new Map()

        this.check = function () {
            getTargets()
                .map(info =>
                    tryIt(() => checkCooldownEvent(info, event)))
                .filter(isError)
                .forEach(err => logError([
                    `[battle-notify] CooldownEvent.check: error while checking event`,
                    `event: ${JSON.stringify(event || {})}`,
                    err.stack
                ]))
        }
    }
    function checkCooldownEvent(info, event) {
        const id = info.item ? info.item : info.skill
        if (!event.lastMatches.has(id))
            event.lastMatches.set(id, 0)

        const lastMatch = event.lastMatches.get(id)
        const match = event.condition(lastMatch, info)
        if (match && match !== lastMatch) {
            notify.cooldown(event.message, info)
            event.lastMatches.set(id, match)
        }
    }

    function ResetEvent(data) {
        cooldown.onReset(toArray(data.skills), info => {
            notify.skillReset(data.message, info)
        })
        this.check = function () { }
    }

    function refreshConfig() {
        events.clear()
        cooldown.clearResetHooks()

        const job = entities.self().class
        if (/^(warrior|lancer|slayer|berserker|sorcerer|archer|priest|mystic|reaper|gunner|brawler|ninja|valkyrie)$/.test(job))
            loadEvents('./config/' + job)
        loadEvents('./config/common')

        loadStyling('./config/common_styling.js')
    }
    function loadStyling(path) {
        const file = require.resolve(path)
        delete require.cache[file]
        const data = require(file)
        if (!data) return
        notify.setDefaults(data)
    }
    function loadEvent(event) {
        let type
        if (event.abnormalities)
            type = AbnormalEvent
        else if (event.type && event.type.toLowerCase() === 'reset')
            type = ResetEvent
        else if (event.skills || event.items)
            type = CooldownEvent

        return new type(event)
    }
    function loadEvents(path) {
        const file = require.resolve(path)
        delete require.cache[file]
        const data = require(file)

        toArray(data)
            .forEach(event => {
                const result = tryIt(() => loadEvent(event))

                if (isError(result)) {
                    logError([
                        `[battle-notify] loadEvents error while loading event from ${path}`,
                        `event: ${JSON.stringify(event)}`,
                        result.stack
                    ])
                    return
                }
                events.add(result)
            })
    }
    function checkEvents() {
        events.forEach(e => e.check())
    }

    function snapshot() {
        return { ingame: mod.game.isIngame, loading: mod.game.isInLoadingScreen,
            class: mod.game.me.class, combat: mod.game.me.status === 1, currentAction: logger.action,
            eventCount: events.size, party: party.members(), cards: cardEffects.snapshot(),
            lotus: lotusMonitor.snapshot(), brooch: broochCountdown.snapshot() }
    }
    mod.game.on('leave_game', stopInterval)
    mod.command.add('battle', (command = 'status', ...args) => {
        command = command.toLowerCase()
        const message = text => mod.command.message('[Battle Notify] ' + text)
        if (command === 'log') {
            const mode = (args[0] || 'toggle').toLowerCase()
            if (!['toggle', 'on', 'off', 'status'].includes(mode)) { message('battle log [on/off/status]'); return }
            if (mode === 'off' || mode === 'toggle' && logger.active) logger.stop()
            else if (mode !== 'status') logger.start(snapshot)
            const state = logger.status()
            message(state.active ? 'Log ON | ' + state.file : 'Log OFF.')
        } else if (command === 'mark') {
            if (!logger.active) { message('Log is OFF. Use battle log first.'); return }
            logger.record('session', 'USER_MARK', { text: args.join(' ') })
            message(logger.active ? 'Log marker added.' : 'Log stopped because writing failed.')
        } else if (command === 'lotus') {
            lotusMonitor.command(args[0] || 'status')
        } else if (command === 'status') {
            logger.record('session', 'STATUS_QUERY', { state: snapshot() })
            message('Notifications active | class ' + (mod.game.me.class || 'unknown') +
                ' | log ' + (logger.active ? 'ON' : 'OFF'))
        } else message('battle status | battle log [on/off/status] | battle mark description | battle lotus status/reload')
    })
    if (mod.game.isIngame) start()
    this.destructor = () => {
        stopInterval()
        lotusMonitor.destructor()
        broochCountdown.destructor()
        cardEffects.destructor()
        party.destructor()
        entities.destructor()
        abMan.destructor()
        cooldown.destructor()
        mod.game.removeListener('leave_game', stopInterval)
        mod.command.remove('battle')
        logger.destructor()
    }
}


exports.NetworkMod = BattleNotify;
