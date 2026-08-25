/* Arma motoru kabul testleri — SADECE geliştirici aracı, oyuna dahil değil.
 *
 *   node tools/badge-selftest.js
 *
 * js/badges.js ve js/core.js'i bir vm kutusunda, oyunun yükleme sırasıyla
 * çalıştırır. DOM yok: badgeVector() belge olmadan da çalışmak zorunda, çünkü
 * ensureBadgeDefs() belgesiz ortamda sessizce çekilir ve SVG yine üretilir.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

/* Yükleme sırası index.html'den okunuyor ki test ile uygulama ayrışamasın. */
const ORDER = [...read('index.html').matchAll(/<script src="(js\/[^"]+)"/g)].map(m => m[1]);

const ctx = vm.createContext({ console, Math, JSON, Date, parseInt, parseFloat, isNaN, Intl });
['js/i18n.js', 'js/data.js', 'js/badges.js'].forEach(f => vm.runInContext(read(f).replace(/^'use strict';/, ''), ctx, { filename: f }));
/* core.js'in tamamı S/PID gibi bağımlılıklar ister; yalnız rozet bölümü alınıyor. */
const coreSrc = read('js/core.js');
const lumSrc = coreSrc.match(/function lum\(hex\)\{[^\n]*\}/)[0];
const badgeSrc = coreSrc.slice(coreSrc.indexOf('function tmBadge(tm,size){'), coreSrc.indexOf('let PID=1;'));
vm.runInContext(lumSrc + '\n' + badgeSrc, ctx, { filename: 'core-badge' });

const G = k => vm.runInContext(k, ctx);
const call = (fn, ...a) => {
  ctx.__a = a;
  return vm.runInContext(fn + '(...__a)', ctx);
};

/* ------------------------------------------------------------ fikstür */
const TEAMS = G('TEAMS'), LEAGUES = G('LEAGUES');
const all = [];
TEAMS.forEach((lgTeams, lg) => lgTeams.forEach(([n, ab, c1, c2, str]) => {
  all.push({ id: all.length, n, ab, c1, c2, lg, str, lgCode: LEAGUES[lg].c });
}));

let fails = 0, checks = 0;
function ok(label, pass, detail) {
  checks++;
  if (!pass) fails++;
  console.log((pass ? '  OK   ' : '  FAIL ') + label.padEnd(52) + (detail || ''));
}
const desc = t => call('badgeDescriptor', t);
const sig = d => d && [d.frame.id, d.pattern.id, d.emblem.id, d.primary, d.secondary,
  d.ink, d.accent, d.embEdge, d.semanticKey, d.semanticCategory, d.usedFallback].join('~');

console.log('=== arma motoru kabul testleri · %d takım / %d lig ===\n', all.length, LEAGUES.length);

/* 1 — iki çalıştırmada aynı. Önbellek kapatılıp açılarak da denenir, yoksa test
      yalnızca Map'in kendini doğrular. */
const run1 = all.map(t => sig(desc(t)));
vm.runInContext('BADGE_CACHE.clear()', ctx);
const run2 = all.map(t => sig(desc(t)));
ok('descriptor iki çalıştırmada aynı', run1.every((v, i) => v === run2[i]), '(önbellek temizlenerek)');

/* 2 — sıra bağımsız */
const rev = [...all].reverse().map(t => sig(desc(t))).reverse();
ok('takım sırası ters çevrilince aynı', run1.every((v, i) => v === rev[i]));

/* 3 — dil bağımsız */
vm.runInContext("L='en'", ctx);
vm.runInContext('BADGE_CACHE.clear()', ctx);
const runEN = all.map(t => sig(desc(t)));
vm.runInContext("L='tr'", ctx);
vm.runInContext('BADGE_CACHE.clear()', ctx);
ok('TR/EN geçişinde aynı', run1.every((v, i) => v === runEN[i]), 'takım adları hiç çevrilmiyor');

/* 4 — tema bağımsız: descriptor tema değişkenine hiç bakmıyor */
const themeFree = !read('js/badges.js').match(/PREFS|themeOf|data-theme|S\.theme/);
ok('dört temada aynı', themeFree, 'badges.js tema durumunu hiç okumuyor');

/* 5 — lig değişince aynı (küme düşme) */
const moved = all.map(t => sig(desc(Object.assign({}, t, { lg: (t.lg + 7) % LEAGUES.length, id: t.id + 999 }))));
ok('lig ve id değişince aynı', run1.every((v, i) => v === moved[i]), 'tohumda lg/id/sıra yok');

/* 6 — aynı ligde tam kombinasyon çakışması */
let clash = 0, clashWho = [];
LEAGUES.forEach((_, lg) => {
  const seen = new Map();
  all.filter(t => t.lg === lg).forEach(t => {
    const c = desc(t).combo;
    if (seen.has(c)) { clash++; clashWho.push(LEAGUES[lg].c + ': ' + seen.get(c) + ' / ' + t.n); }
    seen.set(c, t.n);
  });
});
ok('aynı ligde tam kombinasyon çakışması 0', clash === 0, clashWho.slice(0, 3).join(' | '));

/* 7 — renkler takımın kendi alanlarından */
const cbad = all.filter(t => { const d = desc(t); return d.primary !== t.c1 || d.secondary !== t.c2; });
ok('c1/c2 mevcut takım renkleriyle aynı', cbad.length === 0,
  'primary=tm.c1, secondary=tm.c2 · ' + all.length + ' takım');

/* 8 — birebir anahtarlar doğru ambleme gidiyor */
const EXACT = G('SEM_EXACT');
const exBad = [];
all.forEach(t => {
  const tok = call('badgeToken', t.n);
  const want = EXACT[tok];
  if (!want) return;
  const got = desc(t).emblem.id;
  const allowed = Array.isArray(want) ? want : [want];
  if (!allowed.includes(got)) exBad.push(t.n + ' → ' + got + ' (beklenen ' + allowed.join('/') + ')');
});
const exTeams = all.filter(t => EXACT[call('badgeToken', t.n)]).length;
ok('birebir anahtarlar doğru ambleme gidiyor', exBad.length === 0,
  exTeams + ' takım birebir eşleşti · ' + exBad.slice(0, 2).join(' | '));

/* Yazı-tura kalmadı: aynı tekil kelimenin bütün takımları aynı amblemi almalı */
const single = {};
all.forEach(t => {
  const tok = call('badgeToken', t.n);
  if (typeof EXACT[tok] !== 'string') return;
  (single[tok] = single[tok] || new Set()).add(desc(t).emblem.id);
});
const drift = Object.entries(single).filter(([, s]) => s.size > 1);
ok('tekil birebir kelimede yazı-tura yok', drift.length === 0,
  Object.keys(single).length + ' kelime · sapan ' + drift.length);

/* 9 — yedek güvenli */
const nasty = [null, undefined, {}, { n: '' }, { n: 'X', ab: 'X', c1: 'bozuk', c2: null },
  { n: 'Y Coves', ab: null, c1: '#zzzzzz', c2: '#123456' }, { n: 123, ab: 4 }];
let threw = null, dirty = [];
nasty.forEach((t, i) => {
  try {
    const h = call('tmBadge', t, 26);
    if (/undefined|NaN|\[object Object\]|#zzzzzz|bozuk/.test(h)) dirty.push(i + ':' + h.slice(0, 60));
  } catch (e) { threw = i + ' → ' + e.message; }
});
ok('yedek güvenli, hiç atmıyor', !threw && dirty.length === 0, threw || dirty.join(' | ') || '7 bozuk girdi denendi');

/* 10 — kayıt şemasına alan yok */
/* Yorumlar çıkarılıyor: "Math.random'a ihtiyaç duymadan" diye yazan bir açıklama
   satırı testi düşürüyordu. Aranan şey kodda çağrı, metinde kelime değil. */
const badgeSrcTxt = read('js/badges.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const writesSave = /\bS\s*\.\s*\w+\s*=|SAVE_SCHEMA|lsSet|queueRec|tm\s*\.\s*\w+\s*=/.test(badgeSrcTxt);
ok('kayıt şemasına yeni alan yok', !writesSave, 'badges.js S veya takım nesnesine yazmıyor');
ok('Math.random yok', !/Math\s*\.\s*random/.test(badgeSrcTxt));
ok('raster/data:/harici URL yok',
  !/<image|data:|https?:\/\//.test(badgeSrcTxt.replace(/^.*?\*\//s, '')));

/* ------------------------------------------------------- boyut politikası */
const SIZES = [16, 18, 20, 22, 24, 26, 34, 46, 62];
const NANO_AT = G('NANO_AT'), DIAMOND_MIN = G('DIAMOND_MIN');
let svgBad = [], diaBad = 0;
all.forEach(t => {
  const d = desc(t);
  SIZES.forEach(px => {
    const s = call('badgeSVG', d, px);
    if (s.indexOf('width="' + px + '" height="' + px + '"') < 0) svgBad.push(t.n + '@' + px + ' boyut');
    if (s.indexOf('viewBox="0 0 64 64"') < 0) svgBad.push(t.n + '@' + px + ' viewBox');
    if (/undefined|NaN|null/.test(s)) svgBad.push(t.n + '@' + px + ' kirli');
    if (d.frame.id === 'diamond' && px < DIAMOND_MIN && s.indexOf('bcl-diamond') >= 0) diaBad++;
  });
});
ok('SVG width/height = istenen size', svgBad.length === 0, SIZES.length + ' ölçek × ' + all.length + ' takım');
ok('baklava 26px altında çizilmiyor', diaBad === 0,
  all.filter(t => desc(t).frame.id === 'diamond').length + ' baklava takımı');

/* Amblem 16–24px'te kayboluyor mu? Çizilen görünür kenarı ölç. */
const WATCH = ['anchor', 'oak', 'torch-spear', 'lighthouse', 'compass', 'industrial-cog',
  'sailor-knot', 'stone-bridge', 'mill-wheel', 'ocean-wave'];
const FRAMES = G('FRAMES'), EMB_BY_ID = G('EMB_BY_ID');
let worst = { px: 0, v: 99, who: '' };
[16, 18, 20, 22, 24].forEach(px => {
  FRAMES.forEach(f => {
    if (f.id === 'diamond' && px < DIAMOND_MIN) return;
    WATCH.forEach(eid => {
      const e = EMB_BY_ID[eid];
      const tr = call('badgeTransform', f, e, px <= NANO_AT);
      const w = (e.bb[2] - e.bb[0]) * tr.s * px / 64, h = (e.bb[3] - e.bb[1]) * tr.s * px / 64;
      if (Math.max(w, h) < worst.v) worst = { px, v: Math.max(w, h), who: f.id + '/' + eid };
    });
  });
});
ok('16–24px izlenen amblemler kaybolmuyor', worst.v >= 5,
  'en kısa uzun-kenar ' + worst.v.toFixed(2) + 'px @' + worst.px + ' (' + worst.who + ')');

/* ------------------------------------------------------------ performans */
function bench(fn, reps) {
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < reps; i++) fn();
  return Number(process.hrtime.bigint() - t0) / 1e6 / reps;
}
const fifty = all.slice(0, 50);
vm.runInContext('BADGE_CACHE.clear()', ctx);
const cold = bench(() => { vm.runInContext('BADGE_CACHE.clear()', ctx); fifty.forEach(t => call('tmBadge', t, 26)); }, 20);
const warm = [];
for (let i = 0; i < 100; i++) warm.push(bench(() => fifty.forEach(t => call('tmBadge', t, 26)), 1));
warm.sort((a, b) => a - b);
const legacy = bench(() => fifty.forEach(t => call('tmBadgeLetter', t, 26)), 100);
const html = fifty.map(t => call('tmBadge', t, 26)).join('').length;
const htmlOld = fifty.map(t => call('tmBadgeLetter', t, 26)).join('').length;
const defs = call('badgeDefsHTML').length;

console.log('\n--- performans (50 rozet, vm çağrı yükü dahil) ---');
console.log('  soğuk (önbelleksiz)   %s ms', cold.toFixed(2));
console.log('  100 render medyanı    %s ms', warm[50].toFixed(2));
console.log('  eski baş harfli rozet %s ms', legacy.toFixed(2));
console.log('  HTML 50 rozet         yeni %d B · eski %d B · defs (tek sefer) %d B', html, htmlOld, defs);

/* --------------------------------------------------------- örnek takımlar */
const SHOW = ['Manchester Ironworks', 'Merseyside Summit', 'Leeds Aqueduct', 'Hamburg Harbour',
  'Córdoba Foundry', 'Monterrey Lighthouse', 'Sapporo Cliffs'];
console.log('\n--- istenen gerçek takımlar ---');
console.log('  %s %s %s %s %s %s', 'takım'.padEnd(23), 'lig'.padEnd(4), 'token'.padEnd(11),
  'amblem'.padEnd(16), 'çerçeve'.padEnd(15), 'desen');
SHOW.forEach(n => {
  const t = all.find(x => x.n === n);
  if (!t) { console.log('  %s YOK', n.padEnd(23)); return; }
  const d = desc(t);
  console.log('  %s %s %s %s %s %s  %s%s', n.padEnd(23), t.lgCode.padEnd(4),
    d.semanticKey.padEnd(11), d.emblem.id.padEnd(16), d.frame.id.padEnd(15),
    d.pattern.id.padEnd(17), d.primary + '/' + d.secondary,
    d.usedFallback ? '  [YEDEK]' : (d.semanticExact ? '  [birebir]' : ''));
});

/* ------------------------------------------------------------- kapsama */
const words = new Map();
all.forEach(t => {
  const w = call('badgeToken', t.n);
  words.set(w, (words.get(w) || 0) + 1);
});
const fb = [...words.entries()].filter(([w]) => !EXACT[w] && !G('SEM_INDEX')[w]);
const cov = 100 * (words.size - fb.length) / words.size;
const fbTeams = all.filter(t => desc(t).usedFallback).length;
console.log('\n--- semantik kapsama ---');
console.log('  kelime  %d / %d = %%%s', words.size - fb.length, words.size, cov.toFixed(1));
console.log('  takım   %d / %d = %%%s', all.length - fbTeams, all.length,
  (100 * (all.length - fbTeams) / all.length).toFixed(1));
console.log('  yedeğe düşen kelimeler: %s', fb.map(f => f[0] + '(' + f[1] + ')').join(', ') || 'yok');
const unused = G('EMBLEMS').map(e => e.id).filter(id => !all.some(t => desc(t).emblem.id === id));
console.log('  hiç kullanılmayan amblem: %s', unused.join(', ') || 'yok');

console.log('\n=== %d kontrol · %d başarısız ===', checks, fails);
process.exit(fails ? 1 : 0);
