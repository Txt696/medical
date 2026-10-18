'use strict';
const { html } = require('../html');
const { layout, money, plural, dateRu, drugTitle, qs, pagination } = require('./layout');

function rxBadge(d) {
  return d.rx ? html`<span class="badge badge-rx" title="Отпускается по рецепту врача">Rx</span>` : '';
}

function drugCard(ctx, d) {
  const cur = ctx.settings.currency;
  return html`<a class="drug-card" href="/drug/${d.id}">
    <div class="drug-card-main">
      <div class="drug-card-title">${d.name} ${rxBadge(d)}</div>
      <div class="drug-card-sub">${[d.form, d.dosage, d.pack].filter(Boolean).join(' · ')}</div>
      <div class="drug-card-meta muted">${[d.inn && `МНН: ${d.inn}`, d.manufacturer].filter(Boolean).join(' · ')}</div>
    </div>
    <div class="drug-card-price">
      ${d.offers_count
        ? html`<div class="price-from">от <strong>${money(d.min_price, cur)}</strong></div>
               ${d.max_price > d.min_price ? html`<div class="muted small">до ${money(d.max_price, cur)}</div>` : ''}
               <div class="small">в ${d.offers_count} ${plural(d.offers_count, 'аптеке', 'аптеках', 'аптеках')}</div>`
        : html`<div class="muted small">нет в наличии</div>`}
    </div>
  </a>`;
}

function home(ctx, { stats, categories, popular, pharmacies }) {
  const body = html`
  <section class="hero">
    <h1>${ctx.settings.site_tagline}</h1>
    <p class="muted">Найдите нужный препарат и выберите аптеку с лучшей ценой. Данные обновляют сами аптеки.</p>
    <form class="hero-search" action="/search" method="get">
      <input type="search" name="q" placeholder="Например: парацетамол, ибупрофен, но-шпа" autocomplete="off" data-suggest autofocus>
      <button type="submit">Найти лекарство</button>
      <div class="suggest" hidden></div>
    </form>
    <div class="hero-stats">
      <div><strong>${stats.drugs}</strong> препаратов</div>
      <div><strong>${stats.pharmacies}</strong> ${plural(stats.pharmacies, 'аптека', 'аптеки', 'аптек')}</div>
      <div><strong>${stats.offers}</strong> ${plural(stats.offers, 'предложение', 'предложения', 'предложений')}</div>
    </div>
  </section>

  ${categories.length ? html`<section>
    <h2>Категории</h2>
    <div class="chips">${categories.map((c) => html`<a class="chip" href="/search${qs({ category: c.category })}">${c.category} <span class="muted">${c.n}</span></a>`)}</div>
  </section>` : ''}

  ${popular.length ? html`<section>
    <h2>Чаще всего в аптеках</h2>
    <div class="drug-grid">${popular.map((d) => drugCard(ctx, d))}</div>
  </section>` : ''}

  ${pharmacies.length ? html`<section>
    <h2>Аптеки <a class="small" href="/pharmacies">все →</a></h2>
    <div class="pharm-grid">${pharmacies.map(pharmacyCard)}</div>
  </section>` : ''}

  <section class="howto">
    <div><span class="howto-num">1</span><h3>Найдите препарат</h3><p class="muted">По торговому названию или действующему веществу (МНН).</p></div>
    <div><span class="howto-num">2</span><h3>Сравните цены</h3><p class="muted">Цены во всех аптеках, от самой низкой к самой высокой.</p></div>
    <div><span class="howto-num">3</span><h3>Позвоните и заберите</h3><p class="muted">Уточните наличие по телефону аптеки и приезжайте.</p></div>
  </section>

  <section class="cta-pharm">
    <div>
      <h2>Вы — аптека?</h2>
      <p>Добавляйте свои товары и цены вручную или загрузите весь прайс-лист одним текстом.</p>
    </div>
    <a class="btn" href="/login">Войти в кабинет аптеки</a>
  </section>`;
  return layout(ctx, { body });
}

function pharmacyCard(p) {
  return html`<a class="pharm-card" href="/pharmacy/${p.id}">
    <div class="pharm-card-name">${p.name}</div>
    <div class="muted small">${[p.city, p.address].filter(Boolean).join(', ')}</div>
    ${p.hours ? html`<div class="small">🕒 ${p.hours}</div>` : ''}
    ${p.offers_count !== undefined ? html`<div class="small">${p.offers_count} ${plural(p.offers_count, 'товар', 'товара', 'товаров')}</div>` : ''}
  </a>`;
}

function search(ctx, { q, category, city, sort, results, total, page, pages, categories, cities, alternatives }) {
  const params = { q, category, city, sort };
  const body = html`
  <div class="page-head">
    <h1>${q ? html`Результаты по запросу «${q}»` : category ? category : 'Каталог лекарств'}</h1>
    <div class="muted">${total} ${plural(total, 'препарат', 'препарата', 'препаратов')}</div>
  </div>
  <div class="with-sidebar">
    <aside class="filters">
      <form method="get" action="/search">
        <input type="hidden" name="q" value="${q}">
        <label>Категория
          <select name="category" data-autosubmit>
            <option value="">Все</option>
            ${categories.map((c) => html`<option ${c === category ? 'selected' : ''}>${c}</option>`)}
          </select>
        </label>
        ${cities.length > 1 ? html`<label>Город
          <select name="city" data-autosubmit>
            <option value="">Все</option>
            ${cities.map((c) => html`<option ${c === city ? 'selected' : ''}>${c}</option>`)}
          </select>
        </label>` : ''}
        <label>Сортировка
          <select name="sort" data-autosubmit>
            <option value="relevance" ${sort === 'relevance' ? 'selected' : ''}>По названию</option>
            <option value="price" ${sort === 'price' ? 'selected' : ''}>Сначала дешевле</option>
            <option value="price_desc" ${sort === 'price_desc' ? 'selected' : ''}>Сначала дороже</option>
            <option value="offers" ${sort === 'offers' ? 'selected' : ''}>Больше аптек</option>
          </select>
        </label>
        <label class="check"><input type="checkbox" name="available" value="1" ${ctx.query.available ? 'checked' : ''} data-autosubmit> Только в наличии</label>
        <noscript><button class="btn btn-small">Применить</button></noscript>
      </form>
    </aside>
    <div>
      ${results.length ? html`<div class="drug-list">${results.map((d) => drugCard(ctx, d))}</div>` : html`<div class="empty">
        <p>Ничего не найдено. Проверьте написание или поищите по действующему веществу.</p>
      </div>`}
      ${pagination(page, pages, { ...params, available: ctx.query.available })}
      ${alternatives && alternatives.length ? html`<h3>Возможно, вы искали</h3><div class="drug-list">${alternatives.map((d) => drugCard(ctx, d))}</div>` : ''}
    </div>
  </div>`;
  return layout(ctx, { title: q || category || 'Каталог', body, q });
}

function drugPage(ctx, { drug, offers, analogs, city, cities, sort }) {
  const cur = ctx.settings.currency;
  const inStock = offers.filter((o) => o.quantity === null || o.quantity > 0);
  const prices = inStock.map((o) => o.price);
  const min = prices.length ? Math.min(...prices) : null;
  const max = prices.length ? Math.max(...prices) : null;
  const body = html`
  <nav class="crumbs"><a href="/">Главная</a> / <a href="/catalog">Каталог</a>${drug.category ? html` / <a href="/search${qs({ category: drug.category })}">${drug.category}</a>` : ''}</nav>
  <div class="drug-head">
    <div>
      <h1>${drug.name} ${rxBadge(drug)}</h1>
      <div class="drug-sub">${[drug.form, drug.dosage, drug.pack].filter(Boolean).join(' · ')}</div>
      <dl class="props">
        ${drug.inn ? html`<dt>Действующее вещество (МНН)</dt><dd><a href="/search${qs({ q: drug.inn })}">${drug.inn}</a></dd>` : ''}
        ${drug.manufacturer ? html`<dt>Производитель</dt><dd>${drug.manufacturer}${drug.country ? `, ${drug.country}` : ''}</dd>` : ''}
        ${drug.category ? html`<dt>Категория</dt><dd>${drug.category}</dd>` : ''}
        <dt>Отпуск</dt><dd>${drug.rx ? 'по рецепту' : 'без рецепта'}</dd>
      </dl>
      ${drug.description ? html`<p class="drug-desc">${drug.description}</p>` : ''}
    </div>
    <div class="price-box">
      ${min !== null ? html`
        <div class="muted small">Цена в аптеках</div>
        <div class="price-range">${min === max ? money(min, cur) : html`${money(min, cur)} – ${money(max, cur)}`}</div>
        ${max > min ? html`<div class="saving">Экономия до ${money(max - min, cur)} (${Math.round((1 - min / max) * 100)}%)</div>` : ''}
        <div class="small">в наличии в ${inStock.length} ${plural(inStock.length, 'аптеке', 'аптеках', 'аптеках')}</div>`
      : html`<div class="muted">Сейчас нет в наличии</div>`}
    </div>
  </div>

  <section>
    <div class="section-head">
      <h2>Где купить</h2>
      <form method="get" class="inline-filters">
        ${cities.length > 1 ? html`<select name="city" data-autosubmit>
          <option value="">Все города</option>
          ${cities.map((c) => html`<option ${c === city ? 'selected' : ''}>${c}</option>`)}
        </select>` : ''}
        <select name="sort" data-autosubmit>
          <option value="price" ${sort === 'price' ? 'selected' : ''}>Сначала дешевле</option>
          <option value="price_desc" ${sort === 'price_desc' ? 'selected' : ''}>Сначала дороже</option>
          <option value="updated" ${sort === 'updated' ? 'selected' : ''}>Недавно обновлённые</option>
          <option value="name" ${sort === 'name' ? 'selected' : ''}>По названию аптеки</option>
        </select>
      </form>
    </div>
    ${offers.length ? html`<div class="offers">
      ${offers.map((o) => {
        const out = o.quantity === 0;
        return html`<div class="offer ${o.price === min && !out ? 'offer-best' : ''} ${out ? 'offer-out' : ''}">
          <div class="offer-pharm">
            <a href="/pharmacy/${o.pharmacy_id}"><strong>${o.pharmacy_name}</strong></a>
            ${o.price === min && !out && max > min ? html`<span class="badge badge-best">Лучшая цена</span>` : ''}
            <div class="muted small">${[o.city, o.address].filter(Boolean).join(', ')}${o.hours ? html` · 🕒 ${o.hours}` : ''}</div>
          </div>
          <div class="offer-stock small">${out ? html`<span class="muted">нет в наличии</span>` : o.quantity ? html`в наличии: ${o.quantity} уп.` : 'в наличии'}<br><span class="muted">обновлено ${dateRu(o.updated_at)}</span></div>
          <div class="offer-price">${money(o.price, cur)}</div>
          <div class="offer-action">${o.phone ? html`<a class="btn btn-small" href="tel:${o.phone.replace(/[^\d+]/g, '')}">${o.phone}</a>` : ''}</div>
        </div>`;
      })}
    </div>` : html`<div class="empty">Ни одна аптека пока не добавила этот препарат.</div>`}
  </section>

  ${analogs.length ? html`<section>
    <h2>Аналоги${drug.inn ? html` <span class="muted small">— то же действующее вещество: ${drug.inn}</span>` : ''}</h2>
    <div class="drug-grid">${analogs.map((d) => drugCard(ctx, d))}</div>
  </section>` : ''}`;
  return layout(ctx, { title: drugTitle(drug), body });
}

function catalog(ctx, { letters, letter, drugs, categories }) {
  const body = html`
  <div class="page-head"><h1>Каталог препаратов</h1></div>
  ${categories.length ? html`<div class="chips">${categories.map((c) => html`<a class="chip" href="/search${qs({ category: c.category })}">${c.category} <span class="muted">${c.n}</span></a>`)}</div>` : ''}
  <div class="letters">${letters.map((l) => html`<a class="${l === letter ? 'active' : ''}" href="/catalog${qs({ letter: l })}">${l}</a>`)}</div>
  ${drugs.length ? html`<ul class="az-list">${drugs.map((d) => html`<li><a href="/drug/${d.id}">${drugTitle(d)}</a> ${d.min_price !== null ? html`<span class="muted small">от ${money(d.min_price, ctx.settings.currency)}</span>` : ''}</li>`)}</ul>`
    : html`<div class="empty">Выберите букву.</div>`}`;
  return layout(ctx, { title: 'Каталог', body });
}

function pharmacies(ctx, { list, cities, city, q }) {
  const body = html`
  <div class="page-head"><h1>Аптеки</h1><div class="muted">${list.length} ${plural(list.length, 'аптека', 'аптеки', 'аптек')}</div></div>
  <form class="inline-filters" method="get">
    <input type="search" name="q" value="${q}" placeholder="Название или адрес">
    ${cities.length > 1 ? html`<select name="city" data-autosubmit><option value="">Все города</option>${cities.map((c) => html`<option ${c === city ? 'selected' : ''}>${c}</option>`)}</select>` : ''}
    <button class="btn btn-small">Найти</button>
  </form>
  <div class="pharm-grid">${list.map(pharmacyCard)}</div>`;
  return layout(ctx, { title: 'Аптеки', body });
}

function pharmacyPage(ctx, { pharmacy: p, offers, q, page, pages, total }) {
  const cur = ctx.settings.currency;
  const body = html`
  <nav class="crumbs"><a href="/">Главная</a> / <a href="/pharmacies">Аптеки</a></nav>
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
    <h2>Товары и цены <span class="muted small">${total}</span></h2>
    <form method="get" class="inline-filters"><input type="search" name="q" value="${q}" placeholder="Поиск в этой аптеке"><button class="btn btn-small">Найти</button></form>
  </div>
  ${offers.length ? html`<div class="table-wrap"><table class="table">
    <thead><tr><th>Препарат</th><th>Производитель</th><th>Наличие</th><th class="num">Цена</th></tr></thead>
    <tbody>${offers.map((o) => html`<tr class="${o.quantity === 0 ? 'row-out' : ''}">
      <td><a href="/drug/${o.drug_id}">${drugTitle(o)}</a> ${rxBadge(o)}</td>
      <td class="muted">${o.manufacturer}</td>
      <td class="small">${o.quantity === 0 ? 'нет' : o.quantity ? `${o.quantity} уп.` : 'есть'}</td>
      <td class="num"><strong>${money(o.price, cur)}</strong></td>
    </tr>`)}</tbody>
  </table></div>` : html`<div class="empty">Товары не найдены.</div>`}
  ${pagination(page, pages, { q })}`;
  return layout(ctx, { title: p.name, body });
}

function login(ctx, { error, login }) {
  const body = html`<div class="auth-box">
    <h1>Вход для аптек</h1>
    <p class="muted">Учётную запись аптеки выдаёт администратор справочной.</p>
    ${error ? html`<div class="flash flash-error">${error}</div>` : ''}
    <form method="post" action="/login" class="form">
      <input type="hidden" name="_csrf" value="${ctx.csrf}">
      <label>Логин <input name="login" value="${login || ''}" required autofocus autocomplete="username"></label>
      <label>Пароль <input type="password" name="password" required autocomplete="current-password"></label>
      <button class="btn">Войти</button>
    </form>
  </div>`;
  return layout(ctx, { title: 'Вход', body });
}

function notFound(ctx, message = 'Страница не найдена') {
  return layout(ctx, { title: 'Не найдено', body: html`<div class="empty"><h1>404</h1><p>${message}</p><a class="btn" href="/">На главную</a></div>` });
}

module.exports = { home, search, drugPage, catalog, pharmacies, pharmacyPage, login, notFound };
