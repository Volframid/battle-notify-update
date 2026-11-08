# Battle Notify

Buff, cooldown and combat notifications for TERA Toolbox. Based on Battle Notify by Caali / wuaw; extended by CEM.

## Runtime efficiency

Departed NPCs and non-party players release their entity, abnormality and notification history records. Out-of-range party members retain their buff state until leaving the party, and map changes clear tracking histories. Missing-buff checks do not populate world caches. Boss despawn still cancels its active countdown before releasing its target.

## Installation

Download the installation ZIP from [Releases](https://github.com/Volframid/battle-notify-update/releases/latest) and extract the `battle-notify-update` folder. If using GitHub's source ZIP, rename the extracted folder to `battle-notify-update`. Place that folder in Toolbox's `mods` directory and restart Toolbox. Install only one copy. No additional mod or external skill data is required. Use graphical Toolbox on Windows 10/11.

## Automatic updates

Automatic updates are enabled. Toolbox checks this repository's `main` branch at startup and downloads changed code using the SHA-256 hashes in `manifest.json`. Restart Toolbox to load an update; updates are not applied during a fight. Updates follow the latest code on `main`; a new Release is not required.

The update includes the settings UI, icons, and both precompiled 32-bit/64-bit in-game renderers. Toolbox downloads and checks them automatically; there is no separate installer, compiler or paid overlay dependency. Fully exit TERA and restart Toolbox after updating so the linked game uses the new renderer.

Existing user configuration is kept: `config/`, `card-effects.json` and `lotus.json`. Missing default files are installed. Logs, character state and Toolbox's local settings are never downloaded or overwritten. New configuration defaults are available in the repository; existing settings are not reset.

Recognized older notification rules are upgraded in memory so new defaults and corrections also work with preserved configuration files. Custom labels and unrelated rules are retained.

If upgrading from an older ZIP without an update address, install the current package once, or replace `module.json` and restart Toolbox. Also enable this mod's updates in Toolbox if a local `module.config.json` previously disabled them. Toolbox's global mod updates must be enabled.

For maintainers: every push to `main` runs the GitHub workflow to regenerate and commit the manifest. Wait for the workflow to succeed before announcing an update. Run `node scripts/build-manifest.cjs` before preparing an installation ZIP.

## Features

- Icon notifications for configured buffs, debuffs, skill/item cooldowns, resets and boss/party events.
- **Movable notification area:** drag and lock an independent overlay, with saved position, width, text/icon sizes, background opacity, duration and row limit.
- **Cards:** proc alerts and one cooldown warning at each 30-second milestone. All card effects use one live countdown in the final 10 seconds. Outside-combat summaries and configured Ready notifications are retained.
- **Brooch:** one live 5-to-1 countdown for the equipped brooch's recharge, including Shadow Rest, ending with Ready.
- **Lotus:** independent Moon/Star blessing countdowns from 5 to 1, ending with Ended in the same notification, with protection against false expiry alerts during map changes.
- **Buff expiry counters:** supported rules update one notification as the effect expires. Refreshing the buff above the countdown threshold or removing it clears the counter. Boss counters also clear on leaving combat, death, despawn or a boss HP reset; cached effects from an earlier pull do not restart them.
- **Named alerts:** icons, labels and remaining duration follow the configured notification rule.
- **One diagnostic log:** all notification components record through `battle log`.

The module displays notifications; it does not cast skills or use items.

## Notification examples

These are captures of the actual notification renderer with controlled sample events, not live combat screenshots. Timers update the same row; ordinary duration labels are snapshots. The background opacity remains adjustable; the notification frame and drag-preview outline are transparent.

![Live Lotus, card and Line Held countdown examples](docs/screenshots/live-countdowns.png)

![Named buffs and brooch countdown](docs/screenshots/buff-brooch-notifications.png)

![Lotus Ended and brooch Ready](docs/screenshots/countdown-completion.png)

The boxed **Drag to position** handle and **Lock position** control are aligned. Drag the left handle to move the preview; use the right button to lock it.

![Aligned position controls](docs/screenshots/position-controls.png)

## Commands

| Command | Action |
|---|---|
| `battle` | Show notification/logging status |
| `battle ui` | Open notification placement and appearance settings |
| `battle overlay move` / `battle overlay lock` | Unlock the preview for dragging / lock it |
| `battle overlay on` / `battle overlay off` | Use the movable area / return to native game alerts |
| `battle overlay test` | Display a test notification |
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

## Move your notifications

In game, type `/8 battle ui`. Choose **Move & preview**, drag the preview by its header, then select **Lock position**. Locked notifications pass mouse clicks through to the game and do not request keyboard focus. Closing settings also locks the preview. Use **Test notification** to check the result.

Only the unlocked preview accepts pointer input. Locked notifications do not forward hover events to the display or retain draggable caption regions; new alerts keep the same noninteractive state.

The settings window controls width, text and icon size, background opacity, display time and the maximum number of visible notifications. Sliders and numeric fields are both available. X/Y coordinates can also be entered directly. Changes save automatically in the private `data/overlay.json` file. Live countdowns remain until completion or cancellation; display time applies to ordinary alerts and the final Ended/Ready message. The row limit still applies, and updating a hidden timer does not move it ahead of newer notifications. A smaller display may show fewer rows to keep whole notifications visible; placement is kept within an available monitor after display changes. **Reset defaults** restores the initial placement and appearance.

The overlay is independent of Modern Meter and uses graphical Toolbox. Its in-game renderer supports Direct3D 9/11 in windowed, borderless and exclusive fullscreen modes. The same notification content and position settings are used across modes. Controlled graphics tests cover both client architectures; compatibility with a particular game build and other overlays still needs live verification. In exclusive fullscreen, opening the desktop settings panel can switch away from the game. Set appearance there, return to the game, then use `/8 battle overlay move` to drag the preview inside the game and click its **Lock position** header button. Turning off movable notifications restores the original game alerts. If the overlay is unavailable or still starting, alerts use the native route once, without replaying duplicates when the overlay becomes ready. Ordinary chat and notice channels retain their existing behavior. Notification timers follow observed buff and cooldown deadlines; they do not change gameplay or skill timing.

Game icons are bundled for the notification display: 139,968 buff, item and skill ID mappings with 10,443 distinct PNGs. Compressed texture packs load on demand with a bounded cache. The index is based on the Asura metadata extraction dated 2026-10-28; blank source icons, three unavailable source textures and future unknown IDs retain a neutral marker and the notification text. Native alerts continue to use the game's own icons. See [icon coverage and attribution](ui/ICONS.md).

## Settings

| File | Purpose |
|---|---|
| `config/common.js` | Shared notification rules |
| `config/<class>.js` | Skill and buff rules for all 13 classes |
| `config/common_styling.js` | Default channels and colors |
| `card-effects.json` | Card discovery, labels and cooldown warnings |
| `lotus.json` | Lotus IDs and expiry warnings |

Use existing event rules as templates. For messages, `{alert}` selects the screen notification, `{chat}` selects chat, and color tags such as `{yellow}` change the text color. `{icon}`, `{duration}`, `{stacks}` and `{name}` insert the available event information. Skill rules belong in the matching class file because skill IDs can overlap between classes.

**Card settings:** Every configured or automatically discovered card effect counts down during its final 10 seconds. Earlier 30-second milestone alerts remain in or out of combat. Changing a name or display label does not alter timing. Old `warningTimes` and `outOfCombat.milestoneTimes` fields no longer determine the cadence. `displayName` provides a short label. Automatic discovery covers the configured card effect ID range, not just the two included overrides. Cooldowns come from verified settings or client tooltip data; undocumented or unobserved cooldowns remain unknown. Ready means cooldown expiry, not a guaranteed proc. `notifyReady` and `outOfCombat.notifyReady` retain control of Ready: by default, the counter disappears at zero during combat and Ready is announced once outside combat.

**Lotus settings:** countdowns are fixed at the final 5 seconds; the older `warningTimes` field no longer determines the cadence. `notifyEnded` controls the final alert. Real speed blessings determine the timers, rather than cosmetic auras or short skill reuse. The supplied Moon/Star IDs match the observed server variant; adjust them for servers with different IDs.

Live countdowns require the movable notification renderer. If it is disabled or unavailable, native game alerts show the first counter value and the permitted final message only, avoiding a new native popup every second. Native game alerts cannot edit a previously displayed row.

Use the respective reload command after changing card/Lotus JSON settings. JavaScript changes require restarting Toolbox. Native game alerts keep the game-controlled placement; the movable area has its own settings described above.

## Sharing

Publish the source, configuration and this README. Exclude `logs/`, private `data/`, `LOCAL_UPDATES.md` and Toolbox's local `module.config.json`; `.gitignore` already covers them. The shared ZIP contains no personal logs or local control settings. Build it with `python scripts/package.py <output.zip>` after regenerating the manifest; packaging uses only the explicit manifest list. Native renderer source/build instructions and notices are in [native/README.md](native/README.md).
