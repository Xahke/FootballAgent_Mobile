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
const FILES = ['i18n','store','saves','data','worldgeo','atlas','rivals','core',
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
        // Yapısal kopya: gerçek IndexedDB de put anında kopyalar. Kopyalamazsak
        // S'nin sonraki mutasyonları "diske" sızar ve testler yalan söyler.
        r.__work = () => { data[key] = structuredClone(val); r.result = key; };
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

/* Oturum kurucusu başka doğrulama betiklerinden de kullanılabilsin (tam uygulama
   taraması, çok sezonlu regresyon). Doğrudan çalıştırıldığında testler koşuyor. */
module.exports = { session, newDisk, makeEl, waitFor, tick };
if (require.main !== module) return;

/* ================= koşu ================= */
(async function () {
  const tests = [tNewSaveAndRestart, tLegacySingle, tLegacySlots, tMigrationAtomicity,
                 tQuotaVisible, tLocalStorageFallback, tSchemaVersion, tTwoSeasons,
                 tSlotDeleteAndCoalesce, tCareerIdentity, tCidLegacyMigration,
                 tCidSlotsAndCapacity];
  for (const t of tests) {
    try { await t(); }
    catch (e) { fail++; fails.push(t.name + ' ÇÖKTÜ: ' + e.message); console.log('  ÇÖKTÜ ' + t.name + ': ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 3).join('\n')); }
  }
  console.log('\n' + '='.repeat(52));
  console.log(pass + ' geçti, ' + fail + ' kaldı');
  if (fails.length) { console.log('\nKalanlar:'); fails.forEach(f => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
})();
