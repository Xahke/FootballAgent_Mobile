'use strict';
/* tools/check-native-patch.js — patch-package yamasının KURULU kaynağa
   gerçekten uygulandığını doğrular.

   Neden var: yama `postinstall` ile uygulanıyor. Kilit dosyası, eklenti sürümü
   ya da `patches/` adı bir gün kayarsa `npm ci` yalnız bir uyarı yazar ve
   derleme devam eder — yamasız bir paket sessizce üretilir. O paket iki şeyi
   birden kaybeder: ödeme hatalarını ayırt eden `npx:` kodunu ve satın alma
   tokenini logdan çıkaran redaksiyonu.

   ===== NEYİ OKUDUĞU ÖNEMLİ =====

   Bu betik `patches/*.patch` dosyasına BAKMAZ. Yama dosyasının kendisi, silinen
   satırları `-` önekiyle taşır; yani hassas log ifadelerinin metni yamanın
   içinde zaten vardır ve orayı taramak her koşuda yanlış alarm üretirdi.
   Tek doğru kaynak `node_modules` altındaki KURULU .java dosyasıdır: derlenen
   şey odur.

   Üç soru soruluyor:
     1. eklenti tam olarak beklenen sürümde mi (yama sürüme bağlı),
     2. `npx:` hata kodu değişikliği kurulu kaynakta duruyor mu,
     3. kaldırdığımız hassas log ifadeleri geri gelmiş mi.

   Üçüncüsü bir "yama uygulandı mı" testinden fazlası: yama yeniden üretilirken
   bir redaksiyon düşerse de burada yakalanır. */

const fs = require('fs');
const path = require('path');

const PKG = '@capgo/native-purchases';
const WANT_VERSION = '8.7.0';
const SRC = path.join(
  'node_modules', '@capgo', 'native-purchases', 'android', 'src', 'main',
  'java', 'ee', 'forgr', 'nativepurchases', 'NativePurchasesPlugin.java'
);

const fails = [];
const notes = [];

function fail(msg) { fails.push(msg); }
function ok(msg) { notes.push(msg); }

/* ---- 1. Sürüm ---------------------------------------------------------- */

const pkgJson = path.join('node_modules', '@capgo', 'native-purchases', 'package.json');
if (!fs.existsSync(pkgJson)) {
  fail(`${PKG} kurulu değil (${pkgJson} yok) — önce npm ci`);
} else {
  const v = JSON.parse(fs.readFileSync(pkgJson, 'utf8')).version;
  if (v !== WANT_VERSION) {
    fail(`${PKG} sürümü ${v}, beklenen tam ${WANT_VERSION} — yama sürüme bağlı, ` +
         `yeni sürümün kaynağı okunup yama yeniden üretilmeli`);
  } else {
    ok(`${PKG} ${v}`);
  }
}

/* ---- Kaynağı oku ------------------------------------------------------- */

if (!fs.existsSync(SRC)) {
  fail(`kurulu eklenti kaynağı yok: ${SRC}`);
  report();
}

const raw = fs.readFileSync(SRC, 'utf8');

/* Yorumlar çıkarılıyor: yamanın kendi Türkçe açıklamaları "token" gibi
   kelimeler içeriyor ve bir kod taramasında yer almamalı. */
const code = raw
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\/\/[^\n]*/g, ' ');

/* ---- 2. npx hata kodu değişikliği duruyor mu --------------------------- */

const npxMarkers = [
  ['npxCode yardımcısı', /private\s+static\s+String\s+npxCode\s*\(/],
  ['npx: önek biçimi', /"npx:"/],
  ['state aşaması', /npxCode\(\s*"state"/],
  ['updated aşaması', /npxCode\(\s*"updated"/],
  ['launch aşaması', /npxCode\(\s*"launch"/],
  ['başlamayan akış reddi', /"Billing flow did not start"/],
];
for (const [label, re] of npxMarkers) {
  if (!re.test(code)) fail(`npx hata kodu yaması eksik: ${label} bulunamadı`);
}
if (!fails.some(f => f.startsWith('npx'))) ok('npx hata kodu değişikliği yerinde (6 işaret)');

/* ---- 3. Hassas log ifadeleri geri gelmiş mi ---------------------------- */

/* Statement bazında bakılıyor, satır bazında değil: çok satırlı bir Log
   çağrısı tek satırlık aramadan kaçardı. */
const statements = code.split(';');

const FORBIDDEN = [
  ['satın alma tokeni', /getPurchaseToken\s*\(/],
  ['sipariş numarası', /getOrderId\s*\(/],
  ['orijinal JSON', /getOriginalJson\s*\(/],
  ['Purchase nesnesi (toString)', /purchase\s*\.\s*toString\s*\(/],
  ['token değişkeni', /\+\s*purchaseToken\b/],
  ['Purchase nesnesi (örtük toString)', /\+\s*purchase\s*[,)]/],
];

let leaks = 0;
for (const st of statements) {
  if (!/\bLog\s*\.\s*[a-z]\w*\s*\(/.test(st)) continue;
  for (const [label, re] of FORBIDDEN) {
    if (re.test(st)) {
      leaks++;
      fail(`hassas içerik yeniden loglanıyor (${label}): ` +
           st.trim().replace(/\s+/g, ' ').slice(0, 110));
    }
  }
}
if (leaks === 0) {
  ok(`hassas log ifadesi yok (${statements.length} ifade tarandı)`);
}

/* Redaksiyonun gerçekten orada olduğunu da doğrula: sıfır "kötü" eşleşme,
   dosya boşalmışsa da sıfırdır. En az bir [REDACTED] beklenir. */
const redacted = (code.match(/\[REDACTED\]/g) || []).length;
if (redacted < 8) {
  fail(`beklenen redaksiyon işaretleri eksik: [REDACTED] sayısı ${redacted}, en az 8 bekleniyor`);
} else {
  ok(`[REDACTED] işareti: ${redacted}`);
}

report();

function report() {
  for (const n of notes) console.log(`  ok   ${n}`);
  if (fails.length) {
    console.error('');
    for (const f of fails) console.error(`  HATA ${f}`);
    console.error('');
    console.error(`native yama kontrolü DÜŞTÜ (${fails.length} sorun)`);
    console.error('Beklenen akış: npm ci → postinstall → patch-package');
    process.exit(1);
  }
  console.log('native yama kontrolü tamam');
  process.exit(0);
}
