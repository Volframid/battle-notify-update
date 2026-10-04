'use strict';

// Card proc IDs observed in the log and the local data share this data-center family.
// A missing cooldown description is unknown; never substitute a universal 180s.
function discoverCard(id, data, config) {
  if (!config?.enabled || !Number.isInteger(id) || id < config.minId || id >= config.maxIdExclusive) return null;
  const text = String(data?.tooltip || '').replace(/<[^>]*>/g, ' ');
  const match = text.match(/\bcooldown\s*:?\s*(\d+(?:\.\d+)?)\s*(minutes?|mins?\.?|seconds?|secs?\.?|s\b)/i);
  const seconds = match ? Number(match[1]) * (/^m/i.test(match[2]) ? 60 : 1) : null;
  const known = Number.isFinite(seconds) && seconds > 0 && seconds <= 86400;
  const name = typeof data?.name === 'string' ? data.name.replace(/<[^>]*>/g, '').trim() : '';
  // Named card effects without a documented cooldown still deserve proc alerts.
  // Unnamed helper abnormalities need an explicit cooldown to be identified.
  if (!name && !known) return null;
  return { key: `card-${id}`, name: name || `Card effect ${id}`, abnormalityIds: [id],
    cooldownSeconds: known ? seconds : null, cooldownSource: known ? 'client-tooltip' : 'unknown' };
}

function cardLabel(effect) {
  const clean = text => String(text || '').replace(/<[^>]*>/g, '').replace(/[<>{}]/g, '').trim();
  if (effect.displayName) return clean(effect.displayName).slice(0, 40);
  return clean(effect.name)
    .replace(/^Increased\s+/i, '')
    .replace(/^(?:Magic and Physical|Physical and Magic)\s+/i, '')
    .replace(/\s+Increase$/i, '')
    .replace(/^Combat Movement Speed$/i, 'Combat Speed')
    .slice(0, 40) || 'Card effect';
}

module.exports = { discoverCard, cardLabel };
