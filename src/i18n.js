'use strict';
// Interface translations. Data entered by pharmacies (drug names, addresses…)
// is shown as is; only the interface is translated.

const LANGS = {
  tk: { label: 'Türkmençe', short: 'TM', locale: 'tk-TM' },
  ru: { label: 'Русский', short: 'RU', locale: 'ru-RU' },
  en: { label: 'English', short: 'EN', locale: 'en-GB' },
};
const DEFAULT_LANG = 'ru';

const dicts = {
  ru: require('./locales/ru'),
  tk: require('./locales/tk'),
  en: require('./locales/en'),
};

const plurals = Object.fromEntries(Object.entries(LANGS).map(([code, l]) => [code, new Intl.PluralRules(l.locale)]));

function translate(lang, key, params = {}) {
  let v = dicts[lang]?.[key] ?? dicts[DEFAULT_LANG][key];
  if (v === undefined) return key;
  if (typeof v === 'object') v = v[plurals[lang].select(Number(params.n) || 0)] ?? v.other;
  return v.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? String(params[k]) : m));
}

function makeT(lang) {
  return (key, params) => translate(lang, key, params);
}

// Error carrying a translation key, thrown from code that does not know the language.
class AppError extends Error {
  constructor(key, params = {}) {
    super(key);
    this.key = key;
    this.params = params;
  }
}

module.exports = { LANGS, DEFAULT_LANG, dicts, translate, makeT, AppError };
