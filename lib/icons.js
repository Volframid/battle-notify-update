'use strict';

// Use the same client image sources and size as existing Battle Notify icons.
const valid = id => Number.isInteger(id) && id > 0;
const image = source => `<img src='img://${source}' width='48' height='48' vspace='-7' />`;
const abnormality = id => valid(id) ? image(`abonormality__${id}`) : '';
const item = id => valid(id) ? image(`item__${id}`) : '';
function withIcon(message, icon = '') {
  message = message.replace(/\{icon\}/gi, icon);
  return icon && !/<img\b/i.test(message) ? `${icon} ${message}` : message;
}
module.exports = { abnormality, item, withIcon };
