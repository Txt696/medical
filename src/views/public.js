'use strict';
const { html } = require('../html');
const { layout, money, dateFmt, drugTitle, qs, pagination } = require('./layout');

function rxBadge(ctx, d) {
  return d.rx ? html`<span class="badge badge-rx" title="${ctx.t('drug.rx_title')}">Rx</span>` : '';
}

function drugCard(ctx, d) {
  const { t } = ctx;
  return html`<a class="drug-card" href="/drug/${d.id}">
    <div class="drug-card-main">
      <div class="drug-card-title">${d.name} ${rxBadge(ctx, d)}</div>
      <div class="drug-card-sub">${[d.form, d.dosage, d.pack].filter(Boolean).join(' · ')}</div>
      <div class="drug-card-meta muted">${[d.inn && `${t('drug.inn_short')}: ${d.inn}`, d.manufacturer].filter(Boolean).join(' · ')}</div>
    </div>
    <div class="drug-card-price">
      ${d.offers_count
        ? html`<div class="price-from">${t('price.from')} <strong>${money(ctx, d.min_price)}</strong></div>
               ${d.max_price > d.min_price ? html`<div class="muted small">${t('price.to')} ${money(ctx, d.max_price)}</div>` : ''}
               <div class="small">${t('n.in_pharmacies', { n: d.offers_count })}</div>`
        : html`<div class="muted small">${t('stock.out')}</div>`}
    </div>
  </a>`;
}

function categoryChips(categories) {
  return html`<div class="chips">${categories.map((c) => html`<a class="chip" href="/search${qs({ category: c.category })}">${c.category} <span class="muted">${c.n}</span></a>`)}</div>`;
}

function home(ctx, { stats, categories, popular, pharmacies }) {
  const { t } = ctx;
  const body = html`
  <section class="hero">
    <h1>${ctx.settings.site_tagline}</h1>
    <p class="muted">${t('home.lead')}</p>
    <form class="hero-search" action="/search" method="get">
      <input type="search" name="q" placeholder="${t('home.search_placeholder')}" autocomplete="off" data-suggest autofocus>
      <button type="submit">${t('home.search_button')}</button>
      <div class="suggest" hidden></div>
    </form>
    <div class="hero-stats">
      <div>${t('n.drugs_stat', { n: stats.drugs })}</div>
      <div>${t('n.pharmacies_stat', { n: stats.pharmacies })}</div>
      <div>${t('n.offers_stat', { n: stats.offers })}</div>
    </div>
  </section>

  ${categories.length ? html`<section>
    <h2>${t('home.categories')}</h2>
    ${categoryChips(categories)}
  </section>` : ''}

  ${popular.length ? html`<section>
    <h2>${t('home.popular')}</h2>
    <div class="drug-grid">${popular.map((d) => drugCard(ctx, d))}</div>
  </section>` : ''}

  ${pharmacies.length ? html`<section>
    <h2>${t('nav.pharmacies')} <a class="small" href="/pharmacies">${t('home.all')} →</a></h2>
    <div class="pharm-grid">${pharmacies.map((p) => pharmacyCard(ctx, p))}</div>
  </section>` : ''}

  <section class="howto">
    <div><span class="howto-num">1</span><h3>${t('home.step1')}</h3><p class="muted">${t('home.step1_text')}</p></div>
    <div><span class="howto-num">2</span><h3>${t('home.step2')}</h3><p class="muted">${t('home.step2_text')}</p></div>
    <div><span class="howto-num">3</span><h3>${t('home.step3')}</h3><p class="muted">${t('home.step3_text')}</p></div>
  </section>

  <section class="cta-pharm">
    <div>
      <h2>${t('home.cta_title')}</h2>
      <p>${t('home.cta_text')}</p>
    </div>
    <a class="btn" href="/login">${t('home.cta_button')}</a>
  </section>`;
  return layout(ctx, { body });
}

function pharmacyCard(ctx, p) {
  return html`<a class="pharm-card" href="/pharmacy/${p.id}">
    <div class="pharm-card-name">${p.name}</div>
    <div class="muted small">${[p.city, p.address].filter(Boolean).join(', ')}</div>
    ${p.hours ? html`<div class="small">🕒 ${p.hours}</div>` : ''}
    ${p.offers_count !== undefined ? html`<div class="small">${ctx.t('n.products', { n: p.offers_count })}</div>` : ''}
  </a>`;
}

function search(ctx, { q, category, city, sort, results, total, page, pages, categories, cities, alternatives }) {
  const { t } = ctx;
  const params = { q, category, city, sort };
  const body = html`
  <div class="page-head">
    <h1>${q ? t('search.results_for', { q }) : category || t('search.catalog_title')}</h1>
    <div class="muted">${t('n.drugs', { n: total })}</div>
  </div>
  <div class="with-sidebar">
    <aside class="filters">
      <form method="get" action="/search">
        <input type="hidden" name="q" value="${q}">
        <label>${t('field.category')}
          <select name="category" data-autosubmit>
            <option value="">${t('filter.all')}</option>
            ${categories.map((c) => html`<option ${c === category ? 'selected' : ''}>${c}</option>`)}
          </select>
        </label>
        ${cities.length > 1 ? html`<label>${t('field.city')}
          <select name="city" data-autosubmit>
            <option value="">${t('filter.all')}</option>
            ${cities.map((c) => html`<option ${c === city ? 'selected' : ''}>${c}</option>`)}
          </select>
        </label>` : ''}
        <label>${t('filter.sort')}
          <select name="sort" data-autosubmit>
            <option value="relevance" ${sort === 'relevance' ? 'selected' : ''}>${t('sort.name')}</option>
            <option value="price" ${sort === 'price' ? 'selected' : ''}>${t('sort.cheap')}</option>
            <option value="price_desc" ${sort === 'price_desc' ? 'selected' : ''}>${t('sort.expensive')}</option>
            <option value="offers" ${sort === 'offers' ? 'selected' : ''}>${t('sort.offers')}</option>
          </select>
        </label>
        <label class="check"><input type="checkbox" name="available" value="1" ${ctx.query.available ? 'checked' : ''} data-autosubmit> ${t('filter.available')}</label>
        <noscript><button class="btn btn-small">${t('filter.apply')}</button></noscript>
      </form>
    </aside>
    <div>
      ${results.length ? html`<div class="drug-list">${results.map((d) => drugCard(ctx, d))}</div>` : html`<div class="empty">
        <p>${t('search.nothing')}</p>
      </div>`}
      ${pagination(page, pages, { ...params, available: ctx.query.available })}
      ${alternatives && alternatives.length ? html`<h3>${t('search.maybe')}</h3><div class="drug-list">${alternatives.map((d) => drugCard(ctx, d))}</div>` : ''}
    </div>
  </div>`;
  return layout(ctx, { title: q || category || t('nav.catalog'), body, q });
}

function drugPage(ctx, { drug, offers, analogs, city, cities, sort }) {
  const { t } = ctx;
  const inStock = offers.filter((o) => o.quantity === null || o.quantity > 0);
  const prices = inStock.map((o) => o.price);
  const min = prices.length ? Math.min(...prices) : null;
  const max = prices.length ? Math.max(...prices) : null;
  const body = html`
  <nav class="crumbs"><a href="/">${t('nav.home')}</a> / <a href="/catalog">${t('nav.catalog')}</a>${drug.category ? html` / <a href="/search${qs({ category: drug.category })}">${drug.category}</a>` : ''}</nav>
  <div class="drug-head">
    <div>
      <h1>${drug.name} ${rxBadge(ctx, drug)}</h1>
      <div class="drug-sub">${[drug.form, drug.dosage, drug.pack].filter(Boolean).join(' · ')}</div>
      <dl class="props">
        ${drug.inn ? html`<dt>${t('drug.inn')}</dt><dd><a href="/search${qs({ q: drug.inn })}">${drug.inn}</a></dd>` : ''}
        ${drug.manufacturer ? html`<dt>${t('field.manufacturer')}</dt><dd>${drug.manufacturer}${drug.country ? `, ${drug.country}` : ''}</dd>` : ''}
        ${drug.category ? html`<dt>${t('field.category')}</dt><dd>${drug.category}</dd>` : ''}
        <dt>${t('drug.dispensing')}</dt><dd>${drug.rx ? t('drug.rx_yes') : t('drug.rx_no')}</dd>
      </dl>
      ${drug.description ? html`<p class="drug-desc">${drug.description}</p>` : ''}
    </div>
    <div class="price-box">
      ${min !== null ? html`
        <div class="muted small">${t('drug.price_in_pharmacies')}</div>
        <div class="price-range">${min === max ? money(ctx, min) : html`${money(ctx, min)} – ${money(ctx, max)}`}</div>
        ${max > min ? html`<div class="saving">${t('drug.saving', { sum: money(ctx, max - min), pct: Math.round((1 - min / max) * 100) })}</div>` : ''}
        <div class="small">${t('n.in_stock_in', { n: inStock.length })}</div>`
      : html`<div class="muted">${t('drug.not_available')}</div>`}
    </div>
  </div>

  <section>
    <div class="section-head">
      <h2>${t('drug.where_to_buy')}</h2>
      <form method="get" class="inline-filters">
        ${cities.length > 1 ? html`<select name="city" data-autosubmit>
          <option value="">${t('filter.all_cities')}</option>
          ${cities.map((c) => html`<option ${c === city ? 'selected' : ''}>${c}</option>`)}
        </select>` : ''}
        <select name="sort" data-autosubmit>
          <option value="price" ${sort === 'price' ? 'selected' : ''}>${t('sort.cheap')}</option>
          <option value="price_desc" ${sort === 'price_desc' ? 'selected' : ''}>${t('sort.expensive')}</option>
          <option value="updated" ${sort === 'updated' ? 'selected' : ''}>${t('sort.updated')}</option>
          <option value="name" ${sort === 'name' ? 'selected' : ''}>${t('sort.pharmacy_name')}</option>
        </select>
      </form>
    </div>
    ${offers.length ? html`<div class="offers">
      ${offers.map((o) => {
        const out = o.quantity === 0;
        return html`<div class="offer ${o.price === min && !out ? 'offer-best' : ''} ${out ? 'offer-out' : ''}">
          <div class="offer-pharm">
            <a href="/pharmacy/${o.pharmacy_id}"><strong>${o.pharmacy_name}</strong></a>
            ${o.price === min && !out && max > min ? html`<span class="badge badge-best">${t('drug.best_price')}</span>` : ''}
            <div class="muted small">${[o.city, o.address].filter(Boolean).join(', ')}${o.hours ? html` · 🕒 ${o.hours}` : ''}</div>
          </div>
          <div class="offer-stock small">${out ? html`<span class="muted">${t('stock.out')}</span>` : o.quantity ? t('stock.in_qty', { n: o.quantity }) : t('stock.in')}<br><span class="muted">${t('drug.updated', { date: dateFmt(ctx, o.updated_at) })}</span></div>
          <div class="offer-price">${money(ctx, o.price)}</div>
          <div class="offer-action">${o.phone ? html`<a class="btn btn-small" href="tel:${o.phone.replace(/[^\d+]/g, '')}">${o.phone}</a>` : ''}</div>
        </div>`;
      })}
    </div>` : html`<div class="empty">${t('drug.no_offers')}</div>`}
  </section>

  ${analogs.length ? html`<section>
    <h2>${t('drug.analogs')}${drug.inn ? html` <span class="muted small">— ${t('drug.analogs_same', { inn: drug.inn })}</span>` : ''}</h2>
    <div class="drug-grid">${analogs.map((d) => drugCard(ctx, d))}</div>
  </section>` : ''}`;
  return layout(ctx, { title: drugTitle(drug), body });
}

function catalog(ctx, { letters, letter, drugs, categories }) {
  const { t } = ctx;
  const body = html`
  <div class="page-head"><h1>${t('catalog.title')}</h1></div>
  ${categories.length ? categoryChips(categories) : ''}
  <div class="letters">${letters.map((l) => html`<a class="${l === letter ? 'active' : ''}" href="/catalog${qs({ letter: l })}">${l}</a>`)}</div>
  ${drugs.length ? html`<ul class="az-list">${drugs.map((d) => html`<li><a href="/drug/${d.id}">${drugTitle(d)}</a> ${d.min_price !== null ? html`<span class="muted small">${t('price.from')} ${money(ctx, d.min_price)}</span>` : ''}</li>`)}</ul>`
    : html`<div class="empty">${t('catalog.pick_letter')}</div>`}`;
  return layout(ctx, { title: t('nav.catalog'), body });
}

function pharmacies(ctx, { list, cities, city, q }) {
  const { t } = ctx;
  const body = html`
  <div class="page-head"><h1>${t('nav.pharmacies')}</h1><div class="muted">${t('n.pharmacies', { n: list.length })}</div></div>
  <form class="inline-filters" method="get">
    <input type="search" name="q" value="${q}" placeholder="${t('pharmacies.search_placeholder')}">
    ${cities.length > 1 ? html`<select name="city" data-autosubmit><option value="">${t('filter.all_cities')}</option>${cities.map((c) => html`<option ${c === city ? 'selected' : ''}>${c}</option>`)}</select>` : ''}
    <button class="btn btn-small">${t('search.button')}</button>
  </form>
  <div class="pharm-grid">${list.map((p) => pharmacyCard(ctx, p))}</div>`;
  return layout(ctx, { title: t('nav.pharmacies'), body });
}

function pharmacyPage(ctx, { pharmacy: p, offers, q, page, pages, total }) {
  const { t } = ctx;
  const body = html`
  <nav class="crumbs"><a href="/">${t('nav.home')}</a> / <a href="/pharmacies">${t('nav.pharmacies')}</a></nav>
  <div class="pharm-head">
    <div>
      <h1>${p.name}</h1>
      <div>${[p.city, p.address].filter(Boolean).join(', ')}</div>
      ${p.description ? html`<p class="muted">${p.description}</p>` : ''}
    </div>
    <div class="pharm-contacts">
      ${p.phone ? html`<a class="btn" href="tel:${p.phone.replace(/[^\d+]/g, '')}">${p.phone}</a>` : ''}
      ${p.hours ? html`<div>🕒 ${p.hours}</div>` : ''}
      ${p.website ? html`<div><a href="${/^https?:\/\//.test(p.website) ? p.website : `https://${p.website}`}" rel="nofollow noopener" target="_blank">${p.website}</a></div>` : ''}
    </div>
  </div>
  <div class="section-head">
    <h2>${t('pharmacy.products')} <span class="muted small">${total}</span></h2>
    <form method="get" class="inline-filters"><input type="search" name="q" value="${q}" placeholder="${t('pharmacy.search_placeholder')}"><button class="btn btn-small">${t('search.button')}</button></form>
  </div>
  ${offers.length ? html`<div class="table-wrap"><table class="table">
    <thead><tr><th>${t('field.drug')}</th><th>${t('field.manufacturer')}</th><th>${t('field.availability')}</th><th class="num">${t('field.price')}</th></tr></thead>
    <tbody>${offers.map((o) => html`<tr class="${o.quantity === 0 ? 'row-out' : ''}">
      <td><a href="/drug/${o.drug_id}">${drugTitle(o)}</a> ${rxBadge(ctx, o)}</td>
      <td class="muted">${o.manufacturer}</td>
      <td class="small">${o.quantity === 0 ? t('stock.no') : o.quantity ? t('stock.qty', { n: o.quantity }) : t('stock.yes')}</td>
      <td class="num"><strong>${money(ctx, o.price)}</strong></td>
    </tr>`)}</tbody>
  </table></div>` : html`<div class="empty">${t('pharmacy.nothing')}</div>`}
  ${pagination(page, pages, { q })}`;
  return layout(ctx, { title: p.name, body });
}

function login(ctx, { error, login }) {
  const { t } = ctx;
  const body = html`<div class="auth-box">
    <h1>${t('login.title')}</h1>
    <p class="muted">${t('login.text')}</p>
    ${error ? html`<div class="flash flash-error">${error}</div>` : ''}
    <form method="post" action="/login" class="form">
      <input type="hidden" name="_csrf" value="${ctx.csrf}">
      <label>${t('field.login')} <input name="login" value="${login || ''}" required autofocus autocomplete="username"></label>
      <label>${t('field.password')} <input type="password" name="password" required autocomplete="current-password"></label>
      <button class="btn">${t('login.button')}</button>
    </form>
  </div>`;
  return layout(ctx, { title: t('login.title'), body });
}

function notFound(ctx, message) {
  const { t } = ctx;
  return layout(ctx, { title: t('notfound.title'), body: html`<div class="empty"><h1>404</h1><p>${message || t('notfound.page')}</p><a class="btn" href="/">${t('notfound.home')}</a></div>` });
}

module.exports = { home, search, drugPage, catalog, pharmacies, pharmacyPage, login, notFound };
