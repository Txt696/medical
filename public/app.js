(function () {
  'use strict';

  let T = {};
  try { T = JSON.parse(document.getElementById('i18n').textContent); } catch (e) { /* defaults below */ }
  function tr(key, fallback, n) {
    return String(T[key] || fallback).replace('{n}', n);
  }

  function debounce(fn, ms) {
    let t;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(null, args); }, ms);
    };
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function title(d) {
    return [d.name, d.form, d.dosage, d.pack].filter(Boolean).join(' ');
  }

  function fetchSuggest(q) {
    return fetch('/api/suggest?q=' + encodeURIComponent(q)).then(function (r) { return r.json(); });
  }

  // Generic autocomplete: renders items into `box`, calls onPick(item) on choose.
  function autocomplete(input, box, render, onPick) {
    let items = [];
    let active = -1;

    function close() { box.hidden = true; active = -1; }
    function highlight() {
      Array.prototype.forEach.call(box.children, function (c, i) { c.classList.toggle('active', i === active); });
    }

    const load = debounce(function () {
      const q = input.value.trim();
      if (q.length < 2) { close(); return; }
      fetchSuggest(q).then(function (list) {
        items = list;
        box.innerHTML = '';
        if (!list.length || input.value.trim() !== q) { close(); return; }
        list.forEach(function (d, i) {
          const node = render(d);
          node.addEventListener('mousedown', function (e) { e.preventDefault(); onPick(d, i); close(); });
          box.appendChild(node);
        });
        box.hidden = false;
        active = -1;
      }).catch(close);
    }, 180);

    input.addEventListener('input', load);
    input.addEventListener('blur', function () { setTimeout(close, 100); });
    input.addEventListener('keydown', function (e) {
      if (box.hidden) return;
      if (e.key === 'ArrowDown') { active = Math.min(active + 1, items.length - 1); highlight(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { active = Math.max(active - 1, -1); highlight(); e.preventDefault(); }
      else if (e.key === 'Escape') close();
      else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); onPick(items[active], active); close(); }
    });
  }

  function priceText(d) {
    return d.min_price != null ? tr('from', 'от') + ' ' + Number(d.min_price).toLocaleString(T.locale || undefined) : tr('out', 'нет в наличии');
  }

  // Public search boxes: suggestions lead to the drug page.
  document.querySelectorAll('[data-suggest]').forEach(function (input) {
    const box = input.parentElement.querySelector('.suggest');
    if (!box) return;
    autocomplete(input, box, function (d) {
      const a = el('a');
      a.href = '/drug/' + d.id;
      a.appendChild(el('span', '', title(d)));
      a.appendChild(el('span', 's-price', priceText(d)));
      return a;
    }, function (d) { window.location.href = '/drug/' + d.id; });
  });

  // Admin "add product": pick an existing drug from the catalogue.
  const offerForm = document.querySelector('[data-offer-form]');
  if (offerForm) {
    const nameInput = offerForm.querySelector('[data-drug-name]');
    const box = nameInput.parentElement.querySelector('.suggest');
    const idInput = offerForm.querySelector('[name=drug_id]');
    const picked = offerForm.querySelector('.picked');
    const fields = ['name', 'form', 'dosage', 'pack', 'inn', 'manufacturer', 'country', 'category'];

    function setLocked(locked) {
      fields.forEach(function (f) { offerForm.querySelector('[name=' + f + ']').readOnly = locked && f !== 'name'; });
      offerForm.querySelector('[name=rx]').disabled = locked;
      picked.hidden = !locked;
    }
    if (idInput.value) setLocked(true);

    autocomplete(nameInput, box, function (d) {
      const b = el('button');
      b.type = 'button';
      const left = el('span');
      left.appendChild(el('span', '', title(d)));
      if (d.manufacturer) left.appendChild(el('span', 'muted small', ' · ' + d.manufacturer));
      b.appendChild(left);
      b.appendChild(el('span', 'muted small', d.offers_count ? tr('inPharmacies', 'в {n} апт.', d.offers_count) : ''));
      return b;
    }, function (d) {
      idInput.value = d.id;
      fields.forEach(function (f) { offerForm.querySelector('[name=' + f + ']').value = d[f] || ''; });
      offerForm.querySelector('[name=rx]').checked = !!d.rx;
      setLocked(true);
      offerForm.querySelector('[name=price]').focus();
    });

    nameInput.addEventListener('input', function () {
      if (idInput.value) { idInput.value = ''; setLocked(false); }
    });
    offerForm.querySelector('[data-unpick]').addEventListener('click', function () {
      idInput.value = '';
      setLocked(false);
      nameInput.focus();
    });
  }

  // Import: load a text file into the textarea.
  const fileInput = document.querySelector('[data-import-file]');
  if (fileInput) {
    fileInput.addEventListener('change', function () {
      const file = fileInput.files[0];
      if (!file) return;
      const area = document.querySelector('[data-import-text]');
      const tryRead = function (encoding) {
        const reader = new FileReader();
        reader.onload = function () {
          // Excel often saves CSV in windows-1251: retry if UTF-8 produced garbage
          if (encoding === 'utf-8' && reader.result.indexOf('�') !== -1) return tryRead('windows-1251');
          area.value = reader.result;
        };
        reader.readAsText(file, encoding);
      };
      tryRead('utf-8');
    });
  }

  // Auto-submit filters
  document.querySelectorAll('[data-autosubmit]').forEach(function (s) {
    s.addEventListener('change', function () { s.form.submit(); });
  });

  // Confirm destructive actions
  document.querySelectorAll('form[data-confirm]').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      if (!window.confirm(f.getAttribute('data-confirm'))) e.preventDefault();
    });
  });

  // Password generator for admin forms
  document.querySelectorAll('[data-genpass]').forEach(function (input) {
    const b = el('button', 'linklike small', tr('generate', 'сгенерировать'));
    b.type = 'button';
    b.style.marginLeft = '8px';
    b.addEventListener('click', function () {
      const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const arr = new Uint32Array(10);
      crypto.getRandomValues(arr);
      input.value = Array.prototype.map.call(arr, function (n) { return chars[n % chars.length]; }).join('');
      input.type = 'text';
    });
    input.insertAdjacentElement('afterend', b);
  });
})();
