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
const FILES = ['i18n','store','saves','reward','ads','data','worldgeo','atlas','rivals','core',
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
      get(key) { const r = req(); r.__work = () => { r.result = structuredClone(data[key]); }; return r; },
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
        requestConsentInfo() {
          st.asks++; st.order.push('ask');
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
    ok(a.R("VIEWS.dash().indexOf('adsWatch()')") === -1, '(6) ana ekranda düğme yok');
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
    ok(a.R("adsRowHtml().indexOf('adsAgeOpen()')") !== -1, '(1) satır beyan ekranını açıyor');
    ok(a.R("adsRowHtml().indexOf(fmtK(RW.amount))") === -1, '(1) tutar yazılmıyor');
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
    ok(a.R("adsRowHtml().indexOf('adsAgeOpen()')") === -1, '(3) satırda düzeltme daveti yok');
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
      const h = a.R('adsAgeRowHtml()+adsRowHtml()');
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
    const askSub = a.R("t('adAgeRowSub')");
    ok(h0.indexOf(askSub) !== -1 && h0.indexOf('adsAgeOpen()') !== -1,
       '(24) başlangıçta çizilen satır beyan istiyor');
    /* Gerçek kullanıcı yolu: satır → beyan ekranı → alan → Kaydet. */
    a.R('adsAgeOpen();');
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
    ok(h1.indexOf(askSub) === -1, '(24) eski "doğum yılın sorulacak" metni ekranda kalmadı');
    ok(h1.indexOf('adsAgeOpen()') === -1, '(24) beyan ekranını yeniden açan tıklama yolu kalmadı');
    ok(h1.indexOf('adsWatch()') === -1, '(24) tutulamayacak bir reklam sözü de çizilmedi');
    ok(h1.indexOf('undefined') === -1 && h1.indexOf('[object') === -1, '(24) ekran bozulmadı');
    /* Tek dokunuş tek işlem: ikinci bir izin turu ya da çift beyan yazımı yok. */
    ok(fake.stat.asks === 1 && fake.stat.forms === 0, '(24) çift işlem başlamadı');
    fake.finishAsk(); await settle();
    const h2 = a.R("document.getElementById('view').innerHTML");
    ok(h2.indexOf('adsWatch()') !== -1, '(24) akış bitince ödül satırı çizildi');
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
                 tAdsAdapter, tUmpConsent, tAdAgeGate];
  for (const t of tests) {
    try { await t(); }
    catch (e) { fail++; fails.push(t.name + ' ÇÖKTÜ: ' + e.message); console.log('  ÇÖKTÜ ' + t.name + ': ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 3).join('\n')); }
  }
  console.log('\n' + '='.repeat(52));
  console.log(pass + ' geçti, ' + fail + ' kaldı');
  if (fails.length) { console.log('\nKalanlar:'); fails.forEach(f => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
})();
