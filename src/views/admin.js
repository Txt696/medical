'use strict';
const { html } = require('../html');
const { layout, money, dateFmt, drugTitle, qs, pagination } = require('./layout');
const { LANGS } = require('../i18n');

const page = (ctx, title, body) => layout(ctx, { title, body, admin: true });
const csrf = (ctx) => html`<input type="hidden" name="_csrf" value="${ctx.csrf}">`;
const errorBlock = (error) => (error ? html`<div class="flash flash-error">${error}</div>` : '');

function pharmacySelect(ctx, pharmacies, current, { name = 'pharmacy', autosubmit = true } = {}) {
  if (ctx.user.role !== 'admin') return '';
  return html`<label class="pharm-select">${ctx.t('field.pharmacy')}
    <select name="${name}" ${autosubmit ? 'data-autosubmit' : ''} required>
      ${pharmacies.map((p) => html`<option value="${p.id}" ${p.id === current ? 'selected' : ''}>${p.name}${p.city ? ` (${p.city})` : ''}</option>`)}
    </select></label>`;
}

function noPharmacies(ctx) {
  const { t } = ctx;
  return page(ctx, t('admin.no_pharmacies_title'), html`<div class="empty">
    <p>${t('admin.no_pharmacies')}</p><a class="btn" href="/admin/pharmacies">${t('admin.add_pharmacy')}</a></div>`);
}

function dashboard(ctx, { stats, pharmacy, pharmacies, recent }) {
  const { t } = ctx;
  const isAdmin = ctx.user.role === 'admin';
  const stat = (n, label, cls = '') => html`<div class="stat"><div class="stat-num ${cls}">${n}</div><div class="muted">${label}</div></div>`;
  const body = html`
  <div class="page-head"><h1>${isAdmin ? t('dash.admin_title') : pharmacy.name}</h1>
    ${pharmacy ? html`<a href="/pharmacy/${pharmacy.id}" target="_blank">${t('dash.public_page')} →</a>` : ''}</div>
  <div class="stat-row">
    ${isAdmin
      ? [stat(stats.pharmacies, t('dash.pharmacies')), stat(stats.drugs, t('dash.drugs')), stat(stats.offers, t('dash.offers'))]
      : [stat(stats.offers, t('dash.products_on_site')), stat(stats.out, t('stock.out')), stat(stats.updated ? dateFmt(ctx, stats.updated) : '—', t('dash.last_update'), 'small-num')]}
  </div>

  <div class="action-cards">
    <a class="action-card" href="/admin/offers/new"><strong>${t('dash.card_add')}</strong><span class="muted">${t('dash.card_add_text')}</span></a>
    <a class="action-card" href="/admin/import"><strong>${t('dash.card_import')}</strong><span class="muted">${t('dash.card_import_text')}</span></a>
    <a class="action-card" href="/admin/offers"><strong>${t('dash.card_offers')}</strong><span class="muted">${t('dash.card_offers_text')}</span></a>
  </div>

  ${isAdmin && pharmacies.length ? html`<h2>${t('nav.pharmacies')}</h2>
    <table class="table"><thead><tr><th>${t('field.pharmacy')}</th><th>${t('field.city')}</th><th class="num">${t('dash.products')}</th><th>${t('dash.updated')}</th><th></th></tr></thead>
    <tbody>${pharmacies.map((p) => html`<tr class="${p.is_active ? '' : 'row-out'}">
      <td><a href="/admin/pharmacies/${p.id}">${p.name}</a>${p.is_active ? '' : html` <span class="badge">${t('admin.hidden')}</span>`}</td><td>${p.city}</td>
      <td class="num">${p.offers_count}</td><td class="small">${dateFmt(ctx, p.last_update)}</td>
      <td><a href="/admin/offers?pharmacy=${p.id}">${t('admin.products_link')}</a></td></tr>`)}</tbody></table>` : ''}

  ${recent.length ? html`<h2>${t('dash.recent')}</h2>
    <table class="table"><thead><tr><th>${t('field.drug')}</th>${isAdmin ? html`<th>${t('field.pharmacy')}</th>` : ''}<th class="num">${t('field.price')}</th><th>${t('dash.updated')}</th></tr></thead>
    <tbody>${recent.map((o) => html`<tr><td><a href="/drug/${o.drug_id}">${drugTitle(o)}</a></td>${isAdmin ? html`<td>${o.pharmacy_name}</td>` : ''}
      <td class="num">${money(ctx, o.price)}</td><td class="small">${dateFmt(ctx, o.updated_at)}</td></tr>`)}</tbody></table>` : ''}`;
  return page(ctx, t('nav.cabinet'), body);
}

function offers(ctx, { pharmacies, pharmacyId, list, q, filter, total, page: p, pages }) {
  const { t } = ctx;
  const pharmParam = ctx.user.role === 'admin' ? pharmacyId : '';
  const body = html`
  <div class="page-head"><h1>${t('offers.title')}</h1>
    <div class="head-actions">
      <a class="btn btn-small btn-ghost" href="/admin/offers/export.csv${qs({ pharmacy: pharmParam })}">${t('offers.export')}</a>
      <a class="btn btn-small" href="/admin/offers/new${qs({ pharmacy: pharmParam })}">${t('admin.nav.add')}</a>
    </div>
  </div>
  <form method="get" class="inline-filters">
    ${pharmacySelect(ctx, pharmacies, pharmacyId)}
    <input type="search" name="q" value="${q}" placeholder="${t('offers.search')}">
    <select name="filter" data-autosubmit>
      <option value="">${t('filter.all')}</option>
      <option value="out" ${filter === 'out' ? 'selected' : ''}>${t('stock.out')}</option>
      <option value="old" ${filter === 'old' ? 'selected' : ''}>${t('offers.filter_old')}</option>
    </select>
    <button class="btn btn-small">${t('search.button')}</button>
  </form>
  <p class="muted small">${t('offers.total', { n: total })} ${t('offers.hint')}</p>
  ${list.length ? html`<div class="table-wrap"><table class="table table-edit">
    <thead><tr><th>${t('field.drug')}</th><th>${t('field.price')}, ${ctx.settings.currency}</th><th>${t('field.quantity')}</th><th>${t('dash.updated')}</th><th></th></tr></thead>
    <tbody>${list.map((o) => html`<tr>
      <td><a href="/drug/${o.drug_id}" target="_blank">${drugTitle(o)}</a><div class="muted small">${o.manufacturer}</div></td>
      <td><input form="o${o.id}" class="input-num" name="price" value="${o.price}" inputmode="decimal" required></td>
      <td><input form="o${o.id}" class="input-num" name="quantity" value="${o.quantity ?? ''}" inputmode="numeric" placeholder="${t('stock.yes')}"></td>
      <td class="small muted">${dateFmt(ctx, o.updated_at)}</td>
      <td class="row-actions">
        <form id="o${o.id}" method="post" action="/admin/offers/${o.id}">${csrf(ctx)}<button class="btn btn-small">${t('action.save')}</button></form>
        <form method="post" action="/admin/offers/${o.id}/delete" data-confirm="${t('offers.confirm_delete')}">${csrf(ctx)}<button class="btn btn-small btn-danger" title="${t('action.delete')}">✕</button></form>
      </td></tr>`)}</tbody></table></div>`
    : html`<div class="empty">${t('offers.empty_1')} <a href="/admin/offers/new">${t('offers.empty_add')}</a> ${t('offers.empty_or')} <a href="/admin/import">${t('offers.empty_import')}</a>.</div>`}
  ${pagination(p, pages, { q, filter, pharmacy: pharmParam })}`;
  return page(ctx, t('offers.title'), body);
}

const FORMS = {
  ru: ['таблетки', 'капсулы', 'сироп', 'раствор', 'ампулы', 'мазь', 'крем', 'гель', 'спрей', 'капли', 'суппозитории', 'порошок', 'суспензия'],
  tk: ['tabletka', 'kapsula', 'sirop', 'ergin', 'ampula', 'melhem', 'krem', 'gel', 'spreý', 'damja', 'şem', 'poroşok', 'suspenziýa'],
  en: ['tablets', 'capsules', 'syrup', 'solution', 'ampoules', 'ointment', 'cream', 'gel', 'spray', 'drops', 'suppositories', 'powder', 'suspension'],
};

function drugFields(ctx, d = {}) {
  const { t } = ctx;
  return html`
    <div class="grid-2">
      <label class="span-2">${t('field.trade_name')} *<input name="name" value="${d.name || ''}" required data-drug-name autocomplete="off"><div class="suggest" hidden></div></label>
      <label>${t('field.form')}<input name="form" value="${d.form || ''}" list="forms" placeholder="${FORMS[ctx.lang][0]}"></label>
      <label>${t('field.dosage')}<input name="dosage" value="${d.dosage || ''}" placeholder="500 mg"></label>
      <label>${t('field.pack')}<input name="pack" value="${d.pack || ''}" placeholder="№20"></label>
      <label>${t('drug.inn')}<input name="inn" value="${d.inn || ''}"></label>
      <label>${t('field.manufacturer')}<input name="manufacturer" value="${d.manufacturer || ''}"></label>
      <label>${t('field.country')}<input name="country" value="${d.country || ''}"></label>
      <label>${t('field.category')}<input name="category" value="${d.category || ''}" list="categories"></label>
      <label class="check"><input type="checkbox" name="rx" value="1" ${d.rx ? 'checked' : ''}> ${t('drug.rx_title')}</label>
    </div>
    <datalist id="forms">${FORMS[ctx.lang].map((f) => html`<option>${f}</option>`)}</datalist>`;
}

function offerNew(ctx, { pharmacies, pharmacyId, categories, values = {}, error }) {
  const { t } = ctx;
  const body = html`
  <div class="page-head"><h1>${t('offer_new.title')}</h1></div>
  ${errorBlock(error)}
  <form method="post" action="/admin/offers/new" class="form card" data-offer-form>
    ${csrf(ctx)}
    ${pharmacySelect(ctx, pharmacies, pharmacyId, { autosubmit: false })}
    <input type="hidden" name="drug_id" value="${values.drug_id || ''}">
    <h3>${t('field.drug')}</h3>
    <p class="muted small">${t('offer_new.hint')}</p>
    <div class="picked" ${values.drug_id ? '' : 'hidden'}>${t('offer_new.picked')} <button type="button" class="linklike" data-unpick>${t('offer_new.change')}</button></div>
    ${drugFields(ctx, values)}
    <datalist id="categories">${categories.map((c) => html`<option>${c}</option>`)}</datalist>
    <h3>${t('offer_new.price_stock')}</h3>
    <div class="grid-2">
      <label>${t('field.price')}, ${ctx.settings.currency} *<input name="price" value="${values.price || ''}" inputmode="decimal" required></label>
      <label>${t('offer_new.quantity')}<input name="quantity" value="${values.quantity ?? ''}" inputmode="numeric" placeholder="${t('offer_new.quantity_placeholder')}"></label>
    </div>
    <div class="form-actions"><button class="btn">${t('action.save')}</button><button class="btn btn-ghost" name="more" value="1">${t('offer_new.save_more')}</button></div>
  </form>`;
  return page(ctx, t('offer_new.title'), body);
}

function importForm(ctx, { pharmacies, pharmacyId, text = '', mode = 'upsert', stock = 'replace' }) {
  const { t } = ctx;
  const sampleTable = t('import.sample_table');
  const body = html`
  <div class="page-head"><h1>${t('import.title')}</h1></div>
  <div class="with-sidebar sidebar-right">
    <form method="post" action="/admin/import/preview" class="form card">
      ${csrf(ctx)}
      ${pharmacySelect(ctx, pharmacies, pharmacyId, { autosubmit: false })}
      <label>${t('import.text')}
        <textarea name="text" rows="16" class="mono" placeholder="${sampleTable}" required data-import-text>${text}</textarea>
      </label>
      <label class="file-pick">${t('import.file')} <input type="file" accept=".csv,.txt,.tsv,text/plain,text/csv" data-import-file></label>
      <fieldset>
        <legend>${t('import.mode')}</legend>
        <label class="check"><input type="radio" name="mode" value="upsert" ${mode !== 'replace' ? 'checked' : ''}> ${t('import.mode_upsert')}</label>
        <label class="check"><input type="radio" name="mode" value="replace" ${mode === 'replace' ? 'checked' : ''}> ${t('import.mode_replace')}</label>
      </fieldset>
      <fieldset>
        <legend>${t('import.stock')}</legend>
        <label class="check"><input type="radio" name="stock" value="replace" ${stock !== 'add' ? 'checked' : ''}> ${t('import.stock_replace')}</label>
        <label class="check"><input type="radio" name="stock" value="add" ${stock === 'add' ? 'checked' : ''}> ${t('import.stock_add')}</label>
        <p class="muted small">${t('import.stock_hint')}</p>
      </fieldset>
      <div class="form-actions"><button class="btn">${t('import.check')} →</button><span class="muted small">${t('import.check_hint')}</span></div>
    </form>
    <aside class="help card">
      <h3>${t('import.formats')}</h3>
      <p><strong>1. ${t('import.f1')}</strong> — ${t('import.f1_text')}</p>
      <pre>${sampleTable}</pre>
      <p class="small muted">${t('import.columns_hint')}</p>
      <p><strong>2. ${t('import.f2')}</strong> — ${t('import.f2_text')}</p>
      <p><strong>3. ${t('import.f3')}</strong> — ${t('import.f3_text')}</p>
      <pre>${t('import.sample_free')}</pre>
      <p class="small muted">${t('import.matching_hint')}</p>
    </aside>
  </div>`;
  return page(ctx, t('admin.nav.import'), body);
}

function importPreview(ctx, { pharmacy, parsed, text, mode, stock, summary, toDelete }) {
  const { t } = ctx;
  const qtyText = (q) => (q === null || q === undefined ? t('stock.yes') : q);
  const stockChange = (r) => {
    if (r.oldQty === undefined) return qtyText(r.newQty);
    if (r.oldQty === r.newQty) return html`<span class="muted">${qtyText(r.newQty)}</span>`;
    return html`<span class="muted">${qtyText(r.oldQty)} →</span> <strong>${qtyText(r.newQty)}</strong>`;
  };
  const delimLabel = { '\t': t('import.delim_tab'), ';': '«;»', ',': '«,»', '|': '«|»' }[parsed.delimiter];
  const stat = (n, label, bad) => html`<div class="stat ${bad ? 'stat-bad' : ''}"><div class="stat-num">${n}</div><div class="muted">${label}</div></div>`;
  const body = html`
  <div class="page-head"><h1>${t('preview.title')}</h1><div class="muted">${pharmacy.name}</div></div>
  <div class="stat-row">
    ${stat(summary.ok, t('preview.ok'))}
    ${stat(summary.newDrugs, t('preview.new_drugs'))}
    ${stat(summary.updates, t('preview.updates'))}
    ${stat(summary.errors, t('preview.errors'), summary.errors)}
    ${mode === 'replace' ? stat(toDelete, t('preview.to_delete'), toDelete) : ''}
  </div>
  <p class="small"><strong>${t('import.stock')}:</strong> ${stock === 'add' ? t('preview.stock_add') : t('preview.stock_replace')}.</p>
  <p class="muted small">${t('preview.format')}: ${t(`preview.mode_${parsed.mode}`)}${delimLabel ? `; ${t('preview.delimiter')}: ${delimLabel}` : ''}${parsed.columns ? `; ${t('preview.columns')}: ${parsed.columns.map((c) => (c ? t(`field.${c}`) : t('preview.skip'))).join(', ')}` : ''}.</p>
  <div class="table-wrap"><table class="table">
    <thead><tr><th>#</th><th>${t('field.name')}</th><th>${t('field.form')}</th><th>${t('field.dosage')}</th><th>${t('field.pack')}</th><th>${t('field.manufacturer')}</th><th class="num">${t('field.price')}</th><th class="num">${t('preview.in_file')}</th><th class="num">${t('preview.becomes')}</th><th>${t('preview.status')}</th></tr></thead>
    <tbody>${parsed.rows.map((r) => html`<tr class="${r.error ? 'row-error' : ''}">
      <td class="muted">${r.line}</td><td>${r.drug.name}</td><td>${r.drug.form}</td><td>${r.drug.dosage}</td><td>${r.drug.pack}</td><td>${r.drug.manufacturer}</td>
      <td class="num">${Number.isNaN(r.price) ? '—' : money(ctx, r.price)}</td><td class="num">${r.quantity ?? ''}</td>
      <td class="num small">${r.error ? '' : stockChange(r)}</td>
      <td class="small">${r.matched && r.status !== 'dup' ? html`<div class="muted">→ <a href="/drug/${r.matched.id}" target="_blank">${drugTitle(r.matched)}</a></div>` : ''}${r.error ? html`<span class="err">${t(r.error)}</span><div class="muted mono">${r.raw}</div>`
        : r.status === 'new' ? html`<span class="badge badge-new">${t('preview.status_new')}</span>`
        : r.status === 'update' ? html`<span class="badge">${t('preview.status_update')}${r.oldPrice !== undefined ? ` (${t('preview.was', { price: money(ctx, r.oldPrice) })})` : ''}</span>`
        : r.status === 'dup' ? html`<span class="muted">${stock === 'add' ? t('preview.dup_add') : t('preview.dup_replace')}</span>`
        : html`<span class="badge badge-ok">${t('preview.status_existing')}</span>`}</td>
    </tr>`)}</tbody></table></div>
  <form method="post" action="/admin/import/apply" class="form-actions sticky-actions">
    ${csrf(ctx)}
    <input type="hidden" name="pharmacy" value="${pharmacy.id}">
    <input type="hidden" name="mode" value="${mode}">
    <input type="hidden" name="stock" value="${stock}">
    <textarea name="text" hidden>${text}</textarea>
    <button class="btn" ${summary.ok ? '' : 'disabled'}>${t('preview.load', { n: summary.ok })}</button>
    <button class="btn btn-ghost" formaction="/admin/import/edit">← ${t('preview.edit')}</button>
  </form>`;
  return page(ctx, t('preview.title'), body);
}

function drugs(ctx, { list, q, total, page: p, pages }) {
  const { t } = ctx;
  const body = html`
  <div class="page-head"><h1>${t('catalog.title')}</h1><a class="btn btn-small" href="/admin/drugs/new">+ ${t('drugs.new')}</a></div>
  <form method="get" class="inline-filters"><input type="search" name="q" value="${q}" placeholder="${t('offers.search')}"><button class="btn btn-small">${t('search.button')}</button>
    <a class="small" href="/admin/drugs${qs({ q, orphans: ctx.query.orphans ? '' : '1' })}">${ctx.query.orphans ? t('drugs.show_all') : t('drugs.only_orphans')}</a></form>
  <p class="muted small">${t('offers.total', { n: total })} ${t('drugs.shared_hint')}</p>
  <div class="table-wrap"><table class="table">
    <thead><tr><th>ID</th><th>${t('field.drug')}</th><th>${t('drug.inn_short')}</th><th>${t('field.manufacturer')}</th><th>${t('field.category')}</th><th class="num">${t('dash.pharmacies')}</th><th></th></tr></thead>
    <tbody>${list.map((d) => html`<tr>
      <td class="muted">${d.id}</td><td><a href="/admin/drugs/${d.id}">${drugTitle(d)}</a> ${d.rx ? html`<span class="badge badge-rx">Rx</span>` : ''}</td>
      <td>${d.inn}</td><td>${d.manufacturer}</td><td>${d.category}</td><td class="num">${d.offers_count}</td>
      <td><a href="/drug/${d.id}" target="_blank">${t('drugs.on_site')}</a></td></tr>`)}</tbody></table></div>
  ${pagination(p, pages, { q, orphans: ctx.query.orphans })}`;
  return page(ctx, t('admin.nav.drugs'), body);
}

function drugEdit(ctx, { drug, categories, error, offersCount }) {
  const { t } = ctx;
  const isNew = !drug.id;
  const body = html`
  <div class="page-head"><h1>${isNew ? t('drugs.new') : drugTitle(drug)}</h1></div>
  ${errorBlock(error)}
  <form method="post" action="${isNew ? '/admin/drugs/new' : `/admin/drugs/${drug.id}`}" class="form card">
    ${csrf(ctx)}
    ${drugFields(ctx, drug)}
    <datalist id="categories">${categories.map((c) => html`<option>${c}</option>`)}</datalist>
    <label>${t('drugs.description')}<textarea name="description" rows="4">${drug.description || ''}</textarea></label>
    <div class="form-actions"><button class="btn">${t('action.save')}</button><a href="/admin/drugs">${t('action.cancel')}</a></div>
  </form>
  ${isNew ? '' : html`<form method="post" action="/admin/drugs/${drug.id}/delete" class="danger-zone" data-confirm="${t('drugs.confirm_delete', { n: offersCount })}">
    ${csrf(ctx)}<button class="btn btn-danger btn-small">${t('drugs.delete')}</button> <span class="muted small">${t('drugs.offers_count', { n: offersCount })}</span></form>
    <form method="post" action="/admin/drugs/${drug.id}/merge" class="form card">
      ${csrf(ctx)}
      <h3>${t('drugs.merge_title')}</h3>
      <p class="muted small">${t('drugs.merge_text')}</p>
      <div class="inline-filters"><input name="target" placeholder="${t('drugs.merge_placeholder')}" inputmode="numeric" required><button class="btn btn-small">${t('drugs.merge')}</button></div>
    </form>`}`;
  return page(ctx, isNew ? t('drugs.new') : drug.name, body);
}

function pharmacyFields(ctx, p = {}) {
  const { t } = ctx;
  return html`<div class="grid-2">
    <label class="span-2">${t('field.name')} *<input name="name" value="${p.name || ''}" required></label>
    <label>${t('field.city')}<input name="city" value="${p.city || ''}"></label>
    <label>${t('field.address')}<input name="address" value="${p.address || ''}"></label>
    <label>${t('field.phone')}<input name="phone" value="${p.phone || ''}" type="tel"></label>
    <label>${t('field.hours')}<input name="hours" value="${p.hours || ''}" placeholder="${t('field.hours_placeholder')}"></label>
    <label class="span-2">${t('field.website')}<input name="website" value="${p.website || ''}"></label>
    <label class="span-2">${t('field.description')}<textarea name="description" rows="2">${p.description || ''}</textarea></label>
  </div>`;
}

function pharmacies(ctx, { list, error, values = {} }) {
  const { t } = ctx;
  const body = html`
  <div class="page-head"><h1>${t('nav.pharmacies')}</h1></div>
  ${list.length ? html`<table class="table"><thead><tr><th>${t('field.pharmacy')}</th><th>${t('field.address')}</th><th>${t('pharm.logins')}</th><th class="num">${t('dash.products')}</th><th></th></tr></thead>
    <tbody>${list.map((p) => html`<tr class="${p.is_active ? '' : 'row-out'}">
      <td><a href="/admin/pharmacies/${p.id}">${p.name}</a>${p.is_active ? '' : html` <span class="badge">${t('admin.hidden')}</span>`}</td>
      <td class="small">${[p.city, p.address].filter(Boolean).join(', ')}</td><td class="small">${p.logins || '—'}</td>
      <td class="num">${p.offers_count}</td><td><a href="/admin/offers?pharmacy=${p.id}">${t('admin.products_link')}</a></td></tr>`)}</tbody></table>` : ''}
  <h2 id="new">${t('pharm.new')}</h2>
  ${errorBlock(error)}
  <form method="post" action="/admin/pharmacies" class="form card">
    ${csrf(ctx)}
    ${pharmacyFields(ctx, values)}
    <h3>${t('pharm.access')}</h3>
    <div class="grid-2">
      <label>${t('field.login')} *<input name="login" value="${values.login || ''}" required autocomplete="off"></label>
      <label>${t('field.password')} * <input name="password" value="${values.password || ''}" required minlength="6" autocomplete="new-password" data-genpass></label>
    </div>
    <div class="form-actions"><button class="btn">${t('pharm.create')}</button></div>
  </form>`;
  return page(ctx, t('nav.pharmacies'), body);
}

function pharmacyEdit(ctx, { pharmacy: p, users, error }) {
  const { t } = ctx;
  const body = html`
  <nav class="crumbs"><a href="/admin/pharmacies">${t('nav.pharmacies')}</a></nav>
  <div class="page-head"><h1>${p.name}</h1><div class="head-actions"><a class="btn btn-small btn-ghost" href="/admin/offers?pharmacy=${p.id}">${t('dash.products')}</a><a class="btn btn-small btn-ghost" href="/admin/import?pharmacy=${p.id}">${t('admin.nav.import')}</a></div></div>
  ${errorBlock(error)}
  <form method="post" action="/admin/pharmacies/${p.id}" class="form card">
    ${csrf(ctx)}
    ${pharmacyFields(ctx, p)}
    <label class="check"><input type="checkbox" name="is_active" value="1" ${p.is_active ? 'checked' : ''}> ${t('pharm.visible')}</label>
    <div class="form-actions"><button class="btn">${t('action.save')}</button></div>
  </form>
  <h2>${t('pharm.users')}</h2>
  <table class="table"><thead><tr><th>${t('field.login')}</th><th>${t('pharm.created')}</th><th>${t('pharm.new_password')}</th><th></th></tr></thead>
  <tbody>${users.map((u) => html`<tr><td>${u.login}</td><td class="small">${dateFmt(ctx, u.created_at)}</td>
    <td><form method="post" action="/admin/users/${u.id}/password" class="inline-filters">${csrf(ctx)}<input name="password" minlength="6" required placeholder="${t('pharm.new_password')}" data-genpass><button class="btn btn-small">${t('pharm.change')}</button></form></td>
    <td><form method="post" action="/admin/users/${u.id}/delete" data-confirm="${t('pharm.confirm_delete_user', { login: u.login })}">${csrf(ctx)}<button class="btn btn-small btn-danger">✕</button></form></td></tr>`)}</tbody></table>
  <form method="post" action="/admin/pharmacies/${p.id}/users" class="inline-filters card">
    ${csrf(ctx)}<strong>${t('pharm.add_user')}:</strong>
    <input name="login" placeholder="${t('field.login')}" required><input name="password" placeholder="${t('field.password')}" minlength="6" required data-genpass><button class="btn btn-small">${t('action.add')}</button>
  </form>
  <form method="post" action="/admin/pharmacies/${p.id}/delete" class="danger-zone" data-confirm="${t('pharm.confirm_delete')}">
    ${csrf(ctx)}<button class="btn btn-danger btn-small">${t('pharm.delete')}</button></form>`;
  return page(ctx, p.name, body);
}

function profile(ctx, { pharmacy }) {
  const { t } = ctx;
  const body = html`
  <div class="page-head"><h1>${t('admin.nav.profile')}</h1><a href="/pharmacy/${pharmacy.id}" target="_blank">${t('dash.public_page')} →</a></div>
  <form method="post" action="/admin/profile" class="form card">${csrf(ctx)}${pharmacyFields(ctx, pharmacy)}<div class="form-actions"><button class="btn">${t('action.save')}</button></div></form>`;
  return page(ctx, t('admin.nav.profile'), body);
}

function account(ctx, { error }) {
  const { t } = ctx;
  const body = html`
  <div class="page-head"><h1>${t('account.title')}</h1></div>
  ${errorBlock(error)}
  <form method="post" action="/admin/account" class="form card narrow">
    ${csrf(ctx)}
    <label>${t('account.current')}<input type="password" name="current" required autocomplete="current-password"></label>
    <label>${t('account.new')}<input type="password" name="password" required minlength="6" autocomplete="new-password"></label>
    <label>${t('account.repeat')}<input type="password" name="password2" required minlength="6" autocomplete="new-password"></label>
    <div class="form-actions"><button class="btn">${t('account.button')}</button></div>
  </form>`;
  return page(ctx, t('admin.nav.password'), body);
}

function settingsPage(ctx) {
  const { t } = ctx;
  const s = ctx.rawSettings;
  const body = html`
  <div class="page-head"><h1>${t('settings.title')}</h1></div>
  <form method="post" action="/admin/settings" class="form card">
    ${csrf(ctx)}
    <p class="muted small">${t('settings.empty_hint')}</p>
    ${Object.entries(LANGS).map(([code, l]) => html`<fieldset>
      <legend>${l.label}</legend>
      <div class="grid-2">
        <label>${t('settings.site_name')}<input name="site_name_${code}" value="${s[`site_name_${code}`] || ''}" placeholder="${ctx.tIn(code, 'site.name')}"></label>
        <label>${t('settings.tagline')}<input name="site_tagline_${code}" value="${s[`site_tagline_${code}`] || ''}" placeholder="${ctx.tIn(code, 'site.tagline')}"></label>
      </div>
    </fieldset>`)}
    <div class="grid-2">
      <label>${t('settings.currency')}<input name="currency" value="${s.currency}" required placeholder="TMT, ₽, $…"></label>
      <label>${t('settings.default_lang')}
        <select name="default_lang">${Object.entries(LANGS).map(([code, l]) => html`<option value="${code}" ${s.default_lang === code ? 'selected' : ''}>${l.label}</option>`)}</select>
      </label>
    </div>
    <div class="form-actions"><button class="btn">${t('action.save')}</button></div>
  </form>`;
  return page(ctx, t('admin.nav.settings'), body);
}

module.exports = {
  dashboard, offers, offerNew, importForm, importPreview, drugs, drugEdit, pharmacies, pharmacyEdit, profile, account,
  settingsPage, noPharmacies,
};
