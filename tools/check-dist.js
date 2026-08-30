// node tools/check-dist.js [dosya]  → varsayılan dist/menajer.html
// Tek dosya sürümünün sözleşmesini üretimden sonra doğrular ve bozuksa
// non-zero ile çıkar. build.js sessizce bozuk çıktı yazabiliyordu: exit 0
// veriyor, dosya diske iniyor ve hata ancak tarayıcıda görülüyordu.
// Bağımlılık yok — HTML sınırları elle, JS parse'ı node:vm ile.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const TARGET = process.argv[2] || path.join('dist', 'menajer.html');

const isSpace = c => c === ' ' || c === '\t' || c === '\n' || c === '\f' || c === '\r';
const isAlpha = c => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');

/* Başlangıç etiketini kapatan '>' — tırnak içindeki '>' etiketi bitirmez. */
function endOfStartTag(s, i) {
  let q = null;
  for (; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === '>') return i + 1;
  }
  return -1;
}

/* HTML script data durum makinesi (HTML Standard, tokenizer).
   Gerekli, çünkü </script'in script'i nerede bitirdiği bağlama bağlı:
   <!-- ... --> arası "escaped", onun içindeki <script ise "double escaped"
   durumdur ve orada </script> ARTIK kapatmaz. Düz substring araması hem bunu
   kaçırır hem de JS'in içinde sıradan metin olarak geçen <script dizilerinde
   yanlış pozitif üretir. */
function scriptDataEnd(s, start) {
  let st = 'data', buf = '', ltPos = -1, i = start;
  while (i < s.length) {
    const c = s[i];
    let advance = true;
    switch (st) {
      case 'data':
        if (c === '<') { ltPos = i; st = 'lt'; }
        break;
      case 'lt':
        if (c === '/') { buf = ''; st = 'endOpen'; }
        else if (c === '!') st = 'escStart';
        else { st = 'data'; advance = false; }
        break;
      case 'endOpen':
        if (isAlpha(c)) { buf = ''; st = 'endName'; advance = false; }
        else { st = 'data'; advance = false; }
        break;
      case 'endName':
        if (isAlpha(c)) { buf += c; break; }
        if ((isSpace(c) || c === '/' || c === '>') && buf.toLowerCase() === 'script')
          return { contentEnd: ltPos, tagEnd: endOfStartTag(s, i) };
        st = 'data'; advance = false;
        break;
      case 'escStart':
        if (c === '-') st = 'escStartDash'; else { st = 'data'; advance = false; }
        break;
      case 'escStartDash':
        if (c === '-') st = 'escDashDash'; else { st = 'data'; advance = false; }
        break;
      case 'esc':
        if (c === '-') st = 'escDash';
        else if (c === '<') { ltPos = i; st = 'escLt'; }
        break;
      case 'escDash':
        if (c === '-') st = 'escDashDash';
        else if (c === '<') { ltPos = i; st = 'escLt'; }
        else st = 'esc';
        break;
      case 'escDashDash':
        if (c === '-') break;
        else if (c === '<') { ltPos = i; st = 'escLt'; }
        else if (c === '>') st = 'data';
        else st = 'esc';
        break;
      case 'escLt':
        if (c === '/') { buf = ''; st = 'escEndOpen'; }
        else if (isAlpha(c)) { buf = ''; st = 'dblStart'; advance = false; }
        else { st = 'esc'; advance = false; }
        break;
      case 'escEndOpen':
        if (isAlpha(c)) { buf = ''; st = 'escEndName'; advance = false; }
        else { st = 'esc'; advance = false; }
        break;
      case 'escEndName':
        if (isAlpha(c)) { buf += c; break; }
        if ((isSpace(c) || c === '/' || c === '>') && buf.toLowerCase() === 'script')
          return { contentEnd: ltPos, tagEnd: endOfStartTag(s, i) };
        st = 'esc'; advance = false;
        break;
      case 'dblStart':
        if (isSpace(c) || c === '/' || c === '>') st = buf.toLowerCase() === 'script' ? 'dbl' : 'esc';
        else if (isAlpha(c)) buf += c;
        else { st = 'esc'; advance = false; }
        break;
      case 'dbl':
        if (c === '-') st = 'dblDash'; else if (c === '<') st = 'dblLt';
        break;
      case 'dblDash':
        if (c === '-') st = 'dblDashDash'; else if (c === '<') st = 'dblLt'; else st = 'dbl';
        break;
      case 'dblDashDash':
        if (c === '-') break;
        else if (c === '<') st = 'dblLt';
        else if (c === '>') st = 'data';
        else st = 'dbl';
        break;
      case 'dblLt':
        if (c === '/') { buf = ''; st = 'dblEnd'; } else { st = 'dbl'; advance = false; }
        break;
      case 'dblEnd':
        if (isSpace(c) || c === '/' || c === '>') st = buf.toLowerCase() === 'script' ? 'esc' : 'dbl';
        else if (isAlpha(c)) buf += c;
        else { st = 'dbl'; advance = false; }
        break;
    }
    if (advance) i++;
  }
  return null;                                   // hiç kapanmadı
}

/* RAWTEXT (style): durum makinesi yok, ilk uygun </style bitirir. */
function rawTextEnd(s, start, name) {
  const re = new RegExp('</' + name + '(?=[\\s/>])', 'ig');
  re.lastIndex = start;
  const m = re.exec(s);
  return m ? { contentEnd: m.index, tagEnd: endOfStartTag(s, m.index) } : null;
}

/* Belgeyi imleçle tara. Bir elemanın gövdesi atlandığı için gövdedeki
   "<script" metinleri hiç görülmez — sayım değil, gerçek eleman sınırı. */
function scanElements(s) {
  const out = [];
  const re = /<(script|style)(?=[\s/>])/ig;
  let i = 0;
  while (i < s.length) {
    re.lastIndex = i;
    const m = re.exec(s);
    if (!m) break;
    const tag = m[1].toLowerCase();
    const contentStart = endOfStartTag(s, m.index);
    if (contentStart < 0) { out.push({ tag, start: m.index, broken: 'başlangıç etiketi kapanmamış' }); break; }
    const attrs = s.slice(m.index, contentStart);
    const end = tag === 'script' ? scriptDataEnd(s, contentStart) : rawTextEnd(s, contentStart, 'style');
    out.push({
      tag, start: m.index, attrs, contentStart,
      contentEnd: end ? end.contentEnd : s.length,
      tagEnd: end ? end.tagEnd : -1,
      closed: !!end,
      src: (attrs.match(/\ssrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i) || [])
        .slice(2).find(v => v !== undefined) || null
    });
    i = end ? (end.tagEnd > 0 ? end.tagEnd : s.length) : s.length;
  }
  return out;
}

const lineOf = (s, i) => s.slice(0, i).split('\n').length;
const colOf = (s, i) => i - s.lastIndexOf('\n', i - 1);

const fail = [];
function check(cond, msg) { if (!cond) fail.push(msg); return cond; }

// ---------------------------------------------------------------- 1. dosya
if (!fs.existsSync(TARGET) || !fs.statSync(TARGET).isFile()) {
  console.error('✘ dosya yok: ' + TARGET);
  process.exit(1);
}
const html = fs.readFileSync(TARGET, 'utf8');
if (!html.trim()) {
  console.error('✘ dosya boş: ' + TARGET);
  process.exit(1);
}

// -------------------------------------------------- 2-3. eleman yapısı
const els = scanElements(html);
const scripts = els.filter(e => e.tag === 'script');
const styles = els.filter(e => e.tag === 'style');
const inline = scripts.filter(e => !e.src);
const external = scripts.filter(e => e.src);

check(inline.length === 1,
  'inline uygulama script sayısı ' + inline.length + ', 1 olmalı');
check(external.length === 0,
  'dist tek dosya olmalı ama ' + external.length + ' harici script kaldı: ' +
  external.slice(0, 4).map(e => e.src + ' (L' + lineOf(html, e.start) + ')').join(', ') +
  (external.length > 4 ? ' …' : ''));
check(styles.length === 1,
  'style eleman sayısı ' + styles.length + ', 1 olmalı');

// Ham kapanış sayısı eleman sayısıyla uyuşmalı; uyuşmuyorsa gömülen metnin
// içinden bir kapanış kaçmış demektir (CSS'te </style, JS'te </script).
const rawScriptClose = (html.match(/<\/script(?=[\s/>])/ig) || []).length;
const rawStyleClose = (html.match(/<\/style(?=[\s/>])/ig) || []).length;
check(rawStyleClose === styles.length,
  'beklenmeyen style kapanışı: ' + rawStyleClose + ' adet </style var, ' +
  styles.length + ' style elemanı bulundu — gömülen CSS içinde ham </style olabilir');
check(rawScriptClose === scripts.length,
  'beklenmeyen script kapanışı: ' + rawScriptClose + ' adet </script var, ' +
  scripts.length + ' script elemanı bulundu — gömülen JS içinde kaçırılmamış </script olabilir');

// ------------------------------------------- 4. sınır erken kesilmemiş
let code = null, app = null;
if (inline.length === 1) {
  app = inline[0];
  check(app.closed, 'inline script hiç kapanmamış (dosya sonuna kadar açık)');
  check(app.contentEnd > app.contentStart, 'inline script gövdesi boş');
  if (app.closed) {
    const tail = html.slice(app.tagEnd);
    check(/^\s*<\/body>\s*<\/html>\s*$/i.test(tail),
      'inline script L' + lineOf(html, app.contentEnd) + ' C' + colOf(html, app.contentEnd) +
      ' erken kesilmiş — ardından </body></html> yerine ' +
      JSON.stringify(tail.replace(/^\s+/, '').slice(0, 70)) + ' geliyor');
  }
  code = html.slice(app.contentStart, app.contentEnd);
}

// ----------------------------------------------------- 5. JS parse
let parsed = false, parseErr = null;
if (code !== null) {
  try {
    new vm.Script(code, {
      filename: TARGET,
      lineOffset: lineOf(html, app.contentStart) - 1,
      columnOffset: colOf(html, app.contentStart) - 1
    });
    parsed = true;
  } catch (e) {
    const at = (String(e.stack || '').split('\n')[0] || '').trim();
    parseErr = e.name + ': ' + e.message + (at ? '  @ ' + at : '');
    fail.push('inline JS parse edilemiyor — ' + parseErr);
  }
}

// ------------------------------------------------------------ rapor
const nf = n => n.toLocaleString('tr-TR');
if (fail.length) {
  console.error('✘ ' + TARGET + ' doğrulamayı geçemedi:');
  for (const f of fail) console.error('  · ' + f);
  process.exit(1);
}
console.log(TARGET);
console.log('  inline script   ' + inline.length + '  (' + nf(code.length) + ' karakter, L' +
  lineOf(html, app.contentStart) + '–L' + lineOf(html, app.contentEnd) + ')');
console.log('  harici script   ' + external.length);
console.log('  style           ' + styles.length + '  (' +
  nf(styles[0].contentEnd - styles[0].contentStart) + ' karakter)');
console.log('  parse           ' + (parsed ? 'tamam (node:vm)' : '—'));
console.log('✔ dist doğrulandı');
