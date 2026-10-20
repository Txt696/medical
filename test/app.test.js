'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apteka-'));
process.env.DB_PATH = path.join(dir, 'test.db');
const { db, createUser } = require('../src/db');
const { app } = require('../src/server');

let base;
let server;

test.before(async () => {
  createUser({ login: 'admin', password: 'admin123', role: 'admin' });
  for (const name of ['Аптека 1', 'Аптека 2']) {
    const id = db.prepare('INSERT INTO pharmacies (name, city) VALUES (?, ?)').run(name, 'Город').lastInsertRowid;
    createUser({ login: `ph${id}`, password: 'secret1', role: 'pharmacy', pharmacyId: id });
  }
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

// minimal cookie-keeping client
function client() {
  const jar = {};
  async function req(method, url, form) {
    const headers = { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') };
    let body;
    if (form) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams({ _csrf: jar.csrf, ...form }).toString();
    }
    const res = await fetch(base + url, { method, headers, body, redirect: 'manual' });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(';');
      const i = kv.indexOf('=');
      jar[kv.slice(0, i)] = kv.slice(i + 1);
    }
    return { status: res.status, location: res.headers.get('location'), text: await res.text() };
  }
  return {
    get: (u) => req('GET', u),
    post: (u, f) => req('POST', u, f),
    async login(login, password) {
      await req('GET', '/login');
      return req('POST', '/login', { login, password });
    },
  };
}

test('POST without csrf token is rejected', async () => {
  const res = await fetch(`${base}/login`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'login=admin&password=admin123' });
  assert.equal(res.status, 403);
});

test('wrong password', async () => {
  const c = client();
  assert.equal((await c.login('admin', 'nope')).status, 401);
  assert.equal((await c.get('/admin')).location, '/login');
});

test('pharmacy adds product manually, then via import, and it shows on the site', async () => {
  const c = client();
  assert.equal((await c.login('ph1', 'secret1')).location, '/admin');

  let r = await c.post('/admin/offers/new', { name: 'Парацетамол', form: 'таблетки', dosage: '500 мг', pack: '№20', price: '30,5', quantity: '' });
  assert.equal(r.status, 302);
  const drug = db.prepare("SELECT * FROM drugs WHERE name = 'Парацетамол'").get();
  assert.ok(drug);

  const text = 'Парацетамол таб. 500 мг №20 — 28\nНовый препарат 10мг №5 99.90';
  r = await c.post('/admin/import/preview', { text, mode: 'upsert' });
  assert.match(r.text, /обновит цену/);
  assert.match(r.text, /новый препарат/);
  r = await c.post('/admin/import/apply', { text, mode: 'upsert' });
  assert.equal(r.status, 302);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM drugs').get().n, 2, 'existing drug matched, not duplicated');
  assert.equal(db.prepare('SELECT price FROM offers WHERE drug_id = ?').get(drug.id).price, 28);

  r = await c.get(`/drug/${drug.id}`);
  assert.match(r.text, /Аптека 1/);
  assert.match(r.text, /28 руб\./);

  // replace mode removes items missing from the list
  r = await c.post('/admin/import/apply', { text: 'Парацетамол таблетки 500мг №20 27', mode: 'replace' });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM offers WHERE pharmacy_id = 1').get().n, 1);
});

test('pharmacy cannot touch another pharmacy offers or admin pages', async () => {
  const c = client();
  await c.login('ph2', 'secret1');
  const offer = db.prepare('SELECT * FROM offers WHERE pharmacy_id = 1').get();
  const r = await c.post(`/admin/offers/${offer.id}`, { price: '1', quantity: '' });
  assert.equal(r.status, 404);
  assert.equal(db.prepare('SELECT price FROM offers WHERE id = ?').get(offer.id).price, offer.price);
  assert.equal((await c.get('/admin/pharmacies')).status, 403);
  // a forged "pharmacy" field is ignored for pharmacy users
  await c.post('/admin/import/apply', { text: 'Тест 1', pharmacy: '1', mode: 'replace' });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM offers WHERE pharmacy_id = 1').get().n, 1);
});

test('admin creates a pharmacy with login', async () => {
  const c = client();
  await c.login('admin', 'admin123');
  const r = await c.post('/admin/pharmacies', { name: 'Новая', city: 'Город', login: 'newph', password: 'pass123' });
  assert.equal(r.status, 302);
  const c2 = client();
  assert.equal((await c2.login('newph', 'pass123')).location, '/admin');
});

test('html is escaped', async () => {
  const c = client();
  await c.login('ph1', 'secret1');
  await c.post('/admin/offers/new', { name: '<script>alert(1)</script>', price: '1' });
  const id = db.prepare("SELECT id FROM drugs WHERE name LIKE '<script>%'").get().id;
  const r = await c.get(`/drug/${id}`);
  assert.ok(!r.text.includes('<script>alert(1)'));
  assert.ok(r.text.includes('&lt;script&gt;'));
});

test('import stock: replace from file or add to current stock', async () => {
  const c = client();
  await c.login('ph2', 'secret1');
  const qty = () => db.prepare("SELECT o.quantity FROM offers o JOIN drugs d ON d.id = o.drug_id WHERE o.pharmacy_id = 2 AND d.name = 'Склад'").get().quantity;

  await c.post('/admin/import/apply', { text: 'Склад 10мг №5 50 руб 10 шт', mode: 'upsert', stock: 'replace' });
  assert.equal(qty(), 10);

  let r = await c.post('/admin/import/preview', { text: 'Склад 10мг №5 50 руб 5 шт', mode: 'upsert', stock: 'add' });
  assert.match(r.text, /10 →<\/span> <strong>15/);
  await c.post('/admin/import/apply', { text: 'Склад 10мг №5 50 руб 5 шт', mode: 'upsert', stock: 'add' });
  assert.equal(qty(), 15);

  // duplicates are summed when adding
  await c.post('/admin/import/apply', { text: 'Склад 10мг №5 50 руб 1 шт\nСклад 10мг №5 55 руб 2 шт', mode: 'upsert', stock: 'add' });
  assert.equal(qty(), 18);

  // no quantity in the file keeps current stock
  await c.post('/admin/import/apply', { text: 'Склад 10мг №5 60', mode: 'upsert', stock: 'replace' });
  assert.equal(qty(), 18);

  await c.post('/admin/import/apply', { text: 'Склад 10мг №5 60 руб 3 шт', mode: 'upsert', stock: 'replace' });
  assert.equal(qty(), 3);
});

test('import matches a card even if the file has no form / pack, but only when unambiguous', async () => {
  const c = client();
  await c.login('admin', 'admin123');
  for (const dosage of ['200 мг', '400 мг']) {
    await c.post('/admin/drugs/new', { name: 'Мягкий', form: 'таблетки', dosage, pack: '№10' });
  }
  const before = db.prepare("SELECT COUNT(*) AS n FROM drugs WHERE name = 'Мягкий'").get().n;
  assert.equal(before, 2);

  let r = await c.post('/admin/import/preview', { pharmacy: '1', text: 'Название;Дозировка;Цена;Остаток\nМягкий;400мг;70;3\nМягкий;;50;1', mode: 'upsert' });
  assert.match(r.text, /→ <a href="\/drug\/\d+" target="_blank">Мягкий таблетки 400 мг №10/);
  await c.post('/admin/import/apply', { pharmacy: '1', text: 'Название;Дозировка;Цена;Остаток\nМягкий;400мг;70;3\nМягкий;;50;1', mode: 'upsert' });

  const cards = db.prepare("SELECT * FROM drugs WHERE name = 'Мягкий' ORDER BY id").all();
  // 400 mg found despite the missing form and pack; name only is ambiguous -> new card
  assert.equal(cards.length, 3);
  const offer = db.prepare('SELECT * FROM offers WHERE pharmacy_id = 1 AND drug_id = ?').get(cards[1].id);
  assert.equal(offer.price, 70);
  assert.equal(offer.quantity, 3);
});

test('language switch', async () => {
  const c = client();
  let r = await c.get('/');
  assert.match(r.text, /<html lang="ru">/);
  r = await c.get('/lang/tk');
  assert.equal(r.status, 302);
  r = await c.get('/');
  assert.match(r.text, /<html lang="tk">/);
  assert.match(r.text, /Dermanhanalar/);
  await c.get('/lang/en');
  r = await c.get('/pharmacies');
  assert.match(r.text, /Pharmacies/);
  // flash messages and errors follow the language
  r = await c.login('ph1', 'wrong');
  assert.match(r.text, /Wrong login or password/);
  await c.get('/lang/xx');
  assert.match((await c.get('/')).text, /<html lang="en">/);
});

test('import understands Turkmen headers', async () => {
  const c = client();
  await c.login('ph2', 'secret1');
  const text = 'Ady;Dozasy;Bahasy;Galyndy\nTürkmen dermany;5 mg;12,5;7';
  await c.post('/admin/import/apply', { text, mode: 'upsert', stock: 'replace' });
  const row = db.prepare("SELECT o.price, o.quantity, d.dosage FROM offers o JOIN drugs d ON d.id = o.drug_id WHERE d.name = 'Türkmen dermany'").get();
  assert.deepEqual({ ...row }, { price: 12.5, quantity: 7, dosage: '5 mg' });
});
