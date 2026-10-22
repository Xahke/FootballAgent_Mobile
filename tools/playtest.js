// node tools/playtest.js [--tohum=1-3] [--sezon=5] [--olay=rastgele] [--soz=normal] [--transfer=orta]
//
// Oyunu başsız (tarayıcısız) oynatan bot. Her olayı, her sözleşme görüşmesini
// ve her transferi satır satır kaydeder; çıktı playtest-out/ altına CSV (Excel),
// ham JSON ve okunabilir bir özet olarak yazılır.
//
// Neden tarayıcı değil: bir sezon 38 hafta. Ekranı tıklayarak oynatmak dakikalar
// sürer, burada saniyeler. Bot oyunun kendi fonksiyonlarını çağırdığı için
// ölçülen şey yine oyunun kendisi (bkz. tools/playtest/bot.js).
//
// Neden tohum: bütün rastgelelik core.js'teki R()/RF() üzerinden Math.random'a
// gidiyor. Bağlamın Math.random'ı tohumlu bir üreteçle değiştirilince aynı
// tohum aynı kariyeri verir — bulunan bir hata tekrar üretilebilir, iki koşu
// arasındaki fark da zardan değil değişiklikten gelir.
//
//   --tohum=7 | 1-5 | 1,4,9     hangi tohumlar (varsayılan 1)
//   --sezon=5                   kaç sezon
//   --olay=rastgele|ilk|nakit|itibar|iliski
//   --soz=normal|acgozlu|temkinli
//   --transfer=orta|az|cok|hic
//   --uyruk=tr                  menajerin uyruğu (başlangıç bölgesini belirler)
//   --dunya                     kulüpler arası (bot dışı) transferleri de yaz
//   --cikti=playtest-out        çıktı klasörü
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
// tools/savetest.js'teki FILES ile aynı liste ve aynı sıra. Yeni bir js dosyası
// buraya da eklenmeli; eklenmezse bot onsuz çalışır ve eksikliği fark etmez.
const FILES = ['i18n','lang-es','lang-pt','lang-de','lang-fr','lang-it','store','saves','reward','ads-testcfg','ads','iap','review','data','worldgeo','atlas','rivals','badges','core',
               'sim','market','events','skills','sfx','actions','ui','main'];

/* ================= argümanlar ================= */
const ARG = {};
process.argv.slice(2).forEach(a => {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  if (m) ARG[m[1]] = m[2] === undefined ? true : m[2];
});
function seeds(s) {
  if (!s || s === true) return [1];
  const out = [];
  String(s).split(',').forEach(part => {
    const r = /^(\d+)-(\d+)$/.exec(part);
    if (r) for (let i = +r[1]; i <= +r[2]; i++) out.push(i);
    else if (/^\d+$/.test(part)) out.push(+part);
  });
  return out.length ? out : [1];
}
function pick(v, allowed, def) { return allowed.indexOf(v) >= 0 ? v : def; }
const CFG = {
  seeds: seeds(ARG.tohum),
  seasons: Math.max(1, parseInt(ARG.sezon, 10) || 5),
  ev: pick(ARG.olay, ['rastgele','ilk','nakit','itibar','iliski'], 'rastgele'),
  neg: pick(ARG.soz, ['normal','acgozlu','temkinli'], 'normal'),
  tr: pick(ARG.transfer, ['orta','az','cok','hic'], 'orta'),
  nat: typeof ARG.uyruk === 'string' ? ARG.uyruk : 'tr',
  world: !!ARG.dunya,
  out: path.resolve(ROOT, typeof ARG.cikti === 'string' ? ARG.cikti : 'playtest-out')
};

/* ================= DOM taklidi ================= */
/* savetest.js'tekiyle aynı biçim. Fark: getElementById aynı id için hep aynı
   düğümü veriyor ve value yazılabiliyor — transfer ekranının beş alanını bot
   buradan dolduruyor, submitOffers() da buradan okuyor. */
function makeEl() {
  const cls = new Set();
  const e = {
    tagName: 'DIV', style: { setProperty() {}, removeProperty() {} }, dataset: {}, children: [], _html: '', _v: '',
    classList: {
      add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c),
      toggle: (c, f) => { if (f === undefined) { cls.has(c) ? cls.delete(c) : cls.add(c); } else { f ? cls.add(c) : cls.delete(c); } return cls.has(c); }
    },
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {}, hasAttribute() { return false; },
    appendChild(c) { e.children.push(c); return c; }, removeChild() {}, insertBefore() {},
    addEventListener() {}, removeEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    focus() {}, blur() {}, click() {}, scrollTo() {}, scrollIntoView() {}, remove() {}, closest() { return null; },
    contains() { return false; }, setPointerCapture() {}, releasePointerCapture() {},
    getBoundingClientRect() { return { x: 0, y: 0, width: 360, height: 640, top: 0, left: 0, right: 360, bottom: 640 }; },
    offsetWidth: 360, offsetHeight: 640, scrollTop: 0, className: '', disabled: false,
    get innerHTML() { return e._html; }, set innerHTML(v) { e._html = String(v); },
    get textContent() { return e._html; }, set textContent(v) { e._html = String(v); },
    get firstChild() { return e.children[0] || null; },
    get value() { return e._v; }, set value(v) { e._v = v; }
  };
  return e;
}
function makeLS() {
  const store = {};
  return {
    getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; }
  };
}

/* ================= tek koşu ================= */
function runSeed(seed) {
  const nodes = {};
  const doc = {
    createElement: makeEl, createElementNS: makeEl, createTextNode: makeEl,
    getElementById(id) { return nodes[id] || (nodes[id] = makeEl()); },
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener() {}, removeEventListener() {},
    body: makeEl(), head: makeEl(), visibilityState: 'visible',
    documentElement: { style: { setProperty() {} }, dataset: {}, setAttribute() {}, classList: { add() {}, remove() {} } }
  };
  /* Math, JSON, Promise bağlama VERİLMİYOR: bağlamın kendi Math'i kullanılıyor
     ki Math.random'ı değiştirmek Node'un kendi Math'ine dokunmasın.
     indexedDB ve crypto da yok: kayıt katmanı bu aracın konusu değil
     (savetest.js ölçüyor) ve newCid() Math.random yedeğine düşünce kariyer
     kimliği de tohumdan türüyor. */
  const ctx = {
    console, structuredClone,
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    document: doc, navigator: { language: 'tr', userAgent: 'node' },
    localStorage: makeLS(),
    location: { protocol: 'file:', href: 'file:///x' },
    performance: { now: () => Date.now() },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    addEventListener() {}, removeEventListener() {},
    alert() {}, confirm() { return true; }, prompt() { return ''; },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    AudioContext: function () {
      this.createOscillator = () => ({ connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {}, value: 0 }, type: '' });
      this.createGain = () => ({ connect() {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, value: 0 } });
      this.currentTime = 0; this.destination = {}; this.state = 'running'; this.resume = () => {};
    }
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx; ctx.webkitAudioContext = ctx.AudioContext;
  vm.createContext(ctx);
  // mulberry32: küçük, hızlı, dağılımı düzgün. Kripto değil, olması da gerekmiyor.
  vm.runInContext(
    'function __mb32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);' +
    't=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}' +
    'Math.random=__mb32(' + (seed >>> 0) + ');', ctx);
  FILES.forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8'),
    ctx, { filename: 'js/' + f + '.js' }));
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'playtest', 'bot.js'), 'utf8'),
    ctx, { filename: 'tools/playtest/bot.js' });
  const cfg = { seed, seasons: CFG.seasons, ev: CFG.ev, neg: CFG.neg, tr: CFG.tr, nat: CFG.nat, world: CFG.world };
  const json = vm.runInContext('BOT.run(' + JSON.stringify(cfg) + ')', ctx);
  return JSON.parse(json);
}

/* ================= CSV ================= */
/* Türkçe Excel: ayırıcı noktalı virgül, ondalık virgül, başta BOM. Nokta ile
   yazılan 1.5 orada tarihe ("1 Mayıs") dönüşüyor. */
function cell(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'number') return isFinite(v) ? String(v).replace('.', ',') : String(v);
  if (typeof v === 'boolean') return v ? 'evet' : 'hayır';
  const s = String(v);
  return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function writeCsv(name, cols, rows) {
  const lines = [cols.map(c => c[0]).join(';')];
  rows.forEach(r => lines.push(cols.map(c => cell(c[1](r))).join(';')));
  fs.writeFileSync(path.join(CFG.out, name), '﻿' + lines.join('\r\n') + '\r\n', 'utf8');
}
const P = (r, k) => (r.player ? r.player[k] : '');

const COLS = {
  ev: [
    ['tohum', r => r.seed], ['sezon', r => r.se], ['hafta', r => r.wk],
    ['olay', r => r.id], ['başlık', r => r.title], ['kategori', r => r.cat], ['boyut', r => r.size],
    ['seçenek no', r => r.opt], ['seçenek sayısı', r => r.nOpts], ['verilen cevap', r => r.optText],
    ['sonuç', r => r.result],
    ['nakit K€', r => r.got.cash || 0], ['itibar', r => r.got.rep || 0], ['moral', r => r.got.morale || 0],
    ['güven', r => r.got.trust || 0], ['form', r => r.got.form || 0],
    ['kalıcı etki', r => (r.ag ? JSON.stringify(r.ag) : '')], ['bayrak', r => r.flag],
    // "istenen": bedel ölçeğinden (evScaled) geçmiş, ama itibar sönümünden ve
    // beceri bonuslarından geçmemiş hali. Uygulanan değer soldaki sütunlarda.
    ['istenen nakit', r => r.want.cash], ['istenen itibar', r => r.want.rep],
    ['oyuncu', r => P(r, 'n')], ['yaş', r => P(r, 'age')], ['mevki', r => P(r, 'pos')],
    ['ovr', r => P(r, 'r')], ['pot', r => P(r, 'pot')], ['kulüp', r => P(r, 'club')],
    ['olay öncesi itibar', r => r.rep0], ['olay öncesi kasa K€', r => r.cash0], ['müşteri kaybı', r => r.lostClient]
  ],
  tr: [
    ['tohum', r => r.seed], ['sezon', r => r.se], ['hafta', r => r.wk], ['tür', r => r.kind],
    ['oyuncu', r => r.n], ['yaş', r => r.age], ['mevki', r => r.pos], ['ovr', r => r.r], ['pot', r => r.pot],
    ['nereden', r => r.from], ['nereden lig', r => r.fromLg], ['eski kulüp gücü', r => r.fromStr],
    ['nereye', r => r.to], ['nereye lig', r => r.toLg], ['yeni kulüp gücü', r => r.toStr],
    ['bonservis M€', r => r.fee], ['piyasa değeri M€', r => r.val], ['bonservis/değer', r => r.ratio],
    ['bonservissiz', r => r.free],
    ['eski maaş K€/hf', r => r.wageOld], ['yeni maaş K€/hf', r => r.wageNew], ['yeni sözleşme yıl', r => r.yrsNew],
    ['komisyon K€', r => r.cut], ['komisyon %', r => r.rate], ['taksit', r => r.pay],
    ['gol bonusu eşiği', r => r.gb], ['sonraki satış payı %', r => r.so], ['tahsil edilen satış payı %', r => r.soPaidPct],
    ['fona satılmış', r => r.tpo], ['itibar kazancı', r => r.rep], ['kasa değişimi K€', r => r.cash]
  ],
  ct: [
    ['tohum', r => r.seed], ['sezon', r => r.se], ['hafta', r => r.wk],
    ['oyuncu', r => P(r, 'n')], ['yaş', r => P(r, 'age')], ['mevki', r => P(r, 'pos')],
    ['ovr', r => P(r, 'r')], ['pot', r => P(r, 'pot')], ['kulüp', r => P(r, 'club')], ['lig', r => P(r, 'lg')],
    ['gerekçe', r => r.reason], ['son 5 maç', r => r.last5],
    ['eski maaş K€/hf', r => P(r, 'wage')], ['kalan yıl', r => P(r, 'yrs')],
    ['sonuç', r => r.result], ['yeni maaş K€/hf', r => r.wageNew], ['yeni süre yıl', r => r.yrsNew], ['zam %', r => r.raise],
    ['imza payı K€', r => r.fee], ['komisyon %', r => r.rate], ['itibar', r => r.repPay], ['imzalandı', r => r.signed],
    ['kulüp tavanı K€', r => r.clubMax], ['piyasa maaşı K€', r => r.market], ['kulübün rahat süresi', r => r.clubYears],
    ['tur sayısı', r => r.rounds.length],
    ['turlar', r => r.rounds.map(x => x.round + ': ' + x.wage + 'K/' + x.years + 'y %' + x.chance + ' → ' + x.res +
      (x.counter ? ' ' + x.counter + 'K/' + x.cYears + 'y' : '')).join(' | ')]
  ],
  offers: [
    ['tohum', r => r.seed], ['sezon', r => r.se], ['hafta', r => r.wk],
    ['oyuncu', r => P(r, 'n')], ['yaş', r => P(r, 'age')], ['mevki', r => P(r, 'pos')],
    ['ovr', r => P(r, 'r')], ['pot', r => P(r, 'pot')], ['kulüp', r => P(r, 'club')],
    ['bonservissiz', r => r.free], ['piyasa değeri M€', r => r.val], ['istenen bonservis M€', r => r.fee],
    ['istenen/değer', r => r.ratio], ['taksit', r => r.pay], ['gol bonusu', r => r.gb], ['satış payı %', r => r.so],
    ['teklif götürülen kulüpler', r => r.clubs.map(c => c.n + ' (' + c.str + ')').join(', ')],
    ['reddeden', r => r.rej], ['sonuç', r => r.outcome], ['giden kulüp', r => r.to]
  ],
  meet: [
    ['tohum', r => r.seed], ['sezon', r => r.se], ['hafta', r => r.wk],
    ['oyuncu', r => P(r, 'n')], ['yaş', r => P(r, 'age')], ['mevki', r => P(r, 'pos')],
    ['ovr', r => P(r, 'r')], ['pot', r => P(r, 'pot')], ['kulüp', r => P(r, 'club')], ['lig', r => P(r, 'lg')],
    ['maaş K€/hf', r => P(r, 'wage')], ['önceki temsilci', r => r.agentBefore],
    ['şans başta %', r => r.chance0], ['şans sonda %', r => r.chance1], ['imzaladı', r => r.ok],
    ['maliyet K€', r => r.cost], ['itibar', r => r.rep]
  ],
  poach: [
    ['tohum', r => r.seed], ['sezon', r => r.se], ['hafta', r => r.wk],
    ['oyuncu', r => P(r, 'n')], ['yaş', r => P(r, 'age')], ['ovr', r => P(r, 'r')], ['pot', r => P(r, 'pot')],
    ['güven', r => P(r, 'trust')], ['moral', r => P(r, 'morale')],
    ['rakip ajans', r => r.rival], ['tip', r => r.arch], ['risk %', r => r.risk],
    ['seçenek no', r => r.opt], ['verilen cevap', r => r.optText], ['kaybedildi', r => r.lost], ['nakit K€', r => r.cash]
  ],
  ai: [
    ['tohum', r => r.seed], ['sezon', r => r.se], ['hafta', r => r.wk],
    ['oyuncu', r => r.n], ['yaş', r => r.age], ['mevki', r => r.pos], ['ovr', r => r.r], ['pot', r => r.pot],
    ['nereden', r => r.from], ['nereden lig', r => r.fromLg], ['nereye', r => r.to], ['nereye lig', r => r.toLg],
    ['bonservis M€', r => r.fee], ['piyasa değeri M€', r => r.val], ['eski maaş K€/hf', r => r.wageOld], ['temsilci', r => r.agent]
  ],
  season: [
    ['tohum', r => r.seed], ['sezon', r => r.se], ['itibar', r => r.rep], ['kasa K€', r => r.cash],
    ['seviye', r => r.level], ['yetenek', r => r.skills], ['müşteri', r => r.clients], ['kapasite', r => r.cap],
    ['haftalık gelir K€', r => r.income], ['haftalık gider K€', r => r.cost], ['komisyon %', r => r.commPct],
    ['bilinen lig', r => r.known], ['müşteri ort. ovr', r => r.clAvgR], ['müşteri ort. maaş', r => r.clAvgWage],
    ['nüfus', r => r.pop], ['yaş ort.', r => r.ageAvg], ['en genç', r => r.ageMin], ['en yaşlı', r => r.ageMax],
    ['kulüpsüz', r => r.freeAgents], ['temsilcisiz', r => r.unrep]
  ]
};

/* ================= özet ================= */
const avg = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const f1 = v => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
const pad = (s, n) => { s = String(s); return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length); };
const padL = (s, n) => { s = String(s); return s.length >= n ? s : ' '.repeat(n - s.length) + s; };

function summary(all) {
  const L = [];
  const nSeed = CFG.seeds.length;
  L.push('OYUN TESTİ — ' + nSeed + ' tohum (' + CFG.seeds.join(', ') + ') × ' + CFG.seasons + ' sezon');
  L.push('politika: olay=' + CFG.ev + ' · sözleşme=' + CFG.neg + ' · transfer=' + CFG.tr + ' · uyruk=' + CFG.nat);
  L.push('');

  L.push('== SEZON SONLARI ==');
  L.push(pad('tohum', 6) + pad('sezon', 6) + padL('itibar', 8) + padL('kasa K€', 10) + padL('svy', 5) + padL('müşt', 7) +
    padL('gelir', 8) + padL('gider', 8) + padL('nüfus', 7) + padL('yaş', 6) + padL('kulüpsüz', 9) + padL('tems.siz', 9));
  all.season.forEach(s => L.push(pad(s.seed, 6) + pad(s.se, 6) + padL(f1(s.rep), 8) + padL(s.cash, 10) + padL(s.level, 5) +
    padL(s.clients + '/' + s.cap, 7) + padL(f1(s.income), 8) + padL(f1(s.cost), 8) + padL(s.pop, 7) + padL(f1(s.ageAvg), 6) +
    padL(s.freeAgents, 9) + padL(s.unrep, 9)));
  L.push('');

  L.push('== OLAYLAR == toplam ' + all.ev.length + ' (sezon başına ' + f1(all.ev.length / (nSeed * CFG.seasons)) + ')');
  const byEv = {};
  all.ev.forEach(e => { (byEv[e.id] = byEv[e.id] || { title: e.title, size: e.size, n: 0, opts: {} }).n++;
    const o = (byEv[e.id].opts[e.opt] = byEv[e.id].opts[e.opt] || { text: e.optText, rows: [] }); o.rows.push(e); });
  Object.keys(byEv).sort((a, b) => byEv[b].n - byEv[a].n).forEach(id => {
    const e = byEv[id];
    L.push('');
    L.push(pad(e.n + '×', 5) + id + ' — ' + e.title + ' (' + e.size + ')');
    Object.keys(e.opts).sort().forEach(k => {
      const o = e.opts[k], g = key => avg(o.rows.map(r => r.got[key] || 0));
      L.push('      [' + k + '] ' + pad(o.rows.length + '×', 5) + pad(o.text, 46) +
        ' nakit ' + padL(f1(g('cash')), 7) + '  itibar ' + padL(f1(g('rep')), 5) +
        '  güven ' + padL(f1(g('trust')), 5) + '  moral ' + padL(f1(g('morale')), 5));
    });
  });
  const unseen = EVIDS.filter(id => !byEv[id]);
  L.push('');
  L.push('hiç çıkmayan olaylar (' + unseen.length + '/' + EVIDS.length + '): ' + (unseen.join(', ') || '—'));
  // Uygun hafta: olayın koşulunun sağlandığı hafta sayısı. Sıfırsa koşul hiç
  // tutmamış; yüksekse olay çıkabilirdi ama zar gelmemiş.
  unseen.forEach(id => L.push('    ' + pad(id, 18) + 'koşulu ' + (ELIG[id] || 0) + '/' + ELIGW + ' haftada sağlandı'));
  L.push('');

  const ok = all.ct.filter(c => c.result === 'anlaşıldı'), brk = all.ct.filter(c => c.result === 'koptu');
  L.push('== SÖZLEŞME YENİLEME == ' + all.ct.length + ' görüşme · ' + ok.length + ' anlaşma · ' + brk.length + ' kopma');
  if (ok.length) {
    L.push('  ortalama zam %' + f1(avg(ok.map(c => c.raise))) + ' · ortalama süre ' + f1(avg(ok.map(c => c.yrsNew))) + ' yıl' +
      ' · ortalama imza payı ' + f1(avg(ok.map(c => c.fee))) + 'K · ilk turda anlaşma ' + ok.filter(c => c.rounds.length === 1).length);
    const byReason = {};
    all.ct.forEach(c => { (byReason[c.reason] = byReason[c.reason] || []).push(c); });
    Object.keys(byReason).forEach(k => { const a = byReason[k], o = a.filter(c => c.result === 'anlaşıldı');
      L.push('  gerekçe ' + pad(k, 10) + pad(a.length + ' görüşme', 14) + o.length + ' anlaşma' +
        (o.length ? ' · zam %' + f1(avg(o.map(c => c.raise))) + ' · imza payı ' + f1(avg(o.map(c => c.fee))) + 'K' : '')); });
  }
  L.push('');

  L.push('== TRANSFERLER (müşteriler) == ' + all.tr.length);
  ['benim teklifim', 'kulüp teklifi', 'diğer'].forEach(k => { const a = all.tr.filter(t => t.kind === k); if (!a.length) return;
    const paid = a.filter(t => !t.free);
    L.push('  ' + pad(k, 16) + pad(a.length + ' transfer', 14) + 'bonservisli ' + paid.length +
      (paid.length ? ' · ort. bonservis ' + f1(avg(paid.map(t => t.fee))) + 'M · bonservis/değer ' + f1(avg(paid.map(t => t.ratio)) * 100) + '%' : '') +
      ' · ort. komisyon ' + f1(avg(a.map(t => t.cut))) + 'K'); });
  const sent = all.offers.filter(o => o.clubs.length);
  if (all.offers.length) {
    L.push('  teklif denemesi ' + all.offers.length + ' · ilgilenen kulüp çıkmayan ' + (all.offers.length - sent.length));
    [0.8, 1, 1.2, 1.5].forEach(m => { const a = sent.filter(o => !o.free && Math.abs(o.ratio - m) < 0.11); if (!a.length) return;
      const acc = a.filter(o => o.outcome === 'kabul' || o.outcome.indexOf('anlaşıldı') === 0);
      L.push('    değerin ' + String(m).replace('.', ',') + ' katı istendi: ' + a.length + ' deneme, ' + acc.length + ' kabul (%' + Math.round(acc.length / a.length * 100) + ')'); });
    const fr = sent.filter(o => o.free);
    if (fr.length) L.push('    bonservissiz: ' + fr.length + ' deneme, ' + fr.filter(o => o.outcome === 'kabul' || o.outcome.indexOf('anlaşıldı') === 0).length + ' kabul');
  }
  L.push('');

  L.push('== MÜŞTERİ GÖRÜŞMELERİ == ' + all.meet.length + ' görüşme · ' + all.meet.filter(m => m.ok).length + ' imza');
  L.push('== AYARTMA == ' + all.poach.length + ' karar · ' + all.poach.filter(p => p.lost).length + ' kayıp');
  if (CFG.world) L.push('== DÜNYA TRANSFERLERİ == ' + all.ai.length);
  L.push('');

  L.push('== HATALAR == ' + all.err.length);
  all.err.slice(0, 30).forEach(e => {
    L.push('  tohum ' + e.seed + ' s' + e.se + ' h' + e.wk + ' [' + e.where + '] ' + e.msg);
    if (e.stack) L.push('      ' + e.stack);
  });
  if (all.err.length > 30) L.push('  … ' + (all.err.length - 30) + ' satır daha (ham.json)');
  return L.join('\n');
}

/* ================= çalıştır ================= */
let EVIDS = [], ELIG = {}, ELIGW = 0;
function main() {
  fs.mkdirSync(CFG.out, { recursive: true });
  const all = { ev: [], tr: [], ct: [], offers: [], meet: [], poach: [], ai: [], season: [], err: [], skills: [], scout: [] };
  const raw = {};
  CFG.seeds.forEach(seed => {
    const t0 = Date.now();
    const log = runSeed(seed);
    raw[seed] = log;
    EVIDS = log.allEvents || EVIDS;
    ELIGW += log.eligWeeks || 0;
    Object.keys(log.elig || {}).forEach(k => { ELIG[k] = (ELIG[k] || 0) + log.elig[k]; });
    Object.keys(all).forEach(k => (log[k] || []).forEach(r => { r.seed = seed; all[k].push(r); }));
    console.log('tohum ' + seed + ': ' + ((Date.now() - t0) / 1000).toFixed(1) + ' sn · sezon ' + (log.final.season - 1) +
      ' bitti · itibar ' + log.final.rep + ' · kasa ' + log.final.cash + 'K · ' + log.ev.length + ' olay · ' +
      log.ct.length + ' sözleşme · ' + log.tr.length + ' transfer · ' + log.err.length + ' hata');
  });
  writeCsv('olaylar.csv', COLS.ev, all.ev);
  writeCsv('transferler.csv', COLS.tr, all.tr);
  writeCsv('sozlesmeler.csv', COLS.ct, all.ct);
  writeCsv('teklifler.csv', COLS.offers, all.offers);
  writeCsv('gorusmeler.csv', COLS.meet, all.meet);
  writeCsv('ayartma.csv', COLS.poach, all.poach);
  writeCsv('sezonlar.csv', COLS.season, all.season);
  if (CFG.world) writeCsv('dunya-transferleri.csv', COLS.ai, all.ai);
  fs.writeFileSync(path.join(CFG.out, 'ham.json'), JSON.stringify({ cfg: CFG, runs: raw }), 'utf8');
  const txt = summary(all);
  fs.writeFileSync(path.join(CFG.out, 'ozet.txt'), txt + '\n', 'utf8');
  console.log('\n' + txt);
  console.log('\nçıktı: ' + CFG.out);
  // showSeasonModal'ın 300 ms'lik zamanlayıcıları süreci açık tutmasın.
  process.exit(all.err.length ? 1 : 0);
}
main();
