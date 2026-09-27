'use strict';
/* tools/native-test.js — yamalı native ödeme kodunu DERLER ve KOŞTURUR.

   Neden var: `tools/savetest.js` js/iap.js'i bir eklenti mock'una karşı ölçer.
   O mock'a "reject" yazmak, JS'in bir reject'i doğru işlediğini gösterir —
   native tarafın o reject'i ÜRETTİĞİNİ göstermez. Düzeltilen hata tam orada
   duruyordu: `getPurchases()` başarısız bir Play sorgusunu
   `resolve({purchases: []})` ile kapatıyordu, yani JS hiçbir zaman bir reject
   görmüyordu ve "hiç satın alma yok" ile "sorulamadı" aynı görünüyordu.

   Bu yüzden burada ölçülen şey node_modules altındaki GERÇEK .java dosyası:
   `tools/native-test/stubs/` ağacı yalnızca onu derleyip JVM'de koşturmaya
   yeten en küçük yüzeyi sağlar. Android SDK'nın android.jar'ı kullanılamaz —
   içindeki sınıflar gövdesizdir ve çağrılınca "Stub!" atar.

   Gereken tek şey bir JDK. Sıra: JAVA_HOME → ANDROID_STUDIO_JBR → PATH.
   Android SDK, Gradle ve ağ GEREKMEZ. */

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PLUGIN_SRC = path.join(
  ROOT, 'node_modules', '@capgo', 'native-purchases', 'android', 'src', 'main', 'java'
);
const STUBS = path.join(__dirname, 'native-test', 'stubs');
const HARNESS = path.join(__dirname, 'native-test', 'GetPurchasesTest.java');

/* ---- JDK bul ----------------------------------------------------------- */

function jdkCandidates() {
  const out = [];
  if (process.env.JAVA_HOME) out.push(process.env.JAVA_HOME);
  /* Bu makinede çalışan kurulum Android Studio'nun paketlediği JBR (OpenJDK 21);
     PATH'teki java bir 32-bit JRE 8 olabiliyor ve modern kaynağı derlemiyor. */
  out.push('C:\\Program Files\\Android\\Android Studio\\jbr');
  out.push('/Applications/Android Studio.app/Contents/jbr/Contents/Home');
  return out;
}

function findTool(name) {
  const exe = process.platform === 'win32' ? name + '.exe' : name;
  for (const home of jdkCandidates()) {
    const p = path.join(home, 'bin', exe);
    if (fs.existsSync(p)) return p;
  }
  /* Son çare: PATH. */
  const probe = spawnSync(exe, ['-version'], { encoding: 'utf8' });
  if (!probe.error) return exe;
  return null;
}

/* ---- kaynakları topla -------------------------------------------------- */

function javaFiles(dir) {
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.java')) out.push(p);
    }
  })(dir);
  return out;
}

function main() {
  const javac = findTool('javac');
  const java = findTool('java');
  if (!javac || !java) {
    console.error('HATA: JDK bulunamadı. JAVA_HOME ayarlayın (OpenJDK 17+).');
    process.exit(1);
  }

  if (!fs.existsSync(PLUGIN_SRC)) {
    console.error('HATA: eklenti kaynağı yok: ' + PLUGIN_SRC);
    console.error('Beklenen akış: npm ci → postinstall → patch-package');
    process.exit(1);
  }

  const sources = javaFiles(STUBS).concat(javaFiles(PLUGIN_SRC)).concat([HARNESS]);
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'native-test-'));
  const argFile = path.join(outDir, 'sources.txt');
  /* Windows'ta komut satırı uzunluğu sınırlı; javac'in @argfile biçimi kullanılıyor.
     İki tuzağı birden var: ters bölü javac için kaçış karakteri, boşluk ise
     argüman ayırıcı. Bu yüzden her yol ileri bölüye çevrilip tırnaklanıyor —
     kullanıcı dizini boşluk içerebiliyor. */
  fs.writeFileSync(argFile, sources.map(s => '"' + s.split(path.sep).join('/') + '"').join('\n'));

  console.log('native test');
  console.log('  javac : ' + javac);
  console.log('  kaynak: ' + sources.length + ' dosya (' + javaFiles(PLUGIN_SRC).length + ' tanesi yamalı eklenti)');

  try {
    execFileSync(javac, ['-nowarn', '-d', outDir, '@' + argFile], { stdio: 'inherit' });
  } catch (e) {
    console.error('');
    console.error('native test DÜŞTÜ: derleme hatası');
    process.exit(1);
  }

  console.log('  derleme tamam');
  console.log('');

  const run = spawnSync(java, ['-cp', outDir, 'GetPurchasesTest'], { stdio: 'inherit' });
  if (run.status !== 0) {
    console.error('');
    console.error('native test DÜŞTÜ');
    process.exit(run.status === null ? 1 : run.status);
  }
  console.log('native test tamam');
}

main();
