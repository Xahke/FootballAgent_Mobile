// node tools/i18n-scan.js [--diller=tr,en] [--temalar=saha,dosya] [--sezon=2] [--tohum=1]
//                         [--yaz=dosya.json] [--fark=eski.json] [--sessiz]
//
// Tüm ekranları ve modalları her dilde çizen tarayıcısız tarama. İki iş görüyor:
//
//   1. Sızıntı taraması — DOM'a undefined, NaN, [object Object] ya da çözülmemiş
//      bir {yer tutucu} çıkıyor mu. on*="…" öznitelikleri ayıklanıyor: işleyici
//      gövdesi koddur, buyScout(3) sızmış bir değer değil.
//   2. Önce/sonra karşılaştırması — --yaz ile bir anlık görüntü alınır, kod
//      değişince --fark ile aynı koşu tekrarlanır. Dil altyapısının tr/en
//      çıktısını değiştirmediğini bu ölçüyor: aynı tohum, aynı tarih, aynı sıra.
//
// Neden yalnız iki tema: dört temadan yalnız Saha farklı HTML üretiyor
// (useSaha* kapıları); Dosya, Gazete ve Terminal aynı işaretlemeyi farklı CSS ile
// giydiriyor. Saha + Dosya iki kod yolunun ikisini de çiziyor.
//
// Neden zamanlayıcılar elle: bazı modallar setTimeout ile açılıyor (sezon özeti).
// Gerçek zamanlayıcı sırayı Node'un döngüsüne bırakırdı; burada kuyruk her
// adımdan sonra elle boşaltılıyor, yani iki koşu aynı sırayla çalışıyor.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
// tools/savetest.js ve tools/playtest.js'teki FILES ile aynı liste ve aynı sıra.
const FILES = ['i18n','lang-es','lang-pt','lang-de','lang-fr','lang-it','store','saves','reward','ads-testcfg','ads','iap','review','data','worldgeo','atlas','rivals','badges','core',
               'sim','market','events','skills','sfx','actions','ui','main'];
const FIXED_NOW = 1790000000000;   // 2026 sonu; cmDate ve "son oynanma" sabit kalsın

const ARG = {};
process.argv.slice(2).forEach(a => {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  if (m) ARG[m[1]] = m[2] === undefined ? true : m[2];
});
const list = (v, d) => (typeof v === 'string' && v ? v.split(',').map(s => s.trim()).filter(Boolean) : d);

/* ================= DOM taklidi ================= */
/* playtest.js'tekiyle aynı biçim: aynı id hep aynı düğüm, value yazılabilir. */
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

/* ================= oturum ================= */
function boot(seed) {
  const nodes = {};
  const timers = [];
  const doc = {
    createElement: makeEl, createElementNS: makeEl, createTextNode: makeEl,
    getElementById(id) { return nodes[id] || (nodes[id] = makeEl()); },
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener() {}, removeEventListener() {},
    body: makeEl(), head: makeEl(), visibilityState: 'visible',
    documentElement: { style: { setProperty() {} }, dataset: {}, setAttribute() {}, classList: { add() {}, remove() {} } }
  };
  const ctx = {
    console, structuredClone,
    setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {},
    setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    document: doc, navigator: { language: 'tr', languages: ['tr'], userAgent: 'node' },
    localStorage: makeLS(),
    location: { protocol: 'file:', href: 'file:///x' },
    performance: { now: () => FIXED_NOW },
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
  vm.runInContext(
    'function __mb32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);' +
    't=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}' +
    'Math.random=__mb32(' + (seed >>> 0) + ');' +
    // Sabit saat: argümansız new Date() ve Date.now() aynı anı versin.
    'globalThis.Date=(function(D){class F extends D{constructor(...a){a.length?super(...a):super(' + FIXED_NOW + ');}' +
    'static now(){return ' + FIXED_NOW + ';}}return F;})(Date);', ctx);
  FILES.forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8'),
    ctx, { filename: 'js/' + f + '.js' }));
  /* bot.js hız için render/save/openModal gibi fonksiyonları yüklenirken
     değiştiriyor. Asılları saklanıyor; bot oynadıktan sonra unbot() geri koyuyor,
     yoksa bu araç boş fonksiyonları "çizmiş" olurdu. */
  const BOT_OVR = ['save','render','toast','pushModal','showEvent','showPoach','openModal',
                   'applyEff','transferCutFor','doTransfer','aiTransfer','pushNews'];
  vm.runInContext('var __ORIG={' + BOT_OVR.map(n => n + ':' + n).join(',') + '};', ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'playtest', 'bot.js'), 'utf8'),
    ctx, { filename: 'tools/playtest/bot.js' });
  ctx.__unbot = () => vm.runInContext(BOT_OVR.map(n => n + '=__ORIG.' + n + ';').join(''), ctx);
  const R = code => vm.runInContext(code, ctx);
  const flush = () => { let n = 0; while (timers.length && n++ < 500) { try { timers.shift()(); } catch (e) { /* aşağıda yakalanıyor */ } } };
  return { ctx, R, nodes, flush };
}

/* Çizimin yazdığı düğümler. Sıra sabit; boş olanlar atlanıyor. */
const CAP_IDS = ['hBack','hT1','hT2','hCash','hCashL','hRep','hRepL','btnNext','btnSet','btnShop','saveWarn','view','nav','sheet','toast'];

/* ================= sözde dil (--sahte) =================
   'xx' dili: İngilizcenin her harfi benzer görünen başka bir harfe çevrilmiş
   hâli (a→ä, k→ķ…). Çeviri yollarından (t, tx, newsTxt) geçen her metin böyle
   görünüyor; ekranda düz ASCII harf kalıyorsa ya bir özel ad (oyuncu, kulüp,
   ajans) ya da koda gömülü, hiçbir çeviriden geçmeyen bir metindir. Ayrıca
   %35 uzatılıyor: Almanca gibi uzun bir dilin yerleşime ne yaptığı daha çeviri
   gelmeden görülsün. {yer tutucu}, HTML etiketi, &varlık; ve adresler korunuyor. */
const PSEUDO_JS = `
(function(){
  var A='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var B='äƀçđëƒğħïĵķļɱñöþʠŕšŧüṽŵẋÿžÄƁÇĐËƑĞĦÏĴĶĻṀÑÖṖǪŔŠŦÜṼŴẊŸŽ';
  var MAP={};for(var i=0;i<A.length;i++)MAP[A[i]]=B[i];
  function ps(s){
    s=String(s);
    if(/^https?:/.test(s))return s;
    var out='',n=0;
    for(var i=0;i<s.length;){
      var c=s[i];
      if(c==='<'){var j=s.indexOf('>',i);if(j<0)j=s.length-1;out+=s.slice(i,j+1);i=j+1;continue;}
      if(c==='{'){var k=s.indexOf('}',i);if(k>0&&/^\\{[a-z]+\\}$/i.test(s.slice(i,k+1))){out+=s.slice(i,k+1);i=k+1;continue;}}
      if(c==='&'){var m=/^&[#a-z0-9]+;/i.exec(s.slice(i));if(m){out+=m[0];i+=m[0].length;continue;}}
      if(MAP[c]){out+=MAP[c];n++;}else out+=c;
      i++;
    }
    var pad=Math.round(n*0.35);
    return pad?out+'·'.repeat(pad):out;
  }
  function deep(v){
    if(typeof v==='string')return ps(v);
    if(Array.isArray(v))return v.map(deep);
    if(v&&typeof v==='object'){var o={};for(var k in v)o[k]=deep(v[k]);return o;}
    return v;
  }
  LANGS.push({c:'xx',n:'Ẋẋ',loc:'en',dec:',',pct:'{n} %'});
  STR.xx={};for(var k in STR.en)STR.xx[k]=ps(STR.en[k]);
  NEWS.xx={};Object.keys(NEWS.en).forEach(function(k){NEWS.xx[k]=function(p){return ps(NEWS.en[k](p));};});
  tx=function(o){return o==null?o:(o.xx!==undefined?o.xx:deep(o.en));};
  globalThis.__ps=ps;
})();`;

async function scan(cfg) {
  const s = boot(cfg.seed);
  const tickN = () => new Promise(r => setImmediate(r));
  for (let i = 0; i < 50; i++) { s.flush(); await tickN(); }

  // Durum: bot birkaç sezon oynasın. Sezon özeti modalının argümanı yolda yakalanıyor.
  s.R("var __champs=null;(function(o){showSeasonModal=function(c){__champs=c;return o(c);};})(showSeasonModal);");
  s.R('BOT.run(' + JSON.stringify({ seed: cfg.seed, seasons: cfg.seasons, ev: 'ilk', neg: 'normal', tr: 'orta', nat: 'tr', world: false }) + ')');
  s.flush();
  s.R('__unbot();BOT.q=[];');
  /* Kayıt yuvası yok (curSlot 0), yani save() diske yazmaz; menü de "boş yuva"
     çizer. Menünün beklemedeki "Yükleniyor…" satırı storeReady'ye bağlı. */
  for (let i = 0; i < 50 && !s.R('storeReady'); i++) { s.flush(); await tickN(); }
  s.R('var __S0=JSON.stringify(S);');
  if (cfg.pseudo) s.R(PSEUDO_JS);

  const out = {};
  const errs = [];
  const langs = cfg.langs;
  const themes = cfg.themes;

  const reset = () => {
    s.R("modalQueue=[];closeModal();S=JSON.parse(__S0);stack=[{v:'dash'}];lastSig=null;" +
        "IBF='all';CLFILTER='all';MKQ='';MKF=false;PFTAB='ov';SKTAB=SK_BRANCH[0].id;");
    s.nodes.toast && (s.nodes.toast._html = '');
    s.nodes.sheet && (s.nodes.sheet._html = '');
  };
  // Modal kapalıyken sheet'te önceki modalın HTML'i kalıyor; boş sayılsın diye
  // closeModal() sonrası reset() onu da temizliyor.
  const capture = modal => (modal ? ['sheet','toast'] : CAP_IDS).map(id => s.nodes[id] && s.nodes[id]._html ? '<!--#' + id + '-->' + s.nodes[id]._html : '').join('');

  for (const th of themes) {
    for (const lc of langs) {
      const key = th + '/' + lc;
      const snap = out[key] = {};
      const shot = (name, code, modal) => {
        try {
          if (s.nodes.toast) s.nodes.toast._html = '';
          s.R(code); s.flush();
          snap[name] = capture(modal || /^(m-|ev-|sk-|lg-pick|menu-locked)/.test(name));
        } catch (e) {
          snap[name] = 'HATA: ' + (e && e.message);
          errs.push(key + ' ' + name + ': ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
        }
      };
      s.R("setPref('theme'," + JSON.stringify(th) + ");L=" + JSON.stringify(lc) + ";");
      reset();

      /* ---- kabuk: açık kariyer yok ---- */
      shot('menu', "S=null;stack=[{v:'menu'}];render();");
      shot('setup', "S=null;stack=[{v:'setup'}];render();");
      shot('menu-settings', "S=null;stack=[{v:'menu'},{v:'settings'}];render();");
      shot('menu-locked', "S=null;stack=[{v:'menu'}];render();cmLockedHelp(1);");
      if (s.R("typeof langPickOpen==='function'")) shot('m-langPick', "S=null;stack=[{v:'menu'}];render();langPickOpen();");
      reset();

      /* ---- ana ekranlar ---- */
      const cl = s.R('JSON.stringify(S.clients)');
      const clients = JSON.parse(cl);
      for (const v of ['dash','clients','market','inbox','skills','atlas','rivals','settings','shop']) {
        reset(); shot('v-' + v, "navTo('" + v + "');");
      }
      reset(); shot('market-filter', "MKF=true;navTo('market');");
      for (const f of s.R("JSON.stringify(IB_FILTER.map(x=>x.id))") ? JSON.parse(s.R("JSON.stringify(IB_FILTER.map(x=>x.id))")) : []) {
        reset(); shot('inbox-' + f, "IBF='" + f + "';navTo('inbox');");
      }
      for (const b of JSON.parse(s.R('JSON.stringify(SK_BRANCH.map(b=>b.id))'))) {
        reset(); shot('skills-' + b, "SKTAB='" + b + "';navTo('skills');");
      }
      for (const id of JSON.parse(s.R('JSON.stringify(SKILLS.map(k=>k.id))'))) {
        reset(); shot('sk-' + id, "navTo('skills');skOpen('" + id + "');");
      }

      /* ---- lig: her lig puan durumu, iki ligde her sekme, kupalar ---- */
      const nLg = s.R('LEAGUES.length');
      for (let i = 0; i < nLg; i++) {
        reset(); shot('lg' + i + '-table', "goLg(" + i + ");");
      }
      for (const i of [0, s.R("LEAGUES.findIndex(l=>l.grp)")]) {
        for (const tab of ['fix','scorers','assists','hist','tr']) {
          reset(); shot('lg' + i + '-' + tab, "goLg(" + i + ");S.ltab='" + tab + "';render();");
        }
      }
      for (let ci = 0; ci < 4; ci++) { reset(); shot('cup' + ci, "goCup(" + ci + ");"); }
      reset(); shot('lg-pick', "goLg(0);lgPickOpen();");

      /* ---- kişiler ve takımlar ---- */
      const others = JSON.parse(s.R(
        "JSON.stringify([S.players.find(p=>p.agent===null&&p.team>=0),S.players.find(p=>p.agent==='rival'&&p.ra!==undefined)," +
        "S.players.find(p=>p.team<0)].filter(Boolean).map(p=>p.id))"));
      for (const pid of clients.slice(0, 3).concat(others)) {
        for (const tab of ['ov','mt','ct']) { reset(); shot('p' + pid + '-' + tab, "pushV('player'," + pid + ");pfSetTab('" + tab + "');"); }
      }
      for (const pid of clients.slice(0, 2)) {
        reset(); shot('team-of-' + pid, "pushV('team',teamOf(byId(" + pid + ")).id);");
      }
      for (const rid of JSON.parse(s.R('JSON.stringify((S.rivals||[]).map(r=>r.id))'))) {
        reset(); shot('rival' + rid, "pushV('rival'," + rid + ");");
      }

      /* ---- modallar ---- */
      reset(); shot('m-scout', "openScout();");
      reset(); shot('m-adReward', "adsRewardOpen();");
      reset(); shot('m-adAge', "adsAgeOpen();");
      reset(); shot('m-saveHelp', "showSaveHelp();");
      reset(); shot('m-levelUp', "S.lvUp=1;showLevelUp();");
      /* Haftalık rapor gerçek bir haftadan: elle kurulmuş S.wkRep oyunun üretemeyeceği
         bir durum olabilir (bkz. CLAUDE.md, tarama uyarısı). */
      reset(); shot('m-weekReport', "nextWeek();modalQueue=[];closeModal();showWeekReport(S.week);", true);
      reset(); shot('m-season', "if(__champs)showSeasonModal(__champs);");
      for (const pid of clients.slice(0, 2)) {
        reset(); shot('m-neg-' + pid, "S.renewAt&&(S.renewAt={});openNeg(" + pid + ");");
        reset(); shot('m-tr-' + pid, "openTransfer(" + pid + ");");
        reset(); shot('m-poach-' + pid, "S.poach={pid:" + pid + ",ri:0,at:S.tw};showPoach();");
        reset(); shot('m-poach-' + pid + '-r0', "S.poach={pid:" + pid + ",ri:0,at:S.tw};showPoach();poachChoose(0);");
        reset(); shot('m-poach-' + pid + '-r1', "S.poach={pid:" + pid + ",ri:0,at:S.tw};showPoach();poachChoose(1);");
      }
      /* Görüşmeye açık biri: bilinen ligde, itibarın yettiği, soğumada olmayan.
         Kapasite ve kasa elle açılıyor; yoksa modal yerine uyarı çıkar. */
      const meetPid = s.R("(function(){var p=S.players.find(function(p){return p.agent===null&&p.team>=0&&" +
        "knownLg(teamOf(p).lg)&&profileOf(p)<=repCap()&&pitchCd(p)===0;});return p?p.id:null;})()");
      if (meetPid !== null) {
        const open = "S.cash=1e6;S.clients=[];openMeeting(" + meetPid + ");";
        reset(); shot('m-meet', open);
        reset(); shot('m-meet-1', open + "pickLine(MT.order[0]);");
      }
      for (const id of JSON.parse(s.R('JSON.stringify(EVENTS.map(e=>e.id))'))) {
        const pick = "(function(){var e=evById('" + id + "');var cl=S.clients.map(byId).filter(Boolean);" +
          "var p=cl.find(function(p){try{return !e.when||e.when({p:p,tm:teamOf(p)});}catch(x){return false;}})||cl[0];" +
          "return p?p.id:null;})()";
        reset(); shot('ev-' + id, "showEvent({id:'" + id + "',pid:" + pick + "});");
        reset(); shot('ev-' + id + '-r0', "showEvent({id:'" + id + "',pid:" + pick + "});evChoose(0);");
      }
    }
  }
  /* Özel adlar: sözde dilde de ASCII kalmaları doğru. */
  const names = JSON.parse(s.R("JSON.stringify((function(){var w=[];S.players.forEach(function(p){w.push(p.n);});" +
    "S.teams.forEach(function(t){w.push(t.n,t.ab);});(S.rivals||[]).forEach(function(r){w.push(r.base);});" +
    "w.push(S.agent.fn,S.agent.ln,S.agent.agency,'Bot','Test','Menajer');Object.keys(NATS).forEach(function(k){w.push(NATS[k].c);});" +
    "LEAGUES.forEach(function(l){w.push(l.c);});CUPS.forEach(function(c){w.push(c.c);});return w;})())"));
  return { out, errs, names };
}

/* ================= denetim ================= */
const LEAK = [/undefined/, /\bNaN\b/, /\[object /, /\{[a-z]{1,3}\}/];
function leaks(html) {
  const clean = html.replace(/\son[a-z]+="[^"]*"/g, '').replace(/<!--#[a-zA-Z]+-->/g, '');
  return LEAK.filter(re => re.test(clean)).map(re => {
    const m = re.exec(clean); const i = m.index;
    return clean.slice(Math.max(0, i - 60), i + 40).replace(/\s+/g, ' ');
  });
}

/* Sözde dilde ASCII kalan sözcükler: özel ad değilse koda gömülü metin. */
function suspects(out, names) {
  const allow = new Set();
  names.forEach(n => String(n || '').split(/[^A-Za-z]+/).forEach(w => w && allow.add(w)));
  ['M', 'K', 'EC', 'SVG'].forEach(w => allow.add(w));   // para birimi kısaltmaları
  const hits = {};
  for (const k of Object.keys(out)) for (const n of Object.keys(out[k])) {
    const html = out[k][n];
    const attrs = [];
    html.replace(/\s(?:aria-label|placeholder|title|alt)="([^"]*)"/g, (m, v) => { attrs.push(v); return m; });
    const text = html.replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]*>/g, ' ').replace(/&[#a-z0-9]+;/gi, ' ') + ' ' + attrs.join(' ');
    const re = /[A-Za-zÀ-ɏḀ-ỿɐ-ʯ]+/g; let m;
    while ((m = re.exec(text))) {
      const w = m[0];
      if (!/^[A-Za-z]+$/.test(w) || allow.has(w)) continue;
      const h = hits[w] = hits[w] || { n: 0, at: n, ctx: text.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, ' ') };
      h.n++;
    }
  }
  const rows = Object.entries(hits).sort((a, b) => b[1].n - a[1].n);
  console.log('çevrilmemiş olabilecek sözcük: ' + rows.length);
  rows.slice(0, ARG.detay ? rows.length : 80).forEach(([w, h]) => console.log('  ' + w.padEnd(14) + String(h.n).padStart(5) + '  ' + h.at.padEnd(18) + ' …' + h.ctx + '…'));
}

(async () => {
  const cfg = {
    seed: parseInt(ARG.tohum, 10) || 1,
    seasons: Math.max(1, parseInt(ARG.sezon, 10) || 2),
    langs: list(ARG.diller, null),
    themes: list(ARG.temalar, ['saha', 'dosya']),
    pseudo: !!ARG.sahte
  };
  if (cfg.pseudo) cfg.langs = ['xx'];
  if (!cfg.langs) {
    // Dil listesi oyunun kendisinden: LANGS varsa ondan, yoksa STR'nin anahtarlarından.
    const probe = boot(1);
    cfg.langs = JSON.parse(probe.R("JSON.stringify(typeof LANGS!=='undefined'?LANGS.map(l=>l.c):Object.keys(STR))"));
  }
  const { out, errs, names } = await scan(cfg);
  let nScreens = 0, nLeak = 0;
  const leakRows = [];
  for (const k of Object.keys(out)) for (const n of Object.keys(out[k])) {
    nScreens++;
    const l = leaks(out[k][n]);
    if (l.length) { nLeak++; leakRows.push(k + ' ' + n + ': ' + l[0]); }
  }
  console.log('ekran: ' + nScreens + ' (' + Object.keys(out).join(', ') + ')');
  console.log('hata: ' + errs.length);
  errs.slice(0, 30).forEach(e => console.log('  ' + e));
  console.log('sızıntı: ' + nLeak);
  if (!ARG.sessiz) leakRows.slice(0, 40).forEach(r => console.log('  ' + r));
  if (cfg.pseudo) suspects(out, names);
  if (typeof ARG.yaz === 'string') { fs.writeFileSync(ARG.yaz, JSON.stringify(out)); console.log('yazıldı: ' + ARG.yaz); }
  let nDiff = 0;
  if (typeof ARG.fark === 'string') {
    const old = JSON.parse(fs.readFileSync(ARG.fark, 'utf8'));
    for (const k of Object.keys(old)) {
      if (!out[k]) { console.log('  eksik bölüm: ' + k); nDiff++; continue; }
      for (const n of Object.keys(old[k])) {
        const a = old[k][n], b = out[k][n];
        if (a === b) continue;
        nDiff++;
        if (nDiff <= 25) {
          if (b === undefined) { console.log('  eksik ekran: ' + k + ' ' + n); continue; }
          let i = 0; while (i < a.length && a[i] === b[i]) i++;
          console.log('  FARK ' + k + ' ' + n + '\n     önce: ' + a.slice(Math.max(0, i - 50), i + 70).replace(/\s+/g, ' ') +
            '\n    sonra: ' + b.slice(Math.max(0, i - 50), i + 70).replace(/\s+/g, ' '));
        }
      }
    }
    console.log('fark: ' + nDiff);
  }
  process.exitCode = (errs.length || nDiff) ? 1 : 0;
})();
