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
