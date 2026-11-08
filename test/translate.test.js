'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'apteka-tr-')), 'test.db');
const { translateText, translateAll, remember, userEntries } = require('../src/translate');
const BUILTIN = require('../src/dictionary');

test('built-in dictionary: every entry has all three languages', () => {
  for (const e of BUILTIN) for (const l of ['tk', 'ru', 'en']) assert.ok([].concat(e[l])[0], `${JSON.stringify(e)} has no ${l}`);
});

test('a known sentence is translated exactly, ignoring case, quotes and final dot', () => {
  const r = translateAll('сравните цены на лекарства во всех аптеках города Ашхабад, города Аркадаг и других велаятов.', 'ru');
  assert.equal(r.en.exact, true);
  assert.equal(r.en.text, 'Compare medicine prices across all pharmacies in Ashgabat, Arkadag and other velayats.');
  assert.match(r.tk.text, /^Aşgabat şäheriniň/);
  assert.equal(translateText('Melhem', 'tk', 'ru').text, 'Мелхем');
});

test('an unknown sentence becomes a draft built from known phrases', () => {
  const r = translateText('Аптеки Ашхабада и Мары', 'ru', 'en');
  assert.equal(r.exact, false);
  assert.equal(r.text, 'Pharmacies Ashgabat and Mary');
});

test('a corrected translation is remembered and replaces the old one', () => {
  remember({ ru: 'Лекарства с доставкой', tk: 'Eltip bermek bilen', en: 'Medicines delivered' });
  remember({ ru: 'Лекарства с доставкой', tk: 'Dermanlar öýüňize eltip berilýär', en: 'Medicines delivered to your door' });
  assert.equal(userEntries().length, 1);
  assert.deepEqual(translateText('лекарства с доставкой', 'ru', 'tk'), { text: 'Dermanlar öýüňize eltip berilýär', exact: true });
  assert.equal(translateText('Medicines delivered to your door', 'en', 'ru').text, 'Лекарства с доставкой');
});
