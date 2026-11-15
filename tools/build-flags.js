'use strict';
/* tools/build-flags.js → js/flags.js
   Millî takımların gerçek bayrakları. Kaynak: flag-icons 7.6.0 (MIT,
   © 2013 Panayiotis Lipiridis), 4:3 SVG.

   GELİŞTİRME ARACI — build-geo.js gibi. Oyun bunu asla çalıştırmaz ve ağa
   çıkmaz; üretilen js/flags.js depoya işlenir ve oyun yalnız onu okur.

   Neden bayrak, neden arma değil: ülke bayrakları marka değil. Federasyonların
   armaları ise tescilli — onlar hiçbir zaman girmiyor (bkz. CLAUDE.md, ad ve marka
   kuralı). Önceden millî takım rozeti kulüp rozeti çizicisinden, ülke kodundan
   türetilmiş rastgele renklerle çiziliyordu; gerçek bir sebebi yoktu.

   Ne yapıyor:
   1. Paketi bir kez tools/.flagcache/ içine indiriyor (npm pack, sürüm sabit),
      bütünlüğünü npm'in verdiği sha512 ile denetliyor.
   2. data.js'teki NATS anahtarlarını okuyup her birinin SVG'sini alıyor
      (en → gb-eng, sct → gb-sct; gerisi ISO kodunun kendisi).
   3. Güvenlik süzgeci: <script>, olay öznitelikleri, dış bağlantı, <image>,
      <foreignObject> içeren dosya REDDEDİLİR — derleme durur.
   4. Küçültme yalnız yorum, id ve boşluk. Sayılara DOKUNULMUYOR: tam sayıya
      yuvarlamak göreli yol komutlarında hata biriktirip armaları parçaladı,
      küçük scale() değerlerini sıfırladı; bir basamağa yuvarlamak 80 bayrağın
      hepsinde gözle fark edilmedi ama yalnız 17 KB kazandırıyordu. Bayrak gerçek
      haliyle kalsın: ~640 KB ham, ~175 KB sıkıştırılmış.

   Çalıştırmak için:  node tools/build-flags.js */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { execSync } = require('child_process');

const PKG = 'flag-icons', VER = '7.6.0';
const ROOT = path.join(__dirname, '..');
const CACHE = path.join(__dirname, '.flagcache');
const OUT = path.join(ROOT, 'js', 'flags.js');
/* oyunun uyruk anahtarı → flag-icons dosya adı (yalnız farklı olanlar) */
const MAP = { en: 'gb-eng', sct: 'gb-sct' };

function fetchPkg() {
  const dir = path.join(CACHE, 'package', 'flags', '4x3');
  if (fs.existsSync(dir)) return dir;
  fs.mkdirSync(CACHE, { recursive: true });
  const integ = execSync(`npm view ${PKG}@${VER} dist.integrity`, { encoding: 'utf8' }).trim();
  execSync(`npm pack ${PKG}@${VER} --silent`, { cwd: CACHE, stdio: 'ignore', shell: true });
  const tgz = path.join(CACHE, `${PKG}-${VER}.tgz`);
  const got = 'sha512-' + crypto.createHash('sha512').update(fs.readFileSync(tgz)).digest('base64');
  if (got !== integ) throw new Error('bütünlük tutmadı: ' + tgz);
  execSync(`tar -xzf "${PKG}-${VER}.tgz"`, { cwd: CACHE, stdio: 'ignore', shell: true });
  return dir;
}

function natKeys() {
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'data.js'), 'utf8') + '\n;this.__K=Object.keys(NATS);', ctx);
  return ctx.__K;
}

const BAD = /<script|\son[a-z]+\s*=|javascript:|<image|<foreignObject|(?:xlink:)?href\s*=\s*["'](?!#)/i;
function clean(svg, code) {
  if (BAD.test(svg)) throw new Error('güvenli değil: ' + code);
  let s = svg.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+id="flag-icons-[^"]*"/, '')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!/^<svg[\s>]/.test(s) || !/<\/svg>$/.test(s)) throw new Error('beklenmeyen biçim: ' + code);
  return s;
}

const dir = fetchPkg();
const keys = natKeys();
const out = {};
let raw = 0, small = 0;
for (const k of keys) {
  const code = MAP[k] || k;
  const f = path.join(dir, code + '.svg');
  if (!fs.existsSync(f)) throw new Error('bayrak yok: ' + k + ' → ' + code);
  const svg = fs.readFileSync(f, 'utf8');
  raw += svg.length;
  out[k] = clean(svg, code);
  small += out[k].length;
}
const body = keys.map(k => `${JSON.stringify(k)}:${JSON.stringify(out[k])}`).join(',\n');
/* MIT, telif bildiriminin ve izin metninin kopyalarla birlikte gitmesini istiyor;
   bu dosya uygulamanın içinde dağıtıldığı için metnin tamamı başlığa giriyor. */
const lic = fs.readFileSync(path.join(dir, '..', '..', 'LICENSE'), 'utf8').trim().replace(/\*\//g, '* /');
const head = `'use strict';
/* js/flags.js — ÜRETİLMİŞ DOSYA, elle düzenleme. Kaynak: tools/build-flags.js
   ${keys.length} uyruk, NATS anahtarına göre; 4:3, 640×480 görüntü kutusu.

   Bayraklar: flag-icons ${VER} — https://github.com/lipis/flag-icons

${lic.split(/\r?\n/).map(l => ('   ' + l).trimEnd()).join('\n')}
*/
const FLAGS={
`;
fs.writeFileSync(OUT, head + body + '\n};\n');
console.log(`${keys.length} bayrak · ham ${(raw / 1024).toFixed(0)} KB → ${(small / 1024).toFixed(0)} KB · ${path.relative(ROOT, OUT)}`);
