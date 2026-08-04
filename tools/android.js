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

if (!fs.existsSync(AND)) {
  console.error('android/ klasörü yok. Önce: npm run android:add');
  process.exit(1);
}

const win = process.platform === 'win32';
const wrapper = path.join(AND, win ? 'gradlew.bat' : 'gradlew');
if (!fs.existsSync(wrapper)) { console.error('gradle sarmalayıcısı bulunamadı:', wrapper); process.exit(1); }

console.log('gradle görevi:', cfg.task, '(ilk çalıştırma birkaç dakika sürebilir)');
const r = spawnSync(win ? wrapper : './gradlew', [cfg.task], { cwd: AND, stdio: 'inherit', shell: win });
if (r.status !== 0) process.exit(r.status || 1);

const out = path.join(AND, cfg.out);
if (fs.existsSync(out)) {
  console.log('\nhazır →', out);
  console.log(Math.round(fs.statSync(out).size / 1024 / 1024 * 10) / 10 + ' MB');
  console.log(cfg.note);
} else {
  console.log('\ngörev bitti ama beklenen dosya bulunamadı:', out);
}
