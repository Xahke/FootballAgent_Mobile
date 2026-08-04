// node tools/build-themes.js → css/style.css
// css/themes/*.css dosyalarını tek bir stylesheet'te birleştirir.
// Her temanın seçicileri html[data-theme="ad"] altına kapsamlanır, böylece
// tema değişimi tek bir data-attribute ile yapılır ve tek dosya çıktısı bozulmaz.
'use strict';
const fs = require('fs');
const path = require('path');

const THEMES = ['saha', 'gazete', 'terminal', 'dosya'];
const SRC = path.join(__dirname, '..', 'css', 'themes');
const OUT = path.join(__dirname, '..', 'css', 'style.css');

/* Yorumları at. Seçici öncesindeki bir yorum prelude'a karışırsa ":root" artık
   ":root" olmaz ve kapsamlama sessizce bozulur — bu yüzden ayrıştırmadan önce.
   String içindeki "/*" dizileri korunur. */
function stripComments(css) {
  let out = '', i = 0;
  while (i < css.length) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end < 0 ? css.length : end + 2;
      out += ' ';
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c; out += c; i++;
      while (i < css.length && css[i] !== q) { if (css[i] === '\\') { out += css[i]; i++; } out += css[i]; i++; }
      out += css[i] || ''; i++;
      continue;
    }
    out += c; i++;
  }
  return out;
}

/* Üst seviye blokları ayır: her biri {prelude, body} ya da düz metin (@import vb.).
   Süslü parantez derinliği sayarak yürür — string ve yorum içindekileri atlar. */
function splitBlocks(css) {
  const out = [];
  let i = 0, start = 0, depth = 0, preludeEnd = -1;
  while (i < css.length) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') { i = css.indexOf('*/', i + 2); i = i < 0 ? css.length : i + 2; continue; }
    if (c === '"' || c === "'") { const q = c; i++; while (i < css.length && css[i] !== q) { if (css[i] === '\\') i++; i++; } i++; continue; }
    if (c === '{') { if (depth === 0) preludeEnd = i; depth++; i++; continue; }
    if (c === '}') {
      depth--;
      if (depth === 0) {
        out.push({ prelude: css.slice(start, preludeEnd).trim(), body: css.slice(preludeEnd + 1, i) });
        start = i + 1;
      }
      i++; continue;
    }
    i++;
  }
  return out;
}

/* Virgülle ayrılmış seçici listesini böl (parantez içindeki virgülleri koru) */
function splitSelectors(sel) {
  const out = []; let depth = 0, cur = '';
  for (const ch of sel) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map(s => s.trim()).filter(Boolean);
}

/* :root ve html doğrudan kök öğeye yazar → prefix'in kendisine dönüşür.
   Diğer her şey prefix'in torunu olur. */
function scopeSelector(sel, prefix) {
  if (sel === ':root' || sel === 'html') return prefix;
  if (/^html\b/.test(sel)) return prefix + sel.slice(4);
  return prefix + ' ' + sel;
}

function scopeCss(rawCss, theme) {
  const css = stripComments(rawCss);
  const prefix = `html[data-theme="${theme}"]`;
  const kf = new Set();

  // 1. tur: keyframes adlarını topla (tema başına benzersizleştirilecek)
  splitBlocks(css).forEach(b => {
    const m = /^@(-webkit-)?keyframes\s+([\w-]+)/.exec(b.prelude);
    if (m) kf.add(m[2]);
  });

  const render = (blocks, insideAtRule) => blocks.map(b => {
    const p = b.prelude;
    if (/^@(-webkit-)?keyframes\b/.test(p)) {
      // keyframes kapsamlanamaz; adını temaya bağla, gövdesine dokunma
      return p.replace(/([\w-]+)\s*$/, `$1__${theme}`) + '{' + b.body + '}';
    }
    if (/^@(media|supports)\b/.test(p)) {
      // at-rule korunur, içindeki seçiciler kapsamlanır
      return p + '{' + render(splitBlocks(b.body), true) + '}';
    }
    if (p.startsWith('@')) return p + '{' + b.body + '}';
    const sel = splitSelectors(p).map(s => scopeSelector(s, prefix)).join(',');
    return sel + '{' + b.body + '}';
  }).join('\n');

  let out = render(splitBlocks(css), false);

  // animation / animation-name referanslarını yeni keyframes adlarına bağla
  kf.forEach(name => {
    out = out.replace(
      new RegExp(`(animation(?:-name)?\\s*:[^;}]*?)\\b${name}\\b`, 'g'),
      `$1${name}__${theme}`
    );
  });
  return out;
}

const parts = THEMES.map(t => {
  const file = path.join(SRC, t + '.css');
  const css = fs.readFileSync(file, 'utf8');
  return `/* ===== tema: ${t} ===== */\n` + scopeCss(css, t);
});

const header = `/* OTOMATİK ÜRETİLDİ — bu dosyayı elle düzenleme.
   Kaynak: css/themes/${THEMES.join('.css, css/themes/')}.css
   Yeniden üretmek için: node tools/build-themes.js
   Tema, <html data-theme="..."> ile seçilir (js/ui.js → applyTheme). */\n`;

fs.writeFileSync(OUT, header + parts.join('\n\n') + '\n');
console.log('css/style.css', Math.round(fs.statSync(OUT).size / 1024) + 'KB', '·', THEMES.length, 'tema');
