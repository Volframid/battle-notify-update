module.exports = [

	// Contagion Added
	{
		type: 'added',
		target: 'MyBoss',
		abnormalities: [701700, 701708],
		message: '{icon} {duration}'
	},

	// Hurricane Added
	{
		type: 'added',
		target: 'MyBoss',
		abnormalities: 60010,
		message: 'Hurricane {duration}'
	},

	// Adrenaline Rush  Added
	{
		type: 'added',
		target: 'Self',
		abnormalities: [200701, 200700],
		message: '{icon} {duration}'
	},

	// Missing Battle Solution / Nostrum
	{
		type: 'MissingDuringCombat',
		target: 'Self',
		abnormalities: [4030, 6090, 6091, 6092, 4031, 4020, 4021, 4022, 4042, 4040],
		message: 'Missing {icon}',
		rewarn_timeout: 15
	},

     // Priest edict  Added
	{
		type: 'added',
		target: 'Self',
		abnormalities: [805803],
		message: '{icon} {duration}'
	},

	// Mystic Wrath  Added
	{
		type: 'added',
		target: 'Self',
		abnormalities: [702004],
		message: '{icon} {duration}'
	},

	// Kaia  Added
	{
		type: 'added',
		target: 'Self',
		abnormalities: [800300, 800302, 800303, 800304],
		message: '{icon} on'
	},

	// Mystic Shield  Added
	{
		type: 'added',
		target: 'Self',
		abnormalities: [702001],
		message: '{icon} on'
	},

	// Bahaar Laser
    {
		type: 'Added',
		target: 'PartyIncludingSelf',
		abnormalities: 90442502,
		message: '{name} has {icon}'
	},

	// Sea Stun
    {
		type: 'Added',
		target: 'PartyIncludingSelf',
		abnormalities: 30209101,
		message: '{name} has {icon}'
	},

	// Sea Fear
    {
		type: 'Added',
		target: 'PartyIncludingSelf',
		abnormalities: 30209102,
		message: '{name} has {icon}'
	},

	// Lumikan Immunity
    {
		type: 'Added',
		target: 'Self',
		abnormalities: [31040003, 32040003],
		message: '{icon} {duration}'
	},

	// Lumikan HM target
    {
		type: 'Added',
		target: 'PartyIncludingSelf',
		abnormalities: 32040007,
		message: '{icon} {name}'
	},

	// Gardan HM target
    {
		type: 'Added',
		target: 'PartyIncludingSelf',
		abnormalities: 32060024,
		message: '{icon} {name}'
	},

	// Antaroth stacks
    {
		type: 'Added',
		target: 'MyBoss',
		abnormalities: 31083063,
		message: '{icon} 1!'
	},

	// Antaroth stacks
    {
		type: 'AddedorRefreshed',
		target: 'MyBoss',
		abnormalities: 31083063,
		message: '{icon} {stacks}!'
	},

	// Antaroth stacks
    {
		type: 'Removed',
		target: 'MyBoss',
		abnormalities: 31083063,
		message: '{icon} 4!!!!!!'
	},

	// Valk buffs
    {
		type: 'Added',
		target: 'PartyIncludingSelf',
		abnormalities: 10155130,
		message: '{icon} {name}'
	},

	// Valk buffs
    {
		type: 'Added',
		target: 'PartyIncludingSelf',
		abnormalities: 10155512,
		message: '{icon} {name}'
	},

	//  Ninja buffs
    {
		type: 'Added',
		target: 'PartyIncludingSelf',
		abnormalities: 10154480,
		message: '{icon} {name}'
	},

	// Reaper shadow reaping
    {
		type: 'Added',
		target: 'PartyIncludingSelf',
		abnormalities: 10151010,
		message: '{icon} {name}'
	},

	// Reaper assassinate
    {
		type: 'Added',
		target: 'PartyIncludingSelf',
		abnormalities: 10151192,
		message: '{icon} {name}'
	},

	// Sorc buffs
    {
		type: 'Added',
		target: 'PartyIncludingSelf',
		abnormalities: 503061,
		message: '{icon} {name}'
	},

	// Warrior buffs
    {
		type: 'Added',
		target: 'PartyIncludingSelf',
		abnormalities: 100801,
		message: '{icon} {name}'
	},

	// Gunner buffs
    {
		type: 'Added',
		target: 'PartyIncludingSelf',
		abnormalities: 10152340,
		message: '{icon} {name}'
	},

	// Archer buffs
    {
		type: 'Added',
		target: 'PartyIncludingSelf',
		abnormalities: 602221,
		message: '{icon} {name}'
	},

	// Slayer buffs
    {
		type: 'Added',
		target: 'PartyIncludingSelf',
		abnormalities: 300808,
		message: '{icon} {name}'
	},

	// Zerk buffs
    {
		type: 'Added',
		target: 'PartyIncludingSelf',
		abnormalities: 401705,
		message: '{icon} {name}'
	},

]
