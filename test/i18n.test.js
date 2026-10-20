'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { dicts, translate } = require('../src/i18n');

test('every language has the same keys', () => {
  const ru = Object.keys(dicts.ru).sort();
  for (const lang of ['tk', 'en']) {
    assert.deepEqual(Object.keys(dicts[lang]).sort(), ru, `${lang} differs from ru`);
  }
});

test('every key used in the code exists', () => {
  const files = ['src/server.js', 'src/views/layout.js', 'src/views/public.js', 'src/views/admin.js', 'src/importer.js'];
  const used = new Set();
  for (const f of files) {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    for (const m of src.matchAll(/\bt\('([\w.]+)'/g)) used.add(m[1]);
    for (const m of src.matchAll(/'((?:import\.err|err|flash)\.[\w.]+)'/g)) used.add(m[1]);
  }
  for (const f of ['name', 'inn', 'form', 'dosage', 'pack', 'manufacturer', 'country', 'category', 'rx', 'description', 'price', 'quantity']) used.add(`field.${f}`);
  for (const m of ['header', 'positional', 'free']) used.add(`preview.mode_${m}`);
  const missing = [...used].filter((k) => !(k in dicts.ru));
  assert.deepEqual(missing, []);
});

test('plurals and parameters', () => {
  assert.equal(translate('ru', 'n.pharmacies', { n: 1 }), '1 аптека');
  assert.equal(translate('ru', 'n.pharmacies', { n: 3 }), '3 аптеки');
  assert.equal(translate('ru', 'n.pharmacies', { n: 5 }), '5 аптек');
  assert.equal(translate('en', 'n.pharmacies', { n: 1 }), '1 pharmacy');
  assert.equal(translate('en', 'n.pharmacies', { n: 2 }), '2 pharmacies');
  assert.equal(translate('tk', 'n.pharmacies', { n: 5 }), '5 dermanhana');
});
