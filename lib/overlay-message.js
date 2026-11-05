'use strict';
// Game markup is parsed into plain text runs. It is never executed as browser HTML.
function parse(message) {
  const runs = [], text = String(message).slice(0, 8192);
  let color = '#ffffff', icon = null;
  for (const part of text.split(/(<[^>]*>)/g)) {
    if (part[0] !== '<') {
      const value = part.replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, n) => ({ amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:' ' })[n]);
      if (value) runs.push({ text: value, color });
    } else if (/^<font\b/i.test(part)) {
      const match = part.match(/\bcolor\s*=\s*['"]?(#[0-9a-f]{6})\b/i);
      if (match) color = match[1];
    } else if (/^<br\s*\/?\s*>$/i.test(part)) runs.push({ text: '\n', color });
    else if (!icon && /^<img\b/i.test(part)) {
      const match = part.match(/\bsrc\s*=\s*['"]img:\/\/(abonormality__\d+|item__\d+|skill__\d+__\d+__\d+)['"]/i);
      if (match) icon = match[1].toLowerCase();
    }
  }
  return { runs, icon };
}
module.exports = { parse };
