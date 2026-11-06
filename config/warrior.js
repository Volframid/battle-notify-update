// Shared defaults. Existing personal files are upgraded in memory by lib/event-upgrade.js.
module.exports = [
    {
        "type": "MissingDuringCombat",
        "target": "Self",
        "abnormalities": [
            100100,
            100101,
            100102,
            100103,
            100200,
            100201,
            100202,
            100203
        ],
        "message": "Missing Stance",
        "rewarn_timeout": 10
    },
    {
        "type": "Reset",
        "skills": [
            290100,
            370100
        ],
        "message": "{icon} Reset"
    },
    {
        "type": "Expiring",
        "target": "Self",
        "abnormalities": [
            101300,
            101301
        ],
        "message": "{icon}T-cut {duration} ",
        "time_remaining": [
            2,
            5,
            8
        ]
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
        "message": "COMBATIVE missing",
        "rewarn_timeout": 3
    }
];
