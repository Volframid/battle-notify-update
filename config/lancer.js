// Shared defaults. Existing personal files are upgraded in memory by lib/event-upgrade.js.
module.exports = [
    {
        "type": "AddedOrRefreshed",
        "target": "PartyIncludingSelf",
        "abnormalities": 950023,
        "message": "{name} has {stacks} stack(s)",
        "required_stacks": 1
    },
    {
        "type": "Removed",
        "target": "PartyIncludingSelf",
        "abnormalities": 950023,
        "message": "{name}'s stacks expired"
    },
    {
        "type": "Countdown",
        "target": "MyBoss",
        "abnormalities": [
            200302,
            101200,
            101210,
            10153140,
            10153142,
            200300,
            200301,
            3012020
        ],
        "message": "{icon} Debilitate {duration}",
        "countdownStart": 10
    },
    {
        "type": "MissingDuringCombat",
        "target": "MyBoss",
        "abnormalities": [
            200302,
            101200,
            101210,
            10153140,
            10153142,
            200300,
            200301,
            3012020
        ],
        "message": "DEBILITATE missing",
        "rewarn_timeout": 4
    },
    {
        "type": "Countdown",
        "target": "Self",
        "abnormalities": [
            201701
        ],
        "message": "{icon} Line Held {duration}",
        "countdownStart": 10
    },
    {
        "type": "Added",
        "target": "Self",
        "abnormalities": [
            22010
        ],
        "message": "{icon} Glyph of the Pump {duration}"
    }
];
