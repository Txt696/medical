'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseImport, splitName, parsePrice } = require('../src/importer');

test('table with header, any column order', () => {
  const r = parseImport('Цена;Наименование;Дозировка;Остаток\n120,50;Амоксициллин;500 мг;7\n"1 200";"Ибупрофен; форте";400мг;нет');
  assert.equal(r.mode, 'header');
  assert.deepEqual(r.rows.map((x) => [x.drug.name, x.drug.dosage, x.price, x.quantity]), [
    ['Амоксициллин', '500 мг', 120.5, 7],
    ['Ибупрофен; форте', '400мг', 1200, 0],
  ]);
});

test('tab separated from Excel without header', () => {
  const r = parseImport('Но-шпа\tтаблетки\t40 мг\t№24\tSanofi\t210\t5');
  assert.equal(r.mode, 'positional');
  assert.deepEqual(r.rows[0].drug, { name: 'Но-шпа', form: 'таблетки', dosage: '40 мг', pack: '№24', manufacturer: 'Sanofi' });
  assert.equal(r.rows[0].price, 210);
  assert.equal(r.rows[0].quantity, 5);
});

test('free text lines', () => {
  const r = parseImport('Парацетамол таб. 500мг №20 — 25.50\nНурофен таб. п/о 200 мг №10 145 руб 12 шт\n# комментарий\nАспирин 100 25.50\nБез цены');
  assert.equal(r.rows.length, 4);
  assert.deepEqual(r.rows[0].drug, { name: 'Парацетамол', form: 'таблетки', dosage: '500мг', pack: '№20' });
  assert.equal(r.rows[0].price, 25.5);
  assert.equal(r.rows[1].quantity, 12);
  assert.equal(r.rows[2].drug.name, 'Аспирин 100');
  assert.ok(r.rows[3].error);
});

test('helpers', () => {
  assert.equal(parsePrice('1 234,5 руб.'), 1234.5);
  assert.ok(Number.isNaN(parsePrice('abc')));
  assert.deepEqual(splitName('Називин спрей 0,05% 10 шт'), { form: 'спрей', dosage: '0,05%', pack: '№10', name: 'Називин' });
});
