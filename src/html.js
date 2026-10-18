'use strict';
// Tiny HTML templating: html`...` escapes every interpolated value unless it is
// itself the result of html`` (or raw()). Arrays are joined.

class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

const raw = (s) => new Raw(String(s));

function escape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function render(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  return escape(v);
}

function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => { out += render(v) + strings[i + 1]; });
  return new Raw(out);
}

module.exports = { html, raw, escape, Raw };
