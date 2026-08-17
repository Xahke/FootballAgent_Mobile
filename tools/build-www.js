// node tools/build-www.js → www/
// Capacitor'ın paketleyeceği klasörü hazırlar. Uygulama tamamen istemci tarafında
// çalıştığı için varlıklar uygulamanın içine gömülür; sunucuya ihtiyaç yoktur.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'www');
/* assets/ = arayüz görselleri (ana ekranın stadyum/portre/yükselen görselleri).
   icons/ uygulama ikonlarına ait; karıştırmamak için ayrı kök. */
const ITEMS = ['index.html', 'manifest.json', 'sw.js', 'css', 'js', 'icons', 'assets'];

function copy(src, dst) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    fs.readdirSync(src).forEach(f => copy(path.join(src, f), path.join(dst, f)));
  } else {
    fs.copyFileSync(src, dst);
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let n = 0;
ITEMS.forEach(item => {
  const src = path.join(ROOT, item);
  if (!fs.existsSync(src)) { console.warn('atlandı (yok):', item); return; }
  copy(src, path.join(OUT, item));
  n++;
});

/* css/themes/ kaynak dosyalar; uygulamaya yalnızca üretilen style.css gider */
fs.rmSync(path.join(OUT, 'css', 'themes'), { recursive: true, force: true });

const size = (function du(p) {
  const st = fs.statSync(p);
  if (!st.isDirectory()) return st.size;
  return fs.readdirSync(p).reduce((s, f) => s + du(path.join(p, f)), 0);
})(OUT);

console.log('www/', n, 'öğe ·', Math.round(size / 1024) + 'KB');
