// Shared defaults. Existing personal files are upgraded in memory by lib/event-upgrade.js.
module.exports = [
    {
        "type": "AddedOrRefreshed",
        "target": "PartyIncludingSelf",
        "abnormalities": 950023,
        "message": "{name} has {icon} {stacks} stack(s)",
        "required_stacks": 1
    },
    {
        "type": "Removed",
        "target": "PartyIncludingSelf",
        "abnormalities": 950023,
        "message": "{name}'s {icon} stacks expired"
    },
    {
        "type": "Reset",
        "skills": 61131,
        "message": "{icon} reset!"
    },
    {
        "type": "Added",
        "target": "Self",
        "abnormalities": 31020,
        "message": "{icon} {duration}"
    },
    {
        "type": "Added",
        "target": "Self",
        "abnormalities": 31010,
        "message": "{icon} {duration}"
    },
    {
        "type": "Expiring",
        "target": "Self",
        "abnormalities": 10153210,
        "message": "{icon} {duration}",
        "time_remaining": [
            1,
            2
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
            10153141,
            10153142,
            200300,
            200301,
            3012020
        ],
        "message": "JACKHAMMER missing",
        "rewarn_timeout": 3
    },
    {
        "type": "Expiring",
        "target": "MyBoss",
        "abnormalities": 10153140,
        "message": "{icon} 3s",
        "time_remaining": [
            3
        ]
    },
    {
        "type": "Added",
        "target": "Self",
        "abnormalities": 89210100,
        "message": "{icon} up"
    },
    {
        "type": "Added",
        "target": "MyBoss",
        "abnormalities": 950514,
        "message": "{icon} {stacks}"
    },
    {
        "type": "AddedOrRefreshed",
        "target": "MyBoss",
        "abnormalities": 950514,
        "message": "{icon} {stacks}",
        "required_stacks": 1
    },
    {
        "type": "Added",
        "target": "MyBoss",
        "abnormalities": 950513,
        "message": "{icon} Defense Up"
    },
    {
        "type": "AddedorRefreshed",
        "target": "MyBoss",
        "abnormalities": 950513,
        "message": "{icon} Defense Up {stacks}",
        "required_stacks": 1
    },
    {
        "type": "Expiring",
        "target": "MyBoss",
        "abnormalities": [
            950193,
            950192
        ],
        "message": "{icon} {duration}",
        "time_remaining": [
            3,
            5,
            10,
            30,
            60,
            120,
            180,
            240,
            300,
            360,
            420,
            480,
            540,
            600
        ]
    },
    {
        "type": "Added",
        "target": "MyBoss",
        "abnormalities": 950171,
        "message": "{icon} 50%!"
    }
];
