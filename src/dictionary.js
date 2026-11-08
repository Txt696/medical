'use strict';
// Built-in dictionary for automatic translation of site texts (name, slogan…).
// Whole sentences give an exact, human translation; short phrases and words are used
// to build a draft when the whole text is not known yet.
// A field may hold several variants (an array): the first one is used as the translation,
// the others are only recognised (other spellings, word forms, common typos).
// Entries the administrator adds on the «Dictionary» page or saves in Settings are stored
// in the database and take priority over these.

module.exports = [
  // ----- site name -----
  { ru: ['Мелхем', 'Melhem'], tk: 'Melhem', en: 'Melhem' },

  // ----- slogans -----
  {
    ru: [
      'Сравните цены на лекарственные средства и другие средства медицинского назначения во всех аптеках города Ашхабад, города Аркадаг и других велаятов',
      'Сравните цены на лекарственные средства и другие средства медицинского назначения во всех аптеках города Ашхабад, города Аркадаг и других велаятах',
    ],
    tk: 'Aşgabat şäheriniň, Arkadag şäheriniň we beýleki welaýatlaryň ähli dermanhanalarynda derman serişdeleriniň we lukmançylyk maksatly beýleki harytlaryň bahalaryny deňeşdiriň',
    en: 'Compare prices of medicines and other medical products across all pharmacies in Ashgabat, Arkadag and other velayats',
  },
  {
    ru: 'Сравните цены на лекарства во всех аптеках города Ашхабад, города Аркадаг и других велаятов',
    tk: 'Aşgabat şäheriniň, Arkadag şäheriniň we beýleki welaýatlaryň ähli dermanhanalarynda derman bahalaryny deňeşdiriň',
    en: 'Compare medicine prices across all pharmacies in Ashgabat, Arkadag and other velayats',
  },

  // ----- phrases -----
  { ru: 'лекарственные средства и другие средства медицинского назначения', tk: 'derman serişdeleri we lukmançylyk maksatly beýleki harytlar', en: 'medicines and other medical products' },
  { ru: ['средства медицинского назначения', 'товары медицинского назначения'], tk: 'lukmançylyk maksatly harytlar', en: 'medical products' },
  { ru: ['лекарственные средства', 'лекарственных средств'], tk: 'derman serişdeleri', en: 'medicines' },
  { ru: ['сравните цены на', 'сравнивайте цены на'], tk: 'bahalaryny deňeşdiriň', en: 'compare prices of' },
  { ru: ['сравните цены', 'сравнивайте цены'], tk: 'bahalary deňeşdiriň', en: 'compare prices' },
  { ru: ['цены на лекарства', 'цены лекарств'], tk: 'derman bahalary', en: 'medicine prices' },
  { ru: ['во всех аптеках', 'по всем аптекам'], tk: 'ähli dermanhanalarda', en: 'in all pharmacies' },
  { ru: 'других велаятов', tk: 'beýleki welaýatlaryň', en: 'other velayats' },
  { ru: ['других велаятах', 'в других велаятах'], tk: 'beýleki welaýatlarda', en: 'in other velayats' },
  { ru: ['города Ашхабад', 'города Ашхабада', 'г. Ашхабад'], tk: 'Aşgabat şäheriniň', en: 'Ashgabat' },
  { ru: ['города Аркадаг', 'г. Аркадаг'], tk: 'Arkadag şäheriniň', en: 'Arkadag' },
  { ru: ['в наличии', 'есть в наличии'], tk: 'elde bar', en: 'in stock' },
  { ru: 'нет в наличии', tk: 'elde ýok', en: 'out of stock' },
  { ru: 'без рецепта', tk: 'reseptsiz', en: 'without a prescription' },
  { ru: 'по рецепту', tk: 'resept boýunça', en: 'by prescription' },
  { ru: 'лучшая цена', tk: 'iň amatly baha', en: 'best price' },
  { ru: 'справочник аптек', tk: 'dermanhanalaryň maglumat beriş gollanmasy', en: 'pharmacy directory' },
  { ru: ['круглосуточно', 'круглосуточная'], tk: 'gije-gündiz', en: '24 hours' },

  // ----- places -----
  { ru: ['Туркменистан', 'Туркменистана', 'Туркменистане'], tk: 'Türkmenistan', en: 'Turkmenistan' },
  { ru: ['Ашхабад', 'Ашхабада', 'Ашхабаде'], tk: 'Aşgabat', en: 'Ashgabat' },
  { ru: ['Аркадаг', 'Аркадага', 'Аркадаге'], tk: 'Arkadag', en: 'Arkadag' },
  { ru: ['Мары', 'Мара'], tk: 'Mary', en: 'Mary' },
  { ru: ['Туркменабат', 'Туркменабата', 'Туркменабате'], tk: 'Türkmenabat', en: 'Turkmenabat' },
  { ru: ['Дашогуз', 'Дашогуза', 'Дашогузе'], tk: 'Daşoguz', en: 'Dashoguz' },
  { ru: ['Балканабат', 'Балканабата', 'Балканабате'], tk: 'Balkanabat', en: 'Balkanabat' },
  { ru: ['Ахалский велаят', 'Ахал'], tk: 'Ahal welaýaty', en: 'Ahal velayat' },
  { ru: ['Балканский велаят', 'Балкан'], tk: 'Balkan welaýaty', en: 'Balkan velayat' },
  { ru: ['Дашогузский велаят'], tk: 'Daşoguz welaýaty', en: 'Dashoguz velayat' },
  { ru: ['Лебапский велаят', 'Лебап'], tk: 'Lebap welaýaty', en: 'Lebap velayat' },
  { ru: ['Марыйский велаят'], tk: 'Mary welaýaty', en: 'Mary velayat' },

  // ----- words -----
  { ru: ['велаяты', 'велаятов', 'велаятах'], tk: 'welaýatlar', en: 'velayats' },
  { ru: 'велаят', tk: 'welaýat', en: 'velayat' },
  { ru: ['город', 'города', 'городе'], tk: 'şäher', en: 'city' },
  { ru: ['аптеки', 'аптек', 'аптеках', 'аптекам'], tk: 'dermanhanalar', en: 'pharmacies' },
  { ru: ['аптека', 'аптеке', 'аптеку', 'аптекой'], tk: 'dermanhana', en: 'pharmacy' },
  { ru: ['лекарства', 'лекарств', 'лекарствам'], tk: 'dermanlar', en: 'medicines' },
  { ru: ['лекарство', 'препарат', 'препараты'], tk: 'derman', en: 'medicine' },
  { ru: ['цены', 'цен', 'ценам'], tk: 'bahalar', en: 'prices' },
  { ru: 'цена', tk: 'baha', en: 'price' },
  { ru: ['все', 'всех', 'всем'], tk: 'ähli', en: 'all' },
  { ru: ['другие', 'других', 'другим'], tk: 'beýleki', en: 'other' },
  { ru: 'и', tk: 'we', en: 'and' },
  { ru: 'или', tk: 'ýa-da', en: 'or' },
  { ru: ['найдите', 'найти'], tk: 'tapyň', en: 'find' },
  { ru: 'сравните', tk: 'deňeşdiriň', en: 'compare' },
  { ru: 'доставка', tk: 'eltip bermek', en: 'delivery' },
  { ru: 'здоровье', tk: 'saglyk', en: 'health' },
];
