// node tools/i18n-check.js [--detay]
//
// Çeviri bütünlüğü denetimi. Oyun eksik çeviride çökmüyor (t()/tx() İngilizceye
// düşüyor), ama bu bir güvenlik ağı: eksik metni sessizce İngilizce göstermek,
// çevirinin yarım kaldığını hiç kimseye söylememek demek. Bu araç söylüyor.
//
//   1. Her LANGS dilinin STR ve NEWS tablosu var; anahtarları Türkçeyle aynı;
//      boş değer yok; {yer tutucu}lar ve haber şablonlarının okuduğu p.alanlar aynı.
//   2. js/ altındaki HER {tr:…, en:…} nesnesinde LANGS'ın bütün dilleri var.
//      Kaynak düzeyinde okunuyor, çalışma anında değil: rastgele bir dalda
//      (POACH_OPT) ya da hiç tetiklenmemiş bir olayda duran nesne de sayılıyor.
//   3. Kodda dil dallanması geri gelmemiş: L==='tr', X[L] gibi okumalar tx()/t()
//      yerine yazılırsa yeni dil sessizce İngilizceye ya da undefined'a düşer.
//   4. Her js/lang-*.js dosyası BEŞ listede de var: index.html, build.js,
//      sw.js SHELL, tools/savetest.js, tools/playtest.js (ve tools/i18n-scan.js).
//      Biri eksikse o yolda dil sessizce yüklenmez.
//
// --detay olmadan yalnız sayılar ve ilk birkaç örnek basılıyor.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const DETAIL = process.argv.includes('--detay');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let problems = 0, warnings = 0;
const out = [];
function report(kind, title, items, limit) {
  if (!items.length) return;
  if (kind === 'HATA') problems += items.length; else warnings += items.length;
  out.push(kind + ' · ' + title + ' (' + items.length + ')');
  items.slice(0, DETAIL ? items.length : (limit || 6)).forEach(x => out.push('    ' + x));
  if (!DETAIL && items.length > (limit || 6)) out.push('    … (--detay ile hepsi)');
}

/* ================= dil tabloları ================= */
const langFiles = fs.readdirSync(path.join(ROOT, 'js')).filter(f => /^lang-[a-z]+\.js$/.test(f)).sort();
const ctx = { navigator: { language: 'en', languages: ['en'] }, Intl, console };
vm.createContext(ctx);
vm.runInContext(rd('js/i18n.js'), ctx, { filename: 'js/i18n.js' });
langFiles.forEach(f => vm.runInContext(rd('js/' + f), ctx, { filename: 'js/' + f }));
const R = c => vm.runInContext(c, ctx);
const CODES = JSON.parse(R('JSON.stringify(LANGS.map(l=>l.c))'));
const STR = R('STR'), NEWS = R('NEWS');

const ph = s => (String(s).match(/\{[a-z]+\}/gi) || []).sort().join(' ');
const newsParams = f => [...new Set((String(f).match(/\bp\.([A-Za-z_]\w*)/g) || []))].sort().join(' ');
for (const c of CODES) {
  if (!STR[c]) { report('HATA', c + ': STR tablosu yok', ['STR.' + c]); continue; }
  const miss = Object.keys(STR.tr).filter(k => !(k in STR[c]));
  const extra = Object.keys(STR[c]).filter(k => !(k in STR.tr));
  const empty = Object.keys(STR[c]).filter(k => typeof STR[c][k] !== 'string' || !STR[c][k].trim());
  const phx = Object.keys(STR.tr).filter(k => k in STR[c] && ph(STR.tr[k]) !== ph(STR[c][k]))
    .map(k => k + ': tr[' + ph(STR.tr[k]) + '] ' + c + '[' + ph(STR[c][k]) + ']');
  /* Lig adı ülkeyle başlamalı: dar listelerde ({c} … kesilince) ayırt edici
     kısım ülke. Kademeyle başlayan bir kalıp "1.ª División de A…" bırakıyordu. */
  if (STR[c].lgFmt && STR[c].lgFmt.indexOf('{c}') !== 0) report('HATA', c + ': lgFmt ülkeyle ({c}) başlamıyor', [STR[c].lgFmt]);
  report('HATA', c + ': STR anahtarı eksik', miss);
  report('HATA', c + ': STR\'de Türkçede olmayan anahtar', extra);
  report('HATA', c + ': STR değeri boş', empty);
  report('HATA', c + ': {yer tutucu} farklı', phx);
  if (c !== 'en' && c !== 'tr') {
    // Uyarı, hata değil: bazı değerler gerçekten aynı ("OK", "Panel", "Pro").
    const same = Object.keys(STR.en).filter(k => k in STR[c] && STR[c][k] === STR.en[k] && /[a-z]{3}/i.test(STR.en[k]));
    report('UYARI', c + ': İngilizceyle birebir aynı (çevrilmemiş olabilir)', same.map(k => k + ' = ' + JSON.stringify(STR.en[k])), 10);
  }
  if (!NEWS[c]) { report('HATA', c + ': NEWS tablosu yok', ['NEWS.' + c]); continue; }
  report('HATA', c + ': NEWS şablonu eksik', Object.keys(NEWS.tr).filter(k => !NEWS[c][k]));
  report('HATA', c + ': NEWS\'te Türkçede olmayan şablon', Object.keys(NEWS[c]).filter(k => !NEWS.tr[k]));
  const prx = Object.keys(NEWS.tr).filter(k => NEWS[c][k] && newsParams(NEWS.tr[k]) !== newsParams(NEWS[c][k]))
    .map(k => k + ': tr[' + newsParams(NEWS.tr[k]) + '] ' + c + '[' + newsParams(NEWS[c][k]) + ']');
  report('HATA', c + ': haber şablonu farklı alan okuyor', prx);
}

/* ================= kaynaktaki {tr,en} nesneleri ================= */
/* Küçük bir JS tarayıcısı: dize, şablon (${} iç içe), yorum ve regex
   sabitlerini atlayıp her { … } nesnesinin EN ÜST düzeydeki anahtarlarını
   topluyor. Tam bir ayrıştırıcı değil, olması da gerekmiyor: bu depodaki
   kodu okuması yetiyor ve okuyamadığı bir şey dengesiz parantez olarak
   kendini belli ediyor (aşağıda hata). */
function objectsWithKeys(src) {
  const found = [];
  const stack = [];           // {t:'obj'|'blk', keys:Set, line} | {t:'tx'} (şablon içi ${)
  let i = 0, line = 1, prev = '';    // prev: son anlamlı kod karakteri (regex tespiti için)
  const n = src.length;
  const startsRegex = () => prev === '' || '(,=:[!&|?{};+-*%<>~^'.indexOf(prev) >= 0 ||
    /\b(return|typeof|case|in|of|delete|void|throw|new)$/.test(src.slice(Math.max(0, i - 8), i).trimEnd());
  const top = () => stack[stack.length - 1];
  let expectKey = false;
  function skipString(q) {
    i++;
    while (i < n && src[i] !== q) { if (src[i] === '\\') i++; else if (src[i] === '\n') line++; i++; }
    i++;
  }
  function skipTemplate(resume) {   // i '`' üzerinde, ya da resume: bir ${…} kapandı
    if (!resume) i++;
    while (i < n) {
      const ch = src[i];
      if (ch === '\\') { i += 2; continue; }
      if (ch === '\n') line++;
      if (ch === '`') { i++; return true; }
      if (ch === '$' && src[i + 1] === '{') { i += 2; stack.push({ t: 'tx' }); return false; }
      i++;
    }
    return true;
  }
  while (i < n) {
    const ch = src[i];
    if (ch === '\n') { line++; i++; continue; }
    if (ch === ' ' || ch === '\t' || ch === '\r') { i++; continue; }
    if (ch === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (ch === '/' && src[i + 1] === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; } i += 2; continue; }
    if (ch === '\'' || ch === '"') {
      if (expectKey && top() && top().t === 'obj') {
        const st = i; skipString(ch); const k = src.slice(st + 1, i - 1);
        let j = i; while (src[j] === ' ') j++;
        if (src[j] === ':') top().keys.push(k);
      } else skipString(ch);
      expectKey = false; prev = 'a'; continue;
    }
    if (ch === '`') { skipTemplate(); expectKey = false; prev = 'a'; continue; }
    if (ch === '/' && startsRegex()) {
      i++; let cls = false;
      while (i < n) { const c2 = src[i]; if (c2 === '\\') { i += 2; continue; } if (c2 === '[') cls = true; else if (c2 === ']') cls = false; else if (c2 === '/' && !cls) break; i++; }
      i++; while (/[a-z]/i.test(src[i] || '')) i++;
      expectKey = false; prev = 'a'; continue;
    }
    if (ch === '{') { stack.push({ t: 'obj', keys: [], line }); expectKey = true; prev = '{'; i++; continue; }
    if (ch === '}') {
      const fr = stack.pop();
      if (!fr) throw new Error('dengesiz } satır ' + line);
      i++;
      if (fr.t === 'tx') { skipTemplate(true); prev = 'a'; expectKey = false; continue; }
      if (fr.keys.indexOf('tr') >= 0 && fr.keys.indexOf('en') >= 0) found.push({ line: fr.line, keys: fr.keys });
      expectKey = false; prev = '}'; continue;
    }
    if (ch === ',') { expectKey = !!(top() && top().t === 'obj'); prev = ','; i++; continue; }
    if (/[A-Za-z_$]/.test(ch)) {
      const st = i; while (i < n && /[\w$]/.test(src[i])) i++;
      const id = src.slice(st, i);
      if (expectKey && top() && top().t === 'obj') {
        let j = i; while (src[j] === ' ') j++;
        if (src[j] === ':' || src[j] === ',' || src[j] === '}') top().keys.push(id);   // a:1 ya da {a,b}
      }
      expectKey = false; prev = 'a'; continue;
    }
    if (ch === '.' && src[i + 1] === '.' && src[i + 2] === '.') { i += 3; continue; }
    if (/[0-9]/.test(ch)) { while (i < n && /[\w.]/.test(src[i])) i++; expectKey = false; prev = 'a'; continue; }
    if (ch === '[' || ch === '(') { stack.push({ t: 'blk', keys: [], line }); prev = ch; expectKey = false; i++; continue; }
    if (ch === ']' || ch === ')') { stack.pop(); prev = 'a'; expectKey = false; i++; continue; }
    expectKey = false; prev = ch; i++;
  }
  if (stack.length) throw new Error('kapanmamış ' + stack.length + ' blok');
  return found;
}
/* Bilerek eksik bırakılan nesneler:
     PRIVACY_URL — dil başına sayfa yok; yeni diller İngilizce sayfayı açıyor
                   (kullanıcı kararı, 17 Ekim 2026).
     badges.js   — amblem/çerçeve/desen adları oyunda hiç çizilmiyor; yalnız
                   geliştirici aracı tools/badge-lab.js okuyor, o da tr/en. */
const EXEMPT = [/^const PRIVACY_URL=/,
  /^const (STR|NEWS)=\{/];   // diğer diller js/lang-*.js'ten dolduruyor; bütünlükleri yukarıda ölçülüyor
const EXEMPT_FILES = ['badges.js'];
const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js') && !/^lang-/.test(f) && f !== 'worldgeo.js');
const incomplete = [];
let nObj = 0;
for (const f of jsFiles.filter(f => EXEMPT_FILES.indexOf(f) < 0)) {
  const src = rd('js/' + f);
  let objs;
  try { objs = objectsWithKeys(src); } catch (e) { report('HATA', 'tarayıcı okuyamadı', [f + ': ' + e.message]); continue; }
  const lines = src.split('\n');
  for (const o of objs) {
    if (EXEMPT.some(re => re.test(lines[o.line - 1].trim()))) continue;
    nObj++;
    const miss = CODES.filter(c => o.keys.indexOf(c) < 0);
    if (miss.length) incomplete.push(f + ':' + o.line + ' eksik [' + miss.join(',') + '] ' + lines[o.line - 1].trim().slice(0, 70));
    const dup = o.keys.filter((k, i) => CODES.indexOf(k) >= 0 && o.keys.indexOf(k) !== i);
    if (dup.length) report('HATA', 'aynı dil iki kez', [f + ':' + o.line + ' ' + dup.join(',')]);
  }
}
report('HATA', 'çok dilli nesnede dil eksik', incomplete, 8);

/* ================= kodda dil dallanması ================= */
const branchy = [];
for (const f of jsFiles.filter(f => f !== 'i18n.js')) {
  rd('js/' + f).split('\n').forEach((ln, i) => {
    const code = ln.replace(/\/\*.*?\*\/|\/\/.*$/g, '');
    if (/\bL\s*[!=]==?\s*['"]|\[L\]/.test(code)) branchy.push(f + ':' + (i + 1) + ' ' + code.trim().slice(0, 80));
  });
}
report('HATA', 'dile göre dallanma (tx()/t() kullanılmalı)', branchy);

/* ================= dil dosyaları beş listede ================= */
const lists = {
  'index.html': s => langFiles.filter(f => s.indexOf('js/' + f) < 0),
  'build.js': s => langFiles.filter(f => s.indexOf("'js/" + f + "'") < 0),
  'sw.js': s => langFiles.filter(f => s.indexOf(f) < 0),
  'tools/savetest.js': s => langFiles.filter(f => s.indexOf("'" + f.replace('.js', '') + "'") < 0),
  'tools/playtest.js': s => langFiles.filter(f => s.indexOf("'" + f.replace('.js', '') + "'") < 0),
  'tools/i18n-scan.js': s => langFiles.filter(f => s.indexOf("'" + f.replace('.js', '') + "'") < 0)
};
const unlisted = [];
for (const [file, fn] of Object.entries(lists)) fn(rd(file)).forEach(f => unlisted.push(file + ': ' + f));
report('HATA', 'dil dosyası bir listede yok', unlisted);
const noFile = CODES.filter(c => c !== 'tr' && c !== 'en' && langFiles.indexOf('lang-' + c + '.js') < 0);
report('HATA', 'LANGS\'ta olup dosyası olmayan dil', noFile);

/* ================= özet ================= */
console.log('diller: ' + CODES.join(', ') + ' · dil dosyası: ' + (langFiles.join(', ') || '—'));
console.log('STR: ' + Object.keys(STR.tr).length + ' anahtar · NEWS: ' + Object.keys(NEWS.tr).length + ' şablon · çok dilli nesne: ' + nObj);
out.forEach(l => console.log(l));
console.log((problems ? problems + ' hata' : 'hata yok') + (warnings ? ', ' + warnings + ' uyarı' : ''));
process.exitCode = problems ? 1 : 0;
