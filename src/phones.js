'use strict';
// Pharmacy phone numbers: a JSON list [{ type, number }] in pharmacies.phones.
// pharmacies.phone keeps the first number, so lists and queries can show the main one.

const PHONE_TYPES = ['work', 'mobile', 'other'];
const MAX_PHONES = 10;

function parsePhones(json) {
  try {
    const list = JSON.parse(json || '[]');
    return Array.isArray(list) ? list.filter((p) => p && p.number) : [];
  } catch {
    return [];
  }
}

const asArray = (v) => (Array.isArray(v) ? v : v === undefined ? [] : [v]);

// From the admin form: parallel fields phone_type[] and phone_number[]
function phonesFromBody(body) {
  const types = asArray(body.phone_type);
  return asArray(body.phone_number)
    .map((n, i) => ({
      type: PHONE_TYPES.includes(types[i]) ? types[i] : 'work',
      number: String(n ?? '').trim().replace(/\s+/g, ' ').slice(0, 40),
    }))
    .filter((p) => p.number)
    .slice(0, MAX_PHONES);
}

const telHref = (number) => `tel:${String(number).replace(/[^\d+]/g, '')}`;

module.exports = { PHONE_TYPES, parsePhones, phonesFromBody, telHref };
