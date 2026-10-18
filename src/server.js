'use strict';
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const {
  db, getSettings, setSetting, norm, drugKey, cleanDrug, findDrugByKey, findOrCreateDrug, updateDrug, getDrug,
  upsertOffer, hashPassword, verifyPassword, createUser, transaction,
} = require('./db');
const { parseImport, parsePrice, parseQuantity } = require('./importer');
const pub = require('./views/public');
const adm = require('./views/admin');

const PORT = Number(process.env.PORT) || 3000;
const PAGE_SIZE = 20;
const SESSION_DAYS = 14;
const SECURE_COOKIES = process.env.COOKIE_SECURE === '1';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === '1');
app.use(express.urlencoded({ extended: false, limit: '5mb' }));
app.use('/static', express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));

// ---------- cookies, session, csrf, flash ----------

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) {
      try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignore broken cookie */ }
    }
  }
  return out;
}

function setCookie(res, name, value, { maxAge, httpOnly = true } = {}) {
  let c = `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax`;
  if (httpOnly) c += '; HttpOnly';
  if (SECURE_COOKIES) c += '; Secure';
  if (maxAge !== undefined) c += `; Max-Age=${maxAge}`;
  res.append('Set-Cookie', c);
}

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'same-origin',
  });
  req.cookies = parseCookies(req.headers.cookie);
  req.body = req.body || {};

  // CSRF: double-submit token, checked on every POST
  let token = req.cookies.csrf;
  if (!token || !/^[a-f0-9]{32}$/.test(token)) {
    token = crypto.randomBytes(16).toString('hex');
    setCookie(res, 'csrf', token, { maxAge: 60 * 60 * 24 * 365 });
  }
  req.csrf = token;
  if (req.method === 'POST' && (!req.cookies.csrf || req.body._csrf !== req.cookies.csrf)) {
    return res.status(403).send('Сессия устарела. Вернитесь назад, обновите страницу и повторите действие.');
  }

  req.user = null;
  if (req.cookies.sid) {
    const row = db.prepare(`
      SELECT u.id, u.login, u.role, u.pharmacy_id, p.name AS pharmacy_name, s.expires_at
      FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN pharmacies p ON p.id = u.pharmacy_id
      WHERE s.token = ?`).get(req.cookies.sid);
    if (row && row.expires_at > Date.now()) {
      const { expires_at: _, ...user } = row;
      req.user = user;
    }
  }

  req.flash = null;
  if (req.cookies.flash) {
    try { req.flash = JSON.parse(req.cookies.flash); } catch { /* ignore */ }
    setCookie(res, 'flash', '', { maxAge: 0 });
  }
  next();
});

function flash(res, message, type = 'success') {
  setCookie(res, 'flash', JSON.stringify({ message, type }), { maxAge: 60 });
}

function ctx(req) {
  return {
    settings: getSettings(), user: req.user, csrf: req.csrf, flash: req.flash, path: req.path, query: req.query,
  };
}

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const intParam = (v, def = 1) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : def;
};

// ---------- shared queries ----------

function searchTokens(q) {
  return norm(q).split(' ').filter(Boolean).slice(0, 6);
}

function likeEscape(s) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// Drugs with aggregated price stats over active pharmacies (in stock only).
function drugQuery({ q = '', category = '', city = '', available = false, sort = 'relevance', inn = '', excludeId = 0, limit = PAGE_SIZE, offset = 0 }) {
  const where = [];
  const params = [];
  const offerJoin = ['o.drug_id = d.id', '(o.quantity IS NULL OR o.quantity > 0)', 'p.is_active = 1'];
  const joinParams = [];
  if (city) { offerJoin.push('p.city = ?'); joinParams.push(city); }
  const tokens = searchTokens(q);
  for (const t of tokens) { where.push("d.search LIKE ? ESCAPE '\\'"); params.push(`%${likeEscape(t)}%`); }
  if (category) { where.push('d.category = ?'); params.push(category); }
  if (inn) { where.push('d.inn = ? COLLATE NOCASE'); params.push(inn); }
  if (excludeId) { where.push('d.id <> ?'); params.push(excludeId); }

  const base = `
    FROM drugs d
    LEFT JOIN (offers o JOIN pharmacies p ON p.id = o.pharmacy_id) ON ${offerJoin.join(' AND ')}
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    GROUP BY d.id
    ${available ? 'HAVING COUNT(o.id) > 0' : ''}`;
  const allParams = [...joinParams, ...params];

  const orders = {
    relevance: tokens.length
      ? { sql: "(d.search LIKE ? ESCAPE '\\') DESC, offers_count > 0 DESC, d.name", params: [`${likeEscape(tokens[0])}%`] }
      : { sql: 'offers_count > 0 DESC, d.name', params: [] },
    price: { sql: 'min_price IS NULL, min_price, d.name', params: [] },
    price_desc: { sql: 'min_price IS NULL, min_price DESC, d.name', params: [] },
    offers: { sql: 'offers_count DESC, d.name', params: [] },
  };
  const order = orders[sort] || orders.relevance;

  const rows = db.prepare(`
    SELECT d.*, MIN(o.price) AS min_price, MAX(o.price) AS max_price, COUNT(o.id) AS offers_count
    ${base} ORDER BY ${order.sql} LIMIT ? OFFSET ?`).all(...allParams, ...order.params, limit, offset);
  const { n } = db.prepare(`SELECT COUNT(*) AS n FROM (SELECT d.id ${base})`).get(...allParams);
  return { rows, total: n };
}

function categoriesWithCounts(limit = 100) {
  return db.prepare(`SELECT category, COUNT(*) AS n FROM drugs WHERE category <> '' GROUP BY category ORDER BY n DESC, category LIMIT ?`).all(limit);
}

function categoryNames() {
  return db.prepare(`SELECT DISTINCT category FROM drugs WHERE category <> '' ORDER BY category`).all().map((r) => r.category);
}

function cityNames() {
  return db.prepare(`SELECT DISTINCT city FROM pharmacies WHERE city <> '' AND is_active = 1 ORDER BY city`).all().map((r) => r.city);
}

// ---------- public pages ----------

app.get('/', (req, res) => {
  const stats = {
    drugs: db.prepare('SELECT COUNT(DISTINCT o.drug_id) AS n FROM offers o JOIN pharmacies p ON p.id = o.pharmacy_id WHERE p.is_active = 1').get().n,
    pharmacies: db.prepare('SELECT COUNT(*) AS n FROM pharmacies WHERE is_active = 1').get().n,
    offers: db.prepare('SELECT COUNT(*) AS n FROM offers o JOIN pharmacies p ON p.id = o.pharmacy_id WHERE p.is_active = 1').get().n,
  };
  const popular = drugQuery({ sort: 'offers', available: true, limit: 8 }).rows;
  const pharmacies = db.prepare(`
    SELECT p.*, (SELECT COUNT(*) FROM offers o WHERE o.pharmacy_id = p.id) AS offers_count
    FROM pharmacies p WHERE p.is_active = 1 ORDER BY offers_count DESC LIMIT 6`).all();
  res.send(String(pub.home(ctx(req), { stats, categories: categoriesWithCounts(16), popular, pharmacies })));
});

app.get('/search', (req, res) => {
  const q = str(req.query.q).slice(0, 100);
  const category = str(req.query.category);
  const city = str(req.query.city);
  const sort = ['relevance', 'price', 'price_desc', 'offers'].includes(req.query.sort) ? req.query.sort : 'relevance';
  const available = req.query.available === '1';
  const page = intParam(req.query.page);
  const { rows, total } = drugQuery({ q, category, city, available, sort, offset: (page - 1) * PAGE_SIZE });

  // Nothing found: try a looser search by the beginning of the first word (typos in endings)
  let alternatives = [];
  const first = searchTokens(q)[0];
  if (!total && first && first.length >= 5) {
    alternatives = drugQuery({ q: first.slice(0, 4), category, city, limit: 10 }).rows;
  }
  res.send(String(pub.search(ctx(req), {
    q, category, city, sort, results: rows, total, page, pages: Math.ceil(total / PAGE_SIZE), categories: categoryNames(), cities: cityNames(), alternatives,
  })));
});

app.get('/catalog', (req, res) => {
  const letters = [...new Set(db.prepare('SELECT DISTINCT substr(name, 1, 1) AS l FROM drugs').all().map((r) => r.l.toUpperCase()))]
    .sort((a, b) => {
      const cyr = (x) => /[А-ЯЁ]/.test(x);
      return cyr(a) === cyr(b) ? a.localeCompare(b, 'ru') : cyr(a) ? -1 : 1;
    });
  const letter = str(req.query.letter) || letters[0] || '';
  const drugs = letter ? db.prepare(`
    SELECT d.*, (SELECT MIN(o.price) FROM offers o JOIN pharmacies p ON p.id = o.pharmacy_id
                 WHERE o.drug_id = d.id AND p.is_active = 1 AND (o.quantity IS NULL OR o.quantity > 0)) AS min_price
    FROM drugs d WHERE substr(d.name, 1, 1) IN (?, ?) ORDER BY d.name, d.dosage LIMIT 1000`).all(letter.toUpperCase(), letter.toLowerCase()) : [];
  res.send(String(pub.catalog(ctx(req), { letters, letter, drugs, categories: categoriesWithCounts() })));
});

app.get('/drug/:id', (req, res) => {
  const drug = getDrug(intParam(req.params.id, 0));
  if (!drug) return res.status(404).send(String(pub.notFound(ctx(req), 'Препарат не найден')));
  const city = str(req.query.city);
  const sort = ['price', 'price_desc', 'updated', 'name'].includes(req.query.sort) ? req.query.sort : 'price';
  const orders = {
    price: '(o.quantity = 0), o.price',
    price_desc: '(o.quantity = 0), o.price DESC',
    updated: 'o.updated_at DESC',
    name: 'p.name',
  };
  const offers = db.prepare(`
    SELECT o.*, p.name AS pharmacy_name, p.city, p.address, p.phone, p.hours
    FROM offers o JOIN pharmacies p ON p.id = o.pharmacy_id
    WHERE o.drug_id = ? AND p.is_active = 1 ${city ? 'AND p.city = ?' : ''}
    ORDER BY ${orders[sort]}`).all(...(city ? [drug.id, city] : [drug.id]));
  const analogs = drug.inn ? drugQuery({ inn: drug.inn, excludeId: drug.id, sort: 'price', limit: 12 }).rows : [];
  res.send(String(pub.drugPage(ctx(req), { drug, offers, analogs, city, cities: cityNames(), sort })));
});

app.get('/pharmacies', (req, res) => {
  const q = norm(str(req.query.q));
  const city = str(req.query.city);
  let list = db.prepare(`
    SELECT p.*, (SELECT COUNT(*) FROM offers o WHERE o.pharmacy_id = p.id) AS offers_count
    FROM pharmacies p WHERE p.is_active = 1 ORDER BY p.city, p.name`).all();
  if (city) list = list.filter((p) => p.city === city);
  if (q) list = list.filter((p) => norm(`${p.name} ${p.city} ${p.address}`).includes(q));
  res.send(String(pub.pharmacies(ctx(req), { list, cities: cityNames(), city, q: str(req.query.q) })));
});

app.get('/pharmacy/:id', (req, res) => {
  const pharmacy = db.prepare('SELECT * FROM pharmacies WHERE id = ? AND is_active = 1').get(intParam(req.params.id, 0));
  if (!pharmacy) return res.status(404).send(String(pub.notFound(ctx(req), 'Аптека не найдена')));
  const q = str(req.query.q);
  const page = intParam(req.query.page);
  const where = ['o.pharmacy_id = ?'];
  const params = [pharmacy.id];
  for (const t of searchTokens(q)) { where.push("d.search LIKE ? ESCAPE '\\'"); params.push(`%${likeEscape(t)}%`); }
  const sql = `FROM offers o JOIN drugs d ON d.id = o.drug_id WHERE ${where.join(' AND ')}`;
  const total = db.prepare(`SELECT COUNT(*) AS n ${sql}`).get(...params).n;
  const offers = db.prepare(`SELECT o.*, d.name, d.form, d.dosage, d.pack, d.manufacturer, d.rx ${sql} ORDER BY d.name, d.dosage LIMIT ? OFFSET ?`)
    .all(...params, 50, (page - 1) * 50);
  res.send(String(pub.pharmacyPage(ctx(req), { pharmacy, offers, q, page, pages: Math.ceil(total / 50), total })));
});

app.get('/api/suggest', (req, res) => {
  const q = str(req.query.q).slice(0, 100);
  if (searchTokens(q).length === 0) return res.json([]);
  const { rows } = drugQuery({ q, limit: 8 });
  res.json(rows.map((d) => ({
    id: d.id, name: d.name, form: d.form, dosage: d.dosage, pack: d.pack, inn: d.inn, manufacturer: d.manufacturer,
    country: d.country, category: d.category, rx: d.rx, min_price: d.min_price, offers_count: d.offers_count,
  })));
});

// ---------- auth ----------

const loginFails = new Map();

app.get('/login', (req, res) => {
  if (req.user) return res.redirect('/admin');
  res.send(String(pub.login(ctx(req), {})));
});

app.post('/login', (req, res) => {
  const ip = req.ip;
  const now = Date.now();
  const fails = (loginFails.get(ip) || []).filter((t) => now - t < 15 * 60 * 1000);
  const login = str(req.body.login);
  if (fails.length >= 10) {
    return res.status(429).send(String(pub.login(ctx(req), { error: 'Слишком много попыток. Попробуйте через 15 минут.', login })));
  }
  const user = db.prepare('SELECT * FROM users WHERE login = ?').get(login);
  if (!user || !verifyPassword(req.body.password || '', user.password_hash)) {
    fails.push(now);
    loginFails.set(ip, fails);
    return res.status(401).send(String(pub.login(ctx(req), { error: 'Неверный логин или пароль', login })));
  }
  loginFails.delete(ip);
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, user.id, now + SESSION_DAYS * 86400000);
  setCookie(res, 'sid', token, { maxAge: SESSION_DAYS * 86400 });
  res.redirect('/admin');
});

app.post('/logout', (req, res) => {
  if (req.cookies.sid) db.prepare('DELETE FROM sessions WHERE token = ?').run(req.cookies.sid);
  setCookie(res, 'sid', '', { maxAge: 0 });
  res.redirect('/');
});

// ---------- admin area ----------

const admin = express.Router();

admin.use((req, res, next) => {
  if (!req.user) return res.redirect('/login');
  next();
});

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).send(String(pub.notFound(ctx(req), 'Недостаточно прав')));
  next();
}

function allPharmacies() {
  return db.prepare('SELECT id, name, city FROM pharmacies ORDER BY name').all();
}

// Pharmacy the current request works with: own pharmacy for pharmacy users,
// chosen one (query/body) for the administrator.
function pharmacyFor(req) {
  if (req.user.role === 'pharmacy') return req.user.pharmacy_id;
  const wanted = intParam(req.body.pharmacy || req.query.pharmacy, 0);
  if (wanted && db.prepare('SELECT 1 FROM pharmacies WHERE id = ?').get(wanted)) return wanted;
  const first = db.prepare('SELECT id FROM pharmacies ORDER BY name LIMIT 1').get();
  return first ? first.id : null;
}

function ownOffer(req, id) {
  const offer = db.prepare('SELECT * FROM offers WHERE id = ?').get(id);
  if (!offer) return null;
  if (req.user.role !== 'admin' && offer.pharmacy_id !== req.user.pharmacy_id) return null;
  return offer;
}

admin.get('/', (req, res) => {
  const c = ctx(req);
  if (req.user.role === 'admin') {
    const stats = {
      pharmacies: db.prepare('SELECT COUNT(*) AS n FROM pharmacies').get().n,
      drugs: db.prepare('SELECT COUNT(*) AS n FROM drugs').get().n,
      offers: db.prepare('SELECT COUNT(*) AS n FROM offers').get().n,
    };
    const pharmacies = db.prepare(`
      SELECT p.*, COUNT(o.id) AS offers_count, MAX(o.updated_at) AS last_update
      FROM pharmacies p LEFT JOIN offers o ON o.pharmacy_id = p.id GROUP BY p.id ORDER BY p.name`).all();
    const recent = db.prepare(`
      SELECT o.*, d.name, d.form, d.dosage, d.pack, p.name AS pharmacy_name FROM offers o
      JOIN drugs d ON d.id = o.drug_id JOIN pharmacies p ON p.id = o.pharmacy_id ORDER BY o.updated_at DESC, o.id DESC LIMIT 10`).all();
    return res.send(String(adm.dashboard(c, { stats, pharmacies, recent })));
  }
  const pid = req.user.pharmacy_id;
  const pharmacy = db.prepare('SELECT * FROM pharmacies WHERE id = ?').get(pid);
  const stats = db.prepare(`
    SELECT COUNT(*) AS offers, SUM(quantity = 0) AS out, MAX(updated_at) AS updated FROM offers WHERE pharmacy_id = ?`).get(pid);
  stats.out = stats.out || 0;
  const recent = db.prepare(`
    SELECT o.*, d.name, d.form, d.dosage, d.pack FROM offers o JOIN drugs d ON d.id = o.drug_id
    WHERE o.pharmacy_id = ? ORDER BY o.updated_at DESC, o.id DESC LIMIT 10`).all(pid);
  res.send(String(adm.dashboard(c, { stats, pharmacy, pharmacies: [], recent })));
});

// ----- offers -----

admin.get('/offers', (req, res) => {
  const pharmacyId = pharmacyFor(req);
  if (!pharmacyId) return res.send(String(adm.noPharmacies(ctx(req))));
  const q = str(req.query.q);
  const filter = str(req.query.filter);
  const page = intParam(req.query.page);
  const where = ['o.pharmacy_id = ?'];
  const params = [pharmacyId];
  for (const t of searchTokens(q)) { where.push("d.search LIKE ? ESCAPE '\\'"); params.push(`%${likeEscape(t)}%`); }
  if (filter === 'out') where.push('o.quantity = 0');
  if (filter === 'old') where.push("o.updated_at < datetime('now', '-30 days')");
  const sql = `FROM offers o JOIN drugs d ON d.id = o.drug_id WHERE ${where.join(' AND ')}`;
  const total = db.prepare(`SELECT COUNT(*) AS n ${sql}`).get(...params).n;
  const list = db.prepare(`SELECT o.*, d.name, d.form, d.dosage, d.pack, d.manufacturer ${sql} ORDER BY d.name, d.dosage LIMIT ? OFFSET ?`)
    .all(...params, 50, (page - 1) * 50);
  res.send(String(adm.offers(ctx(req), {
    pharmacies: allPharmacies(), pharmacyId, list, q, filter, total, page, pages: Math.ceil(total / 50),
  })));
});

admin.get('/offers/export.csv', (req, res) => {
  const pharmacyId = pharmacyFor(req);
  const rows = db.prepare(`
    SELECT d.*, o.price, o.quantity FROM offers o JOIN drugs d ON d.id = o.drug_id WHERE o.pharmacy_id = ? ORDER BY d.name`).all(pharmacyId);
  const cell = (v) => {
    const s = String(v ?? '');
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = ['Название;Форма;Дозировка;Упаковка;Производитель;МНН;Категория;Рецепт;Цена;Остаток'];
  for (const r of rows) {
    lines.push([r.name, r.form, r.dosage, r.pack, r.manufacturer, r.inn, r.category, r.rx ? 'да' : '', String(r.price).replace('.', ','), r.quantity ?? '']
      .map(cell).join(';'));
  }
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="price-${pharmacyId}.csv"`);
  res.send(`﻿${lines.join('\r\n')}\r\n`);
});

admin.get('/offers/new', (req, res) => {
  const pharmacyId = pharmacyFor(req);
  if (!pharmacyId) return res.send(String(adm.noPharmacies(ctx(req))));
  res.send(String(adm.offerNew(ctx(req), { pharmacies: allPharmacies(), pharmacyId, categories: categoryNames() })));
});

admin.post('/offers/new', (req, res) => {
  const pharmacyId = pharmacyFor(req);
  if (!pharmacyId) return res.send(String(adm.noPharmacies(ctx(req))));
  const price = parsePrice(req.body.price);
  const quantity = parseQuantity(req.body.quantity);
  const fail = (error) => res.status(400).send(String(adm.offerNew(ctx(req), {
    pharmacies: allPharmacies(), pharmacyId, categories: categoryNames(), values: req.body, error,
  })));
  if (Number.isNaN(price)) return fail('Укажите цену числом, например 125.50');
  let drug;
  try {
    const drugId = intParam(req.body.drug_id, 0);
    drug = drugId ? getDrug(drugId) : findOrCreateDrug(req.body).drug;
    if (!drug) return fail('Препарат не найден в каталоге');
  } catch (e) {
    return fail(e.message);
  }
  upsertOffer(pharmacyId, drug.id, price, quantity);
  flash(res, `Сохранено: ${[drug.name, drug.form, drug.dosage, drug.pack].filter(Boolean).join(' ')}`);
  const suffix = req.user.role === 'admin' ? `?pharmacy=${pharmacyId}` : '';
  res.redirect(req.body.more ? `/admin/offers/new${suffix}` : `/admin/offers${suffix}`);
});

admin.post('/offers/:id', (req, res) => {
  const offer = ownOffer(req, intParam(req.params.id, 0));
  if (!offer) return res.status(404).send(String(pub.notFound(ctx(req))));
  const price = parsePrice(req.body.price);
  if (Number.isNaN(price)) flash(res, 'Неверная цена', 'error');
  else {
    db.prepare("UPDATE offers SET price = ?, quantity = ?, updated_at = datetime('now') WHERE id = ?").run(price, parseQuantity(req.body.quantity), offer.id);
    flash(res, 'Цена обновлена');
  }
  res.redirect(req.get('Referer') || '/admin/offers');
});

admin.post('/offers/:id/delete', (req, res) => {
  const offer = ownOffer(req, intParam(req.params.id, 0));
  if (offer) db.prepare('DELETE FROM offers WHERE id = ?').run(offer.id);
  flash(res, 'Товар удалён');
  res.redirect(req.get('Referer') || '/admin/offers');
});

// ----- import -----

admin.get('/import', (req, res) => {
  const pharmacyId = pharmacyFor(req);
  if (!pharmacyId) return res.send(String(adm.noPharmacies(ctx(req))));
  res.send(String(adm.importForm(ctx(req), { pharmacies: allPharmacies(), pharmacyId })));
});

admin.post('/import/edit', (req, res) => {
  res.send(String(adm.importForm(ctx(req), {
    pharmacies: allPharmacies(), pharmacyId: pharmacyFor(req), text: req.body.text || '', mode: req.body.mode,
  })));
});

function analyseImport(pharmacyId, text) {
  const parsed = parseImport(text);
  const summary = { ok: 0, newDrugs: 0, updates: 0, errors: 0 };
  const lastByKey = new Map();
  const newKeys = new Set();
  const keptDrugIds = new Set();
  for (const r of parsed.rows) {
    if (r.error) { summary.errors++; continue; }
    const d = cleanDrug(r.drug);
    const key = drugKey(d);
    if (lastByKey.has(key)) lastByKey.get(key).status = 'dup';
    lastByKey.set(key, r);
    const existing = findDrugByKey(d);
    if (!existing) {
      r.status = 'new';
      newKeys.add(key);
      continue;
    }
    keptDrugIds.add(existing.id);
    const offer = db.prepare('SELECT price FROM offers WHERE pharmacy_id = ? AND drug_id = ?').get(pharmacyId, existing.id);
    r.status = offer ? 'update' : 'existing';
    if (offer) r.oldPrice = offer.price;
  }
  for (const r of parsed.rows) {
    if (r.error) continue;
    if (r.status !== 'dup') summary.ok++;
    if (r.status === 'update') summary.updates++;
  }
  summary.newDrugs = newKeys.size;
  const current = db.prepare('SELECT drug_id FROM offers WHERE pharmacy_id = ?').all(pharmacyId);
  const toDelete = current.filter((o) => !keptDrugIds.has(o.drug_id)).length;
  return { parsed, summary, toDelete };
}

admin.post('/import/preview', (req, res) => {
  const pharmacyId = pharmacyFor(req);
  if (!pharmacyId) return res.send(String(adm.noPharmacies(ctx(req))));
  const text = String(req.body.text || '');
  const mode = req.body.mode === 'replace' ? 'replace' : 'upsert';
  const pharmacy = db.prepare('SELECT * FROM pharmacies WHERE id = ?').get(pharmacyId);
  const { parsed, summary, toDelete } = analyseImport(pharmacyId, text);
  if (!parsed.rows.length) {
    flash(res, 'Текст пустой — нечего импортировать', 'error');
    return res.redirect(`/admin/import${req.user.role === 'admin' ? `?pharmacy=${pharmacyId}` : ''}`);
  }
  res.send(String(adm.importPreview(ctx(req), { pharmacy, parsed, text, mode, summary, toDelete })));
});

admin.post('/import/apply', (req, res) => {
  const pharmacyId = pharmacyFor(req);
  if (!pharmacyId) return res.send(String(adm.noPharmacies(ctx(req))));
  const mode = req.body.mode === 'replace' ? 'replace' : 'upsert';
  const parsed = parseImport(String(req.body.text || ''));
  const good = parsed.rows.filter((r) => !r.error);
  if (!good.length) {
    flash(res, 'Нет ни одной корректной строки', 'error');
    return res.redirect('/admin/import');
  }
  const result = transaction(() => {
    let created = 0;
    const ids = new Set();
    for (const r of good) {
      const { drug, created: isNew } = findOrCreateDrug(r.drug);
      if (isNew) created++;
      ids.add(drug.id);
      upsertOffer(pharmacyId, drug.id, r.price, r.quantity);
    }
    let removed = 0;
    if (mode === 'replace') {
      for (const o of db.prepare('SELECT id, drug_id FROM offers WHERE pharmacy_id = ?').all(pharmacyId)) {
        if (!ids.has(o.drug_id)) { db.prepare('DELETE FROM offers WHERE id = ?').run(o.id); removed++; }
      }
    }
    return { count: ids.size, created, removed };
  });
  flash(res, `Импорт завершён: загружено ${result.count} позиций, новых препаратов в каталоге — ${result.created}${mode === 'replace' ? `, удалено — ${result.removed}` : ''}.`);
  res.redirect(`/admin/offers${req.user.role === 'admin' ? `?pharmacy=${pharmacyId}` : ''}`);
});

// ----- own pharmacy profile & password -----

const PHARMACY_FIELDS = ['name', 'city', 'address', 'phone', 'hours', 'website', 'description'];
const pharmacyValues = (body) => PHARMACY_FIELDS.map((f) => str(body[f]));

admin.get('/profile', (req, res) => {
  if (!req.user.pharmacy_id) return res.redirect('/admin/pharmacies');
  const pharmacy = db.prepare('SELECT * FROM pharmacies WHERE id = ?').get(req.user.pharmacy_id);
  res.send(String(adm.profile(ctx(req), { pharmacy })));
});

admin.post('/profile', (req, res) => {
  if (!req.user.pharmacy_id) return res.redirect('/admin');
  if (!str(req.body.name)) { flash(res, 'Название обязательно', 'error'); return res.redirect('/admin/profile'); }
  db.prepare(`UPDATE pharmacies SET ${PHARMACY_FIELDS.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`)
    .run(...pharmacyValues(req.body), req.user.pharmacy_id);
  flash(res, 'Профиль сохранён');
  res.redirect('/admin/profile');
});

admin.get('/account', (req, res) => res.send(String(adm.account(ctx(req), {}))));

admin.post('/account', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  let error = null;
  if (!verifyPassword(req.body.current || '', user.password_hash)) error = 'Текущий пароль указан неверно';
  else if (String(req.body.password || '').length < 6) error = 'Новый пароль должен быть не короче 6 символов';
  else if (req.body.password !== req.body.password2) error = 'Пароли не совпадают';
  if (error) return res.status(400).send(String(adm.account(ctx(req), { error })));
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(req.body.password), user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token <> ?').run(user.id, req.cookies.sid);
  flash(res, 'Пароль изменён');
  res.redirect('/admin');
});

// ----- administrator: drugs catalogue -----

admin.get('/drugs', adminOnly, (req, res) => {
  const q = str(req.query.q);
  const page = intParam(req.query.page);
  const where = [];
  const params = [];
  for (const t of searchTokens(q)) { where.push("d.search LIKE ? ESCAPE '\\'"); params.push(`%${likeEscape(t)}%`); }
  const having = req.query.orphans ? 'HAVING offers_count = 0' : '';
  const base = `FROM drugs d LEFT JOIN offers o ON o.drug_id = d.id ${where.length ? `WHERE ${where.join(' AND ')}` : ''} GROUP BY d.id ${having}`;
  const total = db.prepare(`SELECT COUNT(*) AS n FROM (SELECT d.id, COUNT(o.id) AS offers_count ${base})`).get(...params).n;
  const list = db.prepare(`SELECT d.*, COUNT(o.id) AS offers_count ${base} ORDER BY d.name, d.dosage LIMIT ? OFFSET ?`)
    .all(...params, 50, (page - 1) * 50);
  res.send(String(adm.drugs(ctx(req), { list, q, total, page, pages: Math.ceil(total / 50) })));
});

admin.get('/drugs/new', adminOnly, (req, res) => {
  res.send(String(adm.drugEdit(ctx(req), { drug: {}, categories: categoryNames() })));
});

admin.post('/drugs/new', adminOnly, (req, res) => {
  try {
    const d = cleanDrug(req.body);
    if (findDrugByKey(d)) throw new Error('Такой препарат уже есть в каталоге');
    const { drug } = findOrCreateDrug(req.body);
    flash(res, 'Препарат добавлен');
    res.redirect(`/admin/drugs/${drug.id}`);
  } catch (e) {
    res.status(400).send(String(adm.drugEdit(ctx(req), { drug: req.body, categories: categoryNames(), error: e.message })));
  }
});

admin.get('/drugs/:id', adminOnly, (req, res) => {
  const drug = getDrug(intParam(req.params.id, 0));
  if (!drug) return res.status(404).send(String(pub.notFound(ctx(req))));
  const offersCount = db.prepare('SELECT COUNT(*) AS n FROM offers WHERE drug_id = ?').get(drug.id).n;
  res.send(String(adm.drugEdit(ctx(req), { drug, categories: categoryNames(), offersCount })));
});

admin.post('/drugs/:id', adminOnly, (req, res) => {
  const drug = getDrug(intParam(req.params.id, 0));
  if (!drug) return res.status(404).send(String(pub.notFound(ctx(req))));
  try {
    updateDrug(drug.id, req.body);
    flash(res, 'Сохранено');
    res.redirect(`/admin/drugs/${drug.id}`);
  } catch (e) {
    const offersCount = db.prepare('SELECT COUNT(*) AS n FROM offers WHERE drug_id = ?').get(drug.id).n;
    res.status(400).send(String(adm.drugEdit(ctx(req), { drug: { ...req.body, id: drug.id }, categories: categoryNames(), error: e.message, offersCount })));
  }
});

admin.post('/drugs/:id/delete', adminOnly, (req, res) => {
  db.prepare('DELETE FROM drugs WHERE id = ?').run(intParam(req.params.id, 0));
  flash(res, 'Препарат удалён');
  res.redirect('/admin/drugs');
});

admin.post('/drugs/:id/merge', adminOnly, (req, res) => {
  const source = getDrug(intParam(req.params.id, 0));
  const target = getDrug(intParam(req.body.target, 0));
  if (!source || !target || source.id === target.id) {
    flash(res, 'Укажите ID другой существующей карточки', 'error');
    return res.redirect(source ? `/admin/drugs/${source.id}` : '/admin/drugs');
  }
  transaction(() => {
    db.prepare(`
      INSERT INTO offers (pharmacy_id, drug_id, price, quantity, updated_at)
      SELECT pharmacy_id, ?, price, quantity, updated_at FROM offers WHERE drug_id = ?
      ON CONFLICT(pharmacy_id, drug_id) DO UPDATE SET price = excluded.price, quantity = excluded.quantity, updated_at = excluded.updated_at
      WHERE excluded.updated_at > offers.updated_at`).run(target.id, source.id);
    db.prepare('DELETE FROM drugs WHERE id = ?').run(source.id);
  });
  flash(res, `Карточка #${source.id} объединена с #${target.id}`);
  res.redirect(`/admin/drugs/${target.id}`);
});

// ----- administrator: pharmacies & users -----

admin.get('/pharmacies', adminOnly, (req, res) => {
  res.send(String(adm.pharmacies(ctx(req), { list: pharmacyList() })));
});

function pharmacyList() {
  return db.prepare(`
    SELECT p.*, (SELECT COUNT(*) FROM offers o WHERE o.pharmacy_id = p.id) AS offers_count,
           (SELECT group_concat(login, ', ') FROM users u WHERE u.pharmacy_id = p.id) AS logins
    FROM pharmacies p ORDER BY p.name`).all();
}

admin.post('/pharmacies', adminOnly, (req, res) => {
  const login = str(req.body.login);
  const password = String(req.body.password || '');
  let error = null;
  if (!str(req.body.name)) error = 'Укажите название аптеки';
  else if (!/^[\w.@-]{3,40}$/.test(login)) error = 'Логин: 3–40 символов, латиница, цифры, точка, дефис, подчёркивание';
  else if (password.length < 6) error = 'Пароль должен быть не короче 6 символов';
  else if (db.prepare('SELECT 1 FROM users WHERE login = ?').get(login)) error = 'Такой логин уже занят';
  if (error) return res.status(400).send(String(adm.pharmacies(ctx(req), { list: pharmacyList(), error, values: req.body })));
  const id = transaction(() => {
    const pid = db.prepare(`INSERT INTO pharmacies (${PHARMACY_FIELDS.join(', ')}) VALUES (${PHARMACY_FIELDS.map(() => '?').join(', ')})`)
      .run(...pharmacyValues(req.body)).lastInsertRowid;
    createUser({ login, password, role: 'pharmacy', pharmacyId: pid });
    return pid;
  });
  flash(res, `Аптека создана. Логин: ${login}`);
  res.redirect(`/admin/pharmacies/${id}`);
});

function pharmacyEditPage(req, res, error) {
  const pharmacy = db.prepare('SELECT * FROM pharmacies WHERE id = ?').get(intParam(req.params.id, 0));
  if (!pharmacy) return res.status(404).send(String(pub.notFound(ctx(req))));
  const users = db.prepare('SELECT * FROM users WHERE pharmacy_id = ? ORDER BY login').all(pharmacy.id);
  res.status(error ? 400 : 200).send(String(adm.pharmacyEdit(ctx(req), { pharmacy, users, error })));
}

admin.get('/pharmacies/:id', adminOnly, (req, res) => pharmacyEditPage(req, res));

admin.post('/pharmacies/:id', adminOnly, (req, res) => {
  const id = intParam(req.params.id, 0);
  if (!str(req.body.name)) return pharmacyEditPage(req, res, 'Название обязательно');
  db.prepare(`UPDATE pharmacies SET ${PHARMACY_FIELDS.map((f) => `${f} = ?`).join(', ')}, is_active = ? WHERE id = ?`)
    .run(...pharmacyValues(req.body), req.body.is_active ? 1 : 0, id);
  flash(res, 'Сохранено');
  res.redirect(`/admin/pharmacies/${id}`);
});

admin.post('/pharmacies/:id/delete', adminOnly, (req, res) => {
  db.prepare('DELETE FROM pharmacies WHERE id = ?').run(intParam(req.params.id, 0));
  flash(res, 'Аптека удалена');
  res.redirect('/admin/pharmacies');
});

admin.post('/pharmacies/:id/users', adminOnly, (req, res) => {
  const id = intParam(req.params.id, 0);
  const login = str(req.body.login);
  if (!/^[\w.@-]{3,40}$/.test(login)) return pharmacyEditPage(req, res, 'Логин: 3–40 символов, латиница, цифры, точка, дефис, подчёркивание');
  if (String(req.body.password || '').length < 6) return pharmacyEditPage(req, res, 'Пароль должен быть не короче 6 символов');
  if (db.prepare('SELECT 1 FROM users WHERE login = ?').get(login)) return pharmacyEditPage(req, res, 'Такой логин уже занят');
  createUser({ login, password: req.body.password, role: 'pharmacy', pharmacyId: id });
  flash(res, `Пользователь ${login} добавлен`);
  res.redirect(`/admin/pharmacies/${id}`);
});

admin.post('/users/:id/password', adminOnly, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(intParam(req.params.id, 0));
  if (!user) return res.status(404).send(String(pub.notFound(ctx(req))));
  if (String(req.body.password || '').length < 6) flash(res, 'Пароль должен быть не короче 6 символов', 'error');
  else {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(req.body.password), user.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
    flash(res, `Пароль для ${user.login} изменён`);
  }
  res.redirect(user.pharmacy_id ? `/admin/pharmacies/${user.pharmacy_id}` : '/admin');
});

admin.post('/users/:id/delete', adminOnly, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(intParam(req.params.id, 0));
  if (user && user.id !== req.user.id && user.role !== 'admin') db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  flash(res, 'Пользователь удалён');
  res.redirect(user && user.pharmacy_id ? `/admin/pharmacies/${user.pharmacy_id}` : '/admin/pharmacies');
});

// ----- administrator: settings -----

admin.get('/settings', adminOnly, (req, res) => res.send(String(adm.settingsPage(ctx(req)))));

admin.post('/settings', adminOnly, (req, res) => {
  for (const key of ['site_name', 'site_tagline', 'currency']) {
    const v = str(req.body[key]);
    if (v || key === 'site_tagline') setSetting(key, v);
  }
  flash(res, 'Настройки сохранены');
  res.redirect('/admin/settings');
});

app.use('/admin', admin);

app.use((req, res) => res.status(404).send(String(pub.notFound(ctx(req)))));

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).send('Внутренняя ошибка сервера');
});

// ---------- bootstrap ----------

function ensureAdmin() {
  if (db.prepare("SELECT 1 FROM users WHERE role = 'admin'").get()) return;
  const login = process.env.ADMIN_LOGIN || 'admin';
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(6).toString('base64url');
  createUser({ login, password, role: 'admin' });
  console.log('\n  Создан администратор:');
  console.log(`    логин:  ${login}`);
  console.log(`    пароль: ${password}`);
  console.log('  Сохраните пароль — он больше не будет показан.\n');
}

if (require.main === module) {
  ensureAdmin();
  app.listen(PORT, () => console.log(`Сайт запущен: http://localhost:${PORT}`));
}

module.exports = { app, ensureAdmin };
