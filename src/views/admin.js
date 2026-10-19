'use strict';
const { html } = require('../html');
const { layout, money, plural, dateRu, drugTitle, qs, pagination } = require('./layout');
const { FIELD_LABELS } = require('../importer');

const page = (ctx, title, body) => layout(ctx, { title, body, admin: true });
const csrf = (ctx) => html`<input type="hidden" name="_csrf" value="${ctx.csrf}">`;

function pharmacySelect(ctx, pharmacies, current, { name = 'pharmacy', autosubmit = true } = {}) {
  if (ctx.user.role !== 'admin') return '';
  return html`<label class="pharm-select">Аптека
    <select name="${name}" ${autosubmit ? 'data-autosubmit' : ''} required>
      ${pharmacies.map((p) => html`<option value="${p.id}" ${p.id === current ? 'selected' : ''}>${p.name}${p.city ? ` (${p.city})` : ''}</option>`)}
    </select></label>`;
}

function noPharmacies(ctx) {
  return page(ctx, 'Нет аптек', html`<div class="empty">
    <p>Сначала создайте хотя бы одну аптеку.</p><a class="btn" href="/admin/pharmacies">Добавить аптеку</a></div>`);
}

function dashboard(ctx, { stats, pharmacy, pharmacies, recent }) {
  const cur = ctx.settings.currency;
  const isAdmin = ctx.user.role === 'admin';
  const body = html`
  <div class="page-head"><h1>${isAdmin ? 'Панель администратора' : pharmacy.name}</h1>
    ${pharmacy ? html`<a href="/pharmacy/${pharmacy.id}" target="_blank">Страница аптеки на сайте →</a>` : ''}</div>
  <div class="stat-row">
    ${isAdmin ? html`
      <div class="stat"><div class="stat-num">${stats.pharmacies}</div><div class="muted">аптек</div></div>
      <div class="stat"><div class="stat-num">${stats.drugs}</div><div class="muted">препаратов в каталоге</div></div>
      <div class="stat"><div class="stat-num">${stats.offers}</div><div class="muted">предложений</div></div>`
    : html`
      <div class="stat"><div class="stat-num">${stats.offers}</div><div class="muted">товаров на сайте</div></div>
      <div class="stat"><div class="stat-num">${stats.out}</div><div class="muted">нет в наличии</div></div>
      <div class="stat"><div class="stat-num small-num">${stats.updated ? dateRu(stats.updated) : '—'}</div><div class="muted">последнее обновление</div></div>`}
  </div>

  <div class="action-cards">
    <a class="action-card" href="/admin/offers/new"><strong>Добавить товар вручную</strong><span class="muted">Выберите препарат из каталога или создайте новый и укажите цену.</span></a>
    <a class="action-card" href="/admin/import"><strong>Импорт прайс-листа</strong><span class="muted">Вставьте текст или загрузите CSV/TXT — цены обновятся автоматически.</span></a>
    <a class="action-card" href="/admin/offers"><strong>Управление товарами</strong><span class="muted">Быстро меняйте цены и остатки, удаляйте позиции.</span></a>
  </div>

  ${isAdmin && pharmacies.length ? html`<h2>Аптеки</h2>
    <table class="table"><thead><tr><th>Аптека</th><th>Город</th><th class="num">Товаров</th><th>Обновлено</th><th></th></tr></thead>
    <tbody>${pharmacies.map((p) => html`<tr class="${p.is_active ? '' : 'row-out'}">
      <td><a href="/admin/pharmacies/${p.id}">${p.name}</a>${p.is_active ? '' : html` <span class="badge">скрыта</span>`}</td><td>${p.city}</td>
      <td class="num">${p.offers_count}</td><td class="small">${dateRu(p.last_update)}</td>
      <td><a href="/admin/offers?pharmacy=${p.id}">товары</a></td></tr>`)}</tbody></table>` : ''}

  ${recent.length ? html`<h2>Недавно изменённые</h2>
    <table class="table"><thead><tr><th>Препарат</th>${isAdmin ? html`<th>Аптека</th>` : ''}<th class="num">Цена</th><th>Обновлено</th></tr></thead>
    <tbody>${recent.map((o) => html`<tr><td><a href="/drug/${o.drug_id}">${drugTitle(o)}</a></td>${isAdmin ? html`<td>${o.pharmacy_name}</td>` : ''}
      <td class="num">${money(o.price, cur)}</td><td class="small">${dateRu(o.updated_at)}</td></tr>`)}</tbody></table>` : ''}`;
  return page(ctx, 'Кабинет', body);
}

function offers(ctx, { pharmacies, pharmacyId, list, q, filter, total, page: p, pages }) {
  const cur = ctx.settings.currency;
  const body = html`
  <div class="page-head"><h1>Товары аптеки</h1>
    <div class="head-actions">
      <a class="btn btn-small btn-ghost" href="/admin/offers/export.csv${qs({ pharmacy: ctx.user.role === 'admin' ? pharmacyId : '' })}">Скачать CSV</a>
      <a class="btn btn-small" href="/admin/offers/new${qs({ pharmacy: ctx.user.role === 'admin' ? pharmacyId : '' })}">+ Добавить</a>
    </div>
  </div>
  <form method="get" class="inline-filters">
    ${pharmacySelect(ctx, pharmacies, pharmacyId)}
    <input type="search" name="q" value="${q}" placeholder="Поиск по названию">
    <select name="filter" data-autosubmit>
      <option value="">Все</option>
      <option value="out" ${filter === 'out' ? 'selected' : ''}>Нет в наличии</option>
      <option value="old" ${filter === 'old' ? 'selected' : ''}>Не обновлялись 30 дней</option>
    </select>
    <button class="btn btn-small">Найти</button>
  </form>
  <p class="muted small">Всего: ${total}. Измените цену или остаток и нажмите «Сохранить» в строке. Пустой остаток = «в наличии» без указания количества, 0 = нет в наличии.</p>
  ${list.length ? html`<div class="table-wrap"><table class="table table-edit">
    <thead><tr><th>Препарат</th><th>Цена, ${cur}</th><th>Остаток</th><th>Обновлено</th><th></th></tr></thead>
    <tbody>${list.map((o) => html`<tr>
      <td><a href="/drug/${o.drug_id}" target="_blank">${drugTitle(o)}</a><div class="muted small">${o.manufacturer}</div></td>
      <td><input form="o${o.id}" class="input-num" name="price" value="${o.price}" inputmode="decimal" required></td>
      <td><input form="o${o.id}" class="input-num" name="quantity" value="${o.quantity ?? ''}" inputmode="numeric" placeholder="есть"></td>
      <td class="small muted">${dateRu(o.updated_at)}</td>
      <td class="row-actions">
        <form id="o${o.id}" method="post" action="/admin/offers/${o.id}">${csrf(ctx)}<button class="btn btn-small">Сохранить</button></form>
        <form method="post" action="/admin/offers/${o.id}/delete" data-confirm="Удалить товар из аптеки?">${csrf(ctx)}<button class="btn btn-small btn-danger" title="Удалить">✕</button></form>
      </td></tr>`)}</tbody></table></div>` : html`<div class="empty">Товаров пока нет. <a href="/admin/offers/new">Добавьте вручную</a> или <a href="/admin/import">импортируйте прайс</a>.</div>`}
  ${pagination(p, pages, { q, filter, pharmacy: ctx.user.role === 'admin' ? pharmacyId : '' })}`;
  return page(ctx, 'Товары', body);
}

function drugFields(d = {}, { readonly = false } = {}) {
  const ro = readonly ? 'readonly' : '';
  return html`
    <div class="grid-2">
      <label class="span-2">Торговое название *<input name="name" value="${d.name || ''}" required ${ro} data-drug-name autocomplete="off"><div class="suggest" hidden></div></label>
      <label>Лекарственная форма<input name="form" value="${d.form || ''}" list="forms" placeholder="таблетки" ${ro}></label>
      <label>Дозировка<input name="dosage" value="${d.dosage || ''}" placeholder="500 мг" ${ro}></label>
      <label>Упаковка<input name="pack" value="${d.pack || ''}" placeholder="№20" ${ro}></label>
      <label>Действующее вещество (МНН)<input name="inn" value="${d.inn || ''}" placeholder="парацетамол" ${ro}></label>
      <label>Производитель<input name="manufacturer" value="${d.manufacturer || ''}" ${ro}></label>
      <label>Страна<input name="country" value="${d.country || ''}" ${ro}></label>
      <label>Категория<input name="category" value="${d.category || ''}" list="categories" ${ro}></label>
      <label class="check"><input type="checkbox" name="rx" value="1" ${d.rx ? 'checked' : ''} ${readonly ? 'disabled' : ''}> Отпускается по рецепту</label>
    </div>
    <datalist id="forms">${['таблетки', 'капсулы', 'сироп', 'раствор', 'ампулы', 'мазь', 'крем', 'гель', 'спрей', 'капли', 'суппозитории', 'порошок', 'суспензия'].map((f) => html`<option>${f}</option>`)}</datalist>`;
}

function offerNew(ctx, { pharmacies, pharmacyId, categories, values = {}, error }) {
  const body = html`
  <div class="page-head"><h1>Добавить товар</h1></div>
  ${error ? html`<div class="flash flash-error">${error}</div>` : ''}
  <form method="post" action="/admin/offers/new" class="form card" data-offer-form>
    ${csrf(ctx)}
    ${pharmacySelect(ctx, pharmacies, pharmacyId, { autosubmit: false })}
    <input type="hidden" name="drug_id" value="${values.drug_id || ''}">
    <h3>Препарат</h3>
    <p class="muted small">Начните вводить название — если препарат уже есть в каталоге, выберите его из списка. Иначе заполните поля, и будет создана новая карточка.</p>
    <div class="picked" ${values.drug_id ? '' : 'hidden'}>Выбран препарат из каталога. <button type="button" class="linklike" data-unpick>Изменить</button></div>
    ${drugFields(values)}
    <datalist id="categories">${categories.map((c) => html`<option>${c}</option>`)}</datalist>
    <h3>Цена и наличие</h3>
    <div class="grid-2">
      <label>Цена, ${ctx.settings.currency} *<input name="price" value="${values.price || ''}" inputmode="decimal" required></label>
      <label>Остаток, уп.<input name="quantity" value="${values.quantity ?? ''}" inputmode="numeric" placeholder="не указывать"></label>
    </div>
    <div class="form-actions"><button class="btn">Сохранить</button><button class="btn btn-ghost" name="more" value="1">Сохранить и добавить ещё</button></div>
  </form>`;
  return page(ctx, 'Добавить товар', body);
}

const SAMPLE_TABLE = `Название;Форма;Дозировка;Упаковка;Производитель;Цена;Остаток
Парацетамол;таблетки;500 мг;№20;Фармстандарт;25,50;40
Ибупрофен;таблетки;200 мг;№50;Синтез;89;12`;

const SAMPLE_FREE = `Парацетамол таб. 500мг №20 — 25.50
Нурофен таб. п/о 200мг №10 145 руб
Но-шпа таб. 40мг №24 210`;

function importForm(ctx, { pharmacies, pharmacyId, text = '', mode = 'upsert', stock = 'replace' }) {
  const body = html`
  <div class="page-head"><h1>Импорт прайс-листа</h1></div>
  <div class="with-sidebar sidebar-right">
    <form method="post" action="/admin/import/preview" class="form card">
      ${csrf(ctx)}
      ${pharmacySelect(ctx, pharmacies, pharmacyId, { autosubmit: false })}
      <label>Текст прайс-листа
        <textarea name="text" rows="16" class="mono" placeholder="${SAMPLE_TABLE}" required data-import-text>${text}</textarea>
      </label>
      <label class="file-pick">или загрузите файл (.csv, .txt, .tsv) <input type="file" accept=".csv,.txt,.tsv,text/plain,text/csv" data-import-file></label>
      <fieldset>
        <legend>Режим</legend>
        <label class="check"><input type="radio" name="mode" value="upsert" ${mode !== 'replace' ? 'checked' : ''}> Добавить новые и обновить цены существующих</label>
        <label class="check"><input type="radio" name="mode" value="replace" ${mode === 'replace' ? 'checked' : ''}> Полная замена: товары, которых нет в списке, будут удалены</label>
      </fieldset>
      <fieldset>
        <legend>Остатки</legend>
        <label class="check"><input type="radio" name="stock" value="replace" ${stock !== 'add' ? 'checked' : ''}> Обновить остатки из файла (заменить текущие)</label>
        <label class="check"><input type="radio" name="stock" value="add" ${stock === 'add' ? 'checked' : ''}> Прибавить к остаткам на складе (приход товара)</label>
        <p class="muted small">Если у строки остаток не указан, текущий остаток не меняется. Цена в любом случае берётся из файла.</p>
      </fieldset>
      <div class="form-actions"><button class="btn">Проверить →</button><span class="muted small">На следующем шаге вы увидите, как распознан каждый товар.</span></div>
    </form>
    <aside class="help card">
      <h3>Поддерживаемые форматы</h3>
      <p><strong>1. Таблица с заголовком</strong> — из Excel/Google Таблиц (просто скопируйте и вставьте) или CSV. Разделитель: табуляция, «;», «,» или «|». Порядок колонок любой.</p>
      <pre>${SAMPLE_TABLE}</pre>
      <p class="small muted">Распознаются колонки: ${Object.values(FIELD_LABELS).join(', ')}. Также «Наименование», «Остаток», «МНН», «Стоимость» и англ. name, price, qty…</p>
      <p><strong>2. Таблица без заголовка</strong> — последние две колонки: цена и остаток, первые: название, форма, дозировка, упаковка, производитель.</p>
      <p><strong>3. Свободный текст</strong> — одна позиция в строке, цена в конце. Форма, дозировка и №упаковки выделяются из названия автоматически.</p>
      <pre>${SAMPLE_FREE}</pre>
      <p class="small muted">Строки, начинающиеся с «#», пропускаются. Если препарат с таким же названием, формой, дозировкой и упаковкой уже есть в каталоге — цена привяжется к нему, иначе будет создана новая карточка.</p>
    </aside>
  </div>`;
  return page(ctx, 'Импорт', body);
}

const qtyText = (q) => (q === null || q === undefined ? 'есть' : q);

function stockChange(r) {
  if (r.oldQty === undefined) return qtyText(r.newQty);
  if (r.oldQty === r.newQty) return html`<span class="muted">${qtyText(r.newQty)}</span>`;
  return html`<span class="muted">${qtyText(r.oldQty)} →</span> <strong>${qtyText(r.newQty)}</strong>`;
}

function importPreview(ctx, { pharmacy, parsed, text, mode, stock, summary, toDelete }) {
  const cur = ctx.settings.currency;
  const modeLabel = { header: 'таблица с заголовком', positional: 'таблица без заголовка', free: 'свободный текст' }[parsed.mode];
  const delimLabel = { '\t': 'табуляция', ';': '«;»', ',': '«,»', '|': '«|»' }[parsed.delimiter] || '—';
  const body = html`
  <div class="page-head"><h1>Проверка импорта</h1><div class="muted">${pharmacy.name}</div></div>
  <div class="stat-row">
    <div class="stat"><div class="stat-num">${summary.ok}</div><div class="muted">будет загружено</div></div>
    <div class="stat"><div class="stat-num">${summary.newDrugs}</div><div class="muted">новых карточек препаратов</div></div>
    <div class="stat"><div class="stat-num">${summary.updates}</div><div class="muted">обновление цен</div></div>
    <div class="stat ${summary.errors ? 'stat-bad' : ''}"><div class="stat-num">${summary.errors}</div><div class="muted">строк с ошибкой (пропустятся)</div></div>
    ${mode === 'replace' ? html`<div class="stat ${toDelete ? 'stat-bad' : ''}"><div class="stat-num">${toDelete}</div><div class="muted">будет удалено</div></div>` : ''}
  </div>
  <p class="small"><strong>Остатки:</strong> ${stock === 'add' ? 'количество из файла прибавляется к текущему остатку' : 'остаток заменяется количеством из файла'}.</p>
  <p class="muted small">Формат: ${modeLabel}${parsed.delimiter ? `; разделитель: ${delimLabel}` : ''}${parsed.columns ? html`; колонки: ${parsed.columns.map((c) => (c ? FIELD_LABELS[c] : '(пропуск)')).join(', ')}` : ''}.</p>
  <div class="table-wrap"><table class="table">
    <thead><tr><th>#</th><th>Название</th><th>Форма</th><th>Дозировка</th><th>Упак.</th><th>Производитель</th><th class="num">Цена</th><th class="num">В файле</th><th class="num">Станет</th><th>Статус</th></tr></thead>
    <tbody>${parsed.rows.map((r) => html`<tr class="${r.error ? 'row-error' : ''}">
      <td class="muted">${r.line}</td><td>${r.drug.name}</td><td>${r.drug.form}</td><td>${r.drug.dosage}</td><td>${r.drug.pack}</td><td>${r.drug.manufacturer}</td>
      <td class="num">${Number.isNaN(r.price) ? '—' : money(r.price, cur)}</td><td class="num">${r.quantity ?? ''}</td>
      <td class="num small">${r.error ? '' : stockChange(r)}</td>
      <td class="small">${r.error ? html`<span class="err">${r.error}</span><div class="muted mono">${r.raw}</div>`
        : r.status === 'new' ? html`<span class="badge badge-new">новый препарат</span>`
        : r.status === 'update' ? html`<span class="badge">обновит цену${r.oldPrice !== undefined ? html` (было ${money(r.oldPrice, cur)})` : ''}</span>`
        : r.status === 'dup' ? html`<span class="muted">повтор: ${stock === 'add' ? 'остатки суммируются, цена' : 'будет использована'} из последней строки</span>`
        : html`<span class="badge badge-ok">из каталога</span>`}</td>
    </tr>`)}</tbody></table></div>
  <form method="post" action="/admin/import/apply" class="form-actions sticky-actions">
    ${csrf(ctx)}
    <input type="hidden" name="pharmacy" value="${pharmacy.id}">
    <input type="hidden" name="mode" value="${mode}">
    <input type="hidden" name="stock" value="${stock}">
    <textarea name="text" hidden>${text}</textarea>
    <button class="btn" ${summary.ok ? '' : 'disabled'}>Загрузить ${summary.ok} ${plural(summary.ok, 'позицию', 'позиции', 'позиций')}</button>
    <button class="btn btn-ghost" formaction="/admin/import/edit">← Исправить текст</button>
  </form>`;
  return page(ctx, 'Проверка импорта', body);
}

function drugs(ctx, { list, q, total, page: p, pages }) {
  const body = html`
  <div class="page-head"><h1>Каталог препаратов</h1><a class="btn btn-small" href="/admin/drugs/new">+ Новый препарат</a></div>
  <form method="get" class="inline-filters"><input type="search" name="q" value="${q}" placeholder="Поиск"><button class="btn btn-small">Найти</button>
    <a class="small" href="/admin/drugs${qs({ q, orphans: ctx.query.orphans ? '' : '1' })}">${ctx.query.orphans ? 'Показать все' : 'Только без предложений'}</a></form>
  <p class="muted small">Всего: ${total}. Карточки препаратов общие для всех аптек.</p>
  <div class="table-wrap"><table class="table">
    <thead><tr><th>ID</th><th>Препарат</th><th>МНН</th><th>Производитель</th><th>Категория</th><th class="num">Аптек</th><th></th></tr></thead>
    <tbody>${list.map((d) => html`<tr>
      <td class="muted">${d.id}</td><td><a href="/admin/drugs/${d.id}">${drugTitle(d)}</a> ${d.rx ? html`<span class="badge badge-rx">Rx</span>` : ''}</td>
      <td>${d.inn}</td><td>${d.manufacturer}</td><td>${d.category}</td><td class="num">${d.offers_count}</td>
      <td><a href="/drug/${d.id}" target="_blank">на сайте</a></td></tr>`)}</tbody></table></div>
  ${pagination(p, pages, { q, orphans: ctx.query.orphans })}`;
  return page(ctx, 'Каталог', body);
}

function drugEdit(ctx, { drug, categories, error, offersCount }) {
  const isNew = !drug.id;
  const body = html`
  <div class="page-head"><h1>${isNew ? 'Новый препарат' : drugTitle(drug)}</h1></div>
  ${error ? html`<div class="flash flash-error">${error}</div>` : ''}
  <form method="post" action="${isNew ? '/admin/drugs/new' : `/admin/drugs/${drug.id}`}" class="form card">
    ${csrf(ctx)}
    ${drugFields(drug)}
    <datalist id="categories">${categories.map((c) => html`<option>${c}</option>`)}</datalist>
    <label>Описание / показания<textarea name="description" rows="4">${drug.description || ''}</textarea></label>
    <div class="form-actions"><button class="btn">Сохранить</button><a href="/admin/drugs">Отмена</a></div>
  </form>
  ${isNew ? '' : html`<form method="post" action="/admin/drugs/${drug.id}/delete" class="danger-zone" data-confirm="Удалить препарат и все его цены (${offersCount}) во всех аптеках?">
    ${csrf(ctx)}<button class="btn btn-danger btn-small">Удалить препарат</button> <span class="muted small">Предложений в аптеках: ${offersCount}</span></form>
    <form method="post" action="/admin/drugs/${drug.id}/merge" class="form card">
      ${csrf(ctx)}
      <h3>Объединить с другим препаратом</h3>
      <p class="muted small">Если это дубликат: цены аптек будут перенесены в указанную карточку, а эта — удалена.</p>
      <div class="inline-filters"><input name="target" placeholder="ID основной карточки" inputmode="numeric" required><button class="btn btn-small">Объединить</button></div>
    </form>`}`;
  return page(ctx, isNew ? 'Новый препарат' : drug.name, body);
}

function pharmacyFields(p = {}) {
  return html`<div class="grid-2">
    <label class="span-2">Название *<input name="name" value="${p.name || ''}" required></label>
    <label>Город<input name="city" value="${p.city || ''}"></label>
    <label>Адрес<input name="address" value="${p.address || ''}"></label>
    <label>Телефон<input name="phone" value="${p.phone || ''}" type="tel"></label>
    <label>Часы работы<input name="hours" value="${p.hours || ''}" placeholder="Пн–Вс 8:00–22:00"></label>
    <label class="span-2">Сайт<input name="website" value="${p.website || ''}"></label>
    <label class="span-2">Описание<textarea name="description" rows="2">${p.description || ''}</textarea></label>
  </div>`;
}

function pharmacies(ctx, { list, error, values = {} }) {
  const body = html`
  <div class="page-head"><h1>Аптеки</h1></div>
  ${list.length ? html`<table class="table"><thead><tr><th>Аптека</th><th>Адрес</th><th>Логины</th><th class="num">Товаров</th><th></th></tr></thead>
    <tbody>${list.map((p) => html`<tr class="${p.is_active ? '' : 'row-out'}">
      <td><a href="/admin/pharmacies/${p.id}">${p.name}</a>${p.is_active ? '' : html` <span class="badge">скрыта</span>`}</td>
      <td class="small">${[p.city, p.address].filter(Boolean).join(', ')}</td><td class="small">${p.logins || '—'}</td>
      <td class="num">${p.offers_count}</td><td><a href="/admin/offers?pharmacy=${p.id}">товары</a></td></tr>`)}</tbody></table>` : ''}
  <h2 id="new">Новая аптека</h2>
  ${error ? html`<div class="flash flash-error">${error}</div>` : ''}
  <form method="post" action="/admin/pharmacies" class="form card">
    ${csrf(ctx)}
    ${pharmacyFields(values)}
    <h3>Доступ в кабинет</h3>
    <div class="grid-2">
      <label>Логин *<input name="login" value="${values.login || ''}" required autocomplete="off"></label>
      <label>Пароль * <input name="password" value="${values.password || ''}" required minlength="6" autocomplete="new-password" data-genpass></label>
    </div>
    <div class="form-actions"><button class="btn">Создать аптеку</button></div>
  </form>`;
  return page(ctx, 'Аптеки', body);
}

function pharmacyEdit(ctx, { pharmacy: p, users, error }) {
  const body = html`
  <nav class="crumbs"><a href="/admin/pharmacies">Аптеки</a></nav>
  <div class="page-head"><h1>${p.name}</h1><div class="head-actions"><a class="btn btn-small btn-ghost" href="/admin/offers?pharmacy=${p.id}">Товары</a><a class="btn btn-small btn-ghost" href="/admin/import?pharmacy=${p.id}">Импорт</a></div></div>
  ${error ? html`<div class="flash flash-error">${error}</div>` : ''}
  <form method="post" action="/admin/pharmacies/${p.id}" class="form card">
    ${csrf(ctx)}
    ${pharmacyFields(p)}
    <label class="check"><input type="checkbox" name="is_active" value="1" ${p.is_active ? 'checked' : ''}> Показывать на сайте</label>
    <div class="form-actions"><button class="btn">Сохранить</button></div>
  </form>
  <h2>Пользователи</h2>
  <table class="table"><thead><tr><th>Логин</th><th>Создан</th><th>Новый пароль</th><th></th></tr></thead>
  <tbody>${users.map((u) => html`<tr><td>${u.login}</td><td class="small">${dateRu(u.created_at)}</td>
    <td><form method="post" action="/admin/users/${u.id}/password" class="inline-filters">${csrf(ctx)}<input name="password" minlength="6" required placeholder="новый пароль" data-genpass><button class="btn btn-small">Сменить</button></form></td>
    <td><form method="post" action="/admin/users/${u.id}/delete" data-confirm="Удалить пользователя ${u.login}?">${csrf(ctx)}<button class="btn btn-small btn-danger">✕</button></form></td></tr>`)}</tbody></table>
  <form method="post" action="/admin/pharmacies/${p.id}/users" class="inline-filters card">
    ${csrf(ctx)}<strong>Добавить пользователя:</strong>
    <input name="login" placeholder="логин" required><input name="password" placeholder="пароль" minlength="6" required data-genpass><button class="btn btn-small">Добавить</button>
  </form>
  <form method="post" action="/admin/pharmacies/${p.id}/delete" class="danger-zone" data-confirm="Удалить аптеку, её пользователей и все товары? Это необратимо.">
    ${csrf(ctx)}<button class="btn btn-danger btn-small">Удалить аптеку</button></form>`;
  return page(ctx, p.name, body);
}

function profile(ctx, { pharmacy }) {
  const body = html`
  <div class="page-head"><h1>Профиль аптеки</h1><a href="/pharmacy/${pharmacy.id}" target="_blank">Посмотреть на сайте →</a></div>
  <form method="post" action="/admin/profile" class="form card">${csrf(ctx)}${pharmacyFields(pharmacy)}<div class="form-actions"><button class="btn">Сохранить</button></div></form>`;
  return page(ctx, 'Профиль', body);
}

function account(ctx, { error }) {
  const body = html`
  <div class="page-head"><h1>Смена пароля</h1></div>
  ${error ? html`<div class="flash flash-error">${error}</div>` : ''}
  <form method="post" action="/admin/account" class="form card narrow">
    ${csrf(ctx)}
    <label>Текущий пароль<input type="password" name="current" required autocomplete="current-password"></label>
    <label>Новый пароль<input type="password" name="password" required minlength="6" autocomplete="new-password"></label>
    <label>Повторите<input type="password" name="password2" required minlength="6" autocomplete="new-password"></label>
    <div class="form-actions"><button class="btn">Сменить пароль</button></div>
  </form>`;
  return page(ctx, 'Пароль', body);
}

function settingsPage(ctx) {
  const s = ctx.settings;
  const body = html`
  <div class="page-head"><h1>Настройки сайта</h1></div>
  <form method="post" action="/admin/settings" class="form card narrow">
    ${csrf(ctx)}
    <label>Название сайта<input name="site_name" value="${s.site_name}" required></label>
    <label>Слоган<input name="site_tagline" value="${s.site_tagline}"></label>
    <label>Валюта (как подписывать цены)<input name="currency" value="${s.currency}" required placeholder="руб., ₽, TMT, сом, ₸…"></label>
    <div class="form-actions"><button class="btn">Сохранить</button></div>
  </form>`;
  return page(ctx, 'Настройки', body);
}

module.exports = {
  dashboard, offers, offerNew, importForm, importPreview, drugs, drugEdit, pharmacies, pharmacyEdit, profile, account,
  settingsPage, noPharmacies,
};
