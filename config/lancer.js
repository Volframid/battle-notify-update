module.exports = [

	// Vergos Aggro Debuff
   {
		type: 'AddedOrRefreshed',
		target: 'PartyIncludingSelf',
		abnormalities: 950023,
		message: '{name} has {stacks} stack(s)',
		required_stacks: 1
	},

	// Vergos Aggro Debuff Expire
   {
		type: 'Removed',
		target: 'PartyIncludingSelf',
		abnormalities: 950023,
		message: '{name}\'s stacks expired'
	},

	// endurance debuff reminder
	{
		type: 'Expiring',
		target: 'MyBoss',
		abnormalities: [200302, 101200, 101210, 10153140, 10153142],
		message: '{icon}Debilitate {duration} ',
		time_remaining: [2, 5, 8, 15]
	},

	// endurance debuff gone
	{
		type: 'MissingDuringCombat',
		target: 'MyBoss',
		abnormalities: [200302, 101200, 101210, 10153140, 10153142],
		message: 'DEBILITATE missing',
		rewarn_timeout: 4
	},

	//Line Held 5 Stack Buff Expiring
	{
        type: 'Expiring',
		target: 'Self',
        abnormalities: [201701],
        message: '{icon}Line Held {duration} ',
		time_remaining: [2, 5, 8, 15]
    },

	//Pumped (Glyph) %25 Power Stand Fast
	{
        type: 'Added',
		target: 'Self',
        abnormalities: [22010],
        message: '{icon} {duration} '
    },
]
