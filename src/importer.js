'use strict';
// Parses a price list pasted as text (or loaded from a .csv/.txt file) into rows.
//
// Supported inputs:
//  * table with a header row (any order of columns), delimiter: tab ; , |
//  * table without header: Название ; ... ; Цена ; Количество
//    (the last two columns are price and quantity, the first ones are
//     name, form, dosage, pack, manufacturer, country, category, inn)
//  * free text, one product per line: "Парацетамол таб. 500мг №20 — 25.50"

const HEADER_ALIASES = {
  name: ['название', 'наименование', 'препарат', 'товар', 'name', 'product', 'title', 'торговое название'],
  inn: ['мнн', 'действующее вещество', 'inn', 'substance', 'active ingredient'],
  form: ['форма', 'форма выпуска', 'лекарственная форма', 'form'],
  dosage: ['дозировка', 'доза', 'dosage', 'dose', 'strength'],
  pack: ['упаковка', 'фасовка', 'кол-во в упаковке', 'количество в упаковке', 'pack', 'package'],
  manufacturer: ['производитель', 'изготовитель', 'manufacturer', 'brand', 'бренд', 'фирма'],
  country: ['страна', 'country'],
  category: ['категория', 'группа', 'раздел', 'category', 'group'],
  rx: ['рецепт', 'по рецепту', 'rx', 'prescription'],
  description: ['описание', 'description'],
  price: ['цена', 'стоимость', 'price', 'цена руб', 'цена, руб', 'cost'],
  quantity: ['количество', 'кол-во', 'остаток', 'наличие', 'qty', 'quantity', 'stock'],
};

const POSITIONAL = ['name', 'form', 'dosage', 'pack', 'manufacturer', 'country', 'category', 'inn'];

const FIELD_LABELS = {
  name: 'Название', inn: 'МНН', form: 'Форма', dosage: 'Дозировка', pack: 'Упаковка', manufacturer: 'Производитель',
  country: 'Страна', category: 'Категория', rx: 'Рецепт', description: 'Описание', price: 'Цена', quantity: 'Количество',
};

const FORM_WORDS = [
  [/^(?:таб(?:л(?:етки|етка)?)?\.?)(?:\s*п\/?о)?$/i, 'таблетки'],
  [/^(?:капс(?:улы|ула)?\.?)$/i, 'капсулы'],
  [/^(?:р-р|раствор)$/i, 'раствор'],
  [/^(?:амп(?:улы)?\.?)$/i, 'ампулы'],
  [/^(?:супп(?:озитории)?\.?|свечи)$/i, 'суппозитории'],
  [/^(?:пор(?:ошок)?\.?)$/i, 'порошок'],
  [/^(?:сироп|мазь|крем|гель|спрей|капли|аэрозоль|суспензия|гранулы|пастилки|леденцы|пластырь|драже|шампунь|лосьон)$/i, null],
];

function headerField(cell) {
  const c = cell.toLowerCase().replace(/ё/g, 'е').replace(/[*:]/g, '').replace(/\s+/g, ' ').trim();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(c)) return field;
  }
  return null;
}

function detectDelimiter(lines) {
  const sample = lines.slice(0, 20);
  for (const d of ['\t', ';', '|']) {
    if (sample.filter((l) => l.includes(d)).length >= Math.ceil(sample.length / 2)) return d;
  }
  // commas are also decimal separators, require them on most lines and consistent count
  const counts = sample.map((l) => splitLine(l, ',').length);
  if (counts.length && counts.every((c) => c === counts[0] && c >= 3)) return ',';
  return null;
}

function splitLine(line, delim) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"' && cur.trim() === '') {
      quoted = true;
      cur = '';
    } else if (ch === delim) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function parsePrice(v) {
  if (v === undefined || v === null) return NaN;
  const s = String(v)
    .replace(/(руб\.?|р\.|₽|tmt|ман\.?|сом|тг|₸|грн|\$|€|usd|eur)/gi, '')
    .replace(/[\s ]/g, '')
    .replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
  return Math.round(parseFloat(s) * 100) / 100;
}

function parseQuantity(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return null;
  if (['нет', 'no', 'отсутствует', '-'].includes(s)) return 0;
  const m = s.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// Pulls form / dosage / pack out of a product name like "Нурофен таб. п/о 200мг №10".
function splitName(fullName) {
  let name = ` ${fullName} `;
  const res = { form: '', dosage: '', pack: '' };

  const pack = name.match(/\s(?:№|N|No\.?)\s*(\d+)\s|\s(\d+)\s*шт\.?\s/i);
  if (pack) {
    res.pack = `№${pack[1] || pack[2]}`;
    name = name.replace(pack[0], ' ');
  }
  const dosage = name.match(/\s(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)?\s*(?:мг|г|мкг|мл|л|ме|ед|%|mg|g|ml|mcg|iu)(?:\/(?:мл|доза|г))?\.?)(?=\s)/i);
  if (dosage) {
    res.dosage = dosage[1].replace(/\s+/g, ' ').trim();
    name = name.replace(dosage[1], ' ');
  }
  const words = name.trim().split(/\s+/);
  for (let i = 1; i < words.length; i++) {
    // "п/о", "шип." etc. glued to tablets
    for (const [re, canon] of FORM_WORDS) {
      const w = words[i].replace(/,$/, '');
      if (re.test(w)) {
        res.form = canon || w.toLowerCase();
        words.splice(i, 1);
        if (/^п\/?о$/i.test(words[i] || '')) words.splice(i, 1);
        i = words.length;
        break;
      }
    }
  }
  res.name = words.join(' ').replace(/[\s,.;:–—-]+$/, '').trim();
  return res;
}

const FREE_TEXT = /^(.*?\S)[\s\-–—:=]+(\d+(?:[.,]\d{1,2})?)\s*(?:руб\.?|р\.?|₽|tmt|ман\.?|сом|тг|₸|грн)?\s*(?:[,;/]?\s*(?:остаток|наличие|кол-во)?:?\s*(\d+)\s*(?:шт\.?|уп\.?))?\s*$/i;

function parseImport(text) {
  const lines = String(text || '')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((l, i) => ({ text: l, line: i + 1 }))
    .filter((l) => l.text.trim() && !l.text.trim().startsWith('#'));

  const result = { delimiter: null, columns: null, mode: 'free', rows: [] };
  if (!lines.length) return result;

  const delim = detectDelimiter(lines.map((l) => l.text));
  result.delimiter = delim;

  let columns = null;
  let dataLines = lines;
  if (delim) {
    const firstCells = splitLine(lines[0].text, delim);
    const mapped = firstCells.map(headerField);
    if (mapped.includes('name') && mapped.filter(Boolean).length >= 2) {
      columns = mapped;
      dataLines = lines.slice(1);
      result.mode = 'header';
    } else {
      result.mode = 'positional';
    }
  }
  result.columns = columns;

  for (const l of dataLines) {
    const row = { line: l.line, raw: l.text, drug: {}, price: NaN, quantity: null, error: null };
    if (delim) {
      const cells = splitLine(l.text, delim);
      if (columns) {
        columns.forEach((field, i) => {
          if (!field || cells[i] === undefined) return;
          if (field === 'price') row.price = parsePrice(cells[i]);
          else if (field === 'quantity') row.quantity = parseQuantity(cells[i]);
          else row.drug[field] = cells[i];
        });
      } else if (cells.length === 2) {
        row.drug.name = cells[0];
        row.price = parsePrice(cells[1]);
      } else {
        const desc = cells.slice(0, -2);
        desc.forEach((v, i) => { if (POSITIONAL[i]) row.drug[POSITIONAL[i]] = v; });
        row.price = parsePrice(cells[cells.length - 2]);
        row.quantity = parseQuantity(cells[cells.length - 1]);
      }
    } else {
      const m = l.text.trim().match(FREE_TEXT);
      if (m) {
        row.drug.name = m[1];
        row.price = parsePrice(m[2]);
        row.quantity = m[3] ? parseInt(m[3], 10) : null;
      } else {
        row.drug.name = l.text.trim();
      }
    }

    row.drug.name = String(row.drug.name || '').trim();
    if (row.drug.name && !row.drug.form && !row.drug.dosage && !row.drug.pack) {
      const s = splitName(row.drug.name);
      if (s.name) Object.assign(row.drug, s);
    }

    if (!row.drug.name) row.error = 'Нет названия';
    else if (Number.isNaN(row.price)) row.error = 'Не удалось распознать цену';
    result.rows.push(row);
  }
  return result;
}

module.exports = { parseImport, splitName, parsePrice, parseQuantity, FIELD_LABELS, HEADER_ALIASES };
