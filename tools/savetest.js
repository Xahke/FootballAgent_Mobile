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
const FILES = ['i18n','store','saves','reward','data','worldgeo','atlas','rivals','core',
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
                 tRewardPendingAndWriteFail, tRewardClockAndOldSaves, tRewardRegressions];
  for (const t of tests) {
    try { await t(); }
    catch (e) { fail++; fails.push(t.name + ' ÇÖKTÜ: ' + e.message); console.log('  ÇÖKTÜ ' + t.name + ': ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 3).join('\n')); }
  }
  console.log('\n' + '='.repeat(52));
  console.log(pass + ' geçti, ' + fail + ' kaldı');
  if (fails.length) { console.log('\nKalanlar:'); fails.forEach(f => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
})();
