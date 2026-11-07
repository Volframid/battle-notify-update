module.exports = [
	// Focus
	{
		type: 'MissingDuringCombat',
		target: 'Self',
		abnormalities: 10154030,
		message: 'Missing Focus',
		rewarn_timeout: 10
	},

	// Double Cut Reset
	{
		type: 'Reset',
		skills: 140100,
		message: '{icon} Reset'
	},
    // Final three seconds of the actual active buffs; refresh cancels the row.
    { type: 'Countdown', target: 'Self', abnormalities: 89314220,
      countdownStart: 3, message: '{icon} Double Cut Power EP {duration}' },
    { type: 'Countdown', target: 'Self', abnormalities: 32058,
      countdownStart: 3, message: '{icon} Glyph of Blaze {duration}' },
    { type: 'Countdown', target: 'Self', abnormalities: 10154450,
      countdownStart: 3, message: '{icon} Cyclic Chi {duration}' },
]
