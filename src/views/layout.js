'use strict';
const { html, raw } = require('../html');
const { LANGS } = require('../i18n');

function money(ctx, n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  const s = v.toLocaleString(ctx.locale, { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
  return `${s} ${ctx.settings.currency}`;
}

function dateFmt(ctx, s) {
  if (!s) return '';
  const d = new Date(`${s.replace(' ', 'T')}Z`);
  return d.toLocaleString(ctx.locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function drugTitle(d) {
  return [d.name, d.form, d.dosage, d.pack].filter(Boolean).join(' ');
}

function qs(params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}

function pagination(page, pages, params) {
  if (pages <= 1) return '';
  const items = [];
  const from = Math.max(1, page - 2);
  const to = Math.min(pages, page + 2);
  if (page > 1) items.push(html`<a href="${qs({ ...params, page: page - 1 })}">←</a>`);
  if (from > 1) items.push(html`<a href="${qs({ ...params, page: 1 })}">1</a>${from > 2 ? html`<span>…</span>` : ''}`);
  for (let i = from; i <= to; i++) {
    items.push(i === page ? html`<span class="current">${i}</span>` : html`<a href="${qs({ ...params, page: i })}">${i}</a>`);
  }
  if (to < pages) items.push(html`${to < pages - 1 ? html`<span>…</span>` : ''}<a href="${qs({ ...params, page: pages })}">${pages}</a>`);
  if (page < pages) items.push(html`<a href="${qs({ ...params, page: page + 1 })}">→</a>`);
  return html`<nav class="pagination">${items}</nav>`;
}

function flashBlock(flash) {
  if (!flash) return '';
  return html`<div class="flash flash-${flash.type || 'info'}">${flash.message}</div>`;
}

function langSwitch(ctx) {
  return html`<div class="lang-switch">${Object.entries(LANGS).map(([code, l]) => (code === ctx.lang
    ? html`<span class="active" title="${l.label}">${l.short}</span>`
    : html`<a href="/lang/${code}" title="${l.label}" hreflang="${code}" lang="${code}">${l.short}</a>`))}</div>`;
}

// Strings needed by public/app.js
function clientStrings(ctx) {
  const { t } = ctx;
  const data = {
    from: t('price.from'),
    out: t('stock.out'),
    inPharmacies: t('suggest.in_pharmacies'),
    generate: t('admin.generate'),
    locale: ctx.locale,
  };
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

function layout(ctx, { title, body, q = '', admin = false }) {
  const { settings, user, t } = ctx;
  return html`<!doctype html>
<html lang="${ctx.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title ? `${title} — ${settings.site_name}` : settings.site_name}</title>
<link rel="stylesheet" href="/static/style.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%23119f6d'/><path d='M13 7h6v6h6v6h-6v6h-6v-6H7v-6h6z' fill='white'/></svg>">
</head>
<body class="${admin ? 'is-admin' : ''}">
<header class="topbar">
  <div class="container topbar-inner">
    <a class="logo" href="/"><span class="logo-mark">+</span><span>${settings.site_name}</span></a>
    <form class="topsearch" action="/search" method="get" role="search">
      <input type="search" name="q" value="${q}" placeholder="${t('search.placeholder')}" autocomplete="off" data-suggest>
      <button type="submit">${t('search.button')}</button>
      <div class="suggest" hidden></div>
    </form>
    <nav class="topnav">
      <a href="/catalog">${t('nav.catalog')}</a>
      <a href="/pharmacies">${t('nav.pharmacies')}</a>
      ${user ? html`<a class="btn btn-small" href="/admin">${t('nav.cabinet')}</a>` : html`<a class="btn btn-small btn-ghost" href="/login">${t('nav.for_pharmacies')}</a>`}
    </nav>
    ${langSwitch(ctx)}
  </div>
</header>
${admin ? adminNav(ctx) : ''}
<main class="container">
${flashBlock(ctx.flash)}
${body}
</main>
<footer class="footer">
  <div class="container footer-inner">
    <div>
      <strong>${settings.site_name}</strong><br>
      <span class="muted">${settings.site_tagline}</span>
    </div>
    <div class="muted small">
      ${t('footer.prices')}<br>
      ${t('footer.medical')}
    </div>
  </div>
</footer>
<script id="i18n" type="application/json">${raw(clientStrings(ctx))}</script>
<script src="/static/app.js" defer></script>
</body>
</html>`;
}

function adminNav(ctx) {
  const { user, path, t } = ctx;
  const link = (href, label) => html`<a href="${href}" class="${path === href || (href !== '/admin' && path.startsWith(href)) ? 'active' : ''}">${label}</a>`;
  return html`<div class="adminbar"><div class="container adminbar-inner">
    <div class="adminbar-links">
      ${link('/admin', t('admin.nav.overview'))}
      ${link('/admin/offers', t('admin.nav.offers'))}
      ${link('/admin/offers/new', t('admin.nav.add'))}
      ${link('/admin/import', t('admin.nav.import'))}
      ${user.role === 'admin'
        ? [link('/admin/drugs', t('admin.nav.drugs')), link('/admin/pharmacies', t('admin.nav.pharmacies')), link('/admin/settings', t('admin.nav.settings'))]
        : link('/admin/profile', t('admin.nav.profile'))}
    </div>
    <div class="adminbar-user">
      <span class="muted">${user.login}${user.pharmacy_name ? html` · ${user.pharmacy_name}` : user.role === 'admin' ? ` · ${t('admin.role_admin')}` : ''}</span>
      <a href="/admin/account">${t('admin.nav.password')}</a>
      <form method="post" action="/logout" class="inline"><input type="hidden" name="_csrf" value="${ctx.csrf}"><button class="linklike">${t('admin.nav.logout')}</button></form>
    </div>
  </div></div>`;
}

module.exports = { layout, money, dateFmt, drugTitle, qs, pagination };
