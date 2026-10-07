# Battle Notify

Standalone TERA Toolbox notifications for all 13 classes. Based on Battle Notify by Caali / wuaw; extended by CEM.

## Installation

Download the installation ZIP from [Releases](https://github.com/Volframid/battle-notify-update/releases/latest) and extract the `battle-notify-update` folder. If using GitHub's source ZIP, rename the extracted folder to `battle-notify-update`. Place that folder in Toolbox's `mods` directory and restart Toolbox. Install only one copy. No additional mod or external skill data is required.

## Automatic updates

Automatic updates are enabled. Toolbox checks this repository's `main` branch at startup and downloads changed code using the SHA-256 hashes in `manifest.json`. Restart Toolbox to load an update; updates are not applied during a fight. Updates follow the latest code on `main`; a new Release is not required.

Existing user configuration is kept: `config/`, `card-effects.json` and `lotus.json`. Missing default files are installed. Logs, character state and Toolbox's local settings are never downloaded or overwritten. New configuration defaults are available in the repository; existing settings are not reset.

If upgrading from an older ZIP without an update address, install the current package once, or replace `module.json` and restart Toolbox. Also enable this mod's updates in Toolbox if a local `module.config.json` previously disabled them. Toolbox's global mod updates must be enabled.

For maintainers: every push to `main` runs the GitHub workflow to regenerate and commit the manifest. Wait for the workflow to succeed before announcing an update. Run `node scripts/build-manifest.cjs` before preparing an installation ZIP.

## Features

- Icon notifications for configured buffs, debuffs, skill/item cooldowns, resets and boss/party events.
- **Cards:** proc alerts and cooldown warnings at 5 and 3 seconds. Outside combat, remaining cooldowns appear on combat exit and at 2:00, 1:30, 1:00 and 30 seconds, followed by Ready.
- **Brooch:** warnings during the last 5 seconds of the equipped brooch's recharge, including Shadow Rest.
- **Lotus:** Moon/Star blessing warnings at 5, 3 and Ended, with protection against false expiry alerts during map changes.
- **One diagnostic log:** all notification components record through `battle log`.

The module displays notifications; it does not cast skills or use items. Cards, brooch and Lotus monitoring work on every class.

## Commands

| Command | Action |
|---|---|
| `battle` | Show notification/logging status |
| `battle log` | Toggle recording |
| `battle log on` / `battle log off` | Start/stop recording explicitly |
| `battle log status` | Show recording status and filename |
| `battle mark description` | Add a test marker to the active recording |
| `cards` | Show observed card cooldowns |
| `cards reload` | Reload card settings; counters restart at the next proc |
| `cards clear` | Clear observed card counters |
| `battle lotus` | Show observed Lotus blessing/recharge times |
| `battle lotus reload` | Reload Lotus settings and synchronize existing buffs |

Logging starts OFF. Each recording creates one `logs/battle-*.jsonl` file containing state snapshots, relevant packets, notifications and tracking decisions. Use `battle log` before a test and again when finished. `cards log` and `battle lotus log` direct you to `battle log`. The separate Lotus Cycle mod owns the `lotus` command.

## Settings

| File | Purpose |
|---|---|
| `config/common.js` | Shared notification rules |
| `config/<class>.js` | Rules for the corresponding class |
| `config/common_styling.js` | Default channels and colors |
| `card-effects.json` | Card discovery, labels and cooldown warnings |
| `lotus.json` | Lotus IDs and expiry warnings |

Use existing event rules as templates. For messages, `{alert}` selects the screen notification, `{chat}` selects chat, and color tags such as `{yellow}` change the text color. `{icon}`, `{duration}`, `{stacks}` and `{name}` insert the available event information. Skill rules belong in the matching class file because skill IDs can overlap between classes.

**Card settings:** `warningTimes` controls the short countdown; `outOfCombat.milestoneTimes` controls the extra outside-combat warnings. `displayName` provides a short label. Automatic discovery covers the configured card effect ID range, not just the two included overrides. Cooldowns come from verified settings or client tooltip data; undocumented or unobserved cooldowns remain unknown. Ready means cooldown expiry, not a guaranteed proc.

**Lotus settings:** `warningTimes` defaults to `[5, 3]`; `notifyEnded` controls the final alert. Real speed blessings determine the timers, rather than cosmetic auras or short skill reuse. The supplied Moon/Star IDs match the observed server variant; adjust them for servers with different IDs.

Use the respective reload command after changing card/Lotus JSON settings. JavaScript changes require restarting Toolbox. Notification position is controlled by the game; native icons are preserved.

## Sharing

Publish the source, configuration and this README. Exclude `logs/` and Toolbox's local `module.config.json`; `.gitignore` already covers them. The shared ZIP contains no personal logs or local control settings.
