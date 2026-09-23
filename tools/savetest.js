// node tools/savetest.js
// Kalıcılık katmanının testleri: göç, yeni kayıt, yeniden başlatma, kota, şema.
//
// Neden burada bir IndexedDB taklidi var: depoya çalışma zamanı bağımlılığı
// girmiyor (oyunun tamamı sıfır bağımlılık) ve fake-indexeddb gibi bir paket
// kotayı istediğimiz anda patlatmamıza izin vermiyor. Taklit yalnızca
// js/store.js'in gerçekten kullandığı yüzeyi kapsıyor: open/upgrade,
// transaction, get/put/delete/getAllKeys.
//
// Her test "oturum" açıyor: taze bir vm bağlamı, ama disk (IndexedDB verisi ve
// localStorage) oturumlar arasında paylaşılıyor. Uygulamayı kapatıp açmak bu.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FILES = ['i18n','store','saves','reward','ads-testcfg','ads','iap','data','worldgeo','atlas','rivals','core',
               'sim','market','events','skills','sfx','actions','ui','main'];

/* ================= IndexedDB taklidi ================= */
/* disk: {saves:{}, meta:{}} — oturumlar arasında yaşayan tek nesne.
   fail: () => hata|null — her yazmadan önce sorulur, kota taklidi bununla. */
function makeIDB(disk, ctl) {
  const async = fn => setTimeout(fn, 0);
  function req() { return { result: undefined, error: null, onsuccess: null, onerror: null }; }

  // Her istek işini __work içinde tutuyor ve bunu işlem tamamlanırken çalıştırıyoruz.
  // Sonucu kendi setTimeout'unda yazsaydı, işlemin oncomplete'i ondan önce
  // tetiklenir ve okumalar boş dönerdi — gerçek IndexedDB'de de sonuç
  // oncomplete'ten önce hazırdır.
  function objectStore(name) {
    const data = disk[name];
    return {
      // get de kopya döndürüyor: gerçek IndexedDB her okumada yapısal kopya
      // verir, aynı nesneyi değil. Kopyalamazsak yüklenen kaydın sonraki
      // mutasyonları "diske" yazılmadan sızar — yazma başarısızken kaydın
      // değişmediğini iddia eden test, olmayan bir yazmayı görmüş sayardı.
      // ctl.failGet(key): TEK BİR okumayı patlatır (getAllKeys çalışmaya devam
      // eder). "Okuyamadım" ile "orada bir şey yok" cevaplarının ayrıldığını
      // ölçmek için gerekiyor; ikisi aynı sayılırsa göç mevcut kaydı ezer.
      get(key) { const r = req(); r.__work = () => { const e = ctl.failGet && ctl.failGet(key); if (e) throw e; r.result = structuredClone(data[key]); }; return r; },
      getAllKeys() { const r = req(); r.__work = () => { r.result = Object.keys(data); }; return r; },
      put(val, key) {
        const r = req();
        // Kopya PUT ÇAĞRISI SIRASINDA alınıyor — gerçek IndexedDB de değeri o
        // anda yapısal kopyalar. Kopyalamayı __work'e (işlemin tamamlanmasına)
        // bırakmak, put ile tamamlanma arasındaki her mutasyonun "diske"
        // sızmasına yol açıyordu: testler yazılmamış veriyi yazılmış sanıyordu.
        // Başarısız işlemde __work hiç çalışmadığı için disk değişmiyor.
        const snap = structuredClone(val);
        r.__work = () => { data[key] = snap; r.result = key; };
        return r;
      },
      delete(key) { const r = req(); r.__work = () => { delete data[key]; }; return r; }
    };
  }

  function transaction(name, mode) {
    const tx = { error: null, oncomplete: null, onerror: null, onabort: null, __reqs: [] };
    const st = objectStore(name);
    const wrap = fn => function () {
      const r = fn.apply(st, arguments);
      tx.__reqs.push(r);
      return r;
    };
    tx.objectStore = () => ({
      get: wrap(st.get), getAllKeys: wrap(st.getAllKeys),
      put: wrap(st.put), delete: wrap(st.delete)
    });
    setTimeout(() => {
      const err = (mode === 'readwrite' && ctl.failWrite) ? ctl.failWrite() : null;
      if (err) { tx.error = err; if (tx.onerror) tx.onerror(); return; }
      try { tx.__reqs.forEach(r => { if (r.__work) r.__work(); }); }
      catch (e) { tx.error = e; if (tx.onerror) tx.onerror(); return; }
      if (tx.oncomplete) tx.oncomplete();
    }, 0);
    return tx;
  }

  return {
    open(name, ver) {
      const r = { result: null, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null };
      setTimeout(() => {
        // ctl.failOpen: IndexedDB VAR ama bu oturumda açılamıyor (bozuk profil,
        // dolu disk, onblocked). noIDB'den farkı geçici olması: disk yerinde
        // duruyor ve bir sonraki oturum onu yeniden görüyor.
        if (ctl.failOpen) { r.error = new Error('OpenFailed'); if (r.onerror) r.onerror(); return; }
        const db = {
          objectStoreNames: { contains: n => Object.prototype.hasOwnProperty.call(disk, n) },
          createObjectStore(n) { if (!disk[n]) disk[n] = {}; return objectStore(n); },
          transaction
        };
        r.result = db;
        if (!disk.__created) {
          disk.__created = true;
          if (r.onupgradeneeded) r.onupgradeneeded({ target: { result: db } });
        }
        if (r.onsuccess) r.onsuccess({ target: { result: db } });
      }, 0);
      return r;
    }
  };
}

/* ================= DOM taklidi ================= */
function makeEl() {
  const cls = new Set();
  const e = {
    tagName: 'DIV', style: { setProperty() {} }, dataset: {}, children: [], _html: '',
    classList: {
      add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c),
      toggle: (c, f) => { if (f === undefined) { cls.has(c) ? cls.delete(c) : cls.add(c); } else { f ? cls.add(c) : cls.delete(c); } return cls.has(c); }
    },
    __cls: cls,
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    appendChild(c) { e.children.push(c); return c; }, removeChild() {}, insertBefore() {},
    addEventListener() {}, removeEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    focus() {}, blur() {}, click() {}, scrollTo() {}, remove() {}, closest() { return null; },
    contains() { return false; },
    getBoundingClientRect() { return { x: 0, y: 0, width: 360, height: 640, top: 0, left: 0, right: 360, bottom: 640 }; },
    get innerHTML() { return e._html; }, set innerHTML(v) { e._html = String(v); },
    get textContent() { return e._html; }, set textContent(v) { e._html = String(v); },
    get firstChild() { return e.children[0] || null; },
    get value() { return e._v || ''; }, set value(v) { e._v = v; }
  };
  return e;
}

/* ================= localStorage taklidi ================= */
/* quota: karakter değil bayt; Chrome UTF-16 sayıyor, biz de öyle sayıyoruz. */
function makeLS(store, ctl) {
  const used = () => Object.keys(store).reduce((n, k) => n + (k.length + store[k].length) * 2, 0);
  return {
    getItem: k => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem(k, v) {
      v = String(v);
      const old = store[k];
      delete store[k];
      if (ctl.lsQuota && used() + (k.length + v.length) * 2 > ctl.lsQuota) {
        if (old !== undefined) store[k] = old;
        const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e;
      }
      store[k] = v;
    },
    removeItem(k) { delete store[k]; }
  };
}

/* ================= oturum ================= */
function session(disk, lsStore, ctl) {
  ctl = ctl || {};
  const nodes = {};
  const doc = {
    createElement: makeEl, createElementNS: makeEl, createTextNode: makeEl,
    getElementById(id) { return nodes[id] || (nodes[id] = makeEl()); },
    querySelector() { return makeEl(); }, querySelectorAll() { return []; },
    addEventListener() {}, removeEventListener() {},
    body: makeEl(), head: makeEl(), visibilityState: 'visible',
    documentElement: { style: { setProperty() {} }, dataset: {}, setAttribute() {}, classList: { add() {}, remove() {} } }
  };
  const ctx = {
    console, Math, Date, JSON, structuredClone, Promise, Error,
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    document: doc, navigator: { language: 'tr', userAgent: 'node' },
    localStorage: makeLS(lsStore, ctl),
    indexedDB: ctl.noIDB ? undefined : makeIDB(disk, ctl),
    /* vm bağlamı Node'un globallerini devralmıyor; crypto elle veriliyor.
       ctl.noCrypto ile kapatılabiliyor çünkü newCid()'in Math.random yedeği de
       gerçekten çalışmak zorunda (eski tarayıcı, güvensiz bağlam). */
    crypto: ctl.noCrypto ? undefined : crypto,
    location: { protocol: 'file:', href: 'file:///x' },
    performance: { now: () => Date.now() },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    addEventListener() {}, removeEventListener() {},
    alert() {}, confirm() { return true; }, prompt() { return ''; },
    AudioContext: function () {
      this.createOscillator = () => ({ connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {}, value: 0 }, type: '' });
      this.createGain = () => ({ connect() {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, value: 0 } });
      this.currentTime = 0; this.destination = {}; this.state = 'running'; this.resume = () => {};
    }
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx; ctx.webkitAudioContext = ctx.AudioContext;
  vm.createContext(ctx);
  FILES.forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8'),
    ctx, { filename: 'js/' + f + '.js' }));
  const R = code => vm.runInContext(code, ctx);
  return { ctx, R, nodes, booted: waitFor(() => R('storeReady')) };
}

function tick() { return new Promise(r => setTimeout(r, 0)); }
async function waitFor(fn, label, limit) {
  for (let i = 0; i < (limit || 20000); i++) { if (fn()) return true; await tick(); }
  throw new Error('zaman aşımı: ' + (label || 'koşul'));
}

/* ================= yardımcılar ================= */
let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; fails.push(name + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
function newDisk() { return { saves: {}, meta: {} }; }
function quotaErr() { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; return e; }

async function freshCareer(s, weeks) {
  s.R("curSlot=1;newGame();createAgent('Test','Agent','tr','TestCo');");
  for (let i = 0; i < (weeks || 0); i++) s.R('nextWeek();');
  s.R('save();');
  await s.R('saveDrain()');
}

/* ================= testler ================= */

async function tNewSaveAndRestart() {
  console.log('\n[1] yeni kayıt + yeniden başlatma');
  const disk = newDisk(), ls = {};
  const a = session(disk, ls, {});
  await a.booted;
  ok(a.R('saveBackend()') === 'idb', 'IndexedDB arka ucu seçildi');
  await freshCareer(a, 3);
  const before = a.R('JSON.stringify(S)');
  const pidBefore = a.R('PID');
  ok(Object.keys(disk.saves).length === 1, 'kayıt diske yazıldı', JSON.stringify(Object.keys(disk.saves)));
  ok(disk.saves.s1 && disk.saves.s1.v === a.R('SAVE_SCHEMA'), 'kayıt şema sürümü taşıyor');
  ok(!ls['menajerSaveV9s1'], 'localStorage kullanılmadı');

  const b = session(disk, ls, {});
  await b.booted;
  ok(!!b.R("allMeta().s1"), 'yeniden başlatmada özet görünüyor');
  const r = await b.R('loadSlot(1)');
  ok(r.ok === true, 'kayıt yüklendi', JSON.stringify(r));
  ok(b.R('JSON.stringify(S)') === before, 'durum bit bit aynı');
  ok(b.R('PID') === pidBefore, 'PID korundu');
}

async function tLegacySingle() {
  console.log('\n[2] eski tek kayıt (menajerSaveV9) devri');
  const disk = newDisk(), ls = {};
  // Gerçek bir kayıt üret, sonra onu eski biçimde localStorage'a koy.
  const seed = session(newDisk(), {}, {});
  await seed.booted;
  await freshCareer(seed, 2);
  const payload = seed.R('JSON.stringify({S:S,PID:PID})');
  const expect = seed.R('JSON.stringify(S)');
  ls['menajerSaveV9'] = payload;
  // Eski sürüm tema/dili kaydın içinde tutuyordu.
  const withPrefs = JSON.parse(payload);
  withPrefs.S.theme = 'terminal'; withPrefs.S.lang = 'en';
  ls['menajerSaveV9'] = JSON.stringify(withPrefs);

  const a = session(disk, ls, {});
  await a.booted;
  ok(!ls['menajerSaveV9'], 'eski anahtar silindi');
  ok(!!disk.saves.s1, 'kayıt 1. yuvaya taşındı');
  ok(!!a.R('allMeta().s1'), 'özet kuruldu');
  ok(a.R("pref('theme','')") === 'terminal', 'tema PREFS\'e taşındı');
  ok(a.R("pref('lang','')") === 'en', 'dil PREFS\'e taşındı');
  const r = await a.R('loadSlot(1)');
  ok(r.ok === true && a.R('JSON.stringify(S)') === JSON.stringify(withPrefs.S), 'içerik kayıpsız');

  // İkinci açılışta 1. yuva doluyken eski anahtar yeniden belirse üstüne yazmamalı.
  ls['menajerSaveV9'] = payload;
  const b = session(disk, ls, {});
  await b.booted;
  ok(!ls['menajerSaveV9'], 'dolu yuvada eski anahtar yalnızca silindi');
  const r2 = await b.R('loadSlot(1)');
  ok(r2.ok === true && b.R('JSON.stringify(S)') === JSON.stringify(withPrefs.S),
     'dolu yuvanın üstüne yazılmadı');
}

async function tLegacySlots() {
  console.log('\n[3] localStorage yuvalarının devri');
  const disk = newDisk(), ls = {};
  const want = {};
  for (const n of [1, 2, 3]) {
    const s = session(newDisk(), {}, {});
    await s.booted;
    await freshCareer(s, n);
    ls['menajerSaveV9s' + n] = s.R('JSON.stringify({S:S,PID:PID})');
    want[n] = s.R('JSON.stringify(S)');
  }
  ls['menajerMetaV1'] = JSON.stringify({ s1: { agent: 'x' } });

  const a = session(disk, ls, {});
  await a.booted;
  for (const n of [1, 2, 3]) {
    ok(!ls['menajerSaveV9s' + n], 'yuva ' + n + ' localStorage\'dan silindi');
    ok(!!disk.saves['s' + n], 'yuva ' + n + ' IndexedDB\'ye taşındı');
    ok(!!a.R('allMeta().s' + n), 'yuva ' + n + ' özeti var');
  }
  for (const n of [1, 2, 3]) {
    const r = await a.R('loadSlot(' + n + ')');
    ok(r.ok === true && a.R('JSON.stringify(S)') === want[n], 'yuva ' + n + ' içeriği kayıpsız');
  }
}

async function tMigrationAtomicity() {
  console.log('\n[4] göç yarıda kesilirse veri kaybolmuyor');
  const disk = newDisk(), ls = {};
  const seed = session(newDisk(), {}, {});
  await seed.booted;
  await freshCareer(seed, 2);
  const payload = seed.R('JSON.stringify({S:S,PID:PID})');
  const expect = seed.R('JSON.stringify(S)');
  ls['menajerSaveV9s1'] = payload;

  // Yazma hep başarısız: göç ilerleyemez ama eskiyi de silmemeli.
  const a = session(disk, ls, { failWrite: () => quotaErr() });
  await a.booted;
  ok(ls['menajerSaveV9s1'] === payload, 'yazma başarısızken eski kayıt yerinde duruyor');
  ok(!disk.saves.s1, 'yarım kayıt diske düşmedi');
  ok(a.R('saveHealthy()') === false, 'başarısızlık sağlık durumuna yansıdı');

  // Yer açıldı: bir sonraki açılış göçü tamamlamalı.
  const b = session(disk, ls, {});
  await b.booted;
  ok(!ls['menajerSaveV9s1'], 'ikinci açılışta göç tamamlandı');
  const r = await b.R('loadSlot(1)');
  ok(r.ok === true && b.R('JSON.stringify(S)') === expect, 'göçten sonra içerik kayıpsız');
}

async function tQuotaVisible() {
  console.log('\n[5] kayıt başarısızlığı kullanıcıya görünüyor');
  const disk = newDisk(), ls = {};
  const ctl = {};
  const a = session(disk, ls, ctl);
  await a.booted;
  await freshCareer(a, 1);
  ok(a.R('saveHealthy()') === true, 'başlangıçta sağlıklı');
  ok(a.nodes.saveWarn.__cls.has('show') === false, 'şerit başta gizli');

  ctl.failWrite = () => quotaErr();
  a.R('nextWeek();save();');
  await waitFor(() => !a.R('saveHealthy()'), 'kayıt hatası');
  a.R('render();');
  ok(a.nodes.saveWarn.__cls.has('show') === true, 'şerit göründü');
  ok(/kayıt|Kayıt/i.test(a.nodes.saveWarn.innerHTML), 'şeritte uyarı metni var',
     a.nodes.saveWarn.innerHTML.slice(0, 60));
  ok(a.R('SAVEH.lastErr') === 'QuotaExceededError', 'hata kodu tutuldu', a.R('SAVEH.lastErr'));
  a.R('showSaveHelp();');
  ok(/QuotaExceededError/.test(a.nodes.sheet.innerHTML), 'ayrıntı modalı hatayı gösteriyor');

  // Toparlanma
  delete ctl.failWrite;
  a.R('save();');
  await waitFor(() => a.R('saveHealthy()'), 'toparlanma');
  a.R('render();');
  ok(a.nodes.saveWarn.__cls.has('show') === false, 'düzelince şerit kayboldu');
  ok(a.R('SAVEH.everFailed') === true, 'geçmiş hata unutulmadı');
}

async function tLocalStorageFallback() {
  console.log('\n[6] IndexedDB yoksa localStorage\'a düşüş');
  const disk = newDisk(), ls = {};
  const a = session(disk, ls, { noIDB: true });
  await a.booted;
  ok(a.R('saveBackend()') === 'ls', 'localStorage arka ucuna düşüldü');
  await freshCareer(a, 1);
  ok(!!ls['menajerSaveV9s1'], 'kayıt localStorage\'a yazıldı');

  // Gerçek 5 MiB localStorage sınırı altında: oyun er ya da geç duvara toslar.
  // Asıl iddia hangi haftada olduğu değil — toslayınca kullanıcının görmesi.
  // (Bu, IndexedDB'ye taşınmadan önceki tek davranıştı ve sessizdi.)
  const ls2 = {};
  const b = session(newDisk(), ls2, { noIDB: true, lsQuota: 5 * 1024 * 1024 });
  await b.booted;
  b.R("curSlot=1;newGame();createAgent('Test','Agent','tr','TestCo');");
  let failWeek = 0;
  for (let i = 1; i <= 40 && !failWeek; i++) {
    b.R('nextWeek();save();');
    await b.R('saveDrain()');
    if (!b.R('saveHealthy()')) failWeek = i;
  }
  b.R('render();');
  console.log('       5 MiB kotada ilk kayıt hatası: ' + (failWeek ? failWeek + '. hafta' : 'yok') +
    ' · kayıt ' + Math.round(b.R('JSON.stringify({S:S,PID:PID}).length') * 2 / 1048576 * 100) / 100 + ' MB (UTF-16)');
  ok(failWeek > 0, '5 MiB kotada yazma er geç başarısız oluyor');
  ok(b.nodes.saveWarn.__cls.has('show') === true, 've kullanıcı bunu görüyor');
  ok(/Kayıt edilemiyor/.test(b.nodes.saveWarn.innerHTML), 'şerit metni doğru');
}

async function tSchemaVersion() {
  console.log('\n[7] şema sürümlemesi');
  const disk = newDisk(), ls = {};
  const a = session(disk, ls, {});
  await a.booted;
  await freshCareer(a, 1);
  const SCHEMA = a.R('SAVE_SCHEMA');
  ok(disk.saves.s1.v === SCHEMA, 'yazılan kayıt güncel şema sürümünü taşıyor');

  // Sürümü olmayan kayıt (localStorage dönemi) 9 sayılıp çevrilmeli.
  const legacyRec = { S: structuredClone(disk.saves.s1.S), PID: disk.saves.s1.PID };
  ok(a.R('schemaOf(' + JSON.stringify({ PID: 1 }) + ')') === 9, 'sürümsüz kayıt 9 sayılıyor');
  disk.saves.s2 = legacyRec;
  a.R('allMeta().s2=allMeta().s1;');
  const r2 = await a.R('loadSlot(2)');
  ok(r2.ok === true, 'sürümsüz kayıt yüklenebiliyor', JSON.stringify(r2));

  // Gelecekten gelen kayıt: yüklenmemeli ama silinmemeli de.
  disk.saves.s3 = { v: SCHEMA + 99, S: structuredClone(disk.saves.s1.S), PID: 1 };
  a.R('allMeta().s3={agent:"future"};');
  const r3 = await a.R('loadSlot(3)');
  ok(r3.ok === false && r3.reason === 'future', 'ileri sürümlü kayıt reddedildi', JSON.stringify(r3));
  ok(!!a.R('allMeta().s3'), 'ileri sürümlü kaydın özeti silinmedi');
  ok(!!disk.saves.s3, 'ileri sürümlü kayıt diskte duruyor');

  // Bozuk kayıt: özet düşmeli ki menü yalan söylemesin.
  disk.saves.s3 = { v: SCHEMA, S: { nope: true }, PID: 1 };
  const r4 = await a.R('loadSlot(3)');
  ok(r4.ok === false && r4.reason === 'broken', 'bozuk kayıt bozuk olarak işaretlendi');
  ok(!a.R('allMeta().s3'), 'bozuk kaydın özeti menüden düştü');
}

async function tTwoSeasons() {
  console.log('\n[8] iki sezon simülasyon + yeniden başlatma');
  const disk = newDisk(), ls = {};
  const a = session(disk, ls, {});
  await a.booted;
  a.R("curSlot=1;newGame();createAgent('Test','Agent','tr','TestCo');");
  const t0 = Date.now();
  for (let i = 0; i < 80; i++) a.R('nextWeek();save();');
  await a.R('saveDrain()');
  console.log('       80 hafta + her hafta kayıt: ' + (Date.now() - t0) + 'ms');
  const before = a.R('JSON.stringify(S)');
  const stats = JSON.parse(a.R("JSON.stringify({pop:S.players.length,season:S.season,week:S.week,rep:Math.round(S.rep)})"));
  console.log('       ' + JSON.stringify(stats));
  ok(stats.season >= 3, 'iki sezon geçildi', JSON.stringify(stats));
  ok(a.R('saveHealthy()') === true, 'iki sezon boyunca kayıt sağlıklı kaldı');
  const bytes = JSON.stringify(disk.saves.s1).length;
  console.log('       kayıt boyutu: ' + Math.round(bytes / 1024) + 'KB (localStorage 5 MiB sınırı ' +
    (bytes * 2 > 5 * 1024 * 1024 ? 'AŞILIRDI' : 'aşılmazdı') + ')');

  const b = session(disk, ls, {});
  await b.booted;
  const r = await b.R('loadSlot(1)');
  ok(r.ok === true, 'iki sezonluk kayıt yeniden açıldı');
  ok(b.R('JSON.stringify(S)') === before, 'iki sezon sonra durum bit bit aynı');
  // Devam edebiliyor mu
  let crash = null;
  try { b.R('ensureRivals();'); for (let i = 0; i < 10; i++) b.R('nextWeek();'); }
  catch (e) { crash = e.message; }
  ok(!crash, 'yüklenen kayıttan simülasyon devam ediyor', crash || '');
  b.R('save();');
  await b.R('saveDrain()');
  ok(b.R('saveHealthy()') === true, 'devam eden oyunda kayıt sağlıklı');
}

async function tSlotDeleteAndCoalesce() {
  console.log('\n[9] yuva silme ve yazma birleştirme');
  const disk = newDisk(), ls = {};
  const a = session(disk, ls, {});
  await a.booted;
  await freshCareer(a, 1);
  ok(!!disk.saves.s1, 'kayıt var');
  a.R('deleteSlot(1);');
  await a.R('saveDrain()');
  ok(!disk.saves.s1, 'silinen yuva diskten gitti');
  ok(!a.R('allMeta().s1'), 'silinen yuvanın özeti gitti');

  // Bekleyen yazmanın arkasından gelen silme, kaydı geri getirmemeli.
  a.R("curSlot=2;newGame();createAgent('Test','Agent','tr','TestCo');");
  a.R('save();save();save();deleteSlot(2);');
  await a.R('saveDrain()');
  ok(!disk.saves.s2, 'yazma kuyruğu silmeyi geçersiz kılmadı');

  // Birleştirme: art arda 20 save() tek uçuş + tek bekleyen olmalı.
  a.R("curSlot=3;newGame();createAgent('Test','Agent','tr','TestCo');");
  for (let i = 0; i < 20; i++) a.R('save();');
  await a.R('saveDrain()');
  ok(!!disk.saves.s3, '20 art arda kayıt sonunda tek kayıt yazıldı');
  ok(a.R('saveHealthy()') === true, 'birleştirme sağlığı bozmadı');
}

async function tCareerIdentity() {
  console.log('\n[10] kariyer kimliği: üretim, kalıcılık, yuvadan bağımsızlık');
  const disk = newDisk(), ls = {};
  const a = session(disk, ls, {});
  await a.booted;

  ok(a.R('typeof crypto!=="undefined"&&!!crypto.getRandomValues'), 'kumandada crypto var (asıl yol ölçülüyor)');
  const ids = JSON.parse(a.R('JSON.stringify(Array.from({length:500},()=>newCid()))'));
  ok(ids.every(x => /^[0-9a-f]{32}$/.test(x)), 'kimlik 32 haneli onaltılık', ids[0]);
  ok(new Set(ids).size === 500, '500 kimlik benzersiz');

  await freshCareer(a, 2);
  const cid1 = a.R('S.cid');
  ok(/^[0-9a-f]{32}$/.test(cid1), 'yeni kariyer kimlik aldı', cid1);
  ok(disk.saves.s1.S.cid === cid1, 'kimlik diske yazıldı');
  ok(a.R('allMeta().s1.cid') === cid1, 'özet kimliği taşıyor');
  ok(!ids.includes(cid1), 'kimlik bir sayaç değil — önceki üretimlerle çakışmıyor');

  const b = session(disk, ls, {});
  await b.booted;
  const r = await b.R('loadSlot(1)');
  ok(r.ok === true && b.R('S.cid') === cid1, 'yeniden yüklemede kimlik aynı', JSON.stringify(r));
  b.R('save();');
  await b.R('saveDrain()');
  ok(disk.saves.s1.S.cid === cid1, 'ikinci açılış ve kaydetme kimliği değiştirmedi');

  // META eksikse kimlik yine kayıttan geliyor; özet yeniden kurulur.
  delete disk.meta.meta;
  const c = session(disk, ls, {});
  await c.booted;
  const rc = await c.R('loadSlot(1)');
  ok(rc.ok === true && c.R('S.cid') === cid1, 'META silinmişken kimlik değişmedi');
  ok(c.R('allMeta().s1.cid') === cid1, 'özet kayıttan yeniden türetildi');

  // Aynı yuvada silip yeniden kurmak: yeni kimlik, özette eski kimlikten iz yok.
  c.R('deleteSlot(1);');
  await c.R('saveDrain()');
  ok(!c.R('allMeta().s1'), 'silinen yuvanın özeti gitti');
  await freshCareer(c, 1);
  const cid2 = c.R('S.cid');
  ok(cid2 !== cid1, 'aynı yuvadaki yeni kariyerin kimliği farklı');
  ok(c.R('allMeta().s1.cid') === cid2, 'özet eski kimliği taşımıyor');

  // Ana menü: açık kariyer yokken çizim hata üretmemeli.
  let crash = null;
  try { c.R('S=null;curSlot=0;stack=[{v:"menu"}];render();stack=[{v:"settings"}];render();'); }
  catch (e) { crash = e.message; }
  ok(!crash, 'S===null iken menü ve ayarlar çiziliyor', crash || '');

  // crypto yoksa yedek yol.
  const f = session(newDisk(), {}, { noCrypto: true });
  await f.booted;
  ok(f.R('typeof crypto') === 'undefined', 'crypto kapatıldı');
  const ids2 = JSON.parse(f.R('JSON.stringify(Array.from({length:200},()=>newCid()))'));
  ok(ids2.every(x => /^[0-9a-f]{32}$/.test(x)) && new Set(ids2).size === 200,
     'crypto yokken Math.random yedeği çalışıyor');
}

async function tCidLegacyMigration() {
  console.log('\n[11] kimliksiz eski kayda kimlik ataması');
  const disk = newDisk(), ls = {};
  const seed = session(disk, ls, {});
  await seed.booted;
  await freshCareer(seed, 2);
  // Eski kaydı taklit et: ne kayıtta ne özette kimlik var.
  delete disk.saves.s1.S.cid;
  delete disk.meta.meta;
  const before = structuredClone(disk.saves.s1.S);

  const a = session(disk, ls, {});
  await a.booted;
  const r = await a.R('loadSlot(1)');
  ok(r.ok === true, 'kimliksiz eski kayıt açıldı', JSON.stringify(r));
  const cid = a.R('S.cid');
  ok(/^[0-9a-f]{32}$/.test(cid), 'kimlik atandı', cid);
  await a.R('saveDrain()');
  ok(disk.saves.s1.S.cid === cid, 'kimlik diske yazıldı — yalnız bellekte kalmadı');
  ok(a.R('saveHealthy()') === true, 'yazma sağlıklı');

  const b = session(disk, ls, {});
  await b.booted;
  const r2 = await b.R('loadSlot(1)');
  ok(r2.ok === true && b.R('S.cid') === cid, 'yeniden açılan kayıtta aynı kimlik');
  const after = JSON.parse(b.R('JSON.stringify(S)'));
  delete after.cid;
  ok(JSON.stringify(after) === JSON.stringify(before), 'kimlik dışında oyun verisi bit bit aynı');
  ok(after.cash === before.cash && after.week === before.week && after.season === before.season &&
     after.clients.length === before.clients.length, 'kasa/hafta/sezon/müşteriler korundu');

  // Yazma başarısızsa: göç olmuş sayılmıyor, kullanıcı görüyor.
  const disk2 = newDisk(), ls2 = {};
  const seed2 = session(disk2, ls2, {});
  await seed2.booted;
  await freshCareer(seed2, 1);
  delete disk2.saves.s1.S.cid;
  const ctl = { failWrite: () => quotaErr() };
  const c = session(disk2, ls2, ctl);
  await c.booted;
  const r3 = await c.R('loadSlot(1)');
  ok(r3.ok === true, 'yazma bozukken de kayıt açılabiliyor');
  await waitFor(() => !c.R('saveHealthy()'), 'kayıt hatası');
  ok(!disk2.saves.s1.S.cid, 'yazma başarısızken disk hâlâ kimliksiz');
  c.R('render();');
  ok(c.nodes.saveWarn.__cls.has('show') === true, 'başarısızlık uyarı şeridine düştü');

  // Yer açılınca bir sonraki açılış yeniden deniyor ve bu kez kalıcılaşıyor.
  const d = session(disk2, ls2, {});
  await d.booted;
  await d.R('loadSlot(1)');
  await d.R('saveDrain()');
  ok(!!disk2.saves.s1.S.cid, 'sonraki açılışta kimlik kalıcılaştı');
  ok(d.R('saveHealthy()') === true, 'toparlanma sağlıklı');
}

async function tCidSlotsAndCapacity() {
  console.log('\n[12] yuvalar arası karışma yok + maxClients() değişmedi');
  const disk = newDisk(), ls = {};
  const a = session(disk, ls, {});
  await a.booted;

  const cids = {};
  for (const n of [1, 2, 3]) {
    a.R("curSlot=" + n + ";newGame();createAgent('T" + n + "','A','tr','C" + n + "');");
    a.R('save();');
    cids[n] = a.R('S.cid');
  }
  await a.R('saveDrain()');
  ok(new Set(Object.values(cids)).size === 3, 'üç kariyer üç farklı kimlik');
  for (const n of [1, 2, 3]) {
    ok(disk.saves['s' + n].S.cid === cids[n], 'yuva ' + n + ' kimliği doğru kayda düştü');
    ok(a.R('allMeta().s' + n + '.cid') === cids[n], 'yuva ' + n + ' özeti doğru kimliği taşıyor');
  }

  // Gecikmiş yazma: 1. yuvanın kaydı kuyruktayken 2. yuvaya geçiliyor.
  await a.R('loadSlot(1)');
  a.R('S.cash+=1;save();');
  await a.R('loadSlot(2)');
  a.R('save();');
  await a.R('saveDrain()');
  ok(disk.saves.s1.S.cid === cids[1], 'geçişten sonra 1. yuvanın kimliği bozulmadı');
  ok(disk.saves.s2.S.cid === cids[2], 'geçişten sonra 2. yuvanın kimliği bozulmadı');
  ok(a.R('S.cid') === cids[2], 'aktif kariyer 2. yuvanın kimliğini taşıyor');

  // Kapasite: yardımcı sıfır ve formül eski sonucu veriyor.
  ok(a.R('iapCap()') === 0, 'iapCap() sıfır döndürüyor');
  let n = 0, bad = [];
  for (const rep of [0, 5, 17, 18, 35, 60, 100, 130, 250, 502]) {
    for (const sk of ['[]', "['ag2']", "['ag2','ag4']"]) {
      for (const ag of ['{}', '{cap:1}', '{cap:3}']) {
        const got = a.R('S.rep=' + rep + ';S.skills=' + sk + ';S.ag=' + ag + ';maxClients()');
        const want = a.R("2+Math.floor(S.rep/18)+skillBonus('cap')+agMod('cap')");
        n++;
        if (got !== want) bad.push(rep + '/' + sk + '/' + ag + ': ' + got + '≠' + want);
      }
    }
  }
  ok(bad.length === 0, 'maxClients() ' + n + ' itibar/yetenek/olay birleşiminde eski formülle aynı', bad.join(' '));
}

/* ===== günlük ödül altyapısı =====
   Zaman hiç taklit edilmiyor: js/reward.js'in bütün giriş noktaları epoch'u
   parametre olarak alıyor, testler de gerçek yerel saatten kurulmuş epoch'lar
   veriyor. Böylece gece yarısı ve saat oynatma senaryoları belirlenimci. */
const RWDAY = 86400000;
const rwAt = (y, mo, d, h, mi) => new Date(y, mo, d, h, mi, 0, 0).getTime();
async function careerIn(s, n) {
  s.R("curSlot=" + n + ";newGame();createAgent('T','A','tr','C');");
  s.R('save();');
  await s.R('saveDrain()');
  return s.R('S.cid');
}

async function tRewardDailyRight() {
  console.log('\n[13] günlük ödül hakkı: kariyer başına gün başına bir kez');
  const disk = newDisk(), ls = {};
  const a = session(disk, ls, {});
  await a.booted;
  ok(a.R('RW.amount') === 50, 'ödül 50 birim');
  ok(a.R('fmtK(50)') === '50K €', 'birim bin € — 50 → 50K €', a.R('fmtK(50)'));
  const cid = await careerIn(a, 1);
  const cash0 = a.R('S.cash');
  const t1 = rwAt(2026, 5, 10, 12, 0);
  const d1 = a.R('rwDayKey(' + t1 + ')');

  ok(a.R('rwCanClaim(' + t1 + ')') === true, 'yeni kariyerde hak açık');
  const n1 = a.R('rwRequest(' + t1 + ')');
  ok(typeof n1 === 'string' && n1.length === 32, 'istek nonce üretti');
  ok(a.R('((S.rw&&S.rw.d)||0)') === 0, 'tıklama hakkı TÜKETMEDİ');
  ok(a.R('S.cash') === cash0, 'tıklama para vermedi');
  ok(a.R('rwRequest(' + t1 + ')') === null, 'aynı kariyerde eşzamanlı ikinci istek yok');

  const r1 = await a.R('rwEarned("' + n1 + '",' + t1 + ')');
  ok(r1 === 'delivered', 'ödül teslim edildi', String(r1));
  ok(a.R('S.cash') === cash0 + 50, 'para eklendi (+50)');
  ok(a.R('S.rw.d') === d1 && a.R('S.rw.n[' + d1 + ']') === n1, 'gün kapandı ve nonce işlendi');
  ok(a.R('PREFS.rw["' + cid + '"]===undefined') === true, 'PREFS kaydı temizlendi');
  await a.R('saveDrain()');
  ok(disk.saves.s1.S.cash === cash0 + 50 && disk.saves.s1.S.rw.n[d1] === n1 && disk.saves.s1.S.rw.d === d1,
     'para, kullanılmış gün ve nonce BİRLİKTE diske indi');

  ok(a.R('rwCanClaim(' + t1 + ')') === false, 'aynı gün ikinci hak yok');
  const dup = await a.R('rwEarned("' + n1 + '",' + t1 + ')');
  ok(dup === 'unknown' && a.R('S.cash') === cash0 + 50, 'yinelenen bildirim ödeme yapmadı', String(dup));

  const t2 = t1 + RWDAY;
  ok(a.R('rwCanClaim(' + t2 + ')') === true, 'ertesi gün hak yeniden açık');
  const n2 = a.R('rwRequest(' + t2 + ')');
  ok(await a.R('rwEarned("' + n2 + '",' + t2 + ')') === 'delivered' && a.R('S.cash') === cash0 + 100,
     'ertesi gün ikinci ödül verildi');

  // Aynı nonce ERTESİ GÜN yeniden bildirilse de ikinci ödeme yok.
  a.R('rwPrefs()[S.cid]={n:"' + n1 + '",d:' + d1 + ',cid:S.cid,st:"earned",at:' + t1 + '};savePrefs();');
  const dup2 = await a.R('rwSync(' + t2 + ')');
  ok(dup2 === 'again' && a.R('S.cash') === cash0 + 100,
     'ertesi gün gelen yinelenen nonce ikinci ödeme yapmadı', String(dup2));
}

async function tRewardCareersAndMidnight() {
  console.log('\n[14] iki kariyer, gece yarısı, ödülsüz kapatma');
  const disk = newDisk(), ls = {};
  const a = session(disk, ls, {});
  await a.booted;
  const cidA = await careerIn(a, 1);
  await careerIn(a, 2);
  const t = rwAt(2026, 5, 10, 12, 0);

  const cB0 = a.R('S.cash');
  const nB = a.R('rwRequest(' + t + ')');
  ok(await a.R('rwEarned("' + nB + '",' + t + ')') === 'delivered', 'B kariyeri ödül aldı');
  ok(a.R('S.cash') === cB0 + 50, 'B kariyerinin parası arttı');
  await a.R('saveDrain()');

  await a.R('loadSlot(1)');
  ok(a.R('S.cid') === cidA, 'A kariyeri açıldı');
  ok(a.R('rwCanClaim(' + t + ')') === true, 'aynı gün diğer kariyerin hakkı ayrı');
  const cA0 = a.R('S.cash');
  const nA = a.R('rwRequest(' + t + ')');
  ok(await a.R('rwEarned("' + nA + '",' + t + ')') === 'delivered' && a.R('S.cash') === cA0 + 50,
     'A kariyeri de aynı gün ödül aldı');
  await a.R('saveDrain()');
  ok(disk.saves.s2.S.cash === cB0 + 50, 'B kariyerinin kaydı bozulmadı');

  // Gece yarısını aşan gösterim.
  await careerIn(a, 3);
  const cC0 = a.R('S.cash');
  const tPre = rwAt(2026, 5, 10, 23, 59), tPost = rwAt(2026, 5, 11, 0, 1);
  const dPre = a.R('rwDayKey(' + tPre + ')'), dPost = a.R('rwDayKey(' + tPost + ')');
  ok(dPre !== dPost, 'iki epoch farklı yerel güne düşüyor');
  const nC = a.R('rwRequest(' + tPre + ')');
  ok(await a.R('rwEarned("' + nC + '",' + tPost + ')') === 'delivered', '23.59 → 00.01 teslim edildi');
  ok(a.R('S.rw.n[' + dPre + ']') === nC, 'ÖNCEKİ günün hakkı kullanıldı');
  ok(a.R('S.rw.n[' + dPost + ']===undefined') === true, 'yeni günün hakkı kullanılmadı');
  ok(a.R('rwCanClaim(' + tPost + ')') === true, 'yeni günün hakkı açık kaldı');
  ok(a.R('S.cash') === cC0 + 50, 'tek ödül ödendi');

  // Ödülsüz kapatma / yükleme hatası hakkı tüketmiyor.
  const cC1 = a.R('S.cash');
  const nX = a.R('rwRequest(' + tPost + ')');
  ok(a.R('rwAbandon("' + nX + '")') === true, 'ödülsüz kapatma isteği sildi');
  ok(a.R('S.cash') === cC1, 'ödülsüz kapatma para vermedi');
  ok(a.R('rwCanClaim(' + tPost + ')') === true, 'ödülsüz kapatma hakkı TÜKETMEDİ');

  // Kazanılmış ödül, arkasından gelen kapatma bildirimiyle silinemiyor.
  const nY = a.R('rwRequest(' + tPost + ')');
  a.R('PREFS.rw[S.cid].st="earned";savePrefs();');
  ok(a.R('rwAbandon("' + nY + '")') === false, 'kazanılmış ödül abandon ile silinemedi');
  ok(await a.R('rwSync(' + tPost + ')') === 'delivered' && a.R('S.cash') === cC1 + 50,
     've sonradan teslim edildi');
}

async function tRewardPendingAndWriteFail() {
  console.log('\n[15] gecikmiş teslimat, eski ödül, yazma hatası');
  const disk = newDisk(), ls = {};
  const ctl = {};
  const a = session(disk, ls, ctl);
  await a.booted;
  const cidA = await careerIn(a, 1);
  const cashA0 = a.R('S.cash');
  const t = rwAt(2026, 5, 10, 12, 0);
  const nA = a.R('rwRequest(' + t + ')');

  await careerIn(a, 2);
  const cashB0 = a.R('S.cash');
  const rp = await a.R('rwEarned("' + nA + '",' + t + ')');
  ok(rp === 'pending', 'aktif kariyer başkayken ödül bekliyor', String(rp));
  ok(a.R('S.cash') === cashB0, 'ödül başka kariyere verilmedi');
  ok(a.R('PREFS.rw["' + cidA + '"].st') === 'earned', 'kazanılmış ödül sessizce düşürülmedi');
  await a.R('saveDrain()');

  await a.R('loadSlot(1)');
  const t2 = t + RWDAY;
  ok(await a.R('rwSync(' + t2 + ')') === 'delivered', 'kariyer açılınca bekleyen ödül teslim edildi');
  ok(a.R('S.cash') === cashA0 + 50, 'para başlangıçtaki kariyere yazıldı');
  ok(a.R('S.rw.n[rwDayKey(' + t + ')]') === nA, 'BAŞLANGIÇ gününe işlendi');
  ok(a.R('rwCanClaim(' + t2 + ')') === true, 'ertesi günün hakkı açık');

  // Yeni gün kullanıldıktan sonra gelen ESKİ ödül, yeni günün hakkını geri açmamalı.
  const n2 = a.R('rwRequest(' + t2 + ')');
  ok(await a.R('rwEarned("' + n2 + '",' + t2 + ')') === 'delivered', 'ertesi gün ödülü alındı');
  const d2 = a.R('rwDayKey(' + t2 + ')');
  const tOld = t - RWDAY, cashBefore = a.R('S.cash');
  a.R('rwPrefs()[S.cid]={n:"oldnonce",d:rwDayKey(' + tOld + '),cid:S.cid,st:"earned",at:' + tOld + '};savePrefs();');
  ok(await a.R('rwSync(' + t2 + ')') === 'delivered' && a.R('S.cash') === cashBefore + 50,
     'eski günün ödülü teslim edildi');
  ok(a.R('S.rw.d') === d2, 'kapı geri alınmadı');
  ok(a.R('rwCanClaim(' + t2 + ')') === false, 'yeni günün kullanılmış hakkı geri açılmadı');

  // Yazma hatası.
  const t3 = t2 + RWDAY, cash3 = a.R('S.cash');
  await a.R('saveDrain()');
  const diskBefore = disk.saves.s1.S.cash;
  const n3 = a.R('rwRequest(' + t3 + ')');
  ctl.failWrite = () => quotaErr();
  const rw3 = await a.R('rwEarned("' + n3 + '",' + t3 + ')');
  ok(rw3 === 'writefail', 'yazma düşünce teslimat tamamlanmış sayılmadı', String(rw3));
  ok(a.R('PREFS.rw[S.cid].st') === 'earned', 'kayıt duruyor — teslimat kaybolmadı');
  ok(a.R('S.cash') === cash3 + 50, 'para bellekte eklendi');
  ok(disk.saves.s1.S.cash === diskBefore, 'ama diske inmedi');
  ok(a.R('saveHealthy()') === false, 'başarısızlık sağlık durumuna yansıdı');

  delete ctl.failWrite;
  const again = await a.R('rwSync(' + t3 + ')');
  ok(again === 'again', 'yeniden deneme "zaten uygulanmış" dedi', String(again));
  ok(a.R('S.cash') === cash3 + 50, 'para İKİNCİ KEZ eklenmedi');
  await a.R('saveDrain()');
  ok(disk.saves.s1.S.cash === cash3 + 50, 'bu kez diske indi');
  ok(a.R('PREFS.rw[S.cid]===undefined') === true, 'kayıt ancak yazma doğrulanınca temizlendi');

  const b = session(disk, ls, {});
  await b.booted;
  await b.R('loadSlot(1)');
  ok(b.R('S.cash') === cash3 + 50, 'yeniden açılışta para tam bir kez');

  // Kariyer silinince o kariyerin sürmekte olan gösterimi de gidiyor.
  b.R('rwRequest(' + (t3 + RWDAY) + ');');
  const cidNow = b.R('S.cid');
  ok(b.R('PREFS.rw["' + cidNow + '"]!==undefined') === true, 'kayıt var');
  b.R('deleteSlot(1);');
  ok(b.R('PREFS.rw["' + cidNow + '"]===undefined') === true, 'kariyer silinince kayıt da silindi');
}

async function tRewardClockAndOldSaves() {
  console.log('\n[16] saat onarımı, budama, eski kayıtlar');
  const disk = newDisk(), ls = {};
  const a = session(disk, ls, {});
  await a.booted;
  await careerIn(a, 1);
  const t = rwAt(2026, 5, 10, 12, 0);

  a.R('rwEnsure(S);S.rw.t=' + t + ';S.rw.d=0;');
  ok(a.R('rwRepair(' + (t - 59000) + ')') === false, '59 sn geri: onarım yok (tolerans içinde)');
  ok(a.R('rwRepair(' + (t - 61000) + ')') === true, '61 sn geri: onarım');
  ok(a.R('S.rw.d') === a.R('rwDayKey(' + (t - 61000) + ')'), 'onarım o günü bloke etti');
  ok(a.R('S.rw.t') === t - 61000, 'saat referansı şimdiye çekildi');

  a.R('S.rw.t=' + t + ';');
  ok(a.R('rwRepair(' + (t + 1000) + ')') === false,
     'epoch ileri giderken onarım yok — saat dilimi değişimi geri alma değil');

  // Onarım bekleyen kazanılmış ödülü silmiyor.
  a.R('rwPrefs()[S.cid]={n:"pp",d:1,cid:S.cid,st:"earned",at:1};savePrefs();S.rw.t=' + (t + 10 * RWDAY) + ';');
  a.R('rwRepair(' + t + ');');
  ok(a.R('PREFS.rw[S.cid].st') === 'earned', 'onarım bekleyen kazanılmış ödülü silmedi');
  a.R('delete PREFS.rw[S.cid];savePrefs();');

  // İleri sıçrama + düzeltme: kilit en fazla BİR gün.
  const far = t + 90 * RWDAY;
  a.R('S.rw={d:0,t:0,f:0,n:{}};');
  const nF = a.R('rwRequest(' + far + ')');
  ok(await a.R('rwEarned("' + nF + '",' + far + ')') === 'delivered', 'ileri alınmış saatte ödül alındı');
  const cashF = a.R('S.cash');
  ok(await a.R('rwSync(' + t + ')') === 'repaired', 'saat düzeltmesi onarım olarak görüldü');
  ok(a.R('S.cash') === cashF, 'onarım para vermedi');
  ok(a.R('S.rw.n[rwDayKey(' + far + ')]') === nF, 'onarım ödenmiş günü silmedi');
  ok(a.R('rwCanClaim(' + t + ')') === false, 'onarım günü kapalı');
  ok(a.R('rwCanClaim(' + (t + RWDAY) + ')') === true, 'ERTESİ gün açık — aylarca kilit yok');

  // Budama yok: ödenmiş günlerin kaydı eksiksiz kalıyor, taban kavramı da yok.
  a.R('S.rw={d:0,t:0,n:{}};for(let i=0;i<300;i++)S.rw.n[20200101+i]="x"+i;');
  ok(a.R('typeof rwPrune') === 'undefined', 'budama fonksiyonu kaldırıldı');
  ok(a.R('S.rw.f===undefined') === true, 'taban alanı yok');
  ok(a.R('Object.keys(rwEnsure(S)).indexOf("f")') === -1, 'rwEnsure taban kurmuyor');
  const cashP = a.R('S.cash');
  // Çok eski bir gün için AYNI nonce → yeniden ödenmiyor.
  a.R('rwPrefs()[S.cid]={n:"x0",d:20200101,cid:S.cid,st:"earned",at:1};savePrefs();');
  ok(await a.R('rwSync(' + t + ')') === 'again' && a.R('S.cash') === cashP,
     'eski günün aynı nonce\'u yeniden ödenmedi');
  // Aynı eski gün için FARKLI nonce → o günün hakkı ikinci kez ödenmiyor.
  a.R('rwPrefs()[S.cid]={n:"baska",d:20200101,cid:S.cid,st:"earned",at:1};savePrefs();');
  ok(await a.R('rwSync(' + t + ')') === 'dayused' && a.R('S.cash') === cashP,
     'eski günün hakkı ikinci kez ödenmedi');

  // Eski kayıt: S.rw hiç yok.
  a.R('delete S.rw;');
  ok(a.R('rwCanClaim(' + t + ')') === true, 'S.rw olmayan kayıtta hak okunabiliyor');
  ok(await a.R('rwSync(' + t + ')') === 'idle', 'S.rw yokken sync sessiz');
  ok(a.R('S.rw===undefined') === true, 'okuma S.rw alanını kurmadı');

  // S===null güvenliği.
  a.R('S=null;curSlot=0;');
  ok(a.R('rwCanClaim(' + t + ')') === false, 'S null: hak yok');
  ok(a.R('rwRequest(' + t + ')') === null, 'S null: istek yok');
  ok(a.R('rwRepair(' + t + ')') === false, 'S null: onarım yok');
  ok(await a.R('rwSync(' + t + ')') === 'idle', 'S null: sync sessiz');

  // PREFS yazılamıyorsa istek hiç başlamıyor.
  const ctl2 = {};
  const c = session(newDisk(), {}, ctl2);
  await c.booted;
  await careerIn(c, 1);
  ctl2.lsQuota = 1;
  ok(c.R('rwRequest(' + t + ')') === null, 'PREFS yazılamıyorsa istek başlatılmıyor');
  ok(c.R('rwCanClaim(' + t + ')') === true, 've hak tüketilmedi');
}

/* Dört somut hatanın regresyon testleri. Her biri hatayı ÜRETEN sırayı kuruyor;
   düzeltme geri alınırsa bunlar kırmızıya döner. */
async function tRewardRegressions() {
  console.log('\n[17] regresyon: yarım req, gelecek taban, yanlış başarı, put kopyası');

  // --- (4) put taklidi: kopya put anında alınmalı ---
  {
    const disk = newDisk(), ls = {}, ctl = {};
    const a = session(disk, ls, ctl);
    await a.booted;
    await careerIn(a, 1);
    /* Ölçülen şey taklidin KOPYALAMA ANI. put() senkron çağrılmıyor: recPut →
       dbTx → dbOpen().then(...) zinciri onu bir mikro-göreve atıyor. Bu yüzden
       önce bir tur bekleniyor (put çağrıldı, kopya alındı), ANCAK ONDAN SONRA
       mutasyon yapılıyor; işlem hâlâ tamamlanmamış durumda (oncomplete ayrı bir
       setTimeout). Taklit kopyayı __work içinde alsaydı bu mutasyon diske
       sızardı ve aşağıdaki değer 999 olurdu. */
    a.R('S.cash=111;save();');
    await tick();
    a.R('S.cash=999;');
    await a.R('saveDrain()');
    ok(disk.saves.s1.S.cash === 111,
       '(4) put anındaki kopya yazıldı — işlem tamamlanana kadarki mutasyon sızmadı',
       'disk=' + disk.saves.s1.S.cash);
    const before = disk.saves.s1.S.cash;
    ctl.failWrite = () => quotaErr();
    a.R('S.cash=777;save();');
    await a.R('saveDrain()');
    ok(disk.saves.s1.S.cash === before, '(4) başarısız işlem diski değiştirmedi');
  }

  // --- (1b) kalıcılık kanıtı canlı referans olmamalı ---
  {
    const disk = newDisk(), ls = {};
    const a = session(disk, ls, {});
    await a.booted;
    /* put anında içerik: nonce YOK. İşlem tamamlanmadan aynı CANLI nesneye nonce
       ekleniyor. Depolamada eski kopya duruyor, dolayısıyla kanıt da onu
       görmeli. Kanıt canlı referanstan okunsaydı bu yazma "başarılı teslimat"
       sayılırdı. */
    a.R('__obj={cid:"c1",rw:{d:0,t:0,n:{}}};');
    a.R('__p=queueRec("s1",()=>({v:SAVE_SCHEMA,S:__obj,PID:1}),' +
        'w=>!!(w&&w.S&&w.S.rw&&w.S.rw.n&&w.S.rw.n[20260906]==="n1"));');
    await tick();                                   // put çalıştı, içerik dondu
    a.R('__obj.rw.n[20260906]="n1";__obj.cash=300;'); // işlem hâlâ tamamlanmadı
    const proof = await a.R('__p');
    ok(proof === false, '(1b) put sonrası eklenen nonce başarı kanıtında görünmüyor',
       String(proof));
    await a.R('saveDrain()');
    ok(disk.saves.s1.S.rw.n[20260906] === undefined, '(1b) diske de inmemiş');

    // Aynı içerik put anında yerindeyse kanıt doğru şekilde true.
    a.R('__obj2={cid:"c2",rw:{d:0,t:0,n:{20260906:"n2"}}};');
    const proof2 = await a.R('queueRec("s2",()=>({v:SAVE_SCHEMA,S:__obj2,PID:1}),' +
        'w=>!!(w&&w.S&&w.S.rw.n[20260906]==="n2"))');
    ok(proof2 === true, '(1b) put anında var olan içerik doğru kanıtlanıyor');
    // Tanıksız çağıran için anlam değişmiyor: yalnız "yazma tamamlandı".
    ok(await a.R('queueRec("s3",()=>({v:SAVE_SCHEMA,S:{cid:"c3"},PID:1}))') === true,
       '(1b) tanıksız yazma eskisi gibi true');
  }

  // --- (1) ölü oturumdan kalan req kaydı ---
  {
    const disk = newDisk(), ls = {};
    const t = rwAt(2026, 5, 10, 12, 0);
    const a = session(disk, ls, {});
    await a.booted;
    const cid = await careerIn(a, 1);
    const cash0 = a.R('S.cash');
    ok(typeof a.R('rwRequest(' + t + ')') === 'string', '(1) istek açıldı');
    await a.R('saveDrain()');

    const b = session(disk, ls, {});          // yeni uygulama oturumu
    await b.booted;
    await b.R('loadSlot(1)');
    ok(b.R('PREFS.rw["' + cid + '"].st') === 'req', '(1) yarım req kaydı diskten geldi');
    ok(b.R('rwCanClaim(' + t + ')') === false, '(1) sonlandırmadan önce hak kilitli');
    ok(await b.R('rwSync(' + t + ')') === 'idle', '(1) sync sessiz döndü');
    ok(b.R('PREFS.rw["' + cid + '"]===undefined') === true, '(1) ölü req sonlandırıldı');
    ok(b.R('rwCanClaim(' + t + ')') === true, '(1) hak geri açıldı');
    ok(b.R('S.cash') === cash0, '(1) sonlandırma para vermedi');
    ok(b.R('((S.rw&&S.rw.d)||0)') === 0, '(1) sonlandırma günlük hakkı tüketmedi');
    ok(b.R('rwCanClaim(' + (t + 3 * RWDAY) + ')') === true, '(1) sonraki günler de açık');

    // Aynı oturumda süren gerçek gösterim iptal edilmemeli.
    const nLive = b.R('rwRequest(' + t + ')');
    await careerIn(b, 2);                      // kariyer değişimi
    b.R('rwReap();');
    ok(b.R('PREFS.rw["' + cid + '"]&&PREFS.rw["' + cid + '"].n') === nLive,
       '(1) aynı oturumun canlı gösterimi iptal edilmedi');
    // earned kaydı, yabancı oturumdan gelse bile silinmemeli.
    b.R('rwPrefs()["zzz"]={n:"e1",d:1,cid:"zzz",st:"earned",at:1,sid:"baska"};savePrefs();');
    b.R('rwReap();');
    ok(b.R('PREFS.rw["zzz"].st') === 'earned', '(1) earned kaydı sonlandırılmadı');
  }
  {
    // (1) devamı: PREFS yazması düşerken sonlandırma.
    const disk = newDisk(), ls = {}, ctl = {};
    const t = rwAt(2026, 5, 10, 12, 0);
    const a = session(disk, ls, ctl);
    await a.booted;
    const cid = await careerIn(a, 1);
    a.R('rwRequest(' + t + ');');
    await a.R('saveDrain()');
    const b = session(disk, ls, ctl);
    await b.booted;
    await b.R('loadSlot(1)');
    ctl.lsQuota = 1;                            // her PREFS yazması düşecek
    ok(b.R('rwReap()') === false, '(1) yazma düşünce sonlandırma false döndü');
    ok(b.R('PREFS.rw["' + cid + '"]===undefined') === true, '(1) bellekte yine de kilit açıldı');
    ok(b.R('rwCanClaim(' + t + ')') === true, '(1) kullanıcı bu oturumda kilitli kalmadı');
  }

  // --- (2) budanmış teslimat saat onarımından sonra yeniden ödenmemeli ---
  {
    const disk = newDisk(), ls = {};
    const a = session(disk, ls, {});
    await a.booted;
    await careerIn(a, 1);
    const real = rwAt(2026, 8, 6, 12, 0);       // gerçek "bugün": 2026-09-06
    let firstN = null, firstD = null;
    let cash = a.R('S.cash');
    for (let i = 0; i < 91; i++) {
      const tf = rwAt(2027, 8, 6 + i, 12, 0);   // ileri alınmış saat
      const n = a.R('rwRequest(' + tf + ')');
      const r = await a.R('rwEarned("' + n + '",' + tf + ')');
      if (r !== 'delivered') { ok(false, '(2) ileri günde teslimat', i + ': ' + r); break; }
      if (i === 0) { firstN = n; firstD = a.R('rwDayKey(' + tf + ')'); }
    }
    ok(a.R('S.cash') === cash + 91 * 50, '(2) 91 ileri günde 91 ödül ödendi');
    // Eski tasarımda İLK ödül budanırdı; artık kaydın tamamı duruyor.
    ok(a.R('Object.keys(S.rw.n).length') === 91, '(2) hiçbir gün budanmadı');
    ok(a.R('S.rw.n[' + firstD + ']') === firstN, '(2) İLK ödülün nonce\'u hâlâ hatırlanıyor');

    const nDays = a.R('Object.keys(S.rw.n).length'), cashF = a.R('S.cash');
    ok(await a.R('rwSync(' + real + ')') === 'repaired', '(2) saat düzeltmesi onarım verdi');
    ok(a.R('Object.keys(S.rw.n).length') === nDays, '(2) onarım ödenmiş günleri silmedi');
    ok(a.R('S.cash') === cashF, '(2) onarım para vermedi');

    // Onarımdan sonra hak ile teslimat tutarlı.
    const next = real + RWDAY;
    ok(a.R('rwCanClaim(' + next + ')') === true, '(2) ertesi gün hak açık');
    const n2 = a.R('rwRequest(' + next + ')');
    ok(await a.R('rwEarned("' + n2 + '",' + next + ')') === 'delivered' &&
       a.R('S.cash') === cashF + 50, '(2) ertesi günün ödülü teslim edildi');

    // ASIL REGRESYON: İLK ödülün earned kaydı yeniden sunuluyor.
    const cashNow = a.R('S.cash');
    a.R('rwPrefs()[S.cid]={n:"' + firstN + '",d:' + firstD + ',cid:S.cid,st:"earned",at:1,sid:"x"};savePrefs();');
    const rAgain = await a.R('rwSync(' + next + ')');
    ok(rAgain === 'again' && a.R('S.cash') === cashNow,
       '(2) budanmış olması gereken İLK ödül ikinci kez ödenmedi', String(rAgain));
    // O güne başka bir gösterim de giremiyor.
    a.R('rwPrefs()[S.cid]={n:"farkli",d:' + firstD + ',cid:S.cid,st:"earned",at:1,sid:"x"};savePrefs();');
    ok(await a.R('rwSync(' + next + ')') === 'dayused' && a.R('S.cash') === cashNow,
       '(2) o günün hakkı başka nonce ile de ödenmedi');
  }

  // --- (3) queueRec yanlış kayda başarı döndürüyor ---
  {
    const disk = newDisk(), ls = {};
    const a = session(disk, ls, {});
    await a.booted;
    const cid = await careerIn(a, 1);
    const t = rwAt(2026, 5, 10, 12, 0);
    const day = a.R('rwDayKey(' + t + ')');
    const n = a.R('rwRequest(' + t + ')');
    a.R('S.cash=250;save();');                       // uçuşta bir yazma
    a.R('__p=rwEarned("' + n + '",' + t + ');');     // teslimat kuyruğa girdi (cash 300 + nonce)
    // Aynı anahtara nonce TAŞIMAYAN başka bir snapshot: _pend'i ezer.
    a.R('__st=JSON.parse(JSON.stringify(S));__st.cash=250;delete __st.rw.n[' + day + '];' +
        '__st.rw.d=0;S=__st;save();');
    const res = await a.R('__p');
    ok(res === 'writefail', '(3) ezilmiş teslimat yanlış başarı almadı', String(res));
    await a.R('saveDrain()');
    ok(disk.saves.s1.S.rw.n[day] === undefined, '(3) diske gerçekten nonce yazılmamış');
    ok(disk.saves.s1.S.cash === 250, '(3) diskteki kayıt ezen snapshot');
    ok(a.R('PREFS.rw["' + cid + '"].st') === 'earned', '(3) earned kaydı silinmedi');

    // Yeniden deneme doğru kariyere bir kez ödüyor.
    const r2 = await a.R('rwSync(' + t + ')');
    ok(r2 === 'delivered' && a.R('S.cash') === 300, '(3) yeniden denemede tam bir kez ödendi', String(r2));
    await a.R('saveDrain()');
    ok(disk.saves.s1.S.rw.n[day] === n && disk.saves.s1.S.cash === 300, '(3) bu kez içerik diske indi');
    ok(a.R('PREFS.rw["' + cid + '"]===undefined') === true, '(3) doğrulanınca kayıt temizlendi');

    // Aynı yuvaya BAŞKA kariyerin snapshot'ı yazılırsa da başarı sayılmıyor.
    const t2 = t + RWDAY, day2 = a.R('rwDayKey(' + t2 + ')');
    const n2 = a.R('rwRequest(' + t2 + ')');
    a.R('save();');
    a.R('__p2=rwEarned("' + n2 + '",' + t2 + ');');
    a.R('__o=JSON.parse(JSON.stringify(S));__o.cid="baskakariyer";S=__o;save();');
    const res2 = await a.R('__p2');
    ok(res2 === 'writefail', '(3) başka cid yazıldığında da başarı sayılmadı', String(res2));

    // Silme: kayıt yok edildiğinde de başarı sayılmıyor.
    const b = session(newDisk(), {}, {});
    await b.booted;
    await careerIn(b, 1);
    const n3 = b.R('rwRequest(' + t + ')');
    b.R('save();');
    b.R('__p3=rwEarned("' + n3 + '",' + t + ');');
    b.R('deleteSlot(1);');
    const res3 = await b.R('__p3');
    ok(res3 === 'writefail', '(3) silinen yuvada teslimat başarı sayılmadı', String(res3));
  }
}


/* ================= [18] REKLAM ADAPTÖRÜ (js/ads.js) =================
   Taklit, @capacitor-community/admob 8.1.0'in Android tarafında GERÇEKTEN
   yaydığı yüzeyi taklit ediyor, fazlasını değil:

   - showRewardVideoAd() promise'i YALNIZ ödül kazanılınca çözülüyor; ödülsüz
     kapanışta hiç settle olmuyor (AdRewardExecutor: PluginCall yalnız
     OnUserEarnedRewardListener içinden resolve ediliyor).
   - Terminal olayların yükü boş nesne / hata nesnesi. GÖSTERİM KİMLİĞİ YOK ve
     buraya uydurma bir alan EKLENMİYOR — eklentide olmayan bir güvenceyi
     testte kurmak, testi geçirip ürünü yanıltırdı.
   - Her native bildirimi ayrı bir görev olarak veriliyor (emit/reward + tick),
     çünkü köprü de her mesajı ayrı postMessage olarak taşıyor: mikrogörevler
     iki bildirim ARASINDA boşalıyor.

   Bunlar native olay doğrulaması DEĞİLDİR; yalnız adaptörün sözleşmesini
   ölçerler. Gerçek olay sırası cihazda ölçülmek zorunda. */
/* İzin yüzeyi de AdConsentExecutor.java'nın gerçekten yaydığı biçimde:
   - requestConsentInfo dört alanlı bir nesneyle çözülüyor;
   - showConsentForm AYNI dört alanı (isConsentFormAvailable dışında) döndürüyor
     ve "form gerekli değilse" de hatasız çözülüyor — loadAndShowConsentFormIfRequired
     böyle davranıyor;
   - showPrivacyOptionsForm YÜK DÖNDÜRMÜYOR (call.resolve() argümansız), bu
     yüzden testler kapanıştan sonra uygunluğu ancak yeniden okuyarak öğrenebilir;
   - retler yalın Error; eklenti hata nesnesine kimlik ya da durum KOYMUYOR ve
     buraya da koymuyoruz.
   Dönen değerler senaryo başına verilir; hiçbiri "gerçek SDK böyle cevaplar"
   iddiası taşımaz — cihazda ne döndüğü ölçülmek zorunda. */
const ADS_CONSENT_DEFAULT = {
  status: 'NOT_REQUIRED', isConsentFormAvailable: false,
  canRequestAds: true, privacyOptionsRequirementStatus: 'NOT_REQUIRED'
};
function fakeAdMob(ctx, opt) {
  opt = opt || {};
  const L = {}, st = {
    prepares: 0, shows: 0, inits: 0, asks: 0, forms: 0, privs: 0,
    iprepares: 0, ishows: 0, iprepOpts: [],
    askOpts: [],                     // requestConsentInfo'ya geçen seçenekler
    order: [],                       // çağrı sırası — "izin önce, SDK sonra" ölçülebilsin
    rewardResolve: null, prepareResolve: null, initResolve: null, privResolve: null
  };
  let ci = Object.assign({}, ADS_CONSENT_DEFAULT, opt.consent || {});
  let askFail = !!opt.askFail, formFail = !!opt.formFail, privFail = !!opt.privFail;
  let initFail = !!opt.initFail;
  /* Kaçıncı okumadan itibaren düşsün (1 tabanlı). Açılış okuması tutup
     ardından gelen TEK yeniden okumanın düştüğü hâli kurmak için. */
  const askFailFrom = opt.askFailFrom || 0;
  const snap = () => JSON.parse(JSON.stringify(ci));
  ctx.Capacitor = {
    Plugins: {
      AdMob: {
        initialize() {
          st.inits++; st.order.push('init');
          if (initFail) return Promise.reject(new Error('init'));
          if (opt.initHold) return new Promise(res => { st.initResolve = res; });
          return Promise.resolve();
        },
        addListener(ev, cb) { (L[ev] = L[ev] || []).push(cb); return { remove() {} }; },
        requestConsentInfo(o) {
          st.asks++; st.order.push('ask');
          st.askOpts.push(JSON.parse(JSON.stringify(o === undefined ? null : o)));
          const bad = askFail || (askFailFrom && st.asks >= askFailFrom);
          if (bad) return Promise.reject(new Error('ask'));
          /* Yalnız İLK okuma tutuluyor: yaş kapısı testleri "okuma uçuştayken
             beyan değişti" hâlini kurabilsin, sonraki okumalar akmaya devam
             etsin diye. */
          if (opt.askHold && !st.askHeld) {
            st.askHeld = true;
            return new Promise(res => { st.askResolve = () => res(snap()); });
          }
          return Promise.resolve(snap());
        },
        showConsentForm() {
          st.forms++; st.order.push('form');
          if (formFail) return Promise.reject(new Error('form'));
          /* Form YÜKÜ: gerçekte formdan sonraki canRequestAds, formdan ÖNCEKİ
             okumadan farklı olabilir — formun varlık sebebi zaten bu. Senaryo
             ayrı bir yük verdiyse onu döndürüyoruz; vermediyse eski davranış. */
          const fc = () => {
            const r = Object.assign({}, ci, opt.formConsent || {});
            delete r.isConsentFormAvailable;   // eklenti bu alanı döndürmüyor
            return JSON.parse(JSON.stringify(r));
          };
          /* Tutulabilir: "form ekrandayken beyan değişti" hâli kurulabilsin. */
          if (opt.formHold && !st.formHeld) {
            st.formHeld = true;
            return new Promise((res, rej) => {
              st.formResolve = () => res(fc());
              st.formReject = () => rej(new Error('form'));
            });
          }
          return Promise.resolve(fc());
        },
        showPrivacyOptionsForm() {
          st.privs++; st.order.push('priv');
          if (privFail) return Promise.reject(new Error('priv'));
          if (opt.privHold) return new Promise(res => { st.privResolve = res; });
          return Promise.resolve();
        },
        prepareRewardVideoAd(o) {
          st.prepares++;
          if (opt.loadFail) return Promise.reject(new Error('load'));
          if (opt.prepareHold)
            return new Promise(res => { st.prepareResolve = () => res({ adUnitId: o && o.adId }); });
          return Promise.resolve({ adUnitId: o && o.adId });
        },
        showRewardVideoAd() {
          st.shows++;
          // Ödülsüz kapanışta HİÇ settle olmayan promise — gerçeğiyle aynı.
          return new Promise(res => { st.rewardResolve = res; });
        },
        /* Sezon geçişi reklamı. prepareInterstitial YÜKLENİNCE çözülüyor
           (InterstitialAdCallbackAndListeners.onAdLoaded → call.resolve). */
        prepareInterstitial(o) {
          st.iprepares++; st.order.push('iprep');
          st.iprepOpts.push(JSON.parse(JSON.stringify(o === undefined ? null : o)));
          if (opt.interLoadFail) return Promise.reject(new Error('iload'));
          if (opt.interPrepareHold && !st.iprepHeld) {
            st.iprepHeld = true;
            return new Promise((res, rej) => {
              st.iprepResolve = () => res({ adUnitId: o && o.adId });
              st.iprepReject = () => rej(new Error('iload'));
            });
          }
          return Promise.resolve({ adUnitId: o && o.adId });
        },
        /* GÖSTERİM BAŞLAYINCA çözülüyor, kapanınca değil — gerçeğiyle aynı
           (AdInterstitialExecutor: adToShow.show() → call.resolve()). Kilidi
           açan şey bu söz değil, terminal olay. */
        showInterstitial() {
          st.ishows++; st.order.push('ishow');
          if (opt.interShowFail) return Promise.reject(new Error('ishow'));
          return Promise.resolve();
        }
      }
    }
  };
  return {
    stat: st,
    // Sonraki okumaların döndüreceği izin bilgisi (SDK'nın cevabı değişti).
    setConsent(o) { ci = Object.assign({}, ci, o); },
    setAskFail(v) { askFail = !!v; },
    setFormFail(v) { formFail = !!v; },
    setPrivFail(v) { privFail = !!v; },
    setInitFail(v) { initFail = !!v; },
    finishInit() { if (st.initResolve) { const r = st.initResolve; st.initResolve = null; r(); } },
    finishPriv() { if (st.privResolve) { const r = st.privResolve; st.privResolve = null; r(); } },
    finishPrepare() { if (st.prepareResolve) { const r = st.prepareResolve; st.prepareResolve = null; r(); } },
    finishInterPrepare() { if (st.iprepResolve) { const r = st.iprepResolve; st.iprepResolve = null; st.iprepReject = null; r(); } },
    failInterPrepare() { if (st.iprepReject) { const r = st.iprepReject; st.iprepReject = null; st.iprepResolve = null; r(); } },
    finishAsk() { if (st.askResolve) { const r = st.askResolve; st.askResolve = null; r(); } },
    finishForm() { if (st.formResolve) { const r = st.formResolve; st.formResolve = null; st.formReject = null; r(); } },
    failForm() { if (st.formReject) { const r = st.formReject; st.formReject = null; st.formResolve = null; r(); } },
    // Native "ödül kazanıldı": gösterime özgü promise çözülüyor.
    reward(item) { if (st.rewardResolve) st.rewardResolve(item || { type: 'coin', amount: 1 }); },
    // Native terminal olay: kimliksiz, tam da eklentinin yaydığı yük.
    emit(ev, data) { (L[ev] || []).slice().forEach(f => f(data === undefined ? {} : data)); },
    bound(ev) { return (L[ev] || []).length; }
  };
}

/* Taklit + UYGUN yaş beyanı. [18] ve [19] blokları reklam ve izin mekaniğini
   ölçüyor, YAŞ KAPISINI değil — kapı [20]'de ölçülüyor. Beyan burada yazılmasa
   bu blokların tamamı kapıda durur ve ölçmek istedikleri şeye hiç ulaşamazdı.
   Kapının kendisi bu yardımcıyı KULLANMIYOR, beyanı senaryo başına veriyor. */
function fakeAdMobAged(a, opt) {
  a.R('setPref("adBY",' + (new Date().getFullYear() - 30) + ');');
  return fakeAdMob(a.ctx, opt);
}

async function tAdsAdapter() {
  console.log('\n[18] reklam adaptörü: sıra, kilit ve kapsam sınırı');

  /* (1) DESTEKLENEN SIRA — ödül önce işleniyor, kapanış sonra geliyor,
         kalıcı yazma gecikmeli tamamlanıyor. Teslimat bozulmamalı. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted;
    const cid = await careerIn(a, 1);
    const fake = fakeAdMobAged(a);
    ok(await a.R('adsInit()') === 'ready', '(1) SDK başlatıldı, dinleyiciler kuruldu');
    ok(fake.bound('onRewardedVideoAdDismissed') === 1
      && fake.bound('onRewardedVideoAdFailedToShow') === 1
      && fake.bound('onRewardedVideoAdFailedToLoad') === 1, '(1) üç terminal olay dinleniyor');
    ok(fake.bound('onRewardedVideoAdReward') === 0, '(1) global ödül olayı BİLEREK dinlenmiyor');
    ok(a.R('adsRowState()') === 'go', '(1) düğme açık');

    const cash0 = a.R('S.cash');
    a.R('adsWatch();');
    await tick();
    ok(a.R('ADS.cur!==null') === true, '(1) gösterim sürerken kilit kapalı');
    ok(a.R('adsRowState()') === 'busy', '(1) düğme kilitli görünüyor');
    ok(a.R('PREFS.rw["' + cid + '"].st') === 'req', '(1) istek kaydı açıldı, ödül henüz yok');

    fake.reward(); await tick();                                  // ödül mesajı
    ok(a.R('S.cash') === cash0 + 50, '(1) ödül işlendi, kasa +50');
    ok(a.R('PREFS.rw["' + cid + '"].st') === 'earned', '(1) kayıt earned oldu');

    a.R('ADS.__att=ADS.cur;');
    fake.emit('onRewardedVideoAdDismissed'); await tick();         // kapanış mesajı
    ok(a.R('ADS.cur===null') === true, '(1) kapanışta kilit açıldı');
    ok(a.R('S.cash') === cash0 + 50, '(1) kapanış ödülü BOZMADI');
    ok(a.R('ADS.__att.cl===true&&ADS.__att.rw===true') === true, '(1) iki yaşam süresi de kendi bayrağını taşıyor');

    await a.R('saveDrain()');
    await waitFor(() => a.R('PREFS.rw["' + cid + '"]===undefined'), '(1) kayıt temizliği');
    ok(a.R('ADS.lastRw') === 'delivered', '(1) gecikmeli kalıcı yazma teslimatı tamamladı');
    ok(a.R('S.cash') === cash0 + 50, '(1) yazma tamamlandıktan sonra da tek ödeme');
    ok(a.R('adsRowState()') === 'used', '(1) aynı gün hak kapandı');
  }

  /* (2) DESTEKLENMEYEN SIRA — önce ödülsüz kapanış işleniyor, ödül sonra
         geliyor. Bu, ilk kapsamın (yalnız Google'ın kendi sunduğu reklamlar)
         desteklemediği sıradır ve KURTARILDIĞI İDDİA EDİLMİYOR: ödül kaybolur.
         Test bunu belgeliyor, gizlemiyor.

         Aynı test, ödül yolunun ADS.cur'a bakmadığını da kanıtlıyor: baksaydı
         handler erken döner, rwEarned hiç çağrılmaz ve lastRw boş kalırdı. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted;
    const cid = await careerIn(a, 1);
    const fake = fakeAdMobAged(a);
    await a.R('adsInit()');
    const cash0 = a.R('S.cash');
    a.R('adsWatch();'); await tick();

    fake.emit('onRewardedVideoAdDismissed'); await tick();         // önce kapanış
    ok(a.R('ADS.cur===null') === true, '(2) kilit açıldı');
    ok(a.R('PREFS.rw["' + cid + '"]===undefined') === true, '(2) istek kaydı silindi');

    fake.reward(); await tick();                                   // sonra ödül
    await waitFor(() => a.R('ADS.lastRw') !== '', '(2) ödül yolu çalıştı');
    ok(a.R('ADS.lastRw') === 'unknown', '(2) ödül yolu ADS.cur okumadan çalıştı');
    ok(a.R('S.cash') === cash0, '(2) ters sırada ödül KAYIP — para yazılmadı');
    ok(a.R('rwCanClaim(Date.now())') === true, '(2) günün hakkı yanmadı');
  }

  /* (3) Ödülsüz kapatma: para yok, hak tüketilmiyor, ikinci deneme mümkün. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted;
    const cid = await careerIn(a, 1);
    const fake = fakeAdMobAged(a);
    await a.R('adsInit()');
    const cash0 = a.R('S.cash');
    a.R('adsWatch();'); await tick();
    fake.emit('onRewardedVideoAdDismissed'); await tick();
    ok(a.R('S.cash') === cash0, '(3) ödülsüz kapatma para vermedi');
    ok(a.R('PREFS.rw["' + cid + '"]===undefined') === true, '(3) istek kaydı temizlendi');
    ok(a.R('adsRowState()') === 'go', '(3) hak TÜKETİLMEDİ, düğme yeniden açık');
    a.R('adsWatch();'); await tick();
    ok(fake.stat.prepares === 2, '(3) ikinci deneme başlatılabildi');
  }

  /* (4) Yükleme hatası: prepare reject. Eklenti ayrıca FailedToLoad da yayıyor;
         sahipsiz kalan o olay hakka dokunmamalı. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted;
    const cid = await careerIn(a, 1);
    const fake = fakeAdMobAged(a, { loadFail: true });
    await a.R('adsInit()');
    const cash0 = a.R('S.cash');
    a.R('adsWatch();'); await tick();
    ok(a.R('ADS.cur===null') === true, '(4) yükleme hatasında kilit açıldı');
    ok(a.R('S.cash') === cash0, '(4) yükleme hatası para vermedi');
    ok(a.R('PREFS.rw["' + cid + '"]===undefined') === true, '(4) istek kaydı silindi');
    fake.emit('onRewardedVideoAdFailedToLoad', { code: 3, message: 'no fill' });
    await tick();
    ok(a.R('adsRowState()') === 'go', '(4) sahipsiz FailedToLoad hakka dokunmadı');
  }

  /* (5) Gösterim sürerken ikinci dokunuş native'e HİÇ ulaşmıyor. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted;
    await careerIn(a, 1);
    const fake = fakeAdMobAged(a);
    await a.R('adsInit()');
    a.R('adsWatch();'); await tick();
    a.R('adsWatch();adsWatch();'); await tick();
    ok(fake.stat.prepares === 1 && fake.stat.shows === 1, '(5) tek gösterim: prepare/show birer kez');
  }

  /* (6) Native eklenti yoksa (web, PWA, tek dosya): satır çizilmiyor, çağrı yok. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted;
    await careerIn(a, 1);
    ok(a.R('typeof Capacitor') === 'undefined', '(6) ortamda Capacitor yok');
    ok(await a.R('adsInit()') === 'off', '(6) adaptör kapalı');
    ok(a.R('adsRowState()') === null, '(6) düğme HİÇ çizilmiyor');
    const cash0 = a.R('S.cash');
    a.R('adsWatch();'); await tick();
    ok(a.R('S.cash') === cash0 && a.R('ADS.cur===null') === true, '(6) çağrı hiç başlamadı');
    ok(a.R("VIEWS.dash().indexOf('adsRewardOpen()')") === -1, '(6) ana ekranda + düğmesi yok');
    ok(a.R("VIEWS.dash().indexOf('adsWatch()')") === -1, '(6) reklam başlatan yol da yok');
  }

  /* (7) SDK başlatılamazsa düğme hiç çizilmiyor — her dokunuşta patlayacak bir
         düğme göstermek yalan olurdu. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted;
    await careerIn(a, 1);
    fakeAdMobAged(a, { initFail: true });
    ok(await a.R('adsInit()') === 'fail', '(7) başlatma hatası görüldü');
    ok(a.R('adsRowState()') === null, '(7) düğme çizilmiyor');
  }

  /* (8) Sahipsiz terminal olay (ADS.cur boşken) hiçbir şeyi bozmuyor. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted;
    const cid = await careerIn(a, 1);
    const fake = fakeAdMobAged(a);
    await a.R('adsInit()');
    const cash0 = a.R('S.cash');
    fake.emit('onRewardedVideoAdDismissed');
    fake.emit('onRewardedVideoAdFailedToShow', { code: 0, message: 'x' });
    await tick();
    ok(a.R('S.cash') === cash0, '(8) sahipsiz olay para hareketi yapmadı');
    ok(a.R('(PREFS.rw||{})["' + cid + '"]===undefined') === true, '(8) hiç istek kaydı oluşmadı');
    ok(a.R('adsRowState()') === 'go', '(8) hak bozulmadı');
  }
}

/* ================= [19] UMP İZİN AKIŞI (js/ads.js) =================
   Bu blok İZİN mantığını ölçüyor, gerçek formu değil. Taklidin döndürdüğü
   alanlar senaryo başına VERİLİYOR; hiçbir kontrol "gerçek SDK bu değeri
   döndürür" iddiası taşımıyor. Kullanıcının formda ne seçtiği ile SDK'nın ne
   döndürdüğü ayrı şeyler ve burada yalnız ikincisi var — birincisi ancak
   cihazda, yayımlanmış bir mesajla gözlemlenebilir.

   Ölçülen sözleşme: uygunluk YALNIZ canRequestAds'ten gelir, izin işlemiyle
   reklam işlemi çakışmaz, doğrulanamamış uygunlukla reklam başlamaz, başarılı
   bir SDK başlatması tekrarlanmaz ve hiçbir izin yolu paraya/hakka/kayda
   dokunmaz. */
const REQ_PORS = { privacyOptionsRequirementStatus: 'REQUIRED' };

async function tUmpConsent() {
  console.log('\n[19] UMP izin akışı: sıra, kilit, bayat uygunluk, tek başlatma');

  /* (1) SIRA — izin sonucu alınmadan SDK başlatılmıyor. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    const fake = fakeAdMobAged(a);
    ok(await a.R('adsInit()') === 'ready', '(1) uygunluk true → hazır');
    ok(fake.stat.order[0] === 'ask', '(1) ilk native çağrı izin okuması');
    ok(fake.stat.order.indexOf('init') > fake.stat.order.indexOf('ask'),
       '(1) initialize izin okumasından SONRA');
    ok(fake.stat.order.indexOf('init') > fake.stat.order.indexOf('form'),
       '(1) initialize form denemesinden SONRA');
    ok(fake.stat.inits === 1 && fake.stat.asks === 1 && fake.stat.forms === 1,
       '(1) her biri bir kez');
    ok(fake.bound('onRewardedVideoAdDismissed') === 1
       && fake.bound('onRewardedVideoAdFailedToShow') === 1
       && fake.bound('onRewardedVideoAdFailedToLoad') === 1, '(1) üç dinleyici birer kez');
    ok(a.R('adsRowState()') === 'go', '(1) ödül satırı açık');
  }

  /* (2) canRequestAds:false → SDK HİÇ başlatılmıyor, düğme yok, çağrı yok.
         status 'REQUIRED' ama kararı veren o değil, canRequestAds. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; const cid = await careerIn(a, 1);
    const fake = fakeAdMobAged(a, { consent: { canRequestAds: false, status: 'REQUIRED' } });
    ok(await a.R('adsInit()') === 'noconsent', '(2) uygunluk yok');
    ok(fake.stat.inits === 0, '(2) initialize hiç çağrılmadı');
    ok(a.R('adsRowState()') === null, '(2) satır çizilmiyor');
    const cash0 = a.R('S.cash');
    a.R('adsWatch();'); await tick();
    ok(fake.stat.prepares === 0 && fake.stat.shows === 0, '(2) adsWatch hiçbir şey yapmadı');
    ok(a.R('(PREFS.rw||{})["' + cid + '"]===undefined') === true, '(2) istek kaydı oluşmadı');
    ok(a.R('S.cash') === cash0 && a.R('rwCanClaim()') === true, '(2) para ve hak yerinde');
  }

  /* (3) Eşzamanlı açılış çağrıları tek tur: iki izin turu ve iki SDK başlatma
         olsaydı form da iki kez denenirdi. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    const fake = fakeAdMobAged(a);
    await a.R('Promise.all([adsInit(),adsInit(),adsInit()])');
    ok(fake.stat.asks === 1, '(3) tek izin okuması');
    ok(fake.stat.forms === 1, '(3) tek form denemesi');
    ok(fake.stat.inits === 1, '(3) tek initialize');
    ok(fake.bound('onRewardedVideoAdDismissed') === 1, '(3) dinleyici çoğalmadı');
    /* Tamamlandıktan sonraki çağrı da yeni tur açmıyor. */
    ok(await a.R('adsInit()') === 'ready' && fake.stat.asks === 1 && fake.stat.inits === 1,
       '(3) ikinci adsInit yeni tur başlatmadı');
  }

  /* (4) KİLİT — izin işlemi sürerken reklam başlamıyor. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; const cid = await careerIn(a, 1);
    const fake = fakeAdMobAged(a, { consent: REQ_PORS, privHold: true });
    await a.R('adsInit()');
    ok(a.R('adsPrivacyState()') === 'go', '(4) gizlilik girişi görünür');
    a.R('adsPrivacy();'); await tick();
    ok(a.R("adsBusy()") === 'consent', '(4) izin işlemi kilidi aldı');
    ok(a.R('adsRowState()') === 'busy', '(4) ödül satırı meşgul');
    a.R('adsWatch();'); await tick();
    ok(fake.stat.prepares === 0 && fake.stat.shows === 0, '(4) reklam yüklemesi başlamadı');
    ok(a.R('(PREFS.rw||{})["' + cid + '"]===undefined') === true, '(4) hak isteği kaydı yok');
    fake.finishPriv(); await tick(); await tick();
    ok(a.R("adsBusy()") === '', '(4) kilit çözüldü');
  }

  /* (5) KİLİT — reklam sürerken gizlilik formu açılmıyor. YÜKLEME BEKLEMESİ de
         reklam işlemi sayılıyor: prepare henüz çözülmemişken de kapalı. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    const fake = fakeAdMobAged(a, { consent: REQ_PORS, prepareHold: true });
    await a.R('adsInit()');
    a.R('adsWatch();'); await tick();
    ok(fake.stat.prepares === 1 && fake.stat.shows === 0, '(5) yükleme sürüyor, gösterim yok');
    ok(a.R("adsBusy()") === 'ad', '(5) yükleme beklemesi reklam işlemi sayılıyor');
    ok(a.R('adsPrivacyState()') === 'busy', '(5) gizlilik girişi meşgul görünüyor');
    a.R('adsPrivacy();'); await tick();
    ok(fake.stat.privs === 0, '(5) gizlilik formu açılmadı');
    fake.finishPrepare(); await tick(); await tick();
    ok(fake.stat.shows === 1, '(5) yükleme bitince gösterim başladı');
  }

  /* (6) Yükleme ile gösterim ARASINDA uygunluk düşerse reklam gösterilmiyor.
         Kilit bu aralıkta bir izin işlemine zaten izin vermiyor; bu kapı ikinci
         savunma, o yüzden testte uygunluk doğrudan düşürülüyor. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; const cid = await careerIn(a, 1);
    const fake = fakeAdMobAged(a, { prepareHold: true });
    await a.R('adsInit()');
    const cash0 = a.R('S.cash');
    a.R('adsWatch();'); await tick();
    ok(a.R('(PREFS.rw||{})["' + cid + '"]!==undefined') === true, '(6) hak isteği açıldı');
    a.R('ADS.cs.can=false;');
    fake.finishPrepare(); await tick(); await tick();
    ok(fake.stat.shows === 0, '(6) gösterim HİÇ başlamadı');
    ok(a.R('(PREFS.rw||{})["' + cid + '"]===undefined') === true, '(6) istek kaydı geri alındı');
    ok(a.R('S.cash') === cash0, '(6) para hareketi yok');
    ok(a.R('ADS.cur===null') === true, '(6) kilit açıldı');
    a.R('ADS.cs.can=true;');
    ok(a.R('rwCanClaim()') === true, '(6) günlük hak TÜKETİLMEDİ');
  }

  /* (7) Kilit oyunu ve kaydı engellemiyor. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    const fake = fakeAdMobAged(a, { consent: REQ_PORS, privHold: true });
    await a.R('adsInit()');
    a.R('adsPrivacy();'); await tick();
    ok(a.R("adsBusy()") === 'consent', '(7) izin işlemi sürüyor');
    const w0 = a.R('S.week');
    a.R('nextWeek();nextWeek();save();');
    await a.R('saveDrain()');
    ok(a.R('S.week') > w0, '(7) hafta ilerledi');
    ok(a.R('storeReady') === true, '(7) kayıt katmanı çalışıyor');
    fake.finishPriv(); await tick(); await tick();
  }

  /* (8) BAYAT UYGUNLUK — gizlilik formundan sonra yenileme düşerse eski
         canRequestAds=true ile reklam BAŞLAMIYOR ve bu "reddettin" değil. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; const cid = await careerIn(a, 1);
    const fake = fakeAdMobAged(a, { consent: REQ_PORS });
    await a.R('adsInit()');
    ok(a.R('adsRowState()') === 'go' && a.R('adsEligible()') === true, '(8) başta uygun');
    const asks0 = fake.stat.asks;
    fake.setAskFail(true);
    await a.R('adsPrivacy()'); await tick();
    ok(fake.stat.privs === 1, '(8) gizlilik formu gösterildi');
    ok(fake.stat.asks === asks0 + 1, '(8) TEK yeniden okuma denendi (döngü yok)');
    ok(a.R('ADS.stale') === true, '(8) uygunluk doğrulanamadı olarak işaretlendi');
    ok(a.R('ADS.cs.can') === true, '(8) eski kopya duruyor ama karar vermiyor');
    ok(a.R('adsEligible()') === false, '(8) doğrulanamamış uygunluk reklam açmıyor');
    ok(a.R('adsRowState()') === null, '(8) ödül satırı yok');
    a.R('adsWatch();'); await tick();
    ok(fake.stat.prepares === 0, '(8) adsWatch engellendi');
    ok(a.R('(PREFS.rw||{})["' + cid + '"]===undefined') === true, '(8) hak tüketilmedi');
    ok(a.R('ADS.sdk') === 'on', '(8) başarıyla başlatılmış SDK geri alınmadı');
    ok(a.R('adsPrivacyState()') === 'go', '(8) gizlilik girişi KORUNDU — toparlanma yolu açık');
    ok(a.R("t('adEligUnknown')!==t('adRewardFail')") === true, '(8) mesaj ret mesajından ayrı');

    /* (9) Toparlanma: aynı satırdan yeniden okuma tutuyor.
           true→false→true geçişinde SDK YENİDEN başlatılmıyor. */
    const inits0 = fake.stat.inits;
    fake.setAskFail(false);
    await a.R('adsPrivacy()'); await tick(); await tick();
    ok(a.R('ADS.stale') === false, '(9) bayatlık temizlendi');
    ok(a.R('adsEligible()') === true, '(9) uygunluk yeniden doğrulandı');
    ok(a.R('adsRowState()') === 'go', '(9) satır geri geldi');
    ok(fake.stat.inits === inits0, '(9) SDK yeniden initialize EDİLMEDİ');
    ok(fake.bound('onRewardedVideoAdDismissed') === 1, '(9) dinleyici çoğalmadı');
  }

  /* (10) showConsentForm hatası "durum değişmedi" sayılmıyor: desteklenen
          yöntemle TEK yeniden okuma yapılıyor ve tutuyorsa akış sürüyor. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    const fake = fakeAdMobAged(a, { formFail: true });
    ok(await a.R('adsInit()') === 'ready', '(10) yeniden okuma tuttu, akış sürdü');
    ok(fake.stat.forms === 1 && fake.stat.asks === 2, '(10) form 1, okuma 2 (açılış + yenileme)');
    ok(a.R('ADS.stale') === false, '(10) doğrulanmış uygunluk');
    ok(a.R("ADS.cs.src") === 'formfail', '(10) karar form SONRASI okumaya dayanıyor');
    ok(fake.stat.inits === 1, '(10) SDK başlatıldı');
  }

  /* (11) Form hatası + yeniden okuma da düşerse: eski değerle DEVAM EDİLMİYOR. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    const fake = fakeAdMobAged(a, { formFail: true, askFailFrom: 2 });
    ok(await a.R('adsInit()') === 'noconsent', '(11) uygunluk doğrulanamadı');
    ok(a.R('ADS.stale') === true, '(11) bayat olarak işaretlendi');
    ok(a.R('ADS.cs.can') === true, '(11) açılış okuması true idi');
    ok(a.R('adsEligible()') === false, '(11) yine de uygun sayılmıyor');
    ok(fake.stat.inits === 0, '(11) SDK BAŞLATILMADI');
    ok(fake.stat.asks === 2, '(11) tam iki okuma — sonsuz tekrar yok');
  }

  /* (12) showPrivacyOptionsForm reddi de "hiçbir şey olmadı" sayılmıyor. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    const fake = fakeAdMobAged(a, { consent: REQ_PORS, privFail: true });
    await a.R('adsInit()');
    const asks0 = fake.stat.asks;
    await a.R('adsPrivacy()'); await tick();
    ok(fake.stat.asks === asks0 + 1, '(12) ret sonrası da yeniden okundu');
    ok(a.R('ADS.stale') === false, '(12) okuma tuttuğu için bayat değil');
    fake.setAskFail(true);
    await a.R('adsPrivacy()'); await tick();
    ok(a.R('ADS.stale') === true, '(12) okuma da düşerse bayat');
    ok(a.R('adsPrivacyState()') === 'go', '(12) giriş yine korundu');
  }

  /* (13) Başlatma beklerken uygunluk düşerse tamamlanma REKLAM KAPISINI açmıyor
          — ama başarıyla başlatılmış SDK 'off'a da çekilmiyor. Sonra uygunluk
          geri gelince initialize TEKRARLANMIYOR. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    const fake = fakeAdMobAged(a, { initHold: true });
    const p = a.R('adsInit()'); await tick();
    ok(a.R('ADS.sdk') === 'init' && fake.stat.inits === 1, '(13) başlatma uçuşta');
    a.R('ADS.cs.can=false;');                       // uygunluk beklerken düştü
    fake.finishInit(); await p; await tick();
    ok(a.R('ADS.sdk') === 'on', '(13) SDK gerçekten başlatıldı, geri alınmadı');
    ok(a.R('adsReady()') === false, '(13) reklam kapısı açılmadı');
    ok(a.R('adsRowState()') === null, '(13) satır yok');
    a.R('adsWatch();'); await tick();
    ok(fake.stat.prepares === 0, '(13) reklam isteği başlamadı');
    a.R('ADS.cs.can=true;adsApply();'); await tick();
    ok(fake.stat.inits === 1, '(13) true→false→true: initialize BİR kez');
    ok(a.R('adsReady()') === true && a.R('adsRowState()') === 'go', '(13) kapı yeniden açıldı');
    ok(fake.bound('onRewardedVideoAdFailedToLoad') === 1, '(13) dinleyici bir kez');
  }

  /* (14) Başlatma hatası: satır yok, dinleyici yok; sonraki deneme çoğaltmıyor. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    const fake = fakeAdMobAged(a, { initFail: true });
    ok(await a.R('adsInit()') === 'fail', '(14) başlatma hatası görüldü');
    ok(a.R('adsRowState()') === null, '(14) satır çizilmiyor');
    ok(fake.bound('onRewardedVideoAdDismissed') === 0, '(14) dinleyici kurulmadı');
    fake.setInitFail(false);
    a.R('adsApply();'); await tick(); await tick();
    ok(fake.stat.inits === 2 && a.R('ADS.sdk') === 'on', '(14) yeniden denendi ve tuttu');
    ok(fake.bound('onRewardedVideoAdDismissed') === 1
       && fake.bound('onRewardedVideoAdFailedToShow') === 1, '(14) dinleyiciler birer kez');
  }

  /* (15) İzin akışı paraya, günlük hakka ve kayıt biçimine dokunmuyor. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; const cid = await careerIn(a, 1);
    const fake = fakeAdMobAged(a, { consent: REQ_PORS });
    const cash0 = a.R('S.cash');
    await a.R('adsInit()');
    await a.R('adsPrivacy()');
    fake.setAskFail(true); await a.R('adsPrivacy()');
    fake.setAskFail(false); await a.R('adsPrivacy()'); await tick();
    ok(a.R('S.cash') === cash0, '(15) form görüntülemek para vermedi');
    ok(a.R('Object.keys((S.rw||{}).n||{}).length') === 0, '(15) ödenmiş gün kaydı yok');
    ok(a.R('rwCanClaim()') === true, '(15) günlük hak tüketilmedi');
    ok(a.R('(PREFS.rw||{})["' + cid + '"]===undefined') === true, '(15) istek kaydı oluşmadı');
    ok(a.R("JSON.stringify(S).indexOf('canRequestAds')") === -1
       && a.R("JSON.stringify(S).indexOf('privacyOptions')") === -1, '(15) izin durumu S\'ye yazılmadı');
    ok(a.R("JSON.stringify(PREFS).indexOf('canRequestAds')") === -1
       && a.R("JSON.stringify(PREFS).indexOf('privacyOptions')") === -1, '(15) izin durumu PREFS\'e yazılmadı');
    ok(a.R('SAVE_SCHEMA') === 10, '(15) kayıt şeması değişmedi');
  }

  /* (16) Ayarlar girişi yalnız SDK gerekli dediğinde çiziliyor. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    fakeAdMobAged(a);                                   // pors NOT_REQUIRED
    await a.R('adsInit()');
    ok(a.R('adsPrivacyState()') === null, '(16) gerekli değilken durum null');
    ok(a.R("VIEWS.settings().indexOf('adsPrivacy()')") === -1, '(16) Ayarlar\'da satır yok');
  }
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    fakeAdMobAged(a, { consent: REQ_PORS });
    await a.R('adsInit()');
    ok(a.R('adsPrivacyState()') === 'go', '(16) gerekliyken durum go');
    ok(a.R("VIEWS.settings().indexOf('adsPrivacy()')") > -1, '(16) Ayarlar\'da satır var');
    ok(a.R("['tr','en'].every(l=>STR[l].adPrivacyTitle&&STR[l].adEligUnknown&&STR[l].adBusy)") === true,
       '(16) metinler iki dilde de var');
  }

  /* (17) Web/PWA/tek dosya: hiçbir izin çağrısı yok, satır yok. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    ok(a.R('typeof Capacitor') === 'undefined', '(17) ortamda Capacitor yok');
    ok(await a.R('adsInit()') === 'off', '(17) adaptör kapalı');
    ok(a.R('adsPrivacyState()') === null, '(17) gizlilik satırı yok');
    a.R('adsPrivacy();'); await tick();
    ok(a.R('adsRowState()') === null && a.R('ADS.cs===null') === true, '(17) hiçbir native çağrı olmadı');
    ok(a.R("VIEWS.settings().indexOf('adsPrivacy()')") === -1, '(17) Ayarlar\'da satır yok');
  }
}

/* ================= [20] YAŞ KAPISI (js/ads.js) =================
   Bu blok yalnız KAPIYI ölçüyor. Beyan bir ÖZ BEYANDIR; hiçbir kontrol "yaş
   doğrulandı" iddiası taşımıyor — ölçülen tek şey, beyanın uygulamada hangi
   çağrıları açıp kapattığı.

   Sözleşme: beyansız ya da eşik altındayken reklam yolunun HİÇBİR native çağrısı
   yapılmıyor; oyun ve kayıtlar çalışmaya devam ediyor; ödül ekonomisi
   değişmiyor; kazanılmış bir ödül kapı kapansa da teslim ediliyor; verilmiş
   rızayı yönetme yolu soğuk açılıştan sonra da açık kalıyor.

   NOT: satırın çizilmemesi ya da JS'ten çağrı yapılmaması, cihazda native
   başlangıç bileşeni ya da ağ trafiği OLMADIĞININ kanıtı değildir. Burada
   ölçülen tek kanıt sınıfı "JS köprüye çağrı yapmadı"dır. */
const AD_Y_OK = new Date().getFullYear() - 30;     // rahatça eşiğin üstünde
const AD_Y_UNDER = new Date().getFullYear() - 5;   // rahatça eşiğin altında

async function tAdAgeGate() {
  console.log('\n[20] yaş kapısı: beyan, sahiplik, gizlilik erişimi, ödül teslimatı');

  /* (0) SÖZLEŞME SABİTİ — eşik 18. Aşağıdaki sınır senaryosu AD_AGE_MIN'i
         uygulamadan okuyup İLİŞKİYİ ölçüyor; DEĞERİ burada bağımsız olarak
         sabitliyoruz, yoksa eşik sessizce değişse blok tümüyle yeşil kalırdı.
         Bu sayı hem CLAUDE.md'de hem yayımlanacak gizlilik metninde geçiyor. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted;
    ok(a.R('AD_AGE_MIN') === 18, '(0) reklam erişim eşiği 18', a.R('AD_AGE_MIN'));
    ok(a.R('typeof AD_AGE_MIN') === 'number', '(0) eşik sayı');
  }

  /* (1) BEYAN YOK — reklam yolunun hiçbir çağrısı yapılmıyor, satır beyana
         çağırıyor ve TUTAR yazmıyor (yüksek yaş beyanına teşvik olmasın). */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; const cid = await careerIn(a, 1);
    const fake = fakeAdMob(a.ctx);
    ok(await a.R('adsInit()') === 'noage', '(1) kapı kapalı');
    ok(fake.stat.asks === 0 && fake.stat.forms === 0 && fake.stat.inits === 0,
       '(1) izin okuması, form ve initialize hiç çağrılmadı');
    ok(a.R('ADS.cs===null') === true && a.R('ADS.boot') === false,
       '(1) izin durumu kurulmadı, boot işaretlenmedi');
    ok(a.R('adsRowState()') === 'age', '(1) satır beyan istiyor');
    /* Giriş noktası artık bakiyenin yanındaki +; anlatı açılan pencerede.
       Ölçülen sözleşme aynı: beyan istenen hâlde yol NÖTR yaş ekranına gidiyor
       ve hiçbir yüzeyde tutar yazmıyor. */
    ok(a.R("adsPlusHtml().indexOf('adsRewardOpen()')") !== -1, '(1) + düğmesi çizildi');
    ok(a.R("adsPlusHtml().indexOf(fmtK(RW.amount))") === -1, '(1) + üstünde tutar yazmıyor');
    a.R('adsRewardOpen();');
    ok(a.R("document.getElementById('sheet').innerHTML.indexOf('adAgeInp')") !== -1,
       '(1) + doğrudan beyan ekranını açtı');
    ok(a.R("document.getElementById('sheet').innerHTML.indexOf(fmtK(RW.amount))") === -1,
       '(1) beyan ekranında da tutar yazmıyor');
    a.R('closeModal();');
    a.R('adsWatch();'); await tick();
    ok(fake.stat.prepares === 0 && fake.stat.shows === 0, '(1) adsWatch hiçbir şey yapmadı');
    ok(a.R('(PREFS.rw||{})["' + cid + '"]===undefined') === true, '(1) hak isteği kaydı yok');
    ok(a.R('rwCanClaim()') === true, '(1) günlük hak tüketilmedi');
  }

  /* (2) OYUN ÇALIŞMAYA DEVAM EDİYOR — kapı yalnız reklamı bağlıyor. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    const fake = fakeAdMob(a.ctx);
    await a.R('adsInit()');
    const cash0 = a.R('S.cash'), wk0 = a.R('S.week'), wc = a.R('weeklyCost()');
    a.R('nextWeek();'); a.R('save();'); await a.R('saveDrain()');
    ok(a.R('S.week') === wk0 + 1, '(2) hafta ilerledi');
    /* Kasanın "tanımlı olması" hiçbir şey ölçmez. Ölçülen şu: haftalık gider
       gerçekten işlendi ve tutar tam olarak ekonominin söylediği kadar değişti
       — kapalı kapı araya ne para koydu ne de bir şey eksiltti. */
    ok(a.R('S.cash') === cash0 - wc, '(2) haftalık gider birebir işlendi', a.R('S.cash'));
    ok(fake.stat.asks === 0 && fake.stat.inits === 0 && fake.stat.prepares === 0,
       '(2) hafta boyunca reklam yolundan hiçbir native çağrı çıkmadı');
    /* Günlük hak ne tüketildi ne de "kullanılmış" işaretlendi: kapalı kapı
       hakkı yakmıyor, yerine de bir şey koymuyor. */
    ok(a.R('rwCanClaim()') === true && a.R('Object.keys((S.rw||{}).n||{}).length') === 0,
       '(2) günlük hak dokunulmadan duruyor');
    ok(a.R('RW.amount') === 50, '(2) ödül tutarı değişmedi');
    ok(a.R('SAVE_SCHEMA') === 10, '(2) kayıt şeması değişmedi');
  }

  /* (3) EŞİK ALTI — kapı kapalı, satır nötr, yukarı düzeltme daveti yok. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    const fake = fakeAdMob(a.ctx);
    ok(a.R('adsAgeSet("' + AD_Y_UNDER + '")') === true, '(3) beyan yazıldı');
    await tick();
    ok(a.R('adsAgeState()') === 'under' && a.R('adsAgeOk()') === false, '(3) eşik altı');
    ok(await a.R('adsInit()') === 'noage', '(3) kapı kapalı');
    ok(fake.stat.asks === 0 && fake.stat.inits === 0, '(3) hiçbir native çağrı yok');
    ok(a.R('adsRowState()') === 'noage', '(3) satır nötr hâlde');
    a.R('adsRewardOpen();');
    {
      const sh = a.R("document.getElementById('sheet').innerHTML");
      ok(sh.indexOf('adsAgeOpen()') === -1, '(3) pencerede yukarı düzeltme daveti yok');
      ok(sh.indexOf(a.R('fmtK(RW.amount)')) === -1, '(3) pencerede tutar yazmıyor');
      ok(sh.indexOf('adsRewardGo()') === -1, '(3) reklam başlatan yol da yok');
    }
    a.R('closeModal();');
  }

  /* (4) SINIR — yalnız yıl saklandığı için kişi KÜÇÜK yaş sayılıyor.
         Eşit fark kapıyı açmıyor, bir fazlası açıyor. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    fakeAdMob(a.ctx);
    const now = new Date().getFullYear();
    a.R('adsAgeSet("' + (now - AD_AGE_MIN_T()) + '")');
    ok(a.R('adsAgeOk()') === false, '(4) fark eşiğe eşitken kapı kapalı');
    a.R('adsAgeSet("' + (now - AD_AGE_MIN_T() - 1) + '")');
    ok(a.R('adsAgeOk()') === true, '(4) fark eşikten bir fazlayken kapı açık');
    function AD_AGE_MIN_T() { return a.R('AD_AGE_MIN'); }
  }

  /* (5) BOZUK/GEÇERSİZ TERCİH — kapıyı AÇMIYOR, çökmüyor. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    fakeAdMob(a.ctx);
    const bad = ['"1990"', '1990.5', 'null', 'true', '{}', '(new Date().getFullYear()+1)', '1200'];
    let allClosed = true;
    for (const v of bad) {
      a.R('setPref("adBY",' + v + ');');
      if (a.R('adsAgeOk()') !== false || a.R('adsBirthYear()') !== null) allClosed = false;
    }
    ok(allClosed, '(5) geçersiz, kesirli, metin, gelecek ve saçma değerler kapıyı açmıyor');
    ok(a.R('adsAgeSet("19a0")') === false && a.R('adsAgeSet("")') === false
       && a.R('adsAgeSet(null)') === false, '(5) geçersiz girdi yazılmıyor');
    ok(a.R('adsAgeSet("' + (new Date().getFullYear() + 1) + '")') === false,
       '(5) gelecek yıl yazılmıyor');
  }

  /* (6) UYGUN BEYAN — akış BİR KEZ koşuyor, sıra bozulmuyor. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    const fake = fakeAdMob(a.ctx);
    await a.R('adsInit()');
    ok(fake.stat.asks === 0, '(6) beyansızken okuma yok');
    a.R('adsAgeSet("' + AD_Y_OK + '");');
    await tick(); await tick(); await tick();
    ok(fake.stat.asks === 1 && fake.stat.forms === 1 && fake.stat.inits === 1,
       '(6) beyandan sonra akış bir kez koştu');
    ok(fake.stat.order.indexOf('init') > fake.stat.order.indexOf('ask'),
       '(6) initialize izin okumasından SONRA');
    ok(a.R('adsRowState()') === 'go', '(6) ödül satırı açıldı');
    ok(await a.R('adsInit()') === 'ready' && fake.stat.asks === 1,
       '(6) ikinci adsInit yeni tur açmadı');
  }

  /* (7) UYGUN → UYGUN DEĞİL — yeni istek durur, SDK 'on' KALIR.
         Başlatılmış SDK geri alınmış gibi yazılmıyor. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; const cid = await careerIn(a, 1);
    const fake = fakeAdMobAged(a, {});
    await a.R('adsInit()');
    ok(a.R('ADS.sdk') === 'on' && a.R('adsRowState()') === 'go', '(7) başlangıçta açık');
    a.R('adsAgeClear();'); await tick();
    ok(a.R('ADS.sdk') === 'on', '(7) SDK hâlâ on — geri alınmadı');
    ok(a.R('adsRowState()') === 'age', '(7) satır beyan istiyor');
    a.R('adsWatch();'); await tick();
    ok(fake.stat.prepares === 0 && fake.stat.shows === 0, '(7) yeni istek başlamadı');
    ok(a.R('(PREFS.rw||{})["' + cid + '"]===undefined') === true, '(7) hak isteği kaydı yok');
    ok(a.R('PREFS.adBY===undefined') === true, '(7) beyan alanı gerçekten kalktı');
    ok(a.R('ADS.cs!==null') === true, '(7) izin durumu silinmedi — yaş rıza hükmü değil');
  }

  /* (8) UYGUN → UYGUN DEĞİL → UYGUN (aynı oturum, akış TAMAMLANMIŞTI):
         yeni izin turu açılmıyor, initialize ve dinleyiciler tekrarlanmıyor. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    const fake = fakeAdMobAged(a, {});
    await a.R('adsInit()');
    a.R('adsAgeClear();'); await tick();
    a.R('adsAgeSet("' + AD_Y_OK + '");'); await tick(); await tick();
    ok(fake.stat.asks === 1, '(8) yeni izin okuması yapılmadı');
    ok(fake.stat.forms === 1, '(8) form yeniden denenmedi');
    ok(fake.stat.inits === 1, '(8) initialize tekrarlanmadı');
    ok(fake.bound('onRewardedVideoAdDismissed') === 1, '(8) dinleyici çoğalmadı');
    ok(a.R('adsRowState()') === 'go', '(8) satır yeniden açıldı');
  }

  /* (9) YARIDA KALMIŞ AKIŞ — okuma beklerken beyan siliniyor: form BAŞLAMIYOR,
         boot false kalıyor ve sonraki uygun beyan akışı BAŞTAN koşturuyor. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    const fake = fakeAdMobAged(a, { askHold: true });
    a.R('adsInit();'); await tick();
    ok(fake.stat.asks === 1 && fake.stat.forms === 0, '(9) okuma uçuşta, form yok');
    a.R('adsAgeClear();'); await tick();
    fake.finishAsk(); await tick(); await tick();
    ok(fake.stat.forms === 0, '(9) beyan silinince form başlatılmadı');
    ok(fake.stat.inits === 0, '(9) initialize yapılmadı');
    ok(a.R('ADS.boot') === false, '(9) boot işaretlenmedi — akış tamamlanmadı');
    ok(a.R("ADS.busy===''") === true && a.R('ADS.cp===null') === true,
       '(9) kilit ve uçuş sözü sahibi tarafından bırakıldı');
    a.R('adsAgeSet("' + AD_Y_OK + '");'); await tick(); await tick(); await tick();
    ok(fake.stat.asks === 2 && fake.stat.forms === 1 && fake.stat.inits === 1,
       '(9) yeniden uygun beyanda akış baştan koştu');
  }

  /* (10) SAHİPLİK KONTROLLERİ — kısmen SAVUNMA AMAÇLI BİRİM KONTROLÜ.
          Kilidin uçuş sırasında eski zincirde kaldığı ve yalnız sahibince
          bırakıldığı gerçek akıştan ölçülüyor. Son iki satır ise adsAdopt'u
          DOĞRUDAN çağırıyor: bugünkü kodda ADS.op yalnız adsConsentFlow ve
          adsPrivacy içinde artıyor, ikisi de ADS.cp/adsBusy() ile korunduğu
          için busyOp'un uçuş sırasında değiştiği bir yol YOK. O iki satır bu
          yüzden yarış testi değil, kontrolün kendi birim doğrulaması; gerçek
          yarış sıralamaları (18)–(23)'te kuruluyor. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    const fake = fakeAdMobAged(a, { askHold: true });
    a.R('adsInit();'); await tick();
    const op1 = a.R('ADS.busyOp');
    a.R('adsAgeClear();'); await tick();
    /* Eski zincir hâlâ uçuşta; yeni bir tur AÇILMIYOR çünkü kilit hâlâ onda. */
    a.R('adsAgeSet("' + AD_Y_OK + '");'); await tick();
    ok(a.R('ADS.busyOp') === op1, '(10) kilit hâlâ eski zincirde — çakışan form açılmadı');
    ok(fake.stat.forms === 0, '(10) ikinci form başlamadı');
    fake.finishAsk(); await tick(); await tick();
    ok(a.R("ADS.busy===''") === true, '(10) kilit sahibi tarafından bırakıldı');
    const seqBefore = a.R('ADS.seq');
    /* Sahipliği yitirmiş bir okuma sonucu durumu yazamaz. */
    ok(a.R('adsAdopt({canRequestAds:true,status:"OBTAINED",privacyOptionsRequirementStatus:"REQUIRED"},"stale",' + op1 + ')') === false,
       '(10) sahipsiz okuma benimsenmedi (birim kontrolü)');
    ok(a.R('ADS.seq') === seqBefore, '(10) okuma sayacı artmadı (birim kontrolü)');
  }

  /* (11) PREPARE ↔ SHOW ARASI — yükleme beklerken beyan silinirse gösterim
          BAŞLAMIYOR ve günün hakkı İADE ediliyor (yanmıyor). */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; const cid = await careerIn(a, 1);
    const fake = fakeAdMobAged(a, { prepareHold: true });
    await a.R('adsInit()');
    const cash0 = a.R('S.cash');
    a.R('adsWatch();'); await tick();
    ok(fake.stat.prepares === 1 && fake.stat.shows === 0, '(11) yükleme uçuşta');
    ok(a.R('(PREFS.rw||{})["' + cid + '"]!==undefined') === true, '(11) hak isteği açıldı');
    a.R('adsAgeClear();'); await tick();
    fake.finishPrepare(); await tick(); await tick();
    ok(fake.stat.shows === 0, '(11) gösterim başlatılmadı');
    ok(a.R('S.cash') === cash0, '(11) para değişmedi');
    ok(a.R('(PREFS.rw||{})["' + cid + '"]===undefined') === true, '(11) istek kaydı iade edildi');
    ok(a.R('rwCanClaim()') === true, '(11) günün hakkı yanmadı');
  }

  /* (12) KAZANILMIŞ ÖDÜL — gösterim sürerken beyan silinse bile doğru gösterime
          ait ödül teslim ediliyor. Kapı BAŞLATMAYI bağlıyor, teslimatı değil. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    const fake = fakeAdMobAged(a, {});
    await a.R('adsInit()');
    const cash0 = a.R('S.cash');
    a.R('adsWatch();'); await tick(); await tick();
    ok(fake.stat.shows === 1, '(12) gösterim başladı');
    a.R('adsAgeClear();'); await tick();
    fake.reward(); await tick(); await tick(); await tick();
    await a.R('saveDrain()');
    ok(a.R('S.cash') === cash0 + a.R('RW.amount'), '(12) ödül yazıldı');
    ok(a.R('Object.keys((S.rw||{}).n||{}).length') === 1, '(12) gün ödenmiş işaretlendi');
    ok(a.R('rwCanClaim()') === false, '(12) günün hakkı kullanıldı');
    ok(a.R('adsRowState()') === 'age', '(12) buna rağmen kapı kapalı');
  }

  /* (13) GİZLİLİK ERİŞİMİ SOĞUK AÇILIŞTA — beyan silindikten ve uygulama
          yeniden açıldıktan sonra da verilmiş rızayı yönetme yolu açık.
          Kalıcı iz YALNIZ giriş noktasına dair ipucu; rıza kopyası değil. */
  {
    const disk = newDisk(), ls = {};
    const a = session(disk, ls, {});
    await a.booted; await careerIn(a, 1);
    fakeAdMobAged(a, { consent: REQ_PORS });
    await a.R('adsInit()');
    ok(a.R('adsPrivacyState()') === 'go', '(13) ilk oturumda gizlilik girişi var');
    ok(a.R('PREFS.adPors') === 1, '(13) kalıcı ipucu yazıldı');
    a.R('adsAgeClear();'); await tick();

    const b = session(disk, ls, {});                     // YENİDEN AÇILIŞ
    await b.booted;
    const fb = fakeAdMob(b.ctx, { consent: REQ_PORS });
    ok(await b.R('adsInit()') === 'noage', '(13) yeni oturumda kapı kapalı');
    ok(fb.stat.asks === 0, '(13) açılışta izin okuması yapılmadı');
    ok(b.R("ADS.pors") === 'UNKNOWN', '(13) bellekte okuma yok');
    ok(b.R('adsPrivacyState()') === 'go', '(13) gizlilik girişi yine de görünüyor');
    ok(b.R("VIEWS.settings().indexOf('adsPrivacy()')") !== -1, '(13) Ayarlar\'da satır var');
    /* Kullanıcı dokunuşu: gerekli güncel okuma BU yolda yapılıyor, açılışta değil. */
    await b.R('adsPrivacy()'); await tick(); await tick();
    /* İki okuma: soğuk açılış ön okuması + formdan sonraki zorunlu yenileme
       (showPrivacyOptionsForm yük döndürmüyor). İkisi de bu KULLANICI yolunda. */
    ok(fb.stat.asks === 2, '(13) güncel okuma kullanıcı yolunda yapıldı');
    ok(fb.stat.order[0] === 'ask' && fb.stat.order[1] === 'priv',
       '(13) önce okuma, sonra form');
    ok(fb.stat.privs === 1, '(13) gizlilik formu açıldı');
    ok(fb.stat.inits === 0, '(13) bu yol reklam SDK\'sını başlatmadı');
    ok(b.R('ADS.sdk') === 'off', '(13) SDK kapalı kaldı');
    ok(b.R("JSON.stringify(PREFS).indexOf('canRequestAds')") === -1
       && b.R("JSON.stringify(PREFS).indexOf('OBTAINED')") === -1,
       '(13) kalıcı izde rıza kopyası yok');
  }

  /* (14) İZ YALNIZ AÇIK SONUÇLA KALKIYOR — hata ve çevrimdışılık silmiyor,
          hata metni ayrıştırılmıyor; NOT_REQUIRED okuması siliyor. */
  {
    const disk = newDisk(), ls = {};
    const a = session(disk, ls, {});
    await a.booted; await careerIn(a, 1);
    const fake = fakeAdMobAged(a, { consent: REQ_PORS });
    await a.R('adsInit()');
    ok(a.R('PREFS.adPors') === 1, '(14) iz var');
    a.R('adsAgeClear();'); await tick();
    /* Bu oturumda okuma VAR, dolayısıyla ön okumaya gerek yok ve form deneniyor.
       Formdan sonraki zorunlu yenileme düşüyor: uygunluk bayatlıyor ama iz
       DURUYOR — hata "artık gerekli değil" demek değil. */
    fake.setAskFail(true);
    await a.R('adsPrivacy()'); await tick(); await tick();
    ok(fake.stat.privs === 1, '(14) form denendi');
    ok(a.R('ADS.stale') === true, '(14) düşen yenileme uygunluğu bayatlattı');
    ok(a.R('PREFS.adPors') === 1, '(14) okuma hatası izi silmedi');
    ok(a.R('adsPrivacyState()') === 'go', '(14) toparlanma yolu duruyor');
    fake.setAskFail(false);
    fake.setConsent({ privacyOptionsRequirementStatus: 'NOT_REQUIRED' });
    await a.R('adsPrivacy()'); await tick(); await tick();
    ok(a.R('PREFS.adPors===undefined') === true, '(14) açık NOT_REQUIRED sonucu izi kaldırdı');
    ok(a.R('adsPrivacyState()') === null, '(14) satır kalktı');
  }

  /* (14b) SOĞUK AÇILIŞTA ÖN OKUMA DÜŞERSE — form HİÇ denenmiyor (güncel bilgi
           olmadan çalışmaz) ve iz yine silinmiyor. */
  {
    const disk = newDisk(), ls = {};
    const a = session(disk, ls, {});
    await a.booted; await careerIn(a, 1);
    fakeAdMobAged(a, { consent: REQ_PORS });
    await a.R('adsInit()');
    a.R('adsAgeClear();'); await tick();

    const b = session(disk, ls, {});                     // YENİDEN AÇILIŞ
    await b.booted;
    const fb = fakeAdMob(b.ctx, { consent: REQ_PORS, askFail: true });
    ok(b.R('adsPrivacyState()') === 'go', '(14b) iz sayesinde satır var');
    await b.R('adsPrivacy()'); await tick(); await tick();
    ok(fb.stat.asks === 1, '(14b) tek ön okuma denendi');
    ok(fb.stat.privs === 0, '(14b) güncel bilgi olmadan form denenmedi');
    ok(b.R('PREFS.adPors') === 1, '(14b) çevrimdışı/hata izi silmedi');
    ok(b.R('adsPrivacyState()') === 'go', '(14b) satır duruyor');
    ok(fb.stat.inits === 0 && b.R('ADS.sdk') === 'off', '(14b) reklam başlatılmadı');
  }

  /* (15) KARİYER SİLMEK BEYANI SİLMİYOR — beyan cihaza ait, kariyere değil. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    fakeAdMob(a.ctx);
    a.R('adsAgeSet("' + AD_Y_OK + '");'); await tick();
    a.R('deleteSlot(1);'); await a.R('saveDrain()');
    ok(a.R('adsBirthYear()') === AD_Y_OK, '(15) beyan yerinde');
    ok(a.R('adsAgeOk()') === true, '(15) kapı hâlâ açık');
  }

  /* (16) AYARLAR — düzeltme ve silme aynı yerde; beyan yokken silme satırı yok. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    fakeAdMob(a.ctx);
    ok(a.R("adsAgeRowHtml().indexOf('adsAgeOpen()')") !== -1, '(16) düzeltme yolu var');
    ok(a.R("adsAgeRowHtml().indexOf('adsAgeForget()')") === -1, '(16) beyan yokken silme yok');
    a.R('adsAgeSet("' + AD_Y_OK + '");'); await tick();
    ok(a.R("adsAgeRowHtml().indexOf('adsAgeForget()')") !== -1, '(16) beyan varken silme var');
    ok(a.R("VIEWS.settings().indexOf('adsAgeOpen()')") !== -1, '(16) Ayarlar\'da görünüyor');
    for (const lang of ['tr', 'en']) {
      a.R("L='" + lang + "';");
      const h = a.R('adsAgeRowHtml()+adsPlusHtml()');
      ok(h.indexOf('undefined') === -1 && h.indexOf('[object') === -1,
         '(16) ' + lang + ' metinleri eksiksiz');
    }
    a.R("L='tr';");
  }

  /* (17) BEYAN EKRANI NÖTR — alan boş açılıyor, eşik hiçbir yerde yazmıyor,
          paylaşmadan devam yolu var ve hiçbir şey saklamıyor. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    fakeAdMob(a.ctx);
    for (const lang of ['tr', 'en']) {
      a.R("L='" + lang + "';");
      a.R('adsAgeOpen();');
      const h = a.R("document.getElementById('sheet').innerHTML");
      ok(h.indexOf('value=') === -1, '(17) ' + lang + ' alan önceden doldurulmamış');
      ok(h.indexOf(String(a.R('AD_AGE_MIN'))) === -1, '(17) ' + lang + ' eşik yazılmıyor');
      ok(h.indexOf('adsAgeSkip') !== -1 || h.indexOf(a.R("t('adAgeSkip')")) !== -1,
         '(17) ' + lang + ' paylaşmadan devam yolu var');
      a.R('closeModal();');
    }
    a.R("L='tr';");
    ok(a.R('PREFS.adBY===undefined') === true, '(17) ekranı açmak/atlamak bir şey saklamadı');
    ok(a.R('adsAgeState()') === 'ask', '(17) durum değişmedi');
  }

  /* ===== (18)–(22) YARIDA KALAN AKIŞIN TOPARLANMASI =====
     Ortak kurgu: açılış okuması GERÇEKTEN ertelenmiş bir promise üzerinde
     tutuluyor (askHold) ve beyan tam o pencerede değişiyor. Eski zincir kendi
     kilidini bıraktıktan sonra, güncel beyan uygunsa ve gerekli izin akışı
     tamamlanmamışsa TEK bir yeni tur açılmalı.

     Senaryo yükü bilerek "izin gerçekten gerekli" hâli: açılış okuması
     canRequestAds:false diyor, formdan sonra true dönüyor. Form hiç çağrılmazsa
     uygunluk kurulamaz, SDK açılmaz ve satır sessizce kaybolur — kaybın somut
     görüldüğü yer burası. */
  const AGE_REQ = { canRequestAds: false, status: 'REQUIRED', isConsentFormAvailable: true,
                    privacyOptionsRequirementStatus: 'REQUIRED' };
  const AGE_FORM_OK = { canRequestAds: true, status: 'OBTAINED' };
  const settle = async n => { for (let i = 0; i < (n || 8); i++) await tick(); };

  /* (18) UYGUN BEYAN → BAŞKA UYGUN BEYAN, okuma uçuştayken.
          Yazım hatasını düzeltmek gerçekçi tetik: iki yıl da eşiği geçtiği için
          kapı hiç kapanmıyor, yalnız ageSeq artıyor. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    a.R('setPref("adBY",' + AD_Y_OK + ');');
    const fake = fakeAdMob(a.ctx, { askHold: true, consent: AGE_REQ, formConsent: AGE_FORM_OK });
    a.R('adsInit();'); await tick();
    ok(fake.stat.asks === 1 && fake.stat.forms === 0, '(18) açılış okuması uçuşta, form yok');
    a.R('adsAgeSet("' + (AD_Y_OK - 5) + '");'); await settle(3);
    ok(fake.stat.asks === 1, '(18) eski zincir uçuştayken ikinci tur AÇILMADI');
    ok(a.R("ADS.busy==='consent'") === true, '(18) kilit hâlâ eski zincirde');
    fake.finishAsk(); await settle();
    ok(fake.stat.asks === 2, '(18) eski zincir bitince tam bir yeni okuma yapıldı');
    ok(fake.stat.forms === 1, '(18) izin formu gerektiği için çağrıldı');
    ok(fake.stat.inits === 1, '(18) initialize bir kez');
    ok(fake.bound('onRewardedVideoAdDismissed') === 1, '(18) dinleyici çoğalmadı');
    ok(a.R('ADS.boot') === true, '(18) yeni akış TAMAMLANDI');
    ok(a.R("ADS.cs.src") === 'form', '(18) karar formun döndürdüğü taze değere dayanıyor');
    ok(a.R('adsEligible()') === true && a.R('ADS.sdk') === 'on', '(18) uygunluk kuruldu, SDK açıldı');
    ok(a.R('adsRowState()') === 'go', '(18) ödül satırı açıldı');
    ok(a.R("ADS.busy===''") === true && a.R('ADS.cp===null') === true, '(18) kilit bırakıldı');
  }

  /* (19) SİL → UYGUN BEYAN, okuma uçuştayken. Kapı arada gerçekten kapanıyor. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    a.R('setPref("adBY",' + AD_Y_OK + ');');
    const fake = fakeAdMob(a.ctx, { askHold: true, consent: AGE_REQ, formConsent: AGE_FORM_OK });
    a.R('adsInit();'); await tick();
    a.R('adsAgeClear();'); await tick();
    ok(a.R('adsAgeOk()') === false, '(19) kapı arada kapandı');
    a.R('adsAgeSet("' + AD_Y_OK + '");'); await settle(3);
    ok(fake.stat.asks === 1, '(19) eski zincir uçuştayken ikinci tur AÇILMADI');
    fake.finishAsk(); await settle();
    ok(fake.stat.asks === 2 && fake.stat.forms === 1 && fake.stat.inits === 1,
       '(19) eski zincir bitince yeni akış baştan koştu');
    ok(a.R('ADS.boot') === true && a.R('adsRowState()') === 'go', '(19) akış tamamlandı, satır açıldı');
    ok(fake.bound('onRewardedVideoAdFailedToShow') === 1, '(19) dinleyici çoğalmadı');
  }

  /* (20) AYNI BEKLEYEN SÖZE BİRDEN ÇOK adsInit KATILIRSA tek tur açılıyor. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    a.R('setPref("adBY",' + AD_Y_OK + ');');
    const fake = fakeAdMob(a.ctx, { askHold: true, consent: AGE_REQ, formConsent: AGE_FORM_OK });
    a.R('adsInit();adsInit();adsInit();'); await tick();
    ok(fake.stat.asks === 1, '(20) üç çağrı tek okuma');
    a.R('adsAgeSet("' + (AD_Y_OK - 5) + '");'); await tick();
    a.R('adsInit();adsInit();'); await settle(3);
    fake.finishAsk(); await settle();
    ok(fake.stat.asks === 2, '(20) beş bekleyen çağrıdan TEK yeni okuma doğdu');
    ok(fake.stat.forms === 1, '(20) tek form denemesi');
    ok(fake.stat.inits === 1, '(20) tek initialize');
    ok(fake.bound('onRewardedVideoAdDismissed') === 1, '(20) tek dinleyici');
    ok(await a.R('adsInit()') === 'ready' && fake.stat.asks === 2,
       '(20) akış tamamlandıktan sonraki çağrı yeni tur açmıyor');
  }

  /* (21) KULLANICI KAPIYI YENİDEN KAPATTIYSA yeni tur YOK. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    a.R('setPref("adBY",' + AD_Y_OK + ');');
    const fake = fakeAdMob(a.ctx, { askHold: true, consent: AGE_REQ, formConsent: AGE_FORM_OK });
    a.R('adsInit();'); await tick();
    a.R('adsAgeSet("' + (AD_Y_OK - 5) + '");'); await tick();   // hâlâ uygun
    a.R('adsAgeClear();'); await tick();                        // ama sonra silindi
    fake.finishAsk(); await settle();
    ok(fake.stat.asks === 1, '(21) kapı kapalıyken yeni okuma yapılmadı');
    ok(fake.stat.forms === 0 && fake.stat.inits === 0, '(21) form ve initialize yok');
    ok(a.R("ADS.sdk!=='on'") === true, '(21) SDK açılmadı');
    ok(a.R('ADS.boot') === false, '(21) akış tamamlanmış sayılmadı');
    ok(a.R('adsRowState()') === 'age', '(21) satır beyan istiyor');
    ok(a.R("ADS.busy===''") === true && a.R('ADS.cp===null') === true, '(21) kilit bırakıldı');
  }

  /* (22) TOPARLANMA BİR YENİDEN DENEME DÖNGÜSÜ DEĞİL — yeni turun okuması
          düşerse akış TAMAMLANMIŞ sayılıyor ve kendiliğinden tekrar denenmiyor. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    a.R('setPref("adBY",' + AD_Y_OK + ');');
    const fake = fakeAdMob(a.ctx, { askHold: true, consent: AGE_REQ, formConsent: AGE_FORM_OK });
    a.R('adsInit();'); await tick();
    a.R('adsAgeSet("' + (AD_Y_OK - 5) + '");'); await tick();
    fake.setAskFail(true);                     // yeni turun okuması ağ yüzünden düşüyor
    fake.finishAsk(); await settle(12);
    ok(fake.stat.asks === 2, '(22) yeni tur tek okuma denedi');
    ok(fake.stat.forms === 0, '(22) okuma düştüğü için form denenmedi');
    ok(a.R('ADS.boot') === true, '(22) ağ hatası akışı TAMAMLANMIŞ sayıyor');
    ok(a.R('adsEligible()') === false, '(22) uygunluk kurulmadı');
    await settle(12);
    ok(fake.stat.asks === 2, '(22) kendiliğinden yeniden denenmedi');
    ok(await a.R('adsInit()') === 'noconsent' && fake.stat.asks === 2,
       '(22) sonraki adsInit de yeni tur açmıyor');
    a.R('adsAgeSet("' + (AD_Y_OK - 6) + '");'); await settle();
    ok(fake.stat.asks === 2, '(22) beyan değişikliği de döngü başlatmıyor');
  }

  /* (23) FORM REDDİNDEN ÖNCEKİ KAPI — form ekrandayken beyan silinirse, reklam
          amaçlı zincir YENİ bir requestConsentInfo başlatmıyor. Atlanan yenileme
          eski canRequestAds kopyasını yetki hâline getirmiyor: uygunluk bayat
          işaretleniyor ve sonraki uygun beyan GÜNCEL akıştan geçiyor. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    const fake = fakeAdMobAged(a, { formHold: true, consent: REQ_PORS });
    a.R('adsInit();'); await settle(3);
    ok(fake.stat.asks === 1 && fake.stat.forms === 1, '(23) açılış okuması bitti, form ekranda');
    ok(a.R('ADS.cs.can') === true, '(23) açılış okuması true idi');
    a.R('adsAgeClear();'); await tick();
    fake.failForm(); await settle();
    ok(fake.stat.asks === 1, '(23) kapı kapalıyken yeni izin okuması BAŞLATILMADI');
    ok(a.R('ADS.stale') === true, '(23) atlanan yenileme uygunluğu bayat bıraktı');
    ok(a.R('adsEligible()') === false, '(23) eski rıza kopyası reklam yetkisi sayılmıyor');
    ok(a.R('ADS.boot') === false, '(23) akış tamamlanmış sayılmadı');
    ok(fake.stat.inits === 0 && a.R("ADS.sdk!=='on'") === true, '(23) SDK başlatılmadı');
    ok(a.R("ADS.busy===''") === true && a.R('ADS.cp===null') === true, '(23) kilit bırakıldı');
    /* Kullanıcının kendi açtığı gizlilik yönetimi yolu kapı kapalıyken ÇALIŞIYOR. */
    ok(a.R('adsPrivacyState()') === 'go', '(23) gizlilik yolu açık kaldı');
    await a.R('adsPrivacy()'); await settle();
    ok(fake.stat.privs === 1, '(23) gizlilik formu kapı kapalıyken açıldı');
    ok(fake.stat.inits === 0, '(23) gizlilik yolu reklam SDK\'sını başlatmadı');
    /* Sonraki uygun beyan taze bir izin akışından geçiyor. */
    const asks0 = fake.stat.asks, forms0 = fake.stat.forms;
    a.R('adsAgeSet("' + AD_Y_OK + '");'); await settle();
    ok(fake.stat.asks === asks0 + 1 && fake.stat.forms === forms0 + 1,
       '(23) yeniden uygun beyanda güncel izin akışı koştu');
    ok(a.R('ADS.stale') === false && a.R('adsEligible()') === true,
       '(23) uygunluk taze okumadan kuruldu');
    ok(a.R('ADS.boot') === true && a.R('adsRowState()') === 'go', '(23) satır açıldı');
  }

  /* (24) İLK BEYANDAN SONRA ÇİZİLMİŞ EKRAN — native cevap BEKLETİLİRKEN
          arayüz güncel durumu göstermeli. Bu senaryo bilerek adsRowState()
          dönüşüne değil, gerçekten çizilmiş #view içeriğine bakıyor: eksik bir
          yeniden çizim durumu doğru, ekranı yanlış bırakır. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    const fake = fakeAdMob(a.ctx, { askHold: true, consent: AGE_REQ, formConsent: AGE_FORM_OK });
    a.R("navTo('dash');");
    const h0 = a.R("document.getElementById('view').innerHTML");
    /* Çizilen düğme durumunu data-ad ile taşıyor: metni her durumda "+"
       olduğu için yeniden çizimin gerçekten olduğunu gösteren tek işaret o. */
    ok(h0.indexOf('data-ad="age"') !== -1 && h0.indexOf('adsRewardOpen()') !== -1,
       '(24) başlangıçta çizilen düğme beyan bekliyor');
    /* Gerçek kullanıcı yolu: + → beyan ekranı → alan → Kaydet. */
    a.R('adsRewardOpen();');
    ok(a.R("document.getElementById('modal').classList.contains('open')") === true,
       '(24) beyan ekranı açıldı');
    a.R("document.getElementById('adAgeInp').value='" + AD_Y_OK + "';");
    a.R('adsAgeSubmit();');
    ok(a.R('adsBirthYear()') === AD_Y_OK, '(24) beyan yazıldı');
    ok(a.R("document.getElementById('modal').classList.contains('open')") === false,
       '(24) beyan ekranı kapandı');
    /* Native cevap HÂLÂ bekletiliyor. */
    ok(fake.stat.asks === 1 && a.R("ADS.sdk!=='on'") === true, '(24) native cevap hâlâ bekliyor');
    const h1 = a.R("document.getElementById('view').innerHTML");
    ok(h1.indexOf('data-ad="age"') === -1, '(24) eski "beyan bekleniyor" hâli ekranda kalmadı');
    ok(h1.indexOf('data-ad="go"') === -1, '(24) tutulamayacak bir reklam sözü de çizilmedi');
    ok(h1.indexOf('undefined') === -1 && h1.indexOf('[object') === -1, '(24) ekran bozulmadı');
    /* Tek dokunuş tek işlem: ikinci bir izin turu ya da çift beyan yazımı yok. */
    ok(fake.stat.asks === 1 && fake.stat.forms === 0, '(24) çift işlem başlamadı');
    fake.finishAsk(); await settle();
    const h2 = a.R("document.getElementById('view').innerHTML");
    ok(h2.indexOf('data-ad="go"') !== -1, '(24) akış bitince ödül düğmesi açık çizildi');
    ok(a.R('adsRowState()') === 'go', '(24) durum da açık');
  }

  /* (25) KAZANILMIŞ ÖDÜLE YAŞ VETOSU EKLENMEDİ — (12) teslimatı ölçüyor, bu
          senaryo teslimat yolunda yaş/yaş-seq okuyan bir dal OLMADIĞINI
          ölçüyor: beyan silinmiş ve ageSeq ilerlemişken gelen ödül tam ödeniyor. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    const fake = fakeAdMobAged(a, {});
    await a.R('adsInit()');
    const cash0 = a.R('S.cash');
    a.R('adsWatch();'); await settle(3);
    const seq0 = a.R('ADS.ageSeq');
    a.R('adsAgeClear();'); a.R('adsAgeSet("' + AD_Y_UNDER + '");'); await tick();
    ok(a.R('ADS.ageSeq') > seq0 && a.R('adsAgeOk()') === false,
       '(25) ödül gelmeden önce kapı kapandı ve ageSeq ilerledi');
    fake.reward(); await settle();
    await a.R('saveDrain()');
    ok(a.R('S.cash') === cash0 + a.R('RW.amount'), '(25) ödül tam ödendi');
    ok(a.R('rwCanClaim()') === false, '(25) günün hakkı kullanılmış işaretlendi');
    ok(a.R("ADS.lastRw==='delivered'") === true, '(25) teslimat kaydı yazıldı');
  }
}


/* ================= [21] GİZLİLİK FORMU GERİ BİLDİRİMİ + TEST YAPILANDIRMASI =====
   İki ayrı sözleşme:

   (a) Gizlilik seçenekleri formu açılamazsa kullanıcı bunu GÖRMELİ. Cihazda
       ölçülen hâl, soğuk açılışta eklentinin "form henüz yükleniyor" diye
       reddetmesiydi; kod doğru davranıyor ama dokunuş sessiz kalıyordu.
       Ölçülen: bildirim çizildi mi, ham SDK metni sızdı mı, zorunlu yeniden
       okuma yine koştu mu, kilit bırakıldı mı, ikinci deneme çalışıyor mu,
       başarılı kapanışta yanlışlıkla hata çıkıyor mu.

   (b) EEA test coğrafyası YALNIZ Android debug varlıklarında olmalı. Bu blok
       dosyaları okuyup bakıyor; Gradle'ın birleştirme çıktısı ayrı bir ölçüm ve
       burada tekrarlanmıyor. */
async function tPrivacyFeedback() {
  console.log('\n[21] gizlilik formu geri bildirimi ve test yapılandırmasının kapsamı');

  const settle = async n => { for (let i = 0; i < (n || 8); i++) await tick(); };
  const T = (a, k) => a.R("t('" + k + "')");
  const toastOf = a => a.R("document.getElementById('toast').textContent");
  const clearToast = a => a.R("document.getElementById('toast').textContent='';");

  /* (1) FORM REDDİ — bildirim çıkıyor, ham metin sızmıyor, kilit bırakılıyor,
         ikinci deneme çalışıyor ve başarılı kapanışta hata GÖSTERİLMİYOR. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    const fake = fakeAdMobAged(a, { consent: REQ_PORS, privFail: true });
    await a.R('adsInit()');
    const asks0 = fake.stat.asks;
    clearToast(a);
    await a.R('adsPrivacy()'); await settle();
    ok(toastOf(a) === T(a, 'adPrivacyRetry'), '(1) kullanıcıya bildirim çizildi', toastOf(a));
    ok(toastOf(a).indexOf('Privacy options form') === -1
       && toastOf(a).indexOf('being loading') === -1, '(1) ham SDK metni gösterilmedi');
    ok(fake.stat.privs === 1, '(1) form bir kez denendi');
    ok(fake.stat.asks === asks0 + 1, '(1) ret sonrası zorunlu yeniden okuma yine koştu');
    ok(a.R("ADS.busy===''") === true && a.R('adsBusy()') === '', '(1) kilit bırakıldı');
    ok(a.R('adsPrivacyState()') === 'go', '(1) satır duruyor — yeniden denenebilir');
    /* İkinci dokunuş: otomatik değil, çağıran taraf yeniden deniyor. */
    fake.setPrivFail(false);
    clearToast(a);
    await a.R('adsPrivacy()'); await settle();
    ok(fake.stat.privs === 2, '(1) ikinci deneme formu açtı');
    ok(toastOf(a) === '', '(1) başarılı kapanışta hata gösterilmedi');
    ok(a.R("ADS.cs.src") === 'privacy', '(1) başarı yolunda zorunlu yenileme koştu');
  }

  /* (2) OTOMATİK TEKRAR YOK — ret tek denemede kalıyor, kendiliğinden yeniden
         çağrılmıyor ve sabit bir bekleme kurulmuyor. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    const fake = fakeAdMobAged(a, { consent: REQ_PORS, privFail: true });
    await a.R('adsInit()');
    await a.R('adsPrivacy()'); await settle(20);
    ok(fake.stat.privs === 1, '(2) form kendiliğinden yeniden denenmedi');
    const asks1 = fake.stat.asks;
    await settle(20);
    ok(fake.stat.privs === 1 && fake.stat.asks === asks1, '(2) beklemede yeni çağrı doğmadı');
  }

  /* (3) YAŞ KAPALIYKEN — bildirim çıkıyor ama reklam yolu BAŞLAMIYOR.
         Cihazda ölçülen sıralamanın aynısı: ipucu yazılmış, beyan silinmiş,
         uygulama yeniden açılmış. */
  {
    const disk = newDisk(), ls = {};
    const a = session(disk, ls, {});
    await a.booted; await careerIn(a, 1);
    fakeAdMobAged(a, { consent: REQ_PORS });
    await a.R('adsInit()');
    a.R('adsAgeClear();'); await tick();

    const b = session(disk, ls, {});                 // YENİDEN AÇILIŞ
    await b.booted;
    const fb = fakeAdMob(b.ctx, { consent: REQ_PORS, privFail: true });
    ok(await b.R('adsInit()') === 'noage', '(3) kapı kapalı');
    ok(b.R('adsPrivacyState()') === 'go', '(3) gizlilik yolu açık');
    clearToast(b);
    await b.R('adsPrivacy()'); await settle();
    ok(toastOf(b) === T(b, 'adPrivacyRetry'), '(3) kapı kapalıyken de bildirim çizildi');
    ok(fb.stat.inits === 0 && fb.stat.prepares === 0 && fb.stat.shows === 0,
       '(3) reklam yolu BAŞLAMADI');
    ok(b.R("ADS.sdk") === 'off', '(3) SDK kapalı kaldı');
    ok(b.R('adsAgeOk()') === false, '(3) yaş kapısı kapalı');
    ok(b.R("ADS.busy===''") === true, '(3) kilit bırakıldı');
    ok(b.R('adsPrivacyState()') === 'go', '(3) yeniden denenebilir');
  }

  /* (4) İKİ DİL — dize her iki dilde var ve birbirinden farklı. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted;
    ok(a.R("['tr','en'].every(l=>typeof STR[l].adPrivacyRetry==='string'&&STR[l].adPrivacyRetry.length>10)") === true,
       '(4) adPrivacyRetry iki dilde de var');
    ok(a.R("STR.tr.adPrivacyRetry!==STR.en.adPrivacyRetry") === true, '(4) çeviri kopyalanmamış');
    ok(a.R("STR.tr.adPrivacyRetry!==STR.tr.adPrivacyFail") === true,
       '(4) bağlantı hatasından AYRI bir dize (biri bağlantıyı, diğeri zamanı işaret ediyor)');
  }

  /* (5) İZİN SORGUSUNA GEÇEN SEÇENEK — depodaki yapılandırmayla BOŞ. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    const fake = fakeAdMobAged(a, {});
    ok(a.R('ADS_TESTCFG') === null, '(5) depodaki test yapılandırması null');
    ok(a.R('JSON.stringify(adsTestOpts())') === '{}', '(5) adsTestOpts boş nesne veriyor');
    await a.R('adsInit()');
    ok(fake.stat.askOpts.length > 0 && JSON.stringify(fake.stat.askOpts[0]) === '{}',
       '(5) köprüye boş seçenek gitti', JSON.stringify(fake.stat.askOpts[0]));
  }

  /* (6) SIZINTI KONTROLÜ — EEA yapılandırması yalnız debug varlıklarında.
         Dosya tabanlı; Gradle birleştirme ölçümünün yerine geçmez, onu
         tamamlar: burada kaynakların kendisi denetleniyor. */
  {
    const shipped = fs.readFileSync(path.join(ROOT, 'js', 'ads-testcfg.js'), 'utf8');
    ok(/const ADS_TESTCFG = null;/.test(shipped), '(6) yayın sürümü null');
    ok(!/debugGeography/.test(shipped.replace(/\/\*[\s\S]*?\*\//g, '')),
       '(6) yayın sürümünde kod olarak debugGeography yok (yorum sayılmıyor)');

    const dbg = path.join(ROOT, 'android', 'app', 'src', 'debug', 'assets', 'public', 'js', 'ads-testcfg.js');
    ok(fs.existsSync(dbg), '(6) debug varyant dosyası yerinde');
    ok(/const ADS_TESTCFG = \{ debugGeography: 1 \};/.test(fs.readFileSync(dbg, 'utf8')),
       '(6) debug sürümü EEA veriyor');

    /* Release paketine giden her yol null sürümü taşımalı. */
    const bad = [];
    const scan = rel => {
      const abs = path.join(ROOT, rel);
      if (!fs.existsSync(abs)) return;
      const st = fs.statSync(abs);
      if (st.isDirectory()) { fs.readdirSync(abs).forEach(n => scan(path.join(rel, n))); return; }
      if (!/\.(js|html)$/.test(abs)) return;
      const txt = fs.readFileSync(abs, 'utf8');
      const m = txt.match(/const ADS_TESTCFG = ([^;]*);/);
      if (m && m[1].trim() !== 'null') bad.push(rel + ' → ' + m[1].trim());
    };
    ['android/app/src/main', 'android/app/src/release', 'www', 'dist', 'js'].forEach(scan);
    ok(bad.length === 0, '(6) release yollarında EEA yapılandırması yok', bad.join(' | '));

    /* adsTestOpts yalnız debugGeography geçirebilsin: rıza kararına dokunan
       alanlar fonksiyonun kaynağında hiç geçmemeli. */
    const src = fs.readFileSync(path.join(ROOT, 'js', 'ads.js'), 'utf8');
    const fn = src.slice(src.indexOf('function adsTestOpts'), src.indexOf('function adsAsk'));
    ok(fn.length > 40, '(6) adsTestOpts bulundu');
    ok(!/tagForUnderAgeOfConsent|testDeviceIdentifiers|canRequestAds/.test(fn),
       '(6) yalnız debugGeography — rıza/test-cihazı alanı geçmiyor');
  }
}

/* ================= [22] SEZON GEÇİŞİ REKLAMI =================
   Ölçülen sözleşme:

   - Geçiş noktaları SEZON MOTORUNDAN geliyor, sabit bir hafta sayısından değil:
     sezon ortası core.js midWeek(), sezon sonu S.week > totalWeeks().
   - Kariyer/sezon başına en fazla BİRER gösterim; işaret kayda save()'den önce
     düşüyor, bu yüzden yeniden çizim / yeniden yükleme / yeniden açılış aynı
     geçişi ikinci kez üretmiyor.
   - Uygun yaş beyanı ve canRequestAds olmadan ne hazırlama ne gösterim var.
   - Hazır reklam yoksa geçiş BEKLEMİYOR ve o reklam sonradan açılmıyor.
   - Ödüllü reklam / izin formu ile çakışmıyor.
   - Gösterimin kapanışı ya da hatası sezon ilerlemesine HİÇ dokunmuyor.

   Taklit, gerçek eklentinin gözlenen davranışını taşıyor: prepareInterstitial
   yüklenince çözülüyor, showInterstitial ise KAPANIŞTA değil gösterim
   başlayınca. Neyin gerçekten reklam gösterdiği ancak cihazda ölçülür; burada
   ölçülen şey köprüye hangi çağrının gittiği. */

/* Haftayı geçişin bir öncesine kurup tek bir nextWeek() koşturuyoruz. Yirmi
   haftayı simüle etmenin ölçülen şeye kattığı bir şey yok: test geçiş
   TESPİTİNİ ölçüyor, sezon simülasyonunu değil (o [8]'de). */
async function atMid(a) { a.R('S.week=midWeek()-1;nextWeek();'); await tick(); }
async function atEnd(a) { a.R('S.week=totalWeeks();nextWeek();'); await tick(); }

async function tSeasonBreakAds() {
  console.log('\n[22] sezon geçişi reklamı: iki nokta, birer kez, geçiş beklemiyor');

  /* (1) İKİ GEÇİŞ, İKİ GÖSTERİM — ve ikisi de gerçekten o noktada. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    const fake = fakeAdMobAged(a);
    ok(await a.R('adsInit()') === 'ready', '(1) SDK hazır');
    await tick();
    ok(a.R('ADS.iSt') === 'ready', '(1) geçiş reklamı ÖNCEDEN yüklendi');
    ok(fake.stat.iprepares === 1, '(1) tek hazırlama çağrısı');
    ok(fake.stat.iprepOpts[0].isTesting === true
      && fake.stat.iprepOpts[0].adId === a.R('ADS.iUnit'),
      '(1) Google test birimi ve isTesting:true ile istendi');
    ok(a.R('ADS.iUnit') === 'ca-app-pub-3940256099942544/1033173712',
      '(1) birim Google belgesindeki ÖRNEK interstitial birimi');

    const se = a.R('S.season'), mid = a.R('midWeek()');
    await atMid(a);
    ok(a.R('S.week') === mid, '(1) sezon ortası geçişi gerçekten oldu');
    ok(fake.stat.ishows === 1, '(1) sezon ortasında bir gösterim');
    ok(a.R('S.adb.m') === se, '(1) hak biten sezona işaretlendi');
    ok(a.R("adsBusy()") === 'inter', '(1) gösterim sürerken kilit kapalı');

    fake.emit('interstitialAdDismissed'); await tick();
    ok(a.R('ADS.iSt') === 'ready', '(1) kapanışta kilit açıldı ve sonraki kuruldu');
    ok(fake.stat.iprepares === 2, '(1) bir sonraki geçiş için yeniden yüklendi');

    await atEnd(a);
    ok(a.R('S.season') === se + 1, '(1) sezon gerçekten değişti');
    ok(fake.stat.ishows === 2, '(1) sezon sonunda ikinci gösterim');
    ok(a.R('S.adb.e') === se, '(1) hak BİTEN sezona yazıldı, yenisine değil');
  }

  /* (2) AYNI GEÇİŞ İKİNCİ KEZ REKLAM DOĞURMUYOR — yeniden çizim, aynı noktaya
         yeniden gelme ve yeniden yükleme. */
  {
    const disk = newDisk(), ls = {};
    const a = session(disk, ls, {});
    await a.booted; await careerIn(a, 1);
    const fake = fakeAdMobAged(a);
    await a.R('adsInit()'); await tick();
    const se = a.R('S.season');
    await atMid(a);
    ok(fake.stat.ishows === 1, '(2) ilk geçişte bir gösterim');
    fake.emit('interstitialAdDismissed'); await tick();

    a.R('render();render();');
    ok(fake.stat.ishows === 1, '(2) yeniden çizim reklam doğurmadı');

    /* Aynı sezonda aynı noktaya yeniden gelmek (hangi yolla olursa olsun). */
    await atMid(a);
    ok(fake.stat.ishows === 1, '(2) aynı geçiş ikinci kez reklam doğurmadı');
    ok(a.R("adBreakClaim('m'," + se + ")") === '', '(2) hak yeniden verilmiyor');

    a.R('save();'); await a.R('saveDrain()');
    const b = session(disk, ls, {});
    await b.booted;
    await b.R('loadSlot(1)');
    const fake2 = fakeAdMobAged(b);
    await b.R('adsInit()'); await tick();
    ok(b.R('S.adb.m') === se, '(2) işaret kayıttan geri geldi');
    await atMid(b);
    ok(fake2.stat.ishows === 0, '(2) uygulamayı yeniden açmak da doğurmadı');
  }

  /* (3) HAZIR REKLAM YOKSA GEÇİŞ BEKLEMİYOR — ve o reklam sonradan açılmıyor. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    const fake = fakeAdMobAged(a, { interPrepareHold: true });
    await a.R('adsInit()'); await tick();
    ok(a.R('ADS.iSt') === 'load', '(3) yükleme hâlâ uçuşta');

    const se = a.R('S.season'), mid = a.R('midWeek()');
    await atMid(a);
    ok(a.R('S.week') === mid, '(3) geçiş BEKLEMEDİ, hafta ilerledi');
    ok(fake.stat.ishows === 0, '(3) gösterim yok');
    ok(a.R('S.adb.m') === se, '(3) hak yine de o geçişte yandı');

    fake.finishInterPrepare(); await tick(); await tick();
    ok(a.R('ADS.iSt') === 'ready', '(3) reklam sonradan yüklendi');
    ok(fake.stat.ishows === 0, '(3) GECİKMELİ gösterim olmadı');
    a.R('render();'); await tick();
    ok(fake.stat.ishows === 0, '(3) sonraki çizimlerde de açılmadı');

    await atEnd(a);
    ok(fake.stat.ishows === 1, '(3) yüklü reklam ancak SONRAKİ geçişte gösterildi');
  }

  /* (4) YÜKLEME HATASI DÖNGÜ KURMUYOR. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    const fake = fakeAdMobAged(a, { interLoadFail: true });
    await a.R('adsInit()'); await tick(); await tick();
    ok(a.R('ADS.iSt') === 'off', '(4) yükleme düştü');
    const n0 = fake.stat.iprepares;
    a.R('render();render();render();'); await tick();
    ok(fake.stat.iprepares === n0, '(4) çizim yeniden deneme başlatmadı');
    await atMid(a);
    ok(fake.stat.ishows === 0, '(4) gösterim yok');
    ok(fake.stat.iprepares === n0 + 1, '(4) yalnız geçişin kendisi bir deneme daha açtı');
  }

  /* (5) KAPILAR — yaş beyanı ve canRequestAds. İkisi de AYRI terim. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    const fake = fakeAdMob(a.ctx, {});                 // beyan YOK
    ok(await a.R('adsInit()') === 'noage', '(5) yaş kapısı kapalı');
    await atMid(a); await atEnd(a);
    ok(fake.stat.iprepares === 0 && fake.stat.ishows === 0,
      '(5) beyan yokken ne hazırlama ne gösterim');
  }
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    const fake = fakeAdMobAged(a, { consent: { canRequestAds: false, status: 'REQUIRED' },
                                    formConsent: { canRequestAds: false } });
    await a.R('adsInit()'); await tick();
    ok(a.R('adsEligible()') === false, '(5) canRequestAds false');
    await atMid(a); await atEnd(a);
    ok(fake.stat.iprepares === 0 && fake.stat.ishows === 0,
      '(5) rıza yokken ne hazırlama ne gösterim');
  }

  /* (6) ÇAKIŞMA — ödüllü reklam sürerken geçiş reklamı açılmıyor; geçiş reklamı
         ekrandayken ödüllü reklam ve izin formu başlamıyor. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    const fake = fakeAdMobAged(a, { prepareHold: true });
    await a.R('adsInit()'); await tick();
    a.R('adsWatch();'); await tick();
    ok(a.R('adsBusy()') === 'ad', '(6) ödüllü reklam kilidi kapalı');
    await atMid(a);
    ok(fake.stat.ishows === 0, '(6) geçiş reklamı ödüllü reklamın üstüne açılmadı');
    ok(a.R('ADS.iSt') === 'ready', '(6) yüklü reklam yerinde kaldı');
  }
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    const fake = fakeAdMobAged(a, { consent: { privacyOptionsRequirementStatus: 'REQUIRED' } });
    await a.R('adsInit()'); await tick();
    await atMid(a);
    ok(a.R('ADS.iSt') === 'show' && a.R('adsBusy()') === 'inter', '(6) geçiş reklamı ekranda');
    const shows0 = fake.stat.shows, privs0 = fake.stat.privs;
    a.R('adsWatch();'); await tick();
    ok(fake.stat.shows === shows0, '(6) ödüllü reklam başlamadı');
    await a.R('adsPrivacy()');
    ok(fake.stat.privs === privs0, '(6) gizlilik formu açılmadı');
    ok(a.R('adsRowState()') === 'busy', '(6) ödül düğmesi meşgul görünüyor');
  }

  /* (7) KAPANIŞ VE HATA SEZON İLERLEMESİNE DOKUNMUYOR. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    const fake = fakeAdMobAged(a);
    await a.R('adsInit()'); await tick();
    await atEnd(a);
    ok(fake.stat.ishows === 1, '(7) sezon sonu gösterimi başladı');
    const snap = a.R('JSON.stringify({se:S.season,wk:S.week,tw:S.tw,cash:S.cash,n:S.players.length})');
    fake.emit('interstitialAdDismissed');
    fake.emit('interstitialAdFailedToShow', { code: 3, message: 'x' });
    fake.emit('interstitialAdFailedToLoad', { code: 3, message: 'x' });
    await tick(); await tick();
    ok(a.R('JSON.stringify({se:S.season,wk:S.week,tw:S.tw,cash:S.cash,n:S.players.length})') === snap,
      '(7) kapanış/hata sezonu, haftayı, kasayı ve dünyayı kıpırdatmadı');
    ok(a.R('ADS.iSt') === 'ready', '(7) kilit bir kez açıldı, sonraki kuruldu');
  }

  /* (8) SATIN ALINMIŞ "OTOMATİK REKLAMLARI KALDIR" GEÇİŞ REKLAMINI KAPATIYOR.

         Defter burada ELLE kuruluyor. Üretimde bunu yazan hiçbir kod yolu yok
         ([23] (6) bunu ayrıca tarıyor); bu senaryonun ölçtüğü şey satın almanın
         kendisi değil, OKUMA YERİNİN gerçekten bağlı olduğu. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    a.R("PREFS.iap={t:{'test-token':'noads'}};savePrefs();");
    ok(a.R('iapNoAds()') === true, '(8) defter okundu');
    const fake = fakeAdMobAged(a);
    await a.R('adsInit()'); await tick();
    ok(fake.stat.iprepares === 0, '(8) hazırlama hiç yapılmadı');
    await atMid(a); await atEnd(a);
    ok(fake.stat.ishows === 0, '(8) iki geçişte de gösterim yok');
    /* Ödüllü reklam ETKİLENMİYOR: isteğe bağlı ve karşılığında ödül var. */
    ok(a.R('adsRowState()') === 'go', '(8) ödüllü reklam yolu açık kaldı');
  }

  /* (9) Eski kayıt: S.adb yokken ilk geçiş çalışıyor ve alanı kendisi kuruyor. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    a.R('delete S.adb;');
    const fake = fakeAdMobAged(a);
    await a.R('adsInit()'); await tick();
    ok(a.R('S.adb===undefined') === true, '(9) alan gerçekten yok');
    await atMid(a);
    ok(fake.stat.ishows === 1, '(9) eski kayıtta da geçiş çalıştı');
    ok(a.R('typeof S.adb') === 'object', '(9) alan yokken kuruldu');
  }
}

/* ================= [23] MAĞAZA VE SATIN ALMA KAPSAMI =================
   Ölçülen sözleşme: ürünler GÖRÜNÜR, satın alma KAPALI ve bu gizlenmiyor;
   hiçbir yerel bayrak ücretli hak vermiyor; kapasite kariyer, reklam kaldırma
   cihaz kapsamlı; kariyer başına kapasite tavanı +10; ve kapasite, kariyer
   kayıt yuvasıyla karıştırılmıyor. */
async function tShopAndIap() {
  console.log('\n[23] mağaza: görünür ürünler, kapalı satın alma, kapsam ve tavan');

  /* (1) BUGÜNKÜ HÂL — satın alma kapalı, hiçbir hak verilmiyor. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    /* Akış artık BAĞLI, ama köprüsüz bir ortamda (web/PWA/tek dosya, ve bu
       harness) satın alma yine KAPALI olmak zorunda — koruma kalktı değil,
       yer değiştirdi: eskiden bayrak reddediyordu, şimdi köprünün yokluğu. */
    ok(a.R('IAP.wired') === true, '(1) satın alma akışı bağlı');
    ok(a.R('iapAvailable()') === false, '(1) köprüsüz ortamda satın alma kullanılamıyor');
    ok(a.R('iapWhy()') === 'noplay', '(1) neden: bu cihazda Play köprüsü yok');
    ok(a.R("iapState('cap1')") === 'off', '(1) ürün durumu satın alınamaz');
    ok(a.R("iapBuy('cap1')") === false, '(1) satın alma denemesi reddedildi');
    ok(a.R('iapCap()') === 0 && a.R('iapCapOwned()') === 0, '(1) satın alınmış kapasite yok');
    ok(a.R('iapNoAds()') === false, '(1) reklam kaldırma alınmamış');
    ok(a.R("IAP_PRODUCTS.every(p=>iapState(p.id)!=='go')") === true,
      '(1) hiçbir ürün satın alınabilir durumda değil');
  }

  /* (2) EKRAN — beş ürün görünüyor, satın alma kapalı olduğu YAZIYOR, hiçbir
         satın alma yolu çizilmiyor ve iki dil de eksiksiz. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    for (const lang of ['tr', 'en']) {
      a.R("L='" + lang + "';");
      const h = a.R('VIEWS.shop()');
      ok(h.indexOf('undefined') === -1 && h.indexOf('NaN') === -1 && h.indexOf('[object') === -1,
        '(2) ' + lang + ' ekranda sızıntı yok');
      const miss = a.R("IAP_PRODUCTS.filter(p=>VIEWS.shop().indexOf(t(p.k))===-1).map(p=>p.id).join(',')");
      ok(miss === '', '(2) ' + lang + ' beş ürünün hepsi görünüyor', miss);
      ok(h.indexOf(a.R("t('shopOff')")) !== -1,
        '(2) ' + lang + ' satın almanın kapalı olduğu yazıyor');
      /* Geliştirme açıklaması kullanıcıya GİTMİYOR: ödeme bağlantısı, doğrulama
         ya da "hiçbir hak verilmez" gibi cümleler ekranda olmamalı. */
      ok(!/ödeme bağlantısı|hak verilmez|Billing is not connected|grants anything/i.test(h),
        '(2) ' + lang + ' geliştirme açıklaması ekranda yok');
      ok(h.split(a.R("t('shopOff')")).length - 1 === 1,
        '(2) ' + lang + ' durum cümlesi bir kez yazılıyor');
      ok(h.replace(/on[a-z]+="[^"]*"/g, m => m.indexOf('iapBuy') === -1 ? '' : m).indexOf('iapBuy') === -1,
        '(2) ' + lang + ' hiçbir satın alma yolu çizilmedi');
      ok(h.indexOf('₺') === -1 && h.indexOf('$') === -1 && !/\d+[,.]\d\d\s*€/.test(h),
        '(2) ' + lang + ' fiyat yazılmıyor — Play verecek');
    }
    a.R("L='tr';");
  }

  /* (3) MAĞAZAYI ÇİZMEK HİÇBİR ŞEYE DOKUNMUYOR. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    const s0 = a.R('JSON.stringify(S)'), p0 = a.R('JSON.stringify(PREFS)');
    a.R("pushV('shop');render();VIEWS.shop();");
    a.R("IAP_PRODUCTS.forEach(p=>iapBuy(p.id));");
    ok(a.R('JSON.stringify(S)') === s0, '(3) kariyer kaydı değişmedi');
    ok(a.R('JSON.stringify(PREFS)') === p0, '(3) cihaz tercihleri değişmedi');
    ok(a.R('iapCap()') === 0, '(3) iapBuy hiçbir hak vermedi');
  }

  /* (4) TAVAN — defter fazlasını taşısa bile oyuna giren sayı +10'u aşmıyor. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    a.R("S.iap={t:{a:'cap5',b:'cap3',c:'cap1'}};");
    ok(a.R('iapCapOwned()') === 9, '(4) toplam türetildi');
    ok(a.R('iapCapLeft()') === 1, '(4) kalan hak doğru');
    a.R("S.iap={t:{a:'cap10',b:'cap10',c:'cap5'}};");
    ok(a.R('iapCapOwned()') === 10, '(4) tavan bağlıyor');
    ok(a.R('iapCapLeft()') === 0, '(4) kalan hak sıfır');
    ok(a.R("iapState('cap1')") === 'full', '(4) tavanda ürün "doldu" diyor');
    const base = a.R("2+Math.floor(S.rep/18)+skillBonus('cap')+agMod('cap')");
    ok(a.R('maxClients()') === base + 10, '(4) kapasite formüle TEK toplama olarak giriyor');
    a.R('delete S.iap;');
    ok(a.R('maxClients()') === base, '(4) defter yokken eski sonuç');
  }

  /* (5) KAPSAM — kariyer defteri reklam kapatmıyor, cihaz defteri kapasite
         vermiyor. İkisi ayrı kutu ve karışmıyorlar. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    a.R("S.iap={t:{x:'noads'}};PREFS.iap={t:{y:'cap10'}};savePrefs();");
    ok(a.R('iapNoAds()') === false, '(5) kariyer defterindeki noads cihazı kapatmıyor');
    ok(a.R('iapCapOwned()') === 0, '(5) cihaz defterindeki kapasite kariyere geçmiyor');
    a.R("S.iap={t:{x:'cap3'}};PREFS.iap={t:{y:'noads'}};savePrefs();");
    ok(a.R('iapCapOwned()') === 3 && a.R('iapNoAds()') === true, '(5) doğru kutular okunuyor');
    /* Kariyer kapsamı gerçekten KARİYERE ait: ikinci kariyerde yok. */
    await careerIn(a, 2);
    ok(a.R('iapCapOwned()') === 0, '(5) diğer kariyerde kapasite yok');
    ok(a.R('iapNoAds()') === true, '(5) cihaz kapsamı bütün kariyerlerde');
  }

  /* (6) SIZINTI TARAMASI — daraltıldı, kaldırılmadı. Eskiden "hiçbir dosya
         deftere yazmıyor"du; artık teslimat yolu var, ama o yol TEK ve yalnız
         js/iap.js'te. Başka bir dosyadan gelen bir yazım hâlâ hata. */
  {
    const bad = [];
    for (const f of FILES) {
      if (f === 'iap') continue;                 // teslimat yolunun kendi dosyası
      const txt = fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      if (/\bS\.iap\s*=/.test(txt)) bad.push(f + ': S.iap yazımı');
      if (/PREFS\.iap\s*=/.test(txt)) bad.push(f + ': PREFS.iap yazımı');
      if (/\.iap\.t\s*\[[^\]]*\]\s*=/.test(txt)) bad.push(f + ': deftere token yazımı');
    }
    ok(bad.length === 0, '(6) iap.js dışında hiçbir dosya defteri yazmıyor', bad.join(' | '));
    const iap = fs.readFileSync(path.join(ROOT, 'js', 'iap.js'), 'utf8');
    const iapc = iap.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    /* Eklentinin restorePurchases() yolu autoAcknowledge bayrağına BAKMADAN
       acknowledge ediyor (8.7.0 kaynağı) — teslimattan önce kapatmak olurdu.
       Çağrılmadığı burada tutuluyor, yoksa bir gün "geri yükleme" diye eklenir. */
    ok(!/restorePurchases/.test(iapc), '(6) eklentinin restorePurchases yolu kullanılmıyor');
    /* Satın alma çağrısı her iki otomatik bitirmeyi de KAPATIYOR. */
    ok(/isConsumable:\s*false/.test(iapc), '(6) isConsumable kapalı');
    ok(/autoAcknowledgePurchases:\s*false/.test(iapc), '(6) otomatik acknowledge kapalı');
    /* Deftere yazan tek fonksiyon iapApplyTo / iapDeliverDevice; consume/ack
       yalnız iapFinish içinde. İkisinin birbirine karışmadığı: iapFinish
       teslimattan SONRA çağrılıyor (iapAfterDeliver) ve kendisi defter yazmıyor. */
    const fin = iapc.slice(iapc.indexOf('function iapFinish'));
    ok(!/\.iap\.t\s*\[/.test(fin.slice(0, 900)), '(6) kapanış adımı defter yazmıyor');
    ok(!/ADS_TESTCFG|debugGeography/.test(iap), '(6) mağaza reklam yapılandırmasına karışmıyor');
  }

  /* (7) KAPASİTE ≠ KAYIT YUVASI. Ürünler müşteri kapasitesini büyütüyor, yuva
         sayısı sabit üç kalıyor. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    ok(a.R('SLOTS') === 3, '(7) üç kayıt yuvası');
    a.R("S.iap={t:{a:'cap10'}};");
    ok(a.R('SLOTS') === 3, '(7) kapasite ürünü yuva sayısını değiştirmedi');
    ok(a.R('iapCapOwned()') === 10, '(7) değiştirdiği şey müşteri kapasitesi');
    ok(a.R("IAP_PRODUCTS.filter(p=>p.cap).map(p=>p.cap).join(',')") === '1,3,5,10',
      '(7) paketler +1/+3/+5/+10');
    ok(a.R('IAP.capMax') === 10, '(7) kariyer başına tavan +10');
  }

  /* (8) KAPSAM METİNLERİ — her ürün hangi kutuya işlendiğini EKRANDA söylüyor. */
  {
    const a = session(newDisk(), {}, {});
    await a.booted; await careerIn(a, 1);
    for (const lang of ['tr', 'en']) {
      a.R("L='" + lang + "';");
      const h = a.R('VIEWS.shop()');
      ok(h.indexOf(a.R("t('shopScopeCareer')")) !== -1, '(8) ' + lang + ' kariyer kapsamı yazıyor');
      ok(h.indexOf(a.R("t('shopScopeDevice')")) !== -1, '(8) ' + lang + ' cihaz kapsamı yazıyor');
      ok(h.indexOf(a.R("t('shopCapNote')")) !== -1, '(8) ' + lang + ' kapasite/yuva ayrımı yazıyor');
      ok(h.indexOf(a.R("t('shopScopeCareerSub')")) !== -1,
        '(8) ' + lang + ' kariyer silinince kapasitenin gittiği yazıyor');
      ok(h.indexOf(a.R("t('shopNoAdsKeep')")) !== -1, '(8) ' + lang + ' ödüllü reklamın kaldığı yazıyor');
      ok(h.indexOf(a.R("t('shopCapCeil').replace('{n}',IAP.capMax)")) !== -1,
        '(8) ' + lang + ' tavan yazıyor');
    }
    a.R("L='tr';");
  }
}


/* ================= [24] PLAY BILLING: TESLİMAT SÖZLEŞMESİ =================
   Ölçülen sözleşme, tek cümleyle: PARA ÖDENMİŞ HİÇBİR İŞLEM KAYBOLMAZ ve
   HİÇBİR HAK EKSİK YA DA İKİ KEZ VERİLMEZ.

   Taklit eklenti, SABİTLENEN 8.7.0 paketinin Android kaynağından ve TypeScript
   tanımından çıkarılan alanları döndürüyor — uydurma alan yok, eksik alan yok:

     NativePurchasesPlugin.java, purchaseProduct ve getPurchases yükleri
       transactionId     = purchase.getPurchaseToken()   (Android'de token İLE AYNI)
       productIdentifier = purchase.getProducts().get(0)
       purchaseToken     = purchase.getPurchaseToken()
       purchaseState     = String.valueOf(int)  → "0" | "1" | "2"
       quantity          = purchase.getQuantity()        (Play tek adet veriyor)
       appAccountToken   = obfuscatedAccountId ya da NULL
       orderId, isAcknowledged, productType, purchaseDate, willCancel(null)
     definitions.d.ts
       transactionId: string ve productIdentifier: string ZORUNLU;
       purchaseToken?, purchaseState?, quantity?, isAcknowledged?, orderId?
       İSTEĞE BAĞLI; appAccountToken?: string | null NULL OLABİLİR.
     getProducts → {products:[{identifier, priceString, title, description,
       price, currencyCode, currencySymbol, ...}]}

   Bu bir FIXTURE UYUMU'dur, cihaz ölçümü DEĞİLDİR: gerçek Play'in hangi
   değerleri döndürdüğü yalnız gerçek ortamda görülebilir. */
/* Gerçek eklentinin Transaction yükü. Alan adları ve türleri yukarıdaki
   kaynaktan; hiçbiri uydurulmuyor ve hiçbiri eksik bırakılmıyor. */
function fakeTx(tok, sku, state, tag, qty) {
  return {
    transactionId: tok,                 // Android'de token ile AYNI
    productIdentifier: sku,
    purchaseToken: tok,
    purchaseState: state,               // "0" | "1" | "2" — DİZE
    quantity: qty,
    appAccountToken: tag,               // string | null
    orderId: 'GPA.' + tok,
    isAcknowledged: false,
    productType: 'inapp',
    purchaseDate: '2026-09-19T00:00:00Z',
    willCancel: null
  };
}
/* Yamanın ürettiği ret: Capacitor reject(msg, code) → JS'te err.message/err.code.
   Biçim npx:<aşama>:<kod>:<appAccountToken> (bkz. patches/…native-purchases…patch). */
function npxErr(msg, stage, code, tag) {
  const e = new Error(msg);
  e.code = 'npx:' + stage + ':' + code + ':' + (tag || '');
  return e;
}
function fakeBilling(ctx, opt) {
  opt = opt || {};
  const st = { buys: 0, consumes: 0, acks: 0, queries: 0, products: 0, buyOpts: [], owned: [] };
  let nextTok = 1;
  /* Senaryolar elle işlem kurarken de AYNI yükü kullansın: iki farklı biçim
     olsaydı testlerin yarısı gerçek eklentiyi, yarısı bir hayali taklit ederdi. */
  ctx.__tx = fakeTx;
  ctx.Capacitor = {
    Plugins: {
      NativePurchases: {
        isBillingSupported() {
          if (opt.supFail) return Promise.reject(new Error('sup'));
          return Promise.resolve({ isBillingSupported: opt.sup === false ? false : true });
        },
        getProducts(o) {
          st.products++;
          if (opt.prodFail) return Promise.reject(new Error('prod'));
          const ids = (o && o.productIdentifiers) || [];
          const list = ids.map(id => ({
            identifier: id, title: id, description: id,
            price: id.length + 0.99, priceString: '₺' + id.length + ',99',
            currencyCode: 'TRY', currencySymbol: '₺',
            introductoryPrice: null, discounts: []
          }));
          return Promise.resolve({ products: opt.prodShort ? list.slice(0, 1) : list });
        },
        purchaseProduct(o) {
          st.buys++; st.buyOpts.push(JSON.parse(JSON.stringify(o)));
          /* Gerçek eklenti retleri düz Error; mesaj dizesi kaynaktakinin aynısı.
             "Purchase is not purchased" USER_CANCELED dahil her non-OK sonucu
             kapsıyor, "Product not found" ise ödeme ekranı açılmadan dönüyor. */
          /* Yamalı eklentinin ret biçimi: err.message + err.code. */
          if (opt.buyCancel) return Promise.reject(npxErr('Purchase is not purchased', 'updated', 1, o.appAccountToken));
          if (opt.buyStaleCancel) return Promise.reject(npxErr('Purchase is not purchased', 'updated', 1, 'BASKA.deneme'));
          if (opt.buyNoStart) return Promise.reject(npxErr('Billing flow did not start', 'launch', 3, o.appAccountToken));
          if (opt.buyLost) return Promise.reject(npxErr('Purchase is not purchased', 'updated', -1, o.appAccountToken));
          if (opt.buyReject) return Promise.reject(new Error(opt.buyReject));
          if (opt.buyFail) return Promise.reject(new Error('boom'));
          const tok = opt.fixedTok || ('TOK' + (nextTok++));
          const tx = fakeTx(tok, o.productIdentifier,
            opt.pending ? '2' : '1',
            /* appAccountToken GERİ geliyor — hedef kimliği satın almanın
               kendisinden okunuyor, yerel bir tahminden değil. Gelmediğinde
               eklenti NULL koyuyor (obfuscatedAccountId yoksa), undefined değil. */
            opt.dropTag ? null : o.appAccountToken,
            opt.qty === undefined ? 1 : opt.qty);
          st.owned.push(tx);
          /* GERÇEK EKLENTİ PENDING'İ RESOLVE ETMİYOR, REDDEDİYOR
             (handlePurchase, PurchaseState.PENDING dalı). Yamayla birlikte ret
             artık aşama+durumu da taşıyor. Taklit bunu birebir yapıyor —
             aksi halde testler var olmayan bir davranışı doğrularlardı. */
          if (opt.pending) return Promise.reject(npxErr('Purchase is pending', 'state', 2, o.appAccountToken));
          return Promise.resolve(tx);
        },
        getPurchases() {
          st.queries++;
          if (opt.queryFail) return Promise.reject(new Error('query'));
          return Promise.resolve({ purchases: st.owned.slice() });
        },
        consumePurchase(o) {
          st.consumes++;
          if (opt.consumeFail) return Promise.reject(new Error('consume'));
          st.owned = st.owned.filter(x => x.purchaseToken !== o.purchaseToken);
          return Promise.resolve();
        },
        acknowledgePurchase(o) {
          st.acks++;
          if (opt.ackFail) return Promise.reject(new Error('ack'));
          const x = st.owned.find(y => y.purchaseToken === o.purchaseToken);
          if (x) x.isAcknowledged = true;
          return Promise.resolve();
        },
        /* Kasten TANIMLI: kodun onu çağırmadığı kaynak taramasıyla (blok 23)
           tutuluyor, burada varlığı bir tuzak. */
        restorePurchases() { st.restores = (st.restores || 0) + 1; return Promise.resolve(); }
      }
    }
  };
  return st;
}
/* Köprülü oturum: taklit kurulduktan SONRA iapInit() koşuyor. */
async function billSession(disk, ls, opt) {
  const a = session(disk, ls, {});
  await a.booted;
  const st = fakeBilling(a.ctx, opt);
  return { a, st };
}
async function billBoot(a) { await a.R('iapInit()'); await a.R('saveDrain()'); }

async function tPlayBilling() {
  console.log('\n[24] play billing: rezervasyon, teslimat, kapanış ve toparlanma');

  /* (1) MUTLU YOL — rezervasyon → satın alma → teslimat → consume → kapandı. */
  {
    const { a, st } = await billSession(newDisk(), {}, {});
    await careerIn(a, 1); await billBoot(a);
    ok(a.R('iapAvailable()') === true, '(1) köprü ve fiyatlar hazır');
    ok(a.R("iapPrice('cap3')") !== '', '(1) fiyat Play\'den geldi');
    ok(a.R("iapState('cap3')") === 'go', '(1) ürün satın alınabilir');
    a.R("iapBuy('cap3');");
    await waitFor(() => a.R("IAPS.busy") === '' && st.consumes > 0, 3000);
    await a.R('saveDrain()');
    ok(a.R('iapCapOwned()') === 3, '(1) kapasite tam olarak teslim edildi');
    ok(a.R('iapCapReserved()') === 0, '(1) rezervasyon teslimatla birlikte düştü');
    ok(st.consumes === 1, '(1) tam bir kez consume edildi');
    ok(st.acks === 0, '(1) tüketilebilir üründe acknowledge yok');
    const tok = Object.keys(a.R('S.iap.t'))[0];
    ok(a.R('IAPQ.q["' + tok + '"].st') === 'done', '(1) işlem kaydı kapandı');
    ok(a.R('IAPQ.q["' + tok + '"]') !== null, '(1) kapanan kayıt SİLİNMEDİ');
    /* Sıra: teslimat consume'dan ÖNCE. Defterdeki token, consume çağrısından
       önce yazılmış olmak zorunda — tersi Play'e "teslim edildi" deyip defteri
       boş bırakma riski. */
    ok(a.R('S.iap.t["' + tok + '"]') === 'cap3', '(1) defter tokenı taşıyor');
  }

  /* (2) AYNI TOKEN İKİ KEZ — hak bir kez veriliyor. */
  {
    const { a, st } = await billSession(newDisk(), {}, {});
    await careerIn(a, 1); await billBoot(a);
    a.R("iapBuy('cap5');");
    await waitFor(() => st.consumes > 0, 3000); await a.R('saveDrain()');
    const tok = Object.keys(a.R('S.iap.t'))[0];
    ok(a.R('iapCapOwned()') === 5, '(2) ilk teslimat +5');
    /* Aynı işlemi elle yeniden işle: idempotens token üzerinden. */
    await a.R("iapIngest(__tx('" + tok + "','cap_plus_5','1',"
      + "IAPQ.q['" + tok + "'].cid+'.'+IAPQ.q['" + tok + "'].att,1),'test')");
    await a.R('saveDrain()');
    ok(a.R('iapCapOwned()') === 5, '(2) ikinci işlemede kapasite ARTMADI');
    ok(Object.keys(a.R('S.iap.t')).length === 1, '(2) defterde tek token');
  }

  /* (3) KALICI YAZMA HATASI — hak yazılamadıysa consume YOK. */
  {
    const disk = newDisk(), ls = {}, ctl = {};
    const a = session(disk, ls, ctl);
    await a.booted;
    const st = fakeBilling(a.ctx, {});
    await careerIn(a, 1); await billBoot(a);
    /* Her yuva yazması düşüyor: ne rezervasyon ne teslimat kalıcılaşabilir. */
    ctl.failWrite = () => quotaErr();
    a.R("iapBuy('cap1');");
    await waitFor(() => a.R('IAPS.busy') === '', 3000);
    await tick(8);
    ok(st.consumes === 0, '(3) yazma tutmadan consume edilmedi');
    ok(st.acks === 0, '(3) yazma tutmadan acknowledge edilmedi');
    ok(a.R('iapCapOwned()') === 0, '(3) hak verilmedi');
    /* Rezervasyon kalıcılaşamadıysa satın alma HİÇ başlamamalı. */
    ok(st.buys === 0, '(3) rezervasyon yazılamadan ödeme başlatılmadı');
    delete ctl.failWrite;
  }

  /* (4) REZERVASYON VE TAVAN — kısmi teslimat YOK. */
  {
    const { a, st } = await billSession(newDisk(), {}, {});
    await careerIn(a, 1); await billBoot(a);
    /* Elle rezervasyon: +5 rezerveyken +10 alınamaz, +5 alınabilir. */
    const att = await a.R("iapReserve({cap:5})");
    await a.R('saveDrain()');
    ok(!!att, '(4) rezervasyon kalıcılaştı');
    ok(a.R('iapCapReserved()') === 5, '(4) rezerve kapasite sayılıyor');
    ok(a.R('iapCapLeft()') === 5, '(4) kalan hak rezervasyonu düşüyor');
    ok(a.R("iapState('cap10')") === 'full', '(4) tavanı aşan paket kapalı');
    ok(a.R("iapState('cap5')") === 'go', '(4) sığan paket açık');
    /* Rezervasyon BELİRSİZ sebeple düşmez. */
    await a.R("iapRelease('" + att + "','stale')");
    ok(a.R('iapCapReserved()') === 5, '(4) belirsiz sonuç rezervasyonu düşürmedi');
    /* Kesin sonuç düşürür. */
    await a.R("iapRelease('" + att + "','cancel')"); await a.R('saveDrain()');
    ok(a.R('iapCapReserved()') === 0, '(4) iptal rezervasyonu düşürdü');
    /* Tavanı aşan bir teslimat: hak YOK, consume YOK. */
    a.R("S.iap={t:{X1:'cap5'},r:{}};");
    await a.R("iapIngest(__tx('BIG','cap_plus_10','1',S.cid+'.aabbccdd',1),'test')");
    await a.R('saveDrain()');
    ok(a.R('iapCapOwned()') === 5, '(4) tavanı aşan paket KISMİ verilmedi');
    ok(a.R("IAPQ.q.BIG.st") === 'undeliverable', '(4) teslim edilemez işaretlendi');
    ok(st.consumes === 0, '(4) teslim edilemeyen ürün TÜKETİLMEDİ');
  }

  /* (5) MİKTAR — desteklenmeyen miktar sessizce tek adet gibi teslim edilmiyor. */
  {
    const { a, st } = await billSession(newDisk(), {}, {});
    await careerIn(a, 1); await billBoot(a);
    await a.R("iapIngest(__tx('Q2','cap_plus_1','1',S.cid+'.11223344',2),'test')");
    await a.R('saveDrain()');
    ok(a.R('iapCapOwned()') === 0, '(5) çoklu miktarda hak verilmedi');
    ok(a.R('IAPQ.q.Q2.st') === 'undeliverable', '(5) teslim edilemez işaretlendi');
    ok(st.consumes === 0, '(5) tüketilmedi');
  }

  /* (6) PENDING — hak YOK; ödeme tamamlanınca veriliyor. */
  {
    const { a, st } = await billSession(newDisk(), {}, { pending: true });
    await careerIn(a, 1); await billBoot(a);
    a.R("iapBuy('cap3');");
    await waitFor(() => a.R('IAPS.busy') === '', 3000); await a.R('saveDrain()');
    ok(a.R('iapCapOwned()') === 0, '(6) PENDING işlemde hak verilmedi');
    ok(a.R('iapPendingN()') === 1, '(6) bekleyen işlem ekranda sayılıyor');
    ok(st.consumes === 0, '(6) PENDING tüketilmedi');
    ok(a.R('iapCapReserved()') === 3, '(6) rezervasyon PENDING boyunca duruyor');
    /* Ödeme tamamlandı: aynı token PURCHASED olarak dönüyor. */
    const tok = Object.keys(a.R('IAPQ.q'))[0];
    a.R("Capacitor.Plugins.NativePurchases.getPurchases=function(){return Promise.resolve({purchases:["
      + "__tx('" + tok + "','cap_plus_3','1',IAPQ.q['" + tok + "'].cid+'.'+IAPQ.q['" + tok + "'].att,1)]});};");
    await a.R('iapReconcile()'); await a.R('saveDrain()');
    ok(a.R('iapCapOwned()') === 3, '(6) ödeme tamamlanınca hak verildi');
    ok(a.R('iapCapReserved()') === 0, '(6) rezervasyon teslimatla düştü');
  }

  /* (7) KARİYER DEĞİŞTİRME — hedef açılmadan, doğru yuvaya teslimat. */
  {
    const disk = newDisk(), ls = {};
    const a = session(disk, ls, {});
    await a.booted;
    fakeBilling(a.ctx, {});
    const cidA = await careerIn(a, 1);
    const cidB = await careerIn(a, 2);          // artık AÇIK olan kariyer B
    await billBoot(a);
    ok(a.R('S.cid') === cidB, '(7) açık kariyer B');
    /* A için ödenmiş bir işlem geliyor. */
    await a.R("iapIngest(__tx('TA','cap_plus_5','1','" + cidA + ".deadbeef',1),'test')");
    await a.R('saveDrain()');
    ok(a.R('iapCapOwned()') === 0, '(7) açık kariyer B hak ALMADI');
    ok(a.R('S.cid') === cidB, '(7) kullanıcı hâlâ B\'de — hedef açılması beklenmedi');
    ok(a.R('IAPQ.q.TA.st') === 'done', '(7) işlem A için kapandı');
    /* A'yı aç ve hakkın orada olduğunu gör. */
    await a.R('loadSlot(1)');
    ok(a.R('S.cid') === cidA, '(7) A açıldı');
    ok(a.R('iapCapOwned()') === 5, '(7) hak A\'ya yazılmıştı');
  }

  /* (8) KARİYER SİLME — ücretli kayıt SİLİNMİYOR, başka kariyere GİTMİYOR. */
  {
    const disk = newDisk(), ls = {};
    const a = session(disk, ls, {});
    await a.booted;
    const st = fakeBilling(a.ctx, { pending: true });
    const cidA = await careerIn(a, 1);
    await billBoot(a);
    a.R("iapBuy('cap5');");
    await waitFor(() => a.R('IAPS.busy') === '', 3000); await a.R('saveDrain()');
    const tok = Object.keys(a.R('IAPQ.q'))[0];
    a.R('deleteSlot(1);'); await a.R('saveDrain()');
    ok(a.R('IAPQ.q["' + tok + '"]') !== null, '(8) ücretli kayıt silinmedi');
    ok(a.R('IAPQ.q["' + tok + '"].st') === 'orphan', '(8) kayıt hedefsiz işaretlendi');
    ok(a.R('iapStuckN()') === 1, '(8) ekran bunu gösterebiliyor');
    ok(st.consumes === 0, '(8) teslim edilemeyen işlem tüketilmedi');
    /* Yeni kariyer aynı yuvaya kuruluyor: hak ona GEÇMİYOR. */
    const cidB = await careerIn(a, 1);
    await a.R('iapOnCareerOpen()'); await a.R('saveDrain()');
    ok(cidB !== cidA, '(8) yeni kariyerin kimliği farklı');
    ok(a.R('iapCapOwned()') === 0, '(8) hak yeniden kullanılan yuvaya YAZILMADI');
    ok(a.R('IAPQ.q["' + tok + '"].st') === 'orphan', '(8) kayıt hâlâ hedefsiz');
  }

  /* (9) HEDEF KİMLİĞİ GELMEDİ — tahmin YOK. */
  {
    const { a, st } = await billSession(newDisk(), {}, { dropTag: true });
    await careerIn(a, 1); await billBoot(a);
    a.R("iapBuy('cap3');");
    await waitFor(() => a.R('IAPS.busy') === '', 3000); await a.R('saveDrain()');
    ok(a.R('iapCapOwned()') === 0, '(9) kimliksiz işlem açık kariyere YAZILMADI');
    const tok = Object.keys(a.R('IAPQ.q'))[0];
    ok(a.R('IAPQ.q["' + tok + '"].st') === 'unbound', '(9) hedefsiz kimlik işaretlendi');
    ok(st.consumes === 0, '(9) tüketilmedi');
  }

  /* (10) CONSUME YANITI KAYBOLDU — yeniden hak VERİLMİYOR. */
  {
    const { a, st } = await billSession(newDisk(), {}, { consumeFail: true });
    await careerIn(a, 1); await billBoot(a);
    a.R("iapBuy('cap3');");
    await waitFor(() => st.consumes > 0, 3000); await a.R('saveDrain()');
    const tok = Object.keys(a.R('S.iap.t'))[0];
    ok(a.R('iapCapOwned()') === 3, '(10) hak yazıldı');
    ok(a.R('IAPQ.q["' + tok + '"].st') === 'finishing', '(10) kapanış yarım kaldı');
    /* Gerçekte consume TUTMUŞ ama yanıt kaybolmuş olabilir: Play artık tokenı
       döndürmüyor. Kayıt kapanıyor, hak İKİNCİ KEZ verilmiyor. */
    a.R("Capacitor.Plugins.NativePurchases.getPurchases=function(){return Promise.resolve({purchases:[]});};");
    await a.R('iapReconcile()'); await a.R('saveDrain()');
    ok(a.R('iapCapOwned()') === 3, '(10) kapasite ikinci kez EKLENMEDİ');
    /* 'done' DEĞİL: consume tutmuş da olabilir, satın alma iade edilmiş de
       olabilir, Play başka sebeple listelemiyor da olabilir. İstemci bunları
       ayırt edemez, o yüzden ayrı bir durum. */
    ok(a.R('IAPQ.q["' + tok + '"].st') === 'unverified', '(10) kapanış DOĞRULANAMADI olarak işaretlendi');
    ok(a.R('iapUnverifiedN()') === 1, '(10) ekran bunu ayrı sayıyor');
    ok(a.R('iapStuckN()') === 0, '(10) hak kullanıcıda olduğu için "sorunlu" değil');
    ok(Object.keys(a.R('S.iap.t')).length === 1, '(10) defterde tek token');
  }

  /* (11) BAŞARISIZ HAK SORGUSU — hiçbir hak silinmiyor. */
  {
    const { a } = await billSession(newDisk(), {}, {});
    await careerIn(a, 1); await billBoot(a);
    a.R("PREFS.iap={t:{NOADS1:'noads'}};savePrefs();");
    ok(a.R('iapNoAds()') === true, '(11) reklam kaldırma hakkı var');
    a.R("Capacitor.Plugins.NativePurchases.getPurchases=function(){return Promise.reject(new Error('net'));};");
    const r = await a.R('iapReconcile()');
    ok(r === 'queryfail', '(11) sorgu başarısız raporlandı');
    ok(a.R('iapNoAds()') === true, '(11) başarısız sorgu hakkı SİLMEDİ');
    ok(a.R('IAPS.qErr') === true, '(11) hata durumu görünür');
    ok((a.R('PREFS.iap.miss') || 0) === 0, '(11) başarısız sorgu sayaca işlemedi');
  }

  /* (12) BAŞARILI SORGUDA UZLAŞTIRMA — tek sorgu yetmiyor, IAP.missMax gerekiyor. */
  {
    const { a } = await billSession(newDisk(), {}, {});
    await careerIn(a, 1); await billBoot(a);
    a.R("PREFS.iap={t:{NOADS1:'noads'}};savePrefs();");
    a.R("Capacitor.Plugins.NativePurchases.getPurchases=function(){return Promise.resolve({purchases:[]});};");
    for (let i = 1; i < a.R('IAP.missMax'); i++) {
      await a.R('iapReconcile()');
      ok(a.R('iapNoAds()') === true, '(12) ' + i + '. başarılı sorguda hak korundu');
    }
    await a.R('iapReconcile()');
    ok(a.R('iapNoAds()') === false, '(12) missMax sonrası hak düştü');
  }

  /* (13) REKLAM KALDIRMA — acknowledge, consume DEĞİL; ve teslimattan SONRA. */
  {
    const { a, st } = await billSession(newDisk(), {}, {});
    await careerIn(a, 1); await billBoot(a);
    a.R("iapBuy('noads');");
    await waitFor(() => st.acks > 0, 3000); await a.R('saveDrain()');
    ok(a.R('iapNoAds()') === true, '(13) cihaz kapsamlı hak verildi');
    ok(st.acks === 1, '(13) tam bir kez acknowledge edildi');
    ok(st.consumes === 0, '(13) tüketilmedi');
    ok(a.R("iapState('noads')") === 'owned', '(13) ikinci kez satın alınamıyor');
    ok(a.R('iapCapOwned()') === 0, '(13) cihaz ürünü kapasiteye karışmadı');
  }

  /* (14) ESKİ KAYIT — S.iap ve iapq yokken her şey çalışıyor. */
  {
    const { a } = await billSession(newDisk(), {}, {});
    await careerIn(a, 1); await billBoot(a);
    a.R('delete S.iap;'); a.R('save();'); await a.R('saveDrain()');
    ok(a.R('iapCapOwned()') === 0, '(14) defter yokken kapasite 0');
    ok(a.R('iapCapReserved()') === 0, '(14) rezervasyon yokken 0');
    ok(a.R('iapCapLeft()') === a.R('IAP.capMax'), '(14) kalan hak tam');
    ok(a.R('maxClients()') > 0, '(14) oyun formülü çalışıyor');
    ok(a.R('iapNoAds()') === false, '(14) cihaz defteri yokken hak yok');
    const h = a.R('VIEWS.shop()');
    ok(h.indexOf('undefined') === -1 && h.indexOf('NaN') === -1, '(14) mağaza ekranı temiz');
  }

  /* (15) SATIN ALMA ÇAĞRISININ BİÇİMİ — iki otomatik bitirme de kapalı. */
  {
    const { a, st } = await billSession(newDisk(), {}, {});
    const cid = await careerIn(a, 1); await billBoot(a);
    a.R("iapBuy('cap1');");
    await waitFor(() => st.buys > 0, 3000);
    const o = st.buyOpts[0];
    ok(o.isConsumable === false, '(15) isConsumable false gönderildi');
    ok(o.autoAcknowledgePurchases === false, '(15) autoAcknowledge false gönderildi');
    ok(typeof o.appAccountToken === 'string' && o.appAccountToken.indexOf(cid) === 0,
      '(15) hedef kariyer kimliği Play\'e verildi');
    ok(o.appAccountToken.length <= 64, '(15) kimlik dizesi sınır içinde');
    ok((st.restores || 0) === 0, '(15) restorePurchases hiç çağrılmadı');
  }

  /* (16) ÜRÜN SORGUSU DÜŞTÜ — satın alma KAPALI, fiyat uydurulmuyor. */
  {
    const { a } = await billSession(newDisk(), {}, { prodFail: true });
    await careerIn(a, 1); await billBoot(a);
    ok(a.R('iapAvailable()') === false, '(16) fiyat yoksa satın alma kapalı');
    ok(a.R("iapState('cap1')") === 'off', '(16) ürün kapalı');
    ok(a.R("iapPrice('cap1')") === '', '(16) uydurma fiyat yok');
    const h = a.R('VIEWS.shop()');
    ok(h.indexOf(a.R("t('shopPriceWait')")) !== -1, '(16) ekran fiyatın alınamadığını yazıyor');
    ok(h.indexOf(a.R("t('shopOff')")) !== -1, '(16) ekran satın almanın kapalı olduğunu yazıyor');
  }

  /* (17) GERİ YÜKLEME FARKI — ekran, satın almadan ÖNCE söylüyor. */
  {
    const { a } = await billSession(newDisk(), {}, {});
    await careerIn(a, 1); await billBoot(a);
    for (const lang of ['tr', 'en']) {
      a.R("L='" + lang + "';");
      const h = a.R('VIEWS.shop()');
      ok(h.indexOf(a.R("t('shopNoRestoreCap')")) !== -1,
        '(17) ' + lang + ' tüketilen paketin geri yüklenmeyebileceği yazıyor');
      ok(h.indexOf(a.R("t('shopRestoreAds')")) !== -1,
        '(17) ' + lang + ' reklam kaldırmanın geri yükleneceği yazıyor');
    }
    a.R("L='tr';");
  }

  /* (18) BOŞ SORGU SAYISI ÖDEME SONUCUNU KANITLAMAZ.
         Belirsiz bir ödeme, İSTEDİĞİ KADAR başarılı-ama-boş sorgudan sonra
         PURCHASED dönebilir. Rezervasyon hiçbir sayıda düşmemeli — beklenti
         bilerek hiçbir sabitten türetilmiyor, sabit bir "çok fazla" sayı
         kullanılıyor; bir gün yeniden bir eşik eklenirse bu test kırılsın. */
  {
    const { a, st } = await billSession(newDisk(), {}, { pending: true });
    await careerIn(a, 1); await billBoot(a);
    a.R("iapBuy('cap5');");
    await waitFor(() => a.R('IAPS.busy') === '', 3000); await a.R('saveDrain()');
    const tok = Object.keys(a.R('IAPQ.q'))[0];
    ok(a.R('iapCapReserved()') === 5, '(18) yavaş ödeme için rezervasyon duruyor');

    /* En kötü hâl: rezervasyon çok eski, kuyrukta denemeye bağlanacak iz yok,
       ve Play uzun süre hiçbir şey döndürmüyor. */
    a.R("IAPQ.q['" + tok + "'].att=null;");
    a.R("S.iap.r[Object.keys(S.iap.r)[0]].at=1;");
    a.R("Capacitor.Plugins.NativePurchases.getPurchases=function(){return Promise.resolve({purchases:[]});};");
    for (let i = 0; i < 25; i++) { await a.R('iapReconcile()'); }
    await a.R('saveDrain()');
    ok(a.R('iapCapReserved()') === 5, '(18) 25 boş sorgu rezervasyonu DÜŞÜRMEDİ');
    ok(a.R("iapState('cap10')") === 'full', '(18) tavan korunuyor, ikinci paket satılamıyor');
    ok(a.R('iapHeldN()') === 1, '(18) ayrılan kapasite ekranda görünüyor');
    for (const lang of ['tr', 'en']) {
      a.R("L='" + lang + "';");
      ok(a.R('VIEWS.shop()').indexOf(a.R("t('shopTxHeld').replace('{n}',1)")) !== -1,
        '(18) ' + lang + ' kapasitenin neden ayrıldığı yazıyor');
    }
    a.R("L='tr';");

    /* Sığan bir paket alınabilir — tavan kilitlenmiş değil, yalnız 5'i ayrılmış. */
    ok(a.R("iapState('cap5')") === 'go', '(18) kalan 5 hâlâ satılabilir');

    /* Ve sonunda ilk ödeme PURCHASED dönüyor: TAM teslimat, fazla satış yok. */
    a.R("IAPQ.q['" + tok + "'].att=Object.keys(S.iap.r)[0];");
    a.R("Capacitor.Plugins.NativePurchases.getPurchases=function(){return Promise.resolve({purchases:["
      + "__tx('" + tok + "','cap_plus_5','1',IAPQ.q['" + tok + "'].cid+'.'+IAPQ.q['" + tok + "'].att,1)]});};");
    await a.R('iapReconcile()'); await a.R('saveDrain()');
    ok(a.R('iapCapOwned()') === 5, '(18) geç gelen ödeme TAM teslim edildi');
    ok(a.R('iapCapReserved()') === 0, '(18) rezervasyon teslimatla düştü');
    ok(a.R('iapHeldN()') === 0, '(18) ayrılan kapasite kalmadı');
    ok(st.consumes === 1, '(18) tam bir kez tüketildi');
    ok(a.R('iapStuckN()') === 0, '(18) teslim edilemeyen işlem YOK');
  }

  /* (19) ÖDEME AÇISINDAN SONUÇLANMAMIŞ DURUMLAR REZERVASYONU BIRAKMAZ.
         orphan/unbound/undeliverable "para bitti" demek değil: hedefi bulunamayan
         bir kayıt kariyer yeniden göründüğünde ready'ye dönebiliyor. Rezervasyonu
         şimdi bırakmak, o teslimatın yerini bu arada satılmış bir pakete
         verdirirdi. Tek kanıt: tokenın defterde olması. */
  {
    const { a } = await billSession(newDisk(), {}, {});
    await careerIn(a, 1); await billBoot(a);
    a.R("Capacitor.Plugins.NativePurchases.getPurchases=function(){return Promise.resolve({purchases:[]});};");

    for (const stt of ['orphan', 'unbound', 'undeliverable']) {
      const att = await a.R("iapReserve({cap:5})"); await a.R('saveDrain()');
      a.R("IAPQ.q.R_" + stt + "={tok:'R_" + stt + "',sku:'cap_plus_5',pid:'cap5',sc:'career',"
        + "cid:S.cid,att:'" + att + "',st:'" + stt + "',at:1};");
      a.R("S.iap.r['" + att + "'].at=1;");
      for (let i = 0; i < 10; i++) { await a.R('iapReconcile()'); }
      await a.R('saveDrain()');
      ok(a.R('iapCapReserved()') === 5, '(19) ' + stt + ' rezervasyonu BIRAKMADI');
      /* Temizle: sıradaki durum için yeniden kur. */
      a.R("delete S.iap.r['" + att + "'];delete IAPQ.q.R_" + stt + ";");
      a.R('save();'); await a.R('saveDrain()');
    }

    /* KANIT: token deftere girdiyse rezervasyon serbest kalır. */
    const att = await a.R("iapReserve({cap:5})"); await a.R('saveDrain()');
    a.R("IAPQ.q.PROVEN={tok:'PROVEN',sku:'cap_plus_5',pid:'cap5',sc:'career',"
      + "cid:S.cid,att:'" + att + "',st:'done',at:1};");
    a.R("if(!S.iap.t)S.iap.t={};S.iap.t.PROVEN='cap5';");
    await a.R('iapReconcile()'); await a.R('saveDrain()');
    ok(a.R('iapCapReserved()') === 0, '(19) kalıcı teslimat rezervasyonu bıraktı');
    ok(a.R('iapCapOwned()') === 5, '(19) hak yerinde');
  }

  /* (20b) RET SINIFLARI — eklentinin gerçek hata yollarına göre.
         8.7.0'ın onPurchasesUpdated'ı USER_CANCELED dahil OK OLMAYAN HER
         sonucu tek bir "Purchase is not purchased" retine indiriyor. Bu yüzden
         o ret BELİRSİZ sayılmak zorunda; rezervasyonu yalnız ödeme ekranı
         açılmadan dönen doğrulama hataları düşürebilir. */
  {
    const { a, st } = await billSession(newDisk(), {}, { buyReject: 'Purchase is not purchased' });
    await careerIn(a, 1); await billBoot(a);
    a.R("iapBuy('cap3');");
    await waitFor(() => a.R('IAPS.busy') === '', 3000); await a.R('saveDrain()');
    ok(st.buys === 1, '(20b) ödeme akışı denendi');
    ok(a.R('iapCapReserved()') === 3, '(20b) belirsiz ret rezervasyonu DÜŞÜRMEDİ');
    ok(a.R('iapCapOwned()') === 0, '(20b) hak verilmedi');

    /* Ödeme ekranı açılmadan dönen doğrulama hatası KESİN: hemen düşer. */
    const { a: a2, st: st2 } = await billSession(newDisk(), {}, { buyReject: 'Product not found' });
    await careerIn(a2, 1); await billBoot(a2);
    a2.R("iapBuy('cap3');");
    await waitFor(() => a2.R('IAPS.busy') === '', 3000); await a2.R('saveDrain()');
    ok(st2.buys === 1, '(20b) akış denendi');
    ok(a2.R('iapCapReserved()') === 0, '(20b) kesin başlamama rezervasyonu düşürdü');
    ok(a2.R("iapState('cap10')") === 'go', '(20b) tavan serbest kaldı');
    /* İptal artık TAHMİN değil: yalnız yamanın taşıdığı yapılandırılmış alandan
       okunuyor. Metinden çıkarım yapılmadığı burada tutuluyor. */
    ok(a2.R("iapIsCancel({message:'user cancelled the purchase'},'x.y')") === false,
      '(20b) metinden iptal çıkarımı yok');
    ok(a2.R("iapIsCancel({code:'npx:updated:1:x.y'},'x.y')") === true,
      '(20b) açık USER_CANCELED tanınıyor');
  }

  /* (20c) İPTAL SONRASI KAPASİTE KİLİTLENMİYOR — engelin kendisi.
         Kullanıcı +10 ekranını açıp vazgeçiyor: ödeme yok, rezervasyon yok,
         ürün yeniden satın alınabilir. */
  {
    const { a, st } = await billSession(newDisk(), {}, { buyCancel: true });
    await careerIn(a, 1); await billBoot(a);
    ok(a.R("iapState('cap10')") === 'go', '(20c) başta +10 satın alınabilir');
    a.R("iapBuy('cap10');");
    await waitFor(() => a.R('IAPS.busy') === '', 3000); await a.R('saveDrain()');
    ok(st.buys === 1, '(20c) ödeme ekranı açıldı');
    ok(a.R('iapCapOwned()') === 0, '(20c) kapasite verilmedi');
    ok(a.R('iapCapReserved()') === 0, '(20c) rezervasyon BIRAKILDI');
    ok(a.R('iapHeldN()') === 0, '(20c) tutulu kapasite yok');
    ok(a.R('iapCapLeft()') === 10, '(20c) tavan tamamen serbest');
    ok(a.R("iapState('cap10')") === 'go', '(20c) yeniden satın alınabilir');
    ok(Object.keys(a.R('IAPQ.q')).length === 0, '(20c) ödeme kaydı oluşmadı');
    for (const lang of ['tr', 'en']) {
      a.R("L='" + lang + "';");
      ok(a.R("t('shopCancelled')").length > 0, '(20c) ' + lang + ' iptal metni var');
    }
    a.R("L='tr';");
  }

  /* (20d) İPTAL YALNIZ KENDİ DENEMESİNİ BIRAKIR.
         Gecikmiş bir callback başka bir denemenin etiketini taşıyorsa,
         açıktaki rezervasyona DOKUNAMAZ. */
  {
    const { a } = await billSession(newDisk(), {}, { buyStaleCancel: true });
    await careerIn(a, 1); await billBoot(a);
    a.R("iapBuy('cap5');");
    await waitFor(() => a.R('IAPS.busy') === '', 3000); await a.R('saveDrain()');
    ok(a.R('iapCapReserved()') === 5, '(20d) yabancı etiketli iptal rezervasyonu düşürmedi');
    ok(a.R('iapHeldN()') === 1, '(20d) kapasite tutulu kaldı');
    /* Önceden alınmış bir token da etkilenmiyor. */
    a.R("if(!S.iap.t)S.iap.t={};S.iap.t.OLD='cap1';");
    a.R("iapRelease(Object.keys(S.iap.r)[0],'stale');");
    ok(a.R("S.iap.t.OLD") === 'cap1', '(20d) önceden alınmış token dokunulmadı');
  }

  /* (20e) AKIŞ HİÇ BAŞLAMADI (launch aşaması) — KESİN sonuç, rezervasyon düşer.
         Bağlantı kaybı gibi BELİRSİZ sonuçta ise KALIR. */
  {
    const { a } = await billSession(newDisk(), {}, { buyNoStart: true });
    await careerIn(a, 1); await billBoot(a);
    a.R("iapBuy('cap5');");
    await waitFor(() => a.R('IAPS.busy') === '', 3000); await a.R('saveDrain()');
    ok(a.R('iapCapReserved()') === 0, '(20e) ödeme ekranı açılmadıysa rezervasyon düştü');

    const { a: a2 } = await billSession(newDisk(), {}, { buyLost: true });
    await careerIn(a2, 1); await billBoot(a2);
    a2.R("iapBuy('cap5');");
    await waitFor(() => a2.R('IAPS.busy') === '', 3000); await a2.R('saveDrain()');
    ok(a2.R('iapCapReserved()') === 5, '(20e) bağlantı kaybı rezervasyonu KORUDU');
    ok(a2.R('iapHeldN()') === 1, '(20e) tutulu kapasite ekranda');
  }

  /* (20) ÖDEME SONRASI KAYIT HATASI — rezervasyon tuttu, ödeme PURCHASED,
         ama hak kaydı yazılamıyor. Kapanış YAPILMAMALI ve bellekte geçici
         olarak eklenen hak KALICI SAYILMAMALI. */
  {
    const disk = newDisk(), ls = {}, ctl = {};
    const a = session(disk, ls, ctl);
    await a.booted;
    const st = fakeBilling(a.ctx, {});
    await careerIn(a, 1); await billBoot(a);
    const before = a.R('iapCapOwned()');
    ok(before === 0, '(20) başlangıçta kapasite yok');
    /* Rezervasyon BAŞARIYLA yazılıyor; yazma hatası ancak ondan sonra başlıyor. */
    const att = await a.R("iapReserve({cap:3})"); await a.R('saveDrain()');
    ok(!!att, '(20) rezervasyon kalıcılaştı');
    ctl.failWrite = () => quotaErr();
    await a.R("iapIngest(__tx('PW','cap_plus_3','1',S.cid+'.'+'" + att + "',1),'test')");
    await tick(8);
    ok(st.consumes === 0, '(20) hak yazılamadan consume EDİLMEDİ');
    ok(st.acks === 0, '(20) hak yazılamadan acknowledge EDİLMEDİ');
    ok(a.R('iapCapOwned()') === 0, '(20) bellekteki geçici hak geri alındı');
    ok(a.R('iapCapReserved()') === 3, '(20) rezervasyon geri kondu');
    ok(a.R('IAPQ.q.PW') === null || a.R('IAPQ.q.PW.st') !== 'granted',
      '(20) işlem "hak verildi" olarak işaretlenmedi');
    /* Depolama düzeliyor: sonraki normal kayıt ÇİFT hak üretmiyor. */
    delete ctl.failWrite;
    a.R('save();'); await a.R('saveDrain()');
    ok(a.R('iapCapOwned()') === 0, '(20) düzelen kayıt kendiliğinden hak yazmadı');
    await a.R('iapAdvance(IAPQ.q.PW)'); await a.R('saveDrain()');
    ok(a.R('iapCapOwned()') === 3, '(20) yeniden deneme hakkı bir kez verdi');
    ok(Object.keys(a.R('S.iap.t')).length === 1, '(20) defterde tek token');
    ok(a.R('iapCapReserved()') === 0, '(20) rezervasyon teslimatla düştü');
    ok(st.consumes === 1, '(20) tam bir kez tüketildi');
  }

  /* (21) CONSUME TUTTU, YANIT KAYIP, ARDINDAN SÜREÇ KAPANDI.
         (10) aynı oturumda ölçüyordu; burada AYNI DİSKTEN YENİ bir oturum
         açılıyor — 'finishing' durumu diske yazılmış olmak zorunda. */
  {
    const disk = newDisk(), ls = {};
    const s1 = session(disk, ls, {});
    await s1.booted;
    const st1 = fakeBilling(s1.ctx, { consumeFail: true });
    const cid = await careerIn(s1, 1); await billBoot(s1);
    s1.R("iapBuy('cap3');");
    await waitFor(() => st1.consumes > 0, 3000); await s1.R('saveDrain()');
    const tok = Object.keys(s1.R('S.iap.t'))[0];
    ok(s1.R('IAPQ.q["' + tok + '"].st') === 'finishing', '(21) kapanış yarım kaldı');
    ok(s1.R('iapCapOwned()') === 3, '(21) hak yazıldı');

    /* Süreç kapanıyor. Yeni oturum AYNI diski açıyor. */
    const s2 = session(disk, ls, {});
    await s2.booted;
    /* Gerçekte consume TUTMUŞTU: Play artık bu tokenı döndürmüyor. */
    const st2 = fakeBilling(s2.ctx, {});
    s2.ctx.Capacitor.Plugins.NativePurchases.getPurchases =
      () => Promise.resolve({ purchases: [] });
    await s2.R('loadSlot(1)');
    await billBoot(s2);
    await s2.R('saveDrain()');
    ok(s2.R('S.cid') === cid, '(21) aynı kariyer açıldı');
    ok(s2.R('IAPQ.q["' + tok + '"]') !== null, '(21) tamamlama durumu diskten geldi');
    ok(s2.R('IAPQ.q["' + tok + '"].st') === 'unverified',
      '(21) kapanış DOĞRULANAMADI olarak taşındı');
    ok(s2.R('iapUnverifiedN()') === 1, '(21) belirsiz kapanış ayrı sayılıyor');
    ok(s2.R('iapCapOwned()') === 3, '(21) hak BİR KEZ korundu');
    ok(Object.keys(s2.R('S.iap.t')).length === 1, '(21) defterde tek token');
    ok(st2.consumes === 0, '(21) yeniden tüketilmeye çalışılmadı');
    ok(st2.acks === 0, '(21) yanlışlıkla acknowledge edilmedi');
    ok(s2.R('iapStuckN()') === 0, '(21) iade/sorunlu sayılmadı');
    /* Ne "başarıyla tamamlandı" ne "iade edildi" çıkarımı yapılmıyor. */
    ok(s2.R('IAPQ.q["' + tok + '"].dt') === undefined, '(21) başarı zamanı yazılmadı');
    ok(s2.R('iapCapOwned()') === 3, '(21) hak yerinde, ikinci kez verilmedi');
    /* Token GERİ GELİRSE satın alma hâlâ açıktır: kapanış yeniden denenir. */
    s2.ctx.Capacitor.Plugins.NativePurchases.getPurchases =
      () => Promise.resolve({ purchases: [s2.R('__tx("' + tok + '","cap_plus_3","1",S.cid+"."+IAPQ.q["' + tok + '"].att,1)')] });
    await s2.R('iapReconcile()'); await s2.R('saveDrain()');
    ok(s2.R('IAPQ.q["' + tok + '"].st') === 'done', '(21) token dönünce kapanış tamamlandı');
    ok(s2.R('iapCapOwned()') === 3, '(21) hak yine ikinci kez verilmedi');
  }

  /* (22) EKLENTİ SÖZLEŞMESİ — isteğe bağlı alanlar ve NULL.
         TS tanımında purchaseState? isteğe bağlı; eksikse PURCHASED
         VARSAYILMIYOR. appAccountToken NULL olabiliyor ve bu bir tahmin
         sebebi değil. */
  {
    const { a, st } = await billSession(newDisk(), {}, {});
    await careerIn(a, 1); await billBoot(a);
    /* purchaseState hiç yok → hak YOK. */
    await a.R("iapIngest({transactionId:'NS',productIdentifier:'cap_plus_3',"
      + "purchaseToken:'NS',appAccountToken:S.cid+'.aa11bb22',quantity:1},'test')");
    await a.R('saveDrain()');
    ok(a.R('iapCapOwned()') === 0, '(22) durumu bildirilmeyen işlem hak vermedi');
    ok(a.R('IAPQ.q.NS.st') === 'pending', '(22) beklemede sayıldı');
    ok(st.consumes === 0, '(22) tüketilmedi');
    /* UNSPECIFIED ("0") de hak vermiyor. */
    await a.R("iapIngest(__tx('U0','cap_plus_3','0',S.cid+'.cc33dd44',1),'test')");
    await a.R('saveDrain()');
    ok(a.R('iapCapOwned()') === 0, '(22) UNSPECIFIED hak vermedi');
    /* appAccountToken NULL → tahmin yok. */
    await a.R("iapIngest(__tx('NT','cap_plus_3','1',null,1),'test')");
    await a.R('saveDrain()');
    ok(a.R('iapCapOwned()') === 0, '(22) NULL kimlikte açık kariyere yazılmadı');
    ok(a.R('IAPQ.q.NT.st') === 'unbound', '(22) hedefsiz işaretlendi');
    /* transactionId token yerine geçiyor (Android'de ikisi aynı). */
    await a.R("iapIngest({transactionId:'TI',productIdentifier:'cap_plus_1',"
      + "purchaseState:'1',quantity:1,appAccountToken:S.cid+'.ee55ff66'},'test')");
    await a.R('saveDrain()');
    ok(a.R('iapCapOwned()') === 1, '(22) purchaseToken yoksa transactionId kullanıldı');
  }

  /* (23) GERİ ALMA YANLIŞ KARİYERE DOKUNAMAZ.
         Teslimat yazması uçuştayken kullanıcı başka kariyere geçebilir. Geri
         alma, o an S'de NE VARSA ona değil, MUTASYONU YAPTIĞI NESNEYE uygulanır
         ve o nesnenin kimliği ayrıca doğrulanır. Eski kod zincirin sonunda
         `iapRollback(S, ...)` çağırıyordu; bu, A'nın rezervasyonunu B'ye
         yazabilir ve B'nin defterinden aynı adlı tokenı silebilirdi. */
  {
    const disk = newDisk(), ls = {}, ctl = {};
    const a = session(disk, ls, ctl);
    await a.booted;
    const st = fakeBilling(a.ctx, {});
    const cidA = await careerIn(a, 1);
    const cidB = await careerIn(a, 2);
    /* B'ye, A'nın teslim etmeye çalıştığıyla AYNI token adını VE aynı ürünü
       koyalım. Bilerek en zor hâl: değer karşılaştırmasına dayanan bir koruma
       burada ayırt edemez; yalnız "mutasyonu hangi NESNEYE yaptım" bilgisi
       ayırt eder. */
    a.R("S.iap={t:{XTOK:'cap5'},r:{bbbbbbbb:{cap:3,at:1}}};save();");
    await a.R('saveDrain()');
    await a.R('loadSlot(1)');
    await billBoot(a);
    ok(a.R('S.cid') === cidA, '(23) A açık');

    const att = await a.R("iapReserve({cap:5})"); await a.R('saveDrain()');
    a.R("IAPQ.q.XTOK={tok:'XTOK',sku:'cap_plus_5',pid:'cap5',sc:'career',cid:S.cid,att:'" + att + "',st:'ready',at:1};");
    await a.R('iapqSave()');

    /* Yazma düşüyor; teslimat başlatılıp BEKLENMİYOR, araya yuva değişimi giriyor. */
    ctl.failWrite = () => quotaErr();
    const pr = a.R("iapDeliverCareer(IAPQ.q.XTOK)");
    await a.R('loadSlot(2)');
    ok(a.R('S.cid') === cidB, '(23) kullanıcı B\'ye geçti');
    const r = await pr;
    await tick(6);
    /* failWrite BİLEREK açık kalıyor: loadSlot() açılışta iapOnCareerOpen() ile
       teslimatı kendiliğinden yeniden deniyor — bu doğru davranış, ama burada
       ölçülen şey yeniden denemenin sonucu değil, BAŞARISIZ teslimattan sonraki
       tutarlılık. Yazma izni aşağıda, açık retry'den hemen önce geri veriliyor. */
    ok(r === 'writefail', '(23) teslimat yazılamadı');
    ok(st.consumes === 0, '(23) consume edilmedi');
    /* B TAMAMEN AYNI kalmalı. */
    ok(a.R("S.iap.t.XTOK") === 'cap5', '(23) B\'nin kendi tokenı korundu');
    ok(a.R("Object.keys(S.iap.t).length") === 1, '(23) B\'ye token eklenmedi');
    ok(a.R("Object.keys(S.iap.r).join(',')") === 'bbbbbbbb',
      '(23) A\'nın rezervasyonu B\'ye SIZMADI');
    ok(a.R('iapCapReserved()') === 3, '(23) B\'nin rezerve kapasitesi değişmedi');
    ok(a.R('iapCapOwned()') === 5, '(23) B\'nin kapasitesi değişmedi');

    /* A: diskte ne varsa bellekte de o olmalı — token yok, rezervasyon duruyor.
       loadSlot() açılıştaki yeniden denemeyi BAŞLATIYOR ve beklemiyor; o deneme
       de (yazma hâlâ düşüyor) geri alınana kadar bellekte geçici bir token
       bırakıyor. Ölçüm yerleşmiş durumda yapılmalı. */
    await a.R('loadSlot(1)');
    /* Açılıştaki yeniden deneme uçuşta; UÇUŞ KİLİDİ boşalana kadar bekleniyor.
       Sabit sayıda tick yetmiyordu — depolama taklidi setTimeout üzerinden
       çalışıyor ve teslimat zinciri birkaç tur sürüyor. */
    await waitFor(() => a.R("Object.keys(IAPS.flight).length") === 0, 3000);
    ok(a.R('S.cid') === cidA, '(23) A yeniden yüklendi');
    ok(a.R("S.iap.t&&S.iap.t.XTOK") === undefined, '(23) A\'ya hak YAZILMADI');
    ok(a.R("!!(S.iap.r&&S.iap.r['" + att + "'])") === true, '(23) A\'nın rezervasyonu duruyor');
    ok(a.R('iapCapOwned()') === 0, '(23) A\'da kapasite yok');
    ok(a.R('iapCapReserved()') === 5, '(23) A\'nın rezervasyonu tavandan yer tutuyor');
    /* Depolama düzelince yeniden deneme tam ve tek sefer teslim ediyor. */
    delete ctl.failWrite;
    await a.R('iapAdvance(IAPQ.q.XTOK)'); await a.R('saveDrain()');
    ok(a.R('iapCapOwned()') === 5, '(23) yeniden deneme hakkı bir kez verdi');
    ok(a.R('iapCapReserved()') === 0, '(23) rezervasyon teslimatla düştü');
    ok(st.consumes === 1, '(23) tam bir kez tüketildi');
  }

  /* (23b) GERİ ALMANIN SÖZLEŞMESİ — doğrudan ve belirlenimci.
         (23) uçtan uca ölçüyor ama yarış penceresi taklitte güvenilir biçimde
         açılmıyor: yazma hatası çok çabuk dönüyor, geri alma yuva değişiminden
         önce koşuyor. Bu yüzden korumalar burada FONKSİYON DÜZEYİNDE sınanıyor;
         üçü de ayrı bir hatayı kapatıyor ve üçü de bağımsız olarak kırılabilir. */
  {
    const { a } = await billSession(newDisk(), {}, {});
    await careerIn(a, 1); await billBoot(a);
    /* İki ayrı kariyer nesnesi; ikisinde de AYNI token adı ve AYNI ürün. */
    a.R("__A={cid:'aaaa',iap:{t:{},r:{zz:{cap:5,at:1}}}};");
    a.R("__B={cid:'bbbb',iap:{t:{TK:'cap5'},r:{}}};");
    a.R("__m=iapMark(__A,'TK','cap5','zz');");
    ok(a.R("__A.iap.t.TK") === 'cap5', '(23b) mutasyon A nesnesine yazıldı');
    ok(a.R("__A.iap.r.zz") === undefined, '(23b) rezervasyon aynı anda düştü');
    ok(a.R("__m.did") === true, '(23b) gerçekten yazıldığı işaretlendi');

    /* 1) HEDEFİN YENİDEN BELİRLENMEMESİ asıl korumadır, ve bunu değer
          karşılaştırmasıyla yakalamak MÜMKÜN DEĞİL: B aynı tokenı aynı ürünle
          taşıdığında, hedefi B'ye çevrilmiş bir geri alma bütün kapıları
          geçer ve B'yi bozar. Aşağısı bunu GÖSTERİYOR — yani "iapRollback'i
          o an S'de ne varsa onunla çağırmak" neden yasak. */
    a.R("__B2={cid:'bbbb',iap:{t:{TK:'cap5'},r:{}}};");
    a.R("iapRollback(Object.assign({},__m,{st:__B2,cid:'bbbb'}));");
    ok(a.R("__B2.iap.t.TK") === undefined,
      '(23b) hedefi değiştirilmiş geri alma YABANCI kariyeri bozar (bu yüzden yasak)');
    /* Bu yüzden korumanın yeri kaynak: üretim kodunda iapRollback YALNIZ
       mutasyonu yapan çağrının kendi yakaladığı işaretle çağrılıyor. */
    {
      const src = fs.readFileSync(path.join(ROOT, 'js', 'iap.js'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      const calls = src.match(/iapRollback\(([^)]*)\)/g) || [];
      const bad = calls.filter(c => !/^iapRollback\(m\d*\)$/.test(c));
      ok(calls.length > 0 && bad.length === 0,
        '(23b) geri alma yalnız yakalanmış işaretle çağrılıyor', bad.join(' | '));
    }
    ok(a.R("__B.iap.t.TK") === 'cap5', '(23b) dokunulmayan nesne el değmeden durdu');

    /* 2) Kimlik değiştiyse (nesne aynı ama kariyer yeniden kurulmuş) dokunmaz. */
    a.R("__A.cid='other';iapRollback(__m);__A.cid='aaaa';");
    ok(a.R("__A.iap.t.TK") === 'cap5', '(23b) kimlik uyuşmayınca geri alma yapılmadı');

    /* 3) Doğru hedef ve doğru kimlik: geri alma yapılır, rezervasyon geri gelir. */
    ok(a.R("iapRollback(__m)") === true, '(23b) doğru hedefte geri alma çalıştı');
    ok(a.R("__A.iap.t.TK") === undefined, '(23b) token geri alındı');
    ok(a.R("__A.iap.r.zz&&__A.iap.r.zz.cap") === 5, '(23b) rezervasyon geri kondu');

    /* 4) İkinci kez geri alma, araya giren başarılı bir teslimatı SİLMEZ. */
    a.R("__A.iap.t.TK='cap5';");
    a.R("__m2=iapMark(__A,'TK','cap5','zz');");     // 'again' → did=false
    ok(a.R("__m2.did") === false, '(23b) zaten teslim edilmişte did=false');
    ok(a.R("iapRollback(__m2)") === false, '(23b) yazmadığı şeyi geri almadı');
    ok(a.R("__A.iap.t.TK") === 'cap5', '(23b) mevcut teslimat korundu');
  }

  /* (24) AYNI TOKEN İÇİN İKİ TESLİMAT AYNI ANDA UÇMAZ.
         Geri almanın güvenli olması buna dayanıyor: paralel bir deneme
         kalıcılaşırken bizimki düşerse, bizim geri almamız onunkini silerdi. */
  {
    const { a } = await billSession(newDisk(), {}, {});
    await careerIn(a, 1); await billBoot(a);
    a.R("IAPQ.q.FL={tok:'FL',sku:'cap_plus_3',pid:'cap3',sc:'career',cid:S.cid,att:'ffffffff',st:'ready',at:1};");
    const p1 = a.R("iapDeliverCareer(IAPQ.q.FL)");
    const p2 = a.R("iapDeliverCareer(IAPQ.q.FL)");
    const r2 = await p2;
    const r1 = await p1;
    await a.R('saveDrain()');
    ok(r2 === 'inflight', '(24) ikinci teslimat başlamadı');
    ok(r1 === 'ok', '(24) ilk teslimat tamamlandı');
    ok(a.R('iapCapOwned()') === 3, '(24) hak bir kez verildi');
    ok(Object.keys(a.R('S.iap.t')).length === 1, '(24) defterde tek token');
    /* Kilit bırakılmış olmalı: sonraki deneme "inflight" takılmıyor. */
    ok(a.R("Object.keys(IAPS.flight).length") === 0, '(24) uçuş kilidi bırakıldı');
  }
}

/* ================= [25] depo geri dönüşü ve göç =================
   Bu blok tek bir soruyu ölçüyor: GEÇİCİ BİR ERİŞİM HATASI KARİYER KAYBETTİRİYOR
   MU. İki yol vardı ve ikisi de burada yeniden üretiliyor.

   ctl.failOpen bunun için var: IndexedDB'nin kendisi yerinde duruyor (disk
   nesnesi aynı), yalnız o oturumda açılamıyor — noIDB'nin tersine, bir sonraki
   oturum aynı veriyi yeniden görüyor. Gerçek hayattaki karşılığı bozuk bir
   profil, dolu bir disk ya da başka bir sekmenin tuttuğu eski sürüm. */
async function careerWith(s, n, agency, weeks) {
  s.R("curSlot=" + n + ";newGame();createAgent('Ad','Soyad','tr','" + agency + "');");
  for (let i = 0; i < (weeks || 0); i++) s.R('nextWeek();');
  s.R('save();');
  await s.R('saveDrain()');
  return s.R('S.cid');
}
/* Hangi yuvada hangi kariyer duruyor — kimlikle, yuva numarasıyla değil. */
async function slotCids(s) {
  const out = {};
  for (let n = 1; n <= 3; n++) {
    const r = await s.R('loadSlot(' + n + ')');
    out[n] = r.ok ? s.R('S.cid') : null;
  }
  s.R('S=null;curSlot=0;');
  return out;
}
const hasCid = (m, cid) => Object.keys(m).some(k => m[k] === cid);

async function tStorageFallback() {
  console.log('\n[25] depo geri dönüşü: geçici hata kariyer kaybettirmiyor');

  /* (1) localStorage YOLUNDA KARİYER İKİNCİ AÇILIŞTA YAŞIYOR.
         Eski kodda moveOneSlot() kaydı KENDİ ÜSTÜNE yazıp doğruluyor, sonra
         kaynağı siliyordu: arka uç localStorage iken kaynak ile hedef aynı
         anahtar. Kariyer ikinci açılışta yok oluyordu. */
  {
    const disk = newDisk(), ls = {};
    const a = session(disk, ls, { failOpen: true });
    await a.booted;
    ok(a.R('saveBackend()') === 'ls', '(1) IndexedDB açılamadı, localStorage\'a düşüldü');
    const cid = await careerWith(a, 1, 'Yerel', 2);
    ok(!!ls['menajerSaveV9s1'], '(1) kayıt localStorage\'a yazıldı');

    const b = session(disk, ls, { failOpen: true });
    await b.booted;
    ok(b.R('saveBackend()') === 'ls', '(1) ikinci açılış da localStorage\'da');
    ok(!!b.R('allMeta().s1'), '(1) yuva menüde duruyor');
    const r = await b.R('loadSlot(1)');
    ok(r.ok === true && b.R('S.cid') === cid, '(1) kariyer ikinci açılışta yerinde',
      JSON.stringify(r));

    // Depo düzelince aynı kayıt IndexedDB'ye taşınıyor — göç hâlâ çalışıyor.
    const c = session(disk, ls, {});
    await c.booted;
    ok(c.R('saveBackend()') === 'idb', '(1) üçüncü açılışta IndexedDB geri geldi');
    ok(!ls['menajerSaveV9s1'], '(1) göç kaynağı sildi');
    const r2 = await c.R('loadSlot(1)');
    ok(r2.ok === true && c.R('S.cid') === cid, '(1) taşınan kariyer aynı');
  }

  /* (2) OKUNAMAYAN YUVA BOŞ GÖSTERİLMİYOR. Menü boş yuva çizerse kullanıcı
         üstüne yeni kariyer kurar; asıl hasar oradan başlıyordu. */
  {
    const disk = newDisk(), ls = {};
    const a = session(disk, ls, {});
    await a.booted;
    await careerWith(a, 1, 'AjansA', 2);
    ok(a.R("pref('idbs','')") === '1', '(2) dolu yuva cihazda hatırlandı');

    const b = session(disk, ls, { failOpen: true });
    await b.booted;
    ok(b.R('saveBackend()') === 'ls', '(2) bu açılışta depo açılamadı');
    ok(b.R('slotShadow(1)') === true, '(2) 1. yuva "okunamıyor" durumunda');
    ok(b.R('slotShadow(2)') === false, '(2) gerçekten boş yuva gölge değil');
    for (const lang of ['tr', 'en']) {
      b.R("L='" + lang + "';");
      b.R('render();');
      const h = b.nodes.view.innerHTML;
      ok(h.indexOf(b.R("t('slotLocked')")) !== -1, '(2) ' + lang + ' menü yuvayı okunamıyor diye çiziyor');
      ok(h.indexOf(b.R("t('slotEmpty')")) === -1, '(2) ' + lang + ' yuva boş diye çizilmiyor');
      ok(h.indexOf('undefined') === -1 && h.indexOf('NaN') === -1 && h.indexOf('[object') === -1,
        '(2) ' + lang + ' menüde sızıntı yok');
    }
    b.R("L='tr';");
    // Gölge yuvaya yeni kariyer kurulmuyor: kurulsaydı çakışma yaratılırdı.
    b.R('newCareerSlot(1);');
    ok(b.R("cur().v") === 'menu', '(2) gölge yuvada yeni kariyer ekranı açılmadı');
    ok(b.nodes.sheet.innerHTML.indexOf(b.R("t('slotLockedTtl')")) !== -1,
      '(2) yerine neden açılamadığı anlatıldı');
    b.R('closeModal();');
    // Gerçekten boş yuva hâlâ kullanılabiliyor.
    b.R('newCareerSlot(2);');
    ok(b.R("cur().v") === 'setup' && b.R('pendSlot') === 2, '(2) boş yuvada yeni kariyer açılıyor');
  }

  /* (3) ÇAKIŞMA: İKİ KARİYER DE KALIYOR ve ikisi de MENÜDEN açılabiliyor.
         Eski kodda B, A'nın üstüne yazılıyordu. */
  {
    const disk = newDisk(), ls = {};
    const a = session(disk, ls, {});
    await a.booted;
    const cidA = await careerWith(a, 1, 'AjansA', 3);

    // Depo açılamıyor; kullanıcı gölge uyarısına rağmen 1. yuvada kariyer kuruyor
    // (uyarıyı atlatan bir yol kalsa bile veri kaybolmamalı — doğrudan kuruyoruz).
    const b = session(disk, ls, { failOpen: true });
    await b.booted;
    const cidB = await careerWith(b, 1, 'AjansB', 1);
    ok(cidA !== cidB, '(3) iki ayrı kariyer');

    const c = session(disk, ls, {});
    await c.booted;
    ok(!ls['menajerSaveV9s1'], '(3) kaynak ancak aktarımdan sonra silindi');
    const m = await slotCids(c);
    ok(hasCid(m, cidA), '(3) IndexedDB\'deki kariyer korundu');
    ok(hasCid(m, cidB), '(3) localStorage yolunda kurulan kariyer korundu');
    ok(!!c.R('allMeta().s1') && !!c.R('allMeta().s2'), '(3) ikisi de menüde görünüyor');
    ok(c.R('rescuedCount()') === 1, '(3) bir kurtarma yapıldı');
    c.R('render();');
    ok(c.nodes.view.innerHTML.indexOf('AjansA') !== -1 &&
       c.nodes.view.innerHTML.indexOf('AjansB') !== -1, '(3) ikisi de menüde yazıyor');

    // Yeniden açılış kopya üretmiyor: kaynak gitti, kurtarma bir kez oldu.
    const d = session(disk, ls, {});
    await d.booted;
    ok(Object.keys(disk.saves).length === 2, '(3) yeniden açılış üçüncü bir kopya üretmedi',
      JSON.stringify(Object.keys(disk.saves)));
    ok(d.R('rescuedCount()') === 0, '(3) ikinci açılışta kurtarılacak bir şey yok');
  }

  /* (4) YER YOKSA: hiçbir şey silinmiyor, menü söylüyor, yuva boşalınca
         kurtarma kendiliğinden tamamlanıyor. */
  {
    const disk = newDisk(), ls = {};
    const a = session(disk, ls, {});
    await a.booted;
    const cid1 = await careerWith(a, 1, 'Bir', 1);
    const cid2 = await careerWith(a, 2, 'İki', 1);
    const cid3 = await careerWith(a, 3, 'Üç', 1);

    const b = session(disk, ls, { failOpen: true });
    await b.booted;
    const cidX = await careerWith(b, 1, 'Kurtarilan', 1);

    const c = session(disk, ls, {});
    await c.booted;
    ok(c.R('rescuePending().length') === 1, '(4) kurtarma yer bekliyor');
    ok(!!ls['menajerSaveV9s1'], '(4) yer yokken kaynak silinmedi');
    const m0 = await slotCids(c);
    ok(hasCid(m0, cid1) && hasCid(m0, cid2) && hasCid(m0, cid3), '(4) üç kariyer de yerinde');
    for (const lang of ['tr', 'en']) {
      c.R("L='" + lang + "';"); c.R('render();');
      ok(c.nodes.view.innerHTML.indexOf(c.R("t('rescueRow')")) !== -1,
        '(4) ' + lang + ' menü bekleyen kurtarmayı söylüyor');
    }
    c.R("L='tr';");
    ok(Object.keys(disk.saves).length === 3, '(4) sınırsız kopya üretilmedi');

    // Yuva boşalıyor: kurtarma tamamlanmalı.
    c.R('deleteSlot(2);');
    await c.R('rescueTask()');
    await c.R('saveDrain()');
    ok(c.R('rescuePending().length') === 0, '(4) bekleyen kurtarma kalmadı');
    ok(!ls['menajerSaveV9s1'], '(4) yer açılınca kaynak aktarıldı ve silindi');
    const m1 = await slotCids(c);
    ok(hasCid(m1, cidX), '(4) bekleyen kariyer artık bir yuvada');
    ok(hasCid(m1, cid1) && hasCid(m1, cid3), '(4) diğer kariyerler etkilenmedi');
  }

  /* (5) YARIDA KESİLEN KURTARMA KOPYA ÜRETMİYOR. Kurtarma yazıldı, kaynak
         silinmeden oturum bitti: ikinci açılış aynı kaydı bir kez daha
         kopyalamamalı. */
  {
    const disk = newDisk(), ls = {};
    const a = session(disk, ls, {});
    await a.booted;
    const cidA = await careerWith(a, 1, 'AjansA', 2);
    const b = session(disk, ls, { failOpen: true });
    await b.booted;
    const cidB = await careerWith(b, 1, 'AjansB', 1);
    const src = ls['menajerSaveV9s1'];

    const c = session(disk, ls, {});
    await c.booted;
    await c.R('saveDrain()');
    ok(Object.keys(disk.saves).length === 2, '(5) kurtarma yazıldı');
    // Kaynağı geri koy: "yazdım ama silemeden kapandım" durumu.
    ls['menajerSaveV9s1'] = src;
    const d = session(disk, ls, {});
    await d.booted;
    await d.R('saveDrain()');
    ok(Object.keys(disk.saves).length === 2, '(5) ikinci kopya üretilmedi',
      JSON.stringify(Object.keys(disk.saves)));
    ok(!ls['menajerSaveV9s1'], '(5) aktarımın tamamlandığı görülünce kaynak silindi');
    const m = await slotCids(d);
    ok(hasCid(m, cidA) && hasCid(m, cidB), '(5) iki kariyer de duruyor');
  }

  /* (6) HEDEF OKUNAMIYORSA HİÇBİR ŞEY YAZILMIYOR VE SİLİNMİYOR.
         "Okuyamadım" ile "orada bir şey yok" aynı cevap sayılırsa göç mevcut
         kariyeri ezer — bu bulgunun çekirdeği. */
  {
    const disk = newDisk(), ls = {};
    const a = session(disk, ls, {});
    await a.booted;
    const cidA = await careerWith(a, 1, 'AjansA', 2);
    const b = session(disk, ls, { failOpen: true });
    await b.booted;
    const cidB = await careerWith(b, 1, 'AjansB', 1);
    const src = ls['menajerSaveV9s1'];
    const snapA = JSON.stringify(disk.saves.s1);

    const c = session(disk, ls, { failGet: k => (k === 's1' ? new Error('ReadFailed') : null) });
    await c.booted;
    ok(ls['menajerSaveV9s1'] === src, '(6) okuma hatasında kaynak yerinde duruyor');
    ok(JSON.stringify(disk.saves.s1) === snapA, '(6) hedef kariyer değişmedi');
    ok(Object.keys(disk.saves).length === 1, '(6) yarım bir kurtarma yazılmadı');

    // Okuma düzelince göç kaldığı yerden devam ediyor.
    const d = session(disk, ls, {});
    await d.booted;
    const m = await slotCids(d);
    ok(hasCid(m, cidA) && hasCid(m, cidB), '(6) sonraki açılışta ikisi de var');
  }

  /* (7) AYNI KİMLİK, HEDEF DAHA İLERİ. İlerleme KAPSAMA DEĞİLDİR: hedefin
         geride kalan kopyayı taşıdığı kanıtlanamaz, bu yüzden kaynak
         silinmiyor — karantinaya alınıyor. Canlı kariyer tek kalıyor. */
  {
    const disk = newDisk(), ls = {};
    const a = session(disk, ls, {});
    await a.booted;
    const cid = await careerWith(a, 1, 'Ajans', 1);
    ls['menajerSaveV9s1'] = JSON.stringify({ v: a.R('SAVE_SCHEMA'), S: a.R('JSON.parse(JSON.stringify(S))'), PID: a.R('PID') });
    // Aynı kariyer diskte ilerliyor.
    for (let i = 0; i < 4; i++) a.R('nextWeek();');
    a.R('save();'); await a.R('saveDrain()');
    const wkDisk = a.R('S.week');

    const b = session(disk, ls, {});
    await b.booted;
    await b.R('saveDrain()');
    ok(!ls['menajerSaveV9s1'], '(7) kaynak localStorage\'da bırakılmadı');
    ok(Object.keys(disk.saves).length === 1, '(7) ikinci bir YUVA harcanmadı');
    ok(b.R('forkList().length') === 1, '(7) geride kalan kopya karantinada');
    const r = await b.R('loadSlot(1)');
    ok(r.ok === true && b.R('S.cid') === cid && b.R('S.week') === wkDisk,
      '(7) oynanan kopya ileri olan');
  }

  /* (8) AYNI KİMLİK, KAYNAK DAHA İLERİ: yine kanıt yok. İki kopya da kalıyor,
         ama ikisi birden CANLI olmuyor — aynı cid iki yuvada duramaz. */
  {
    const disk = newDisk(), ls = {};
    const a = session(disk, ls, {});
    await a.booted;
    const cid = await careerWith(a, 1, 'Ajans', 1);
    const wkDisk = a.R('S.week');
    // Diskteki GERİ kalan kopya bir kenara alınıyor; kariyer ilerledikten sonra
    // ileri olan kopya localStorage kaynağı yapılıp disk geri sarılıyor.
    const early = structuredClone(disk.saves.s1);
    for (let i = 0; i < 4; i++) a.R('nextWeek();');
    a.R('save();'); await a.R('saveDrain()');
    const wkLs = a.R('S.week');
    ls['menajerSaveV9s1'] = JSON.stringify(disk.saves.s1);
    disk.saves.s1 = early;

    const b = session(disk, ls, {});
    await b.booted;
    await b.R('saveDrain()');
    ok(!ls['menajerSaveV9s1'], '(8) kaynak karantinaya alındı');
    ok(Object.keys(disk.saves).length === 1, '(8) ikinci yuva açılmadı');
    ok(b.R('forkList().length') === 1, '(8) ikinci kopya korundu');
    const r1 = await b.R('loadSlot(1)');
    ok(r1.ok && b.R('S.cid') === cid && b.R('S.week') === wkDisk,
      '(8) canlı kopya yuvada duran');
    const kept = await b.R('recGet(forkList()[0].key)');
    ok(!!kept && kept.S.week === wkLs, '(8) saklanan kopya diğer an',
      kept && String(kept.S.week));
    // Canlı ikiz yerindeyken kurtarma yok; ikiz gidince BİREBİR kuruluyor.
    ok((await b.R('forkRestore(forkList()[0].key)')) === 'live',
      '(8) ikiz varken kurtarma reddedildi');
    b.R('deleteSlot(1);'); await b.R('saveDrain()');
    const rr = await b.R('forkRestore(forkList()[0].key)');
    await b.R('saveDrain()');
    ok(rr === 'restored', '(8) ikiz gidince kurtarıldı', String(rr));
    const slot8 = b.R('iapSlotOfCid("' + cid + '")');
    const r2 = await b.R('loadSlot(' + slot8 + ')');
    ok(r2.ok && b.R('S.week') === wkLs && b.R('S.cid') === cid,
      '(8) kurtarılan kopya kendi kimliğiyle açılıyor');
  }

  /* (9) KİMLİKSİZ ESKİ KAYIT. Hedef doluyken kimliği olmayan bir kayıt hiçbir
         şeyin yerine geçmiş sayılmıyor; hedef boşken normal göç aynen çalışıyor
         (blok 3 bunu zaten ölçüyor, burada dolu hedef ölçülüyor). */
  {
    const disk = newDisk(), ls = {};
    const a = session(disk, ls, {});
    await a.booted;
    const cidA = await careerWith(a, 1, 'AjansA', 2);
    const seed = session(newDisk(), {}, {});
    await seed.booted;
    await careerWith(seed, 1, 'Eski', 1);
    const old = JSON.parse(seed.R('JSON.stringify({S:S,PID:PID})'));
    delete old.S.cid;                       // kimlikten önceki dönem
    ls['menajerSaveV9s1'] = JSON.stringify(old);

    const b = session(disk, ls, {});
    await b.booted;
    ok(!ls['menajerSaveV9s1'], '(9) kimliksiz kayıt kurtarıldı');
    ok(Object.keys(disk.saves).length === 2, '(9) iki kayıt da duruyor');
    const r1 = await b.R('loadSlot(1)');
    ok(r1.ok && b.R('S.cid') === cidA, '(9) mevcut kariyer ezilmedi');
    const r2 = await b.R('loadSlot(2)');
    ok(r2.ok === true, '(9) eski kayıt açılabiliyor');
    ok(typeof b.R('S.cid') === 'string' && b.R('S.cid').length === 32,
      '(9) açılışta kimlik verildi');
  }

  /* (10) KURTARMA SIRASINDA YAZMA HATASI: kaynak silinmiyor, sonraki açılış
          tamamlıyor. */
  {
    const disk = newDisk(), ls = {};
    const a = session(disk, ls, {});
    await a.booted;
    const cidA = await careerWith(a, 1, 'AjansA', 2);
    const b = session(disk, ls, { failOpen: true });
    await b.booted;
    const cidB = await careerWith(b, 1, 'AjansB', 1);
    const src = ls['menajerSaveV9s1'];

    const c = session(disk, ls, { failWrite: () => quotaErr() });
    await c.booted;
    ok(ls['menajerSaveV9s1'] === src, '(10) yazma başarısızken kaynak duruyor');
    ok(Object.keys(disk.saves).length === 1, '(10) yarım kayıt diske düşmedi');
    ok(c.R('saveHealthy()') === false, '(10) başarısızlık sağlık durumuna yansıdı');

    const d = session(disk, ls, {});
    await d.booted;
    ok(!ls['menajerSaveV9s1'], '(10) sonraki açılış kurtarmayı tamamladı');
    const m = await slotCids(d);
    ok(hasCid(m, cidA) && hasCid(m, cidB), '(10) iki kariyer de var');
  }

  /* (11) İLERİ SÜRÜMLÜ HEDEF ASLA EZİLMİYOR — loadSlot() ile aynı kural. */
  {
    const disk = newDisk(), ls = {};
    const a = session(disk, ls, {});
    await a.booted;
    await careerWith(a, 1, 'Ajans', 1);
    const SCHEMA = a.R('SAVE_SCHEMA');
    const seed = session(newDisk(), {}, {});
    await seed.booted;
    await careerWith(seed, 1, 'Gelecek', 1);
    disk.saves.s1 = JSON.parse(seed.R('JSON.stringify({v:SAVE_SCHEMA,S:S,PID:PID})'));
    disk.saves.s1.v = SCHEMA + 99;
    const future = JSON.stringify(disk.saves.s1);
    const seed2 = session(newDisk(), {}, {});
    await seed2.booted;
    const cidLs = await careerWith(seed2, 1, 'Gelen', 1);
    ls['menajerSaveV9s1'] = seed2.R('JSON.stringify({S:S,PID:PID})');

    const b = session(disk, ls, {});
    await b.booted;
    ok(JSON.stringify(disk.saves.s1) === future, '(11) ileri sürümlü kayıt yerinde duruyor');
    ok(!ls['menajerSaveV9s1'], '(11) gelen kayıt boş yuvaya kurtarıldı');
    const m = await slotCids(b);
    ok(hasCid(m, cidLs), '(11) gelen kariyer açılabiliyor');
  }
}

/* ================= [26] aynı kimlikli çatal =================
   Blok 25 çakışmayı çözdü ama iki yanlış varsayım bıraktı ve ikisi de burada
   ölçülüyor.

   1) "Aynı cid + hedef eşit ya da ileri (season, week)" KAPSAMA KANITI DEĞİL.
      Aynı hafta içinde ayrışmış iki kopya sıralanamaz, ve ileri haftadaki bir
      kopya geride kalan kopyadaki bir satın alma tokenını taşımıyor olabilir.
      Sıralama artık hiçbir yerde silme gerekçesi değil: kaynak YALNIZ hedefin
      onu birebir taşıdığı görülürse siliniyor.

   2) Aynı cid'li iki kopya iki normal yuvaya konamaz. cid ödeme ve ödül
      teslimatının hedefi: iapSlotOfCid() ilk eşleşen yuvayı döner, deleteSlot()
      cid'ye bağlı ücretli işlemi hedefsiz bırakır, ve aynı token iki kariyerde
      birden kapasite verir. Bu yüzden çatal KARANTİNAYA alınıyor: kalıcı,
      kullanıcıya görünür, ama canlı bir kariyer değil. */

/* Bir kaydı doğrudan diske koyar — ayrışmış kopyalar kurmak için. */
function putSave(disk, slot, rec) { disk.saves['s' + slot] = structuredClone(rec); }
/* Kayıttaki cid'leri sayar: canlı yuvalarda aynı cid iki kez görünmemeli. */
function liveCids(s) {
  const m = s.R('allMeta()'), out = {};
  for (let n = 1; n <= 3; n++) { const e = m['s' + n]; if (e && e.cid) out[e.cid] = (out[e.cid] || 0) + 1; }
  return out;
}

async function tSameCidFork() {
  console.log('\n[26] aynı kimlikli çatal: sıralama kanıt değil, çatal canlı kariyer değil');

  /* (1) AYNI CID, AYNI SEZON/HAFTA, FARKLI VERİ.
         Sıralama bu iki kopyayı ayıramaz. Hiçbiri sessizce silinmemeli. */
  {
    const disk = newDisk(), ls = {};
    const a = session(disk, ls, {}); await a.booted;
    const cid = await careerWith(a, 1, 'Ajans', 2);
    const base = structuredClone(disk.saves.s1);
    const cash0 = base.S.cash;
    // Aynı an, farklı para: ls kopyası ayrışmış.
    const forked = structuredClone(base);
    forked.S.cash = cash0 + 777;
    ls['menajerSaveV9s1'] = JSON.stringify(forked);

    const b = session(disk, ls, {}); await b.booted;
    await b.R('saveDrain()');
    ok(!ls['menajerSaveV9s1'], '(1) kaynak localStorage\'da bırakılmadı');
    ok(JSON.stringify(disk.saves.s1) === JSON.stringify(base),
      '(1) diskteki kopya değişmedi');
    ok(b.R('forkList().length') === 1, '(1) ayrışmış kopya KORUNDU', 'forkList=' + b.R('forkList().length'));
    const fk = b.R('forkList()')[0];
    ok(fk.meta && fk.meta.cash === cash0 + 777, '(1) korunan kopya ayrışmış olan',
      fk.meta && String(fk.meta.cash));
    const cnt = liveCids(b);
    ok(cnt[cid] === 1, '(1) canlı yuvalarda aynı cid yalnız bir kez', JSON.stringify(cnt));
  }

  /* (2) AYNI CID, HEDEF DAHA İLERİ HAFTADA, KAYNAKTA HEDEFTE OLMAYAN BİR
         SATIN ALMA TOKENI. Sıralama "hedef her şeyi taşıyor" der; taşımıyor. */
  {
    const disk = newDisk(), ls = {};
    const a = session(disk, ls, {}); await a.booted;
    await careerWith(a, 1, 'Ajans', 1);
    const early = structuredClone(disk.saves.s1);
    // Geride kalan kopyada ödenmiş bir token var.
    early.S.iap = { t: { 'tok-odenmis': 'cap5' } };
    ls['menajerSaveV9s1'] = JSON.stringify(early);
    // Disk kopyası ilerliyor ama o tokenı hiç görmedi.
    for (let i = 0; i < 4; i++) a.R('nextWeek();');
    a.R('save();'); await a.R('saveDrain()');
    ok(!(disk.saves.s1.S.iap && disk.saves.s1.S.iap.t), '(2) ileri kopyada token yok');

    const b = session(disk, ls, {}); await b.booted;
    await b.R('saveDrain()');
    ok(b.R('forkList().length') === 1, '(2) ödenmiş tokenlı kopya silinmedi');
    const rec = await b.R("recGet(forkList()[0].key)");
    ok(!!(rec && rec.S && rec.S.iap && rec.S.iap.t && rec.S.iap.t['tok-odenmis']),
      '(2) korunan kopya tokenı hâlâ taşıyor');
  }

  /* (3) ÇATAL CANLI KARİYER DEĞİL: ödeme ve ödül hedefi tek. */
  {
    const disk = newDisk(), ls = {};
    const a = session(disk, ls, {}); await a.booted;
    const cid = await careerWith(a, 1, 'Ajans', 2);
    const f = structuredClone(disk.saves.s1); f.S.cash += 500;
    ls['menajerSaveV9s1'] = JSON.stringify(f);
    const b = session(disk, ls, {}); await b.booted;
    await b.R('saveDrain()');
    ok(b.R('iapSlotOfCid("' + cid + '")') === 1, '(3) ödeme hedefi tek ve doğru yuva');
    ok(Object.keys(b.R('allMeta()')).filter(k => /^s\d$/.test(k)).length === 1,
      '(3) menüde tek kariyer var');
    // Yuvayı silmek çatalı canlandırmıyor; çatal yerinde duruyor.
    b.R('deleteSlot(1);'); await b.R('saveDrain()');
    ok(b.R('iapSlotOfCid("' + cid + '")') === 0, '(3) silinen kariyer artık hedef değil');
    ok(b.R('forkList().length') === 1, '(3) çatal silmeden etkilenmedi');
  }

  /* (4) KARANTİNADAKİ KOPYA SONRAKİ localStorage YAZMALARIYLA EZİLEMEZ. */
  {
    const disk = newDisk(), ls = {};
    const a = session(disk, ls, {}); await a.booted;
    await careerWith(a, 1, 'Ajans', 2);
    const f = structuredClone(disk.saves.s1); f.S.cash += 999;
    ls['menajerSaveV9s1'] = JSON.stringify(f);
    const b = session(disk, ls, {}); await b.booted;
    await b.R('saveDrain()');
    const key = b.R('forkList()[0].key');
    const before = JSON.stringify(await b.R('recGet("' + key + '")'));
    // Eski dönem anahtarlarına yazılıyor (göç kaynağı gibi) — karantina ayrı bir
    // anahtar ailesinde durduğu için dokunulmamalı.
    b.R("lsSet('menajerSaveV9s1','{\"bozuk\":1}');lsSet('menajerSaveV9s2','{\"bozuk\":1}');");
    const c = session(disk, ls, {}); await c.booted; await c.R('saveDrain()');
    const after = JSON.stringify(await c.R('recGet("' + key + '")'));
    ok(after === before, '(4) karantinadaki kopya bozulmadı');
    ok(c.R('forkList().length') === 1, '(4) karantina dizini duruyor');
  }

  /* (5) KULLANICIYA ERİŞİLEBİLİR ÇÖZÜM: menü satırı, iki dil, ve kısıtın
         açıkça yazılması. Canlı ikiz yerindeyken KURMA teklif edilmiyor —
         kayıplı bir kopya üretmek yerine iki özgün kayıt da duruyor. */
  {
    const disk = newDisk(), ls = {};
    const a = session(disk, ls, {}); await a.booted;
    const cid = await careerWith(a, 1, 'Ajans', 2);
    const cashLive = a.R('S.cash');
    const f = structuredClone(disk.saves.s1); f.S.cash += 1234;
    ls['menajerSaveV9s1'] = JSON.stringify(f);
    const b = session(disk, ls, {}); await b.booted;
    await b.R('saveDrain()');
    const key = b.R('forkList()[0].key');
    const parked = JSON.stringify(await b.R('recGet("' + key + '")'));
    for (const lang of ['tr', 'en']) {
      b.R("L='" + lang + "';render();");
      const h = b.nodes.view.innerHTML.replace(/on[a-z]+="[^"]*"/g, '');
      ok(h.indexOf(b.R("t('forkRow')")) !== -1, '(5) ' + lang + ' menü çatalı gösteriyor');
      ok(h.indexOf('undefined') === -1 && h.indexOf('NaN') === -1 && h.indexOf('[object') === -1,
        '(5) ' + lang + ' menüde sızıntı yok');
      b.R('cmForkHelp("' + key + '");');
      const s = b.nodes.sheet.innerHTML.replace(/on[a-z]+="[^"]*"/g, '');
      ok(s.indexOf(b.R("t('forkLive')")) !== -1 && s.indexOf(b.R("t('forkKept')")) !== -1,
        '(5) ' + lang + ' modal iki kopyayı da tanıtıyor');
      ok(s.indexOf(b.R("t('forkLiveBlock').replace('{n}',1)")) !== -1,
        '(5) ' + lang + ' kısıt ve nedeni yazıyor');
      ok(s.indexOf(b.R("t('forkRestore')")) === -1, '(5) ' + lang + ' kurma düğmesi yok');
      ok(s.indexOf(b.R("t('forkDiscard')")) !== -1, '(5) ' + lang + ' açık silme yolu var');
      ok(s.indexOf('undefined') === -1 && s.indexOf('NaN') === -1 && s.indexOf('[object') === -1,
        '(5) ' + lang + ' modalda sızıntı yok');
      b.R('closeModal();');
    }
    b.R("L='tr';");
    ok((await b.R('forkRestore("' + key + '")')) === 'live', '(5) ikiz varken kurtarma yok');
    ok(JSON.stringify(await b.R('recGet("' + key + '")')) === parked,
      '(5) reddedilen kurtarma kopyaya dokunmadı');

    /* İkiz gidince kurtarma açılıyor ve BİREBİR oluyor. */
    b.R('deleteSlot(1);'); await b.R('saveDrain()');
    b.R('cmForkHelp("' + key + '");');
    ok(b.nodes.sheet.innerHTML.indexOf(b.R("t('forkRestore')")) !== -1,
      '(5) ikiz gidince kurma düğmesi çıktı');
    b.R('closeModal();');
    const r = await b.R('forkRestore("' + key + '")');
    await b.R('saveDrain()');
    ok(r === 'restored', '(5) kurtarma tamamlandı', String(r));
    ok(b.R('forkList().length') === 0, '(5) karantina boşaldı');
    const cnt = liveCids(b);
    ok(Object.keys(cnt).length === 1 && cnt[cid] === 1,
      '(5) tek etkin kariyer, kimlik korundu', JSON.stringify(cnt));
    const slot = b.R('iapSlotOfCid("' + cid + '")');
    ok(slot > 0 && JSON.stringify(await b.R('recGet("s' + '"+' + slot + ')')) === parked,
      '(5) kurulan kayıt saklanan kopyanın bit bit aynısı');
    const rr = await b.R('loadSlot(' + slot + ')');
    ok(rr.ok && b.R('S.cash') === cashLive + 1234, '(5) ayrışmış içerik korundu',
      String(b.R('S.cash')));
    ok(b.R('S.cid') === cid, '(5) kimlik değişmedi');
  }

  /* (6) AYNI TOKEN İKİ ETKİN KARİYERDE HAK VERMİYOR: iki kopya aynı anda
         ETKİN olamadığı için soru hiç doğmuyor, ve token hiçbir aşamada
         silinmiyor. */
  {
    const disk = newDisk(), ls = {};
    const a = session(disk, ls, {}); await a.booted;
    const cid = await careerWith(a, 1, 'Ajans', 2);
    a.R("S.iap={t:{'tok-1':'cap5'}};save();"); await a.R('saveDrain()');
    const f = structuredClone(disk.saves.s1); f.S.cash += 42;
    ls['menajerSaveV9s1'] = JSON.stringify(f);
    const b = session(disk, ls, {}); await b.booted; await b.R('saveDrain()');
    const key = b.R('forkList()[0].key');
    ok((await b.R('forkRestore("' + key + '")')) === 'live', '(6) ikinci ETKİN kopya açılmadı');
    let carrying = 0;
    for (let n = 1; n <= 3; n++) {
      const r = await b.R('loadSlot(' + n + ')');
      if (r.ok && b.R('iapCapOwned()') > 0) carrying++;
    }
    b.R('S=null;curSlot=0;');
    ok(carrying === 1, '(6) kapasiteyi taşıyan tek etkin kariyer', String(carrying));
    // İkiz gidip kopya kurulunca da kapasite bir kez var, sıfırlanmadan.
    b.R('deleteSlot(1);'); await b.R('saveDrain()');
    await b.R('forkRestore("' + key + '")'); await b.R('saveDrain()');
    let after = 0, capSum = 0;
    for (let n = 1; n <= 3; n++) {
      const r = await b.R('loadSlot(' + n + ')');
      if (r.ok) { after++; capSum += b.R('iapCapOwned()'); }
    }
    b.R('S=null;curSlot=0;');
    ok(after === 1 && capSum === 5, '(6) kapasite ne silindi ne ikilendi',
      after + '/' + capSum);
  }

  /* (7) CANLI İKİZ, YER KOŞULUNDAN ÖNCE GELİR. Yuvalar dolu olsa bile ekranın
         söylediği şey "yer aç" değil, "aynı kariyer zaten oynanıyor" — çünkü
         yer açılsa bile kurtarma yapılamazdı. Hiçbir şey silinmiyor.
         (Gerçek yer-yok durumu, ikiz gittikten sonra yuvasını başka bir
         kariyerin aldığı hâl: blok 27 (4).) */
  {
    const disk = newDisk(), ls = {};
    const a = session(disk, ls, {}); await a.booted;
    await careerWith(a, 1, 'Bir', 2);
    await careerWith(a, 2, 'İki', 1);
    await careerWith(a, 3, 'Üç', 1);
    const f = structuredClone(disk.saves.s1); f.S.cash += 5;
    ls['menajerSaveV9s1'] = JSON.stringify(f);
    const b = session(disk, ls, {}); await b.booted; await b.R('saveDrain()');
    const key = b.R('forkList()[0].key');
    const parked = JSON.stringify(await b.R('recGet("' + key + '")'));
    const r = await b.R('forkRestore("' + key + '")');
    ok(r === 'live', '(7) ikiz varken kurtarma yapılmadı', String(r));
    ok(b.R('forkList().length') === 1, '(7) çatal duruyor');
    b.R('cmForkHelp("' + key + '");');
    ok(b.nodes.sheet.innerHTML.indexOf(b.R("t('forkLiveBlock').replace('{n}',1)")) !== -1,
      '(7) ekran önce ikizi söylüyor');
    ok(b.nodes.sheet.innerHTML.indexOf(b.R("t('forkRestore')")) === -1,
      '(7) kurma düğmesi yok');
    b.R('closeModal();');
    // Yer açmak tek başına yetmiyor: ikiz duruyorsa cevap değişmiyor.
    b.R('deleteSlot(3);'); await b.R('saveDrain()');
    ok((await b.R('forkRestore("' + key + '")')) === 'live', '(7) yer açmak yetmedi');
    // İkizin kendisi gidince kurtarma açılıyor.
    b.R('deleteSlot(1);'); await b.R('saveDrain()');
    const r2 = await b.R('forkRestore("' + key + '")'); await b.R('saveDrain()');
    ok(r2 === 'restored', '(7) ikiz gidince kurtarıldı', String(r2));
    ok(b.R('forkList().length') === 0, '(7) karantina boşaldı');
    const slot = b.R('forkList().length') === 0 ? 1 : 0;
    ok(JSON.stringify(await b.R('recGet("s1")')) === parked ||
       JSON.stringify(await b.R('recGet("s3")')) === parked,
      '(7) kurulan kayıt saklanan kopyanın bit bit aynısı');
  }

  /* (8) KULLANICI SİLERSE — açık bir eylem, sessiz bir kayıp değil. */
  {
    const disk = newDisk(), ls = {};
    const a = session(disk, ls, {}); await a.booted;
    await careerWith(a, 1, 'Ajans', 2);
    const f = structuredClone(disk.saves.s1); f.S.cash += 7;
    ls['menajerSaveV9s1'] = JSON.stringify(f);
    const b = session(disk, ls, {}); await b.booted; await b.R('saveDrain()');
    const key = b.R('forkList()[0].key');
    ok((await b.R('forkDiscard("' + key + '")')) === true, '(8) silme çalıştı');
    await b.R('saveDrain()');
    ok(b.R('forkList().length') === 0, '(8) çatal listesi boşaldı');
    ok(!(await b.R('recGet("' + key + '")')), '(8) kayıt gerçekten gitti');
    const c = session(disk, ls, {}); await c.booted;
    ok(c.R('forkList().length') === 0, '(8) yeniden açılışta geri gelmedi');
  }

  /* (9) KARANTİNA YAZMASI TUTMAZSA kaynak silinmiyor; sonraki açılış tamamlıyor. */
  {
    const disk = newDisk(), ls = {};
    const a = session(disk, ls, {}); await a.booted;
    await careerWith(a, 1, 'Ajans', 2);
    const f = structuredClone(disk.saves.s1); f.S.cash += 11;
    const src = JSON.stringify(f);
    ls['menajerSaveV9s1'] = src;
    const b = session(disk, ls, { failWrite: () => quotaErr() }); await b.booted;
    ok(ls['menajerSaveV9s1'] === src, '(9) yazma tutmazken kaynak duruyor');
    ok(b.R('forkList().length') === 0, '(9) yarım bir çatal dizine girmedi');
    const c = session(disk, ls, {}); await c.booted; await c.R('saveDrain()');
    ok(!ls['menajerSaveV9s1'], '(9) sonraki açılış park etti');
    ok(c.R('forkList().length') === 1, '(9) çatal artık görünür');
  }

  /* (10) YARIDA KESİLEN PARK: kopya yazıldı, kaynak silinemedi. İkinci açılış
          ikinci bir kopya üretmemeli. */
  {
    const disk = newDisk(), ls = {};
    const a = session(disk, ls, {}); await a.booted;
    await careerWith(a, 1, 'Ajans', 2);
    const f = structuredClone(disk.saves.s1); f.S.cash += 13;
    const src = JSON.stringify(f);
    ls['menajerSaveV9s1'] = src;
    const b = session(disk, ls, {}); await b.booted; await b.R('saveDrain()');
    const keys0 = Object.keys(disk.meta).filter(k => /^f\d$/.test(k));
    ok(keys0.length === 1, '(10) tek karantina anahtarı');
    ls['menajerSaveV9s1'] = src;                      // silinemeden kapanmış gibi
    const c = session(disk, ls, {}); await c.booted; await c.R('saveDrain()');
    ok(Object.keys(disk.meta).filter(k => /^f\d$/.test(k)).length === 1,
      '(10) ikinci karantina kopyası üretilmedi');
    ok(!ls['menajerSaveV9s1'], '(10) kaynak silindi');
    ok(c.R('forkList().length') === 1, '(10) tek çatal');
  }

  /* (11) FARKLI YUVADAKİ AYNI CID. Kaynağın kimliği HEDEFTEN BAŞKA bir yuvadaki
          kariyerle aynıysa boş yuvaya kurtarmak iki canlı kopya üretirdi. */
  {
    const disk = newDisk(), ls = {};
    const a = session(disk, ls, {}); await a.booted;
    await careerWith(a, 1, 'Bir', 2);
    const cid2 = await careerWith(a, 2, 'İki', 2);
    const f = structuredClone(disk.saves.s2); f.S.cash += 21;
    ls['menajerSaveV9s1'] = JSON.stringify(f);       // 1. yuvaya, ama 2'nin kimliği
    const b = session(disk, ls, {}); await b.booted; await b.R('saveDrain()');
    const cnt = liveCids(b);
    ok(cnt[cid2] === 1, '(11) aynı cid iki yuvaya konmadı', JSON.stringify(cnt));
    ok(b.R('forkList().length') === 1, '(11) çatal karantinada');
    ok(b.R('iapSlotOfCid("' + cid2 + '")') === 2, '(11) ödeme hedefi bozulmadı');
  }

  /* (12) FARKLI CID normal kurtarma yolunda kalıyor — blok 25 davranışı korundu. */
  {
    const disk = newDisk(), ls = {};
    const a = session(disk, ls, {}); await a.booted;
    const cidA = await careerWith(a, 1, 'AjansA', 2);
    const b = session(disk, ls, { failOpen: true }); await b.booted;
    const cidB = await careerWith(b, 1, 'AjansB', 1);
    const c = session(disk, ls, {}); await c.booted; await c.R('saveDrain()');
    ok(c.R('forkList().length') === 0, '(12) farklı cid karantinaya girmedi');
    const cnt = liveCids(c);
    ok(cnt[cidA] === 1 && cnt[cidB] === 1, '(12) iki kariyer de canlı', JSON.stringify(cnt));
  }
}

/* ================= [27] kurtarmanın bedeli ve bekleyen kaynak =================
   Blok 26 çatalı canlı yuvadan ayırdı ama iki şey açıkta kaldı.

   1) forkRestore() kopyayı YENİ bir kimlikle kurup S.iap'ı düşürüyordu. Ücretli
      token yalnız karantinadaki kopyada duruyorsa (bkz. blok 26 (2)) bu, para
      ödenmiş bir kaydı kurtarma adı altında silmek demekti — üstelik karantina
      kaydı da hemen ardından siliniyordu, yani token geri getirilemiyordu.
      Ekrandaki metin de yanlıştı: "kapasite oynanan kopyada kalır" diyordu,
      oysa o kopyada hiç yoktu.

   2) Karantina doluyken ikinci çatalın kaynağı localStorage'ın YUVA anahtarında
      bekliyor. O anahtar aynı zamanda localStorage arka ucunun kendi yuva
      anahtarı — yani depo açılamayan bir açılışta oyunun normal yazıcıları
      oraya yazabilir. Blok 26 (4) yalnız "elle bozuk veri yazınca karantina
      bozulmadı" diyordu; bu, bekleyen KAYNAĞIN başına ne geldiğini ölçmüyor. */

/* Gerçek yazıcı yolu: menüden yuva seç, formu doldur, kariyeri kur.
   startCareer() DOM'dan okuyor, bu yüzden alanlar gerçekten dolduruluyor. */
async function uiNewCareer(s, slot, fn, ln, ag) {
  s.R("stack=[{v:'menu'}];pendSlot=0;");
  s.R('newCareerSlot(' + slot + ');');
  if (s.R("cur().v") !== 'setup') return false;   // menü girişte reddetti
  s.nodes.inp_fn.value = fn; s.nodes.inp_ln.value = ln;
  s.nodes.inp_ag.value = ag; s.nodes.sel_nat.value = 'tr';
  s.R('startCareer();');
  // Kariyer GERÇEKTEN kuruldu mu — yazıcı da reddedebiliyor.
  const made = s.R('!!(S&&S.agent)&&curSlot===' + slot);
  if (made) { s.R('save();'); await s.R('saveDrain()'); }
  return made;
}

async function tForkRestoreCost() {
  console.log('\n[27] kurtarma kayıpsız mı, bekleyen kaynak duruyor mu');

  /* (1) YALNIZ KARANTİNADAKİ KOPYADA DURAN ÖDENMİŞ TOKEN.
         Kullanıcı arayüzünün çağırdığı gerçek kurtarma fonksiyonuna kadar
         gidiliyor; park edilmiş baytlara bakmak yetmez. */
  {
    const disk = newDisk(), ls = {};
    const a = session(disk, ls, {}); await a.booted;
    const cid = await careerWith(a, 1, 'Ajans', 1);
    const paid = structuredClone(disk.saves.s1);
    paid.S.iap = { t: { 'TOKEN-ODENMIS': 'cap5' }, r: { 'att-1': { cap: 3, at: 1 } } };
    ls['menajerSaveV9s1'] = JSON.stringify(paid);
    // Disk kopyası ilerliyor ve o tokenı hiç görmüyor.
    for (let i = 0; i < 4; i++) a.R('nextWeek();');
    a.R('save();'); await a.R('saveDrain()');

    const b = session(disk, ls, {}); await b.booted; await b.R('saveDrain()');
    ok(b.R('forkList().length') === 1, '(1) ödenmiş kopya karantinada');
    const key = b.R('forkList()[0].key');

    /* Canlı ikiz yerindeyken kurtarma TEKLİF EDİLMEMELİ: aynı cid iki yuvada
       olamaz, ve tokenı düşürerek kurmak kayıplı bir kopya üretmek olurdu. */
    const r = await b.R('forkRestore("' + key + '")');
    ok(r === 'live', '(1) canlı ikiz varken kurtarma yapılmadı', String(r));
    const kept = await b.R('recGet("' + key + '")');
    ok(!!(kept && kept.S.iap && kept.S.iap.t && kept.S.iap.t['TOKEN-ODENMIS']),
      '(1) token karantinada duruyor');
    ok(!!(kept && kept.S.iap && kept.S.iap.r && kept.S.iap.r['att-1']),
      '(1) rezervasyon da duruyor');
    ok(Object.keys(b.R('allMeta()')).filter(k => /^s\d$/.test(k)).length === 1,
      '(1) kayıplı bir kopya kurulmadı');

    /* Ekran kısıtı açıkça anlatıyor ve "tam kurtarma" diye bir şey sunmuyor. */
    for (const lang of ['tr', 'en']) {
      b.R("L='" + lang + "';cmForkHelp('" + key + "');");
      const s = b.nodes.sheet.innerHTML.replace(/on[a-z]+="[^"]*"/g, '');
      ok(s.indexOf(b.R("t('forkLiveBlock').replace('{n}',1)")) !== -1, '(1) ' + lang + ' kısıt yazıyor');
      ok(s.indexOf(b.R("t('forkRestore')")) === -1, '(1) ' + lang + ' kurma düğmesi yok');
      ok(s.indexOf(b.R("t('forkDiscard')")) !== -1, '(1) ' + lang + ' açık silme yolu var');
      ok(s.indexOf('undefined') === -1 && s.indexOf('NaN') === -1 && s.indexOf('[object') === -1,
        '(1) ' + lang + ' sızıntı yok');
      b.R('closeModal();');
    }
    b.R("L='tr';");

    /* Canlı ikiz gidince kurtarma açılıyor — ve BİREBİR oluyor: kimlik de,
       ödeme defteri de olduğu gibi geliyor. */
    b.R('deleteSlot(1);'); await b.R('saveDrain()');
    const before = JSON.stringify(await b.R('recGet("' + key + '")'));
    const r2 = await b.R('forkRestore("' + key + '")'); await b.R('saveDrain()');
    ok(r2 === 'restored', '(1) ikiz gidince kurtarıldı', String(r2));
    const slot = b.R('iapSlotOfCid("' + cid + '")');
    ok(slot > 0, '(1) ödeme hedefi yeniden bağlandı', String(slot));
    const back = await b.R('recGet("s' + 1 + '")');
    ok(JSON.stringify(await b.R('recGet("s' + slot + '")')) === before,
      '(1) kurtarma BİREBİR — kimlik ve defter değişmedi');
    await b.R('loadSlot(' + slot + ')');
    ok(b.R('S.cid') === cid, '(1) kimlik korundu');
    ok(b.R('iapCapOwned()') === 5, '(1) ödenmiş kapasite geldi', String(b.R('iapCapOwned()')));
    ok(b.R('forkList().length') === 0, '(1) karantina ancak kayıpsız geçişten sonra boşaldı');
  }

  /* (2) AYNI TOKEN İKİ ETKİN KARİYERDE HAK VERMİYOR: kurtarma yalnız cid
         hiçbir yuvada canlı değilken yapılabildiği için iki kopya asla aynı
         anda etkin olamıyor. */
  {
    const disk = newDisk(), ls = {};
    const a = session(disk, ls, {}); await a.booted;
    const cid = await careerWith(a, 1, 'Ajans', 1);
    a.R("S.iap={t:{'TOK':'cap5'}};save();"); await a.R('saveDrain()');
    const f = structuredClone(disk.saves.s1); f.S.cash += 9;
    ls['menajerSaveV9s1'] = JSON.stringify(f);
    const b = session(disk, ls, {}); await b.booted; await b.R('saveDrain()');
    const key = b.R('forkList()[0].key');
    ok((await b.R('forkRestore("' + key + '")')) === 'live', '(2) ikinci etkin kopya açılmadı');
    let live = 0;
    for (let n = 1; n <= 3; n++) {
      const r = await b.R('loadSlot(' + n + ')');
      if (r.ok && b.R('S.cid') === cid) live++;
    }
    b.R('S=null;curSlot=0;');
    ok(live === 1, '(2) token taşıyan tek bir etkin kariyer var', String(live));
  }

  /* (3) BEKLEYEN KAYNAK (forkBusy) — karantina dolu, ikinci kaynak yuva
         anahtarında bekliyor. Depo açılamayan bir açılışta oyunun GERÇEK
         yazıcıları çalışıyor; kaynak ne kaybolmalı ne de ezilmeli. */
  {
    const disk = newDisk(), ls = {};
    const a = session(disk, ls, {}); await a.booted;
    await careerWith(a, 1, 'Ajans', 2);
    const base = structuredClone(disk.saves.s1);
    // İlk çatal park ediliyor.
    const f1 = structuredClone(base); f1.S.cash += 100;
    ls['menajerSaveV9s1'] = JSON.stringify(f1);
    const b = session(disk, ls, {}); await b.booted; await b.R('saveDrain()');
    ok(b.R('forkList().length') === 1, '(3) ilk çatal karantinada');
    // İkinci çatal: karantina dolu, kaynak yuva anahtarında bekliyor.
    const f2 = structuredClone(base); f2.S.cash += 200;
    const src2 = JSON.stringify(f2);
    ls['menajerSaveV9s1'] = src2;
    const c = session(disk, ls, {}); await c.booted; await c.R('saveDrain()');
    ok(c.R("rescuePending().filter(r=>r.why==='forkBusy').length") === 1,
      '(3) ikinci kaynak bekliyor');
    ok(ls['menajerSaveV9s1'] === src2, '(3) bekleyen kaynak yerinde');

    // Depo açılamıyor: gerçek yazıcı yolu çalışıyor.
    const d = session(disk, ls, { failOpen: true }); await d.booted;
    ok(d.R('saveBackend()') === 'ls', '(3) localStorage arka ucundayız');
    /* Bu kipte bekleyen kaynak o yuvanın kaydının TA KENDİSİ: saklı değil,
       menüde normal bir kariyer olarak görünüyor ve açılabiliyor. */
    const rr = await d.R('loadSlot(1)');
    ok(rr.ok === true && d.R('S.cash') === JSON.parse(src2).S.cash,
      '(3) bekleyen kaynak bu kipte açılabiliyor', JSON.stringify(rr));
    d.R('S=null;curSlot=0;');
    ok((await uiNewCareer(d, 1, 'A', 'B', 'X')) === false,
      '(3) üstüne yeni kariyer KURULAMADI');
    ok(d.nodes.toast.innerHTML.indexOf(d.R("t('slotBusy')")) !== -1, '(3) neden söylendi');
    ok(ls['menajerSaveV9s1'] === src2, '(3) kurma denemesi kaynağa dokunmadı');
    d.R('closeModal();');
    ok((await uiNewCareer(d, 2, 'Yeni', 'Kariyer', 'YeniAjans')) === true,
      '(3) boş yuvada kariyer kuruldu');
    for (let i = 0; i < 3; i++) { d.R('nextWeek();save();'); }
    await d.R('saveDrain()');
    ok(!!ls['menajerSaveV9s2'], '(3) yeni kariyer kendi yuvasına yazıldı');
    ok(ls['menajerSaveV9s1'] === src2, '(3) bekleyen kaynak hâlâ bit bit aynı');

    // Karantina boşalınca kaynak TAM BİR KEZ kurtarılıyor.
    const e = session(disk, ls, {}); await e.booted; await e.R('saveDrain()');
    const k1 = e.R('forkList()[0].key');
    ok(e.R('forkList().length') === 1, '(3) hâlâ tek çatal');
    ok(ls['menajerSaveV9s1'] === src2, '(3) kaynak yine bekliyor');
    ok((await e.R('forkDiscard("' + k1 + '")')) === true, '(3) kullanıcı ilk çatalı sildi');
    await e.R('rescueTask()'); await e.R('saveDrain()');
    ok(!ls['menajerSaveV9s1'], '(3) bekleyen kaynak park edildi');
    ok(e.R('forkList().length') === 1, '(3) karantinada tam bir kopya var');
    const parked = await e.R('recGet(forkList()[0].key)');
    ok(JSON.stringify(parked) === JSON.stringify(JSON.parse(src2).S ? { v: e.R('SAVE_SCHEMA'), S: JSON.parse(src2).S, PID: JSON.parse(src2).PID } : null),
      '(3) park edilen, bekleyen kaynağın ta kendisi');
    const fkeys = Object.keys(disk.meta).filter(k => /^f\d$/.test(k));
    ok(fkeys.length === 1, '(3) fazladan karantina kopyası yok', JSON.stringify(fkeys));
    // Bir kez daha açılış hiçbir şey üretmemeli.
    const g = session(disk, ls, {}); await g.booted; await g.R('saveDrain()');
    ok(g.R('forkList().length') === 1, '(3) yeniden açılışta ikinci kez kurtarılmadı');
    ok(Object.keys(disk.meta).filter(k => /^f\d$/.test(k)).length === 1, '(3) karantina tek');
  }

  /* (4) KURTARMA BOŞ YUVA İSTER; yer yokken de hiçbir şey kaybolmuyor. */
  {
    const disk = newDisk(), ls = {};
    const a = session(disk, ls, {}); await a.booted;
    const cid = await careerWith(a, 1, 'Bir', 2);
    const f = structuredClone(disk.saves.s1); f.S.cash += 5;
    ls['menajerSaveV9s1'] = JSON.stringify(f);
    const b = session(disk, ls, {}); await b.booted; await b.R('saveDrain()');
    const key = b.R('forkList()[0].key');
    await careerWith(b, 2, 'İki', 1);
    await careerWith(b, 3, 'Üç', 1);
    b.R('deleteSlot(1);'); await b.R('saveDrain()');     // ikiz gitti
    await careerWith(b, 1, 'Baska', 1);                  // ama üç yuva da dolu
    const r = await b.R('forkRestore("' + key + '")');
    ok(r === 'noRoom', '(4) yer yokken kurtarma yapılmadı', String(r));
    ok(b.R('forkList().length') === 1, '(4) kopya duruyor');
    b.R('cmForkHelp("' + key + '");');
    ok(b.nodes.sheet.innerHTML.indexOf(b.R("t('forkNoRoom')")) !== -1, '(4) ekran yer açmayı söylüyor');
    b.R('closeModal();');
    b.R('deleteSlot(3);'); await b.R('saveDrain()');
    ok((await b.R('forkRestore("' + key + '")')) === 'restored', '(4) yer açılınca kurtarıldı');
    await b.R('saveDrain()');
    ok(b.R('iapSlotOfCid("' + cid + '")') > 0, '(4) kimlik geri geldi');
  }

  /* (5) KURTARMA YAZMASI TUTMAZSA karantina silinmiyor. */
  {
    const disk = newDisk(), ls = {}, ctl = {};
    const a = session(disk, ls, ctl); await a.booted;
    await careerWith(a, 1, 'Ajans', 2);
    const f = structuredClone(disk.saves.s1); f.S.cash += 3;
    ls['menajerSaveV9s1'] = JSON.stringify(f);
    const b = session(disk, ls, ctl); await b.booted; await b.R('saveDrain()');
    const key = b.R('forkList()[0].key');
    b.R('deleteSlot(1);'); await b.R('saveDrain()');
    ctl.failWrite = () => quotaErr();
    const r = await b.R('forkRestore("' + key + '")');
    ok(r === 'writeFailed' || r === 'verifyFailed', '(5) kurtarma başarısız raporlandı', String(r));
    delete ctl.failWrite;
    ok(!!(await b.R('recGet("' + key + '")')), '(5) karantina kaydı duruyor');
    const r2 = await b.R('forkRestore("' + key + '")'); await b.R('saveDrain()');
    ok(r2 === 'restored', '(5) sonraki deneme tamamladı', String(r2));
  }
}

/* Oturum kurucusu başka doğrulama betiklerinden de kullanılabilsin (tam uygulama
   taraması, çok sezonlu regresyon). Doğrudan çalıştırıldığında testler koşuyor. */
module.exports = { session, newDisk, makeEl, waitFor, tick };
if (require.main !== module) return;

/* ================= koşu ================= */
(async function () {
  const tests = [tNewSaveAndRestart, tLegacySingle, tLegacySlots, tMigrationAtomicity,
                 tQuotaVisible, tLocalStorageFallback, tSchemaVersion, tTwoSeasons,
                 tSlotDeleteAndCoalesce, tCareerIdentity, tCidLegacyMigration,
                 tCidSlotsAndCapacity, tRewardDailyRight, tRewardCareersAndMidnight,
                 tRewardPendingAndWriteFail, tRewardClockAndOldSaves, tRewardRegressions,
                 tAdsAdapter, tUmpConsent, tAdAgeGate, tPrivacyFeedback,
                 tSeasonBreakAds, tShopAndIap, tPlayBilling,
                 tStorageFallback, tSameCidFork, tForkRestoreCost];
  for (const t of tests) {
    try { await t(); }
    catch (e) { fail++; fails.push(t.name + ' ÇÖKTÜ: ' + e.message); console.log('  ÇÖKTÜ ' + t.name + ': ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 3).join('\n')); }
  }
  console.log('\n' + '='.repeat(52));
  console.log(pass + ' geçti, ' + fail + ' kaldı');
  if (fails.length) { console.log('\nKalanlar:'); fails.forEach(f => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
})();
