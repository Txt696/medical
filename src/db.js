'use strict';
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'pharmacy.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pharmacies (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  city        TEXT NOT NULL DEFAULT '',
  address     TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL DEFAULT '',
  hours       TEXT NOT NULL DEFAULT '',
  website     TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  login         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'pharmacy')),
  pharmacy_id   INTEGER REFERENCES pharmacies(id) ON DELETE CASCADE,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS drugs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  inn          TEXT NOT NULL DEFAULT '',
  form         TEXT NOT NULL DEFAULT '',
  dosage       TEXT NOT NULL DEFAULT '',
  pack         TEXT NOT NULL DEFAULT '',
  manufacturer TEXT NOT NULL DEFAULT '',
  country      TEXT NOT NULL DEFAULT '',
  category     TEXT NOT NULL DEFAULT '',
  rx           INTEGER NOT NULL DEFAULT 0,
  description  TEXT NOT NULL DEFAULT '',
  norm_key     TEXT NOT NULL UNIQUE,
  search       TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS offers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  pharmacy_id INTEGER NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  drug_id     INTEGER NOT NULL REFERENCES drugs(id) ON DELETE CASCADE,
  price       REAL NOT NULL CHECK (price >= 0),
  quantity    INTEGER,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (pharmacy_id, drug_id)
);

CREATE INDEX IF NOT EXISTS idx_offers_drug ON offers(drug_id);
CREATE INDEX IF NOT EXISTS idx_drugs_category ON drugs(category);
`);

const DEFAULT_SETTINGS = {
  site_name: 'АптекаСправка',
  site_tagline: 'Сравните цены на лекарства во всех аптеках города',
  currency: 'руб.',
};

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const s = { ...DEFAULT_SETTINGS };
  for (const r of rows) s[r.key] = r.value;
  return s;
}

function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value));
}

// ---------- normalisation helpers ----------

function norm(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/,/g, '.')
    .replace(/[«»"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// "500мг" and "500 мг" should match; "№20", "N20", "20 шт" too.
function normUnits(s) {
  return norm(s)
    .replace(/(\d)\s+(?=[a-zа-я%])/g, '$1')
    .replace(/^(?:№|n|no\.?)\s*/, '')
    .replace(/\s*(?:шт\.?|штук)$/, '');
}

function drugKey(d) {
  return [norm(d.name), norm(d.form), normUnits(d.dosage), normUnits(d.pack)].join('|');
}

function drugSearch(d) {
  return norm([d.name, d.inn, d.manufacturer, d.category, d.form, d.dosage].join(' '));
}

const DRUG_FIELDS = ['name', 'inn', 'form', 'dosage', 'pack', 'manufacturer', 'country', 'category', 'rx', 'description'];

function cleanDrug(input) {
  const d = {};
  for (const f of DRUG_FIELDS) {
    if (f === 'rx') d.rx = input.rx === true || ['1', 'on', 'true', 'да', 'yes', 'rx', 'рецепт', '+'].includes(norm(input.rx)) ? 1 : 0;
    else if (f === 'description') d[f] = String(input[f] ?? '').trim();
    else d[f] = String(input[f] ?? '').trim().replace(/\s+/g, ' ');
  }
  return d;
}

function findDrugByKey(d) {
  return db.prepare('SELECT * FROM drugs WHERE norm_key = ?').get(drugKey(d));
}

// Returns existing drug if the same name/form/dosage/pack already exists,
// otherwise creates a new card.
function findOrCreateDrug(input) {
  const d = cleanDrug(input);
  if (!d.name) throw new Error('Не указано название препарата');
  const existing = findDrugByKey(d);
  if (existing) {
    // fill empty fields of the existing card with new data
    const patch = {};
    for (const f of ['inn', 'manufacturer', 'country', 'category', 'description']) {
      if (!existing[f] && d[f]) patch[f] = d[f];
    }
    if (Object.keys(patch).length) updateDrug(existing.id, { ...existing, ...patch });
    return { drug: { ...existing, ...patch }, created: false };
  }
  const info = db.prepare(`
    INSERT INTO drugs (name, inn, form, dosage, pack, manufacturer, country, category, rx, description, norm_key, search)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(d.name, d.inn, d.form, d.dosage, d.pack, d.manufacturer, d.country, d.category, d.rx, d.description, drugKey(d), drugSearch(d));
  return { drug: getDrug(info.lastInsertRowid), created: true };
}

function updateDrug(id, input) {
  const d = cleanDrug(input);
  if (!d.name) throw new Error('Не указано название препарата');
  const clash = db.prepare('SELECT id FROM drugs WHERE norm_key = ? AND id <> ?').get(drugKey(d), id);
  if (clash) throw new Error(`Такой препарат уже есть в каталоге (#${clash.id})`);
  db.prepare(`
    UPDATE drugs SET name=?, inn=?, form=?, dosage=?, pack=?, manufacturer=?, country=?, category=?, rx=?, description=?, norm_key=?, search=?
    WHERE id = ?`)
    .run(d.name, d.inn, d.form, d.dosage, d.pack, d.manufacturer, d.country, d.category, d.rx, d.description, drugKey(d), drugSearch(d), id);
}

function getDrug(id) {
  return db.prepare('SELECT * FROM drugs WHERE id = ?').get(id);
}

// stock: 'set'     — quantity is written as is (empty = "в наличии" without a number);
//        'replace' — quantity from the import replaces the current one, empty keeps it;
//        'add'     — quantity from the import is added to the current one, empty keeps it.
const STOCK_SQL = {
  set: 'excluded.quantity',
  replace: 'COALESCE(excluded.quantity, offers.quantity)',
  add: 'CASE WHEN excluded.quantity IS NULL THEN offers.quantity ELSE COALESCE(offers.quantity, 0) + excluded.quantity END',
};

function upsertOffer(pharmacyId, drugId, price, quantity, stock = 'set') {
  db.prepare(`
    INSERT INTO offers (pharmacy_id, drug_id, price, quantity, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(pharmacy_id, drug_id) DO UPDATE SET price = excluded.price, quantity = ${STOCK_SQL[stock]}, updated_at = excluded.updated_at`)
    .run(pharmacyId, drugId, price, quantity ?? null);
}

// Quantity after applying an imported value to the current one (mirrors STOCK_SQL).
function nextStock(current, incoming, stock) {
  if (incoming === null || incoming === undefined) return current ?? null;
  if (stock === 'add') return (current ?? 0) + incoming;
  return incoming;
}

// ---------- auth ----------

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === test.length && crypto.timingSafeEqual(expected, test);
}

function createUser({ login, password, role, pharmacyId = null }) {
  return db.prepare('INSERT INTO users (login, password_hash, role, pharmacy_id) VALUES (?, ?, ?, ?)')
    .run(String(login).trim(), hashPassword(password), role, pharmacyId).lastInsertRowid;
}

function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

module.exports = {
  db, DB_PATH, getSettings, setSetting, norm, drugKey, cleanDrug, findDrugByKey, findOrCreateDrug, updateDrug,
  getDrug, upsertOffer, nextStock, hashPassword, verifyPassword, createUser, transaction, DRUG_FIELDS,
};
