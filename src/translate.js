'use strict';
// Free offline translation of site texts between tk / ru / en using a dictionary
// (built-in src/dictionary.js + entries saved by the administrator in the database).
//
// 1. The whole text is in the dictionary → its human translation (exact: true).
// 2. Otherwise each sentence is looked up; unknown sentences are built phrase by phrase
//    from the longest known phrases, unknown words stay as they are (exact: false —
//    a draft the administrator should check and correct; the corrected version is
//    remembered, so next time the translation is exact).

const { db } = require('./db');
const BUILTIN = require('./dictionary');

const LANG_CODES = ['tk', 'ru', 'en'];
const MAX_PHRASE_WORDS = 12;

const variants = (v) => (Array.isArray(v) ? v : [v]).map((s) => String(s ?? '').trim()).filter(Boolean);

// Comparison key: case, «ё», quotes, extra spaces and final punctuation do not matter
function key(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"“”„'’]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s.!?;:,]+$/, '')
    .trim();
}

function userEntries() {
  return db.prepare('SELECT id, tk, ru, en FROM dictionary ORDER BY id').all();
}

// Map per language: key(text) → entry. Database entries win over built-in ones.
function buildIndex() {
  const index = Object.fromEntries(LANG_CODES.map((l) => [l, new Map()]));
  const add = (entry) => {
    for (const l of LANG_CODES) for (const v of variants(entry[l])) index[l].set(key(v), entry);
  };
  BUILTIN.forEach(add);
  userEntries().forEach(add);
  return index;
}

const first = (entry, lang) => variants(entry[lang])[0] || '';

function matchCase(source, out) {
  if (!out) return out;
  const s = source.trim()[0];
  if (s && s !== s.toLowerCase() && out[0] === out[0].toLowerCase()) return out[0].toUpperCase() + out.slice(1);
  return out;
}

function trailingPunct(s) {
  return (String(s).match(/[.!?…]+\s*$/) || [''])[0].trim();
}

// Build a draft from known phrases (longest match first)
function phraseByPhrase(text, from, to, index) {
  // words (a dot only inside numbers: 12.50) and the separators between them
  const parts = text.match(/[\p{L}\p{N}](?:[\p{L}\p{N}'’-]|\.(?=\p{N}))*|[^\p{L}\p{N}]+/gu) || [];
  const out = [];
  for (let i = 0; i < parts.length; ) {
    let hit = null;
    if (/[\p{L}\p{N}]/u.test(parts[i][0])) {
      // try phrases of n words: parts i, i+2, i+4… (separators in between), longest first
      for (let n = MAX_PHRASE_WORDS; n >= 1 && !hit; n--) {
        const end = i + (n - 1) * 2;
        if (end >= parts.length) continue;
        const entry = index[from].get(key(parts.slice(i, end + 1).join('')));
        if (entry && first(entry, to)) hit = { tr: first(entry, to), end };
      }
    }
    // unknown words, numbers and punctuation stay as they are
    out.push(hit ? hit.tr : parts[i]);
    i = hit ? hit.end + 1 : i + 1;
  }
  return out.join('');
}

function translateText(text, from, to, index = buildIndex()) {
  const src = String(text ?? '').trim();
  if (!src || from === to) return { text: src, exact: true };

  const whole = index[from].get(key(src));
  if (whole && first(whole, to)) return { text: first(whole, to) + trailingPunct(src), exact: true };

  // sentence by sentence
  const sentences = src.split(/(?<=[.!?…])\s+/);
  let exact = true;
  const out = sentences.map((s) => {
    const e = index[from].get(key(s));
    if (e && first(e, to)) return matchCase(s, first(e, to)) + trailingPunct(s);
    exact = false;
    return matchCase(s, phraseByPhrase(s, from, to, index));
  });
  return { text: out.join(' '), exact };
}

// Translate one text into all other languages
function translateAll(text, from) {
  const index = buildIndex();
  const result = {};
  for (const l of LANG_CODES) if (l !== from) result[l] = translateText(text, from, l, index);
  return result;
}

// Remember a set of translations (all three languages filled in).
// An existing entry with the same text in any language is replaced.
function remember(texts) {
  const clean = Object.fromEntries(LANG_CODES.map((l) => [l, String(texts[l] ?? '').trim().slice(0, 1000)]));
  if (LANG_CODES.some((l) => !clean[l])) return false;
  const builtinSame = BUILTIN.some((e) => LANG_CODES.every((l) => key(first(e, l)) === key(clean[l])));
  const old = userEntries().filter((e) => LANG_CODES.some((l) => key(e[l]) === key(clean[l])));
  for (const e of old) db.prepare('DELETE FROM dictionary WHERE id = ?').run(e.id);
  if (builtinSame) return true; // already known exactly, nothing to store
  db.prepare("INSERT INTO dictionary (tk, ru, en, updated_at) VALUES (?, ?, ?, datetime('now'))").run(clean.tk, clean.ru, clean.en);
  return true;
}

module.exports = { LANG_CODES, key, translateText, translateAll, remember, userEntries, buildIndex, BUILTIN };
