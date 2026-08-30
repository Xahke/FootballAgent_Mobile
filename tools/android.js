// node tools/android.js apk|aab
// Gradle sarmalayıcısını çalıştırır ve üretilen dosyanın yerini yazar.
// Windows'ta gradlew.bat, diğerlerinde ./gradlew — ikisini de kendi bulur.
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const AND = path.join(ROOT, 'android');
const kind = (process.argv[2] || 'apk').toLowerCase();

const TASKS = {
  apk: { task: 'assembleDebug', out: 'app/build/outputs/apk/debug/app-debug.apk',
         note: 'Telefona doğrudan kurulur. Ayarlar → "Bilinmeyen kaynaklara izin ver" açık olmalı.' },
  aab: { task: 'bundleRelease', out: 'app/build/outputs/bundle/release/app-release.aab',
         note: 'Play Console\'a yüklenecek dosya. İmzalanmamışsa Android Studio → Generate Signed App Bundle kullan.' }
};
const cfg = TASKS[kind];
if (!cfg) { console.error('kullanım: node tools/android.js apk|aab'); process.exit(1); }

/* android/ artık depoda; eksikse bu bir kurulum adımının atlanması değil,
   bozuk bir checkout'tur. Eskiden burada "npm run android:add" öneriliyordu —
   o script kaldırıldı, çünkü projeyi yeniden üretmek native tarafa yazılmış
   her şeyi silmek anlamına gelir. */
if (!fs.existsSync(AND)) {
  console.error('android/ klasörü yok. Depoda olması gerekiyor — checkout eksik görünüyor.');
  process.exit(1);
}

const win = process.platform === 'win32';
const wrapper = path.join(AND, win ? 'gradlew.bat' : 'gradlew');
if (!fs.existsSync(wrapper)) { console.error('gradle sarmalayıcısı bulunamadı:', wrapper); process.exit(1); }

console.log('gradle görevi:', cfg.task, '(ilk çalıştırma birkaç dakika sürebilir)');
/* Windows yolu tırnak içinde. shell:true, komutu cmd.exe'ye tek bir dize
   olarak veriyor ve tırnaklamayı çağırana bırakıyor; depo "C:\Users\Ad
   Soyad\..." gibi boşluklu bir yerdeyse cmd dizeyi ilk boşluktan bölüp
   "'C:\Users\Ad' is not recognized" diyordu — yani bu betik boşluklu hiçbir
   yolda çalışmıyordu. Çalıştırılan yol, varlığı yukarıda sınanan yolun
   aynısı; ikisi ayrı ifade olsaydı biri düzeltilip diğeri unutulabilirdi. */
const r = spawnSync(win ? `"${wrapper}"` : './gradlew', [cfg.task], { cwd: AND, stdio: 'inherit', shell: win });
if (r.status !== 0) process.exit(r.status || 1);

const out = path.join(AND, cfg.out);
if (fs.existsSync(out)) {
  console.log('\nhazır →', out);
  console.log(Math.round(fs.statSync(out).size / 1024 / 1024 * 10) / 10 + ' MB');
  console.log(cfg.note);
} else {
  console.log('\ngörev bitti ama beklenen dosya bulunamadı:', out);
}
