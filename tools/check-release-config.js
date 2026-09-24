'use strict';
/* tools/check-release-config.js — RELEASE yapılandırmasını, imza sırrı
   gerektirmeden doğrular.

   Neden var: CI bugüne kadar yalnız `assembleDebug` derliyordu. Debug paketi
   release'in yanlış olabileceği iki şeyi hiç görmüyor:

     1. release kaynak kümesi derlenmiyordu — yalnız release'de bozulan bir
        Java değişikliği ancak Play'e yükleme günü fark edilirdi,
     2. `ads-testcfg.js` ayrımı ölçülmüyordu. Debug paketi AEA test coğrafyası
        taşıyor (`{debugGeography: 1}`), release paketi `null` taşımak zorunda.
        Bu ayrım bir bayrağa değil Android'in varyant birleştirmesine dayanıyor;
        dayanak buysa ölçülebilir olması gerekir.

   ===== BU BETİK DERLEME YAPMAZ =====

   Gradle görevlerini çağıran taraf workflow. Burada yalnız o görevlerin
   ÜRETTİĞİ çıktı okunuyor. Görevler şunlar ve TAM PAKET DERLEMESİ DEĞİL:

     :app:compileReleaseJavaWithJavac   release Java derleniyor
     :app:mergeReleaseAssets            release varlıkları birleşiyor
     :app:processReleaseMainManifest    release manifesti birleşiyor

   Ayrım bilerek: `assembleRelease`/`bundleRelease`/`packageRelease`
   android/app/build.gradle içindeki taskGraph kapısını tetikler ve
   keystore.properties yoksa düşer. O kapı doğru — sessizce imzasız paket
   üretmemek için var — ve bu kontrolü geçirmek uğruna zayıflatılmadı. Yukarıdaki
   üç görev kapının deseninin (assemble|bundle|package)Release dışında kaldığı
   için sırsız çalışıyor.

   Yani burada kanıtlanan: release kodu DERLENİYOR ve release varlıkları DOĞRU.
   Kanıtlanmayan: imzalı bir AAB üretilebildiği. O ayrı ve yereldir. */

const fs = require('fs');
const path = require('path');

const APP = path.join('android', 'app', 'build', 'intermediates');
const fails = [];
const notes = [];
const fail = m => fails.push(m);
const ok = m => notes.push(m);

function findOne(root, pred) {
  if (!fs.existsSync(root)) return null;
  const stack = [root];
  while (stack.length) {
    const d = stack.pop();
    let ents;
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (pred(p)) return p;
    }
  }
  return null;
}

function walkFiles(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  const stack = [root];
  while (stack.length) {
    const d = stack.pop();
    let ents;
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p); else out.push(p);
    }
  }
  return out;
}

const norm = p => p.split(path.sep).join('/');

/* ---- 1. Release Java derlendi mi -------------------------------------- */

const relClasses = path.join(APP, 'javac', 'release');
const cls = findOne(relClasses, p => p.endsWith('.class'));
if (!cls) {
  fail('release Java derleme çıktısı yok — önce :app:compileReleaseJavaWithJavac');
} else {
  ok(`release Java derlendi (${norm(path.relative(process.cwd(), cls))})`);
}

/* ---- 2. Release manifesti üretildi mi --------------------------------- */

const relManifest = findOne(
  path.join(APP),
  p => p.endsWith('AndroidManifest.xml') && norm(p).includes('/release/')
);
if (!relManifest) {
  fail('birleştirilmiş release manifesti yok — önce :app:processReleaseMainManifest');
} else {
  const m = fs.readFileSync(relManifest, 'utf8');
  const appId = JSON.parse(fs.readFileSync('capacitor.config.json', 'utf8')).appId;
  if (!m.includes(`package="${appId}"`)) {
    fail(`release manifest paket kimliği capacitor.config.json ile uyuşmuyor (${appId} yok)`);
  } else {
    ok(`release manifesti üretildi, paket kimliği ${appId}`);
  }
}

/* ---- 3. Release varlıkları: ads-testcfg.js null olmalı ---------------- */

const relAssets = path.join(APP, 'assets', 'release');
const relFiles = walkFiles(relAssets);
if (!relFiles.length) {
  fail('release varlık birleştirme çıktısı yok — önce :app:mergeReleaseAssets');
} else {
  const cfg = relFiles.find(p => norm(p).endsWith('/js/ads-testcfg.js'));
  if (!cfg) {
    fail(`release varlıkları arasında js/ads-testcfg.js yok (${relFiles.length} dosya tarandı)`);
  } else {
    const txt = fs.readFileSync(cfg, 'utf8');
    const assign = txt.match(/const\s+ADS_TESTCFG\s*=\s*([^\n;]*);/);
    if (!assign) {
      fail('release ads-testcfg.js içinde ADS_TESTCFG ataması bulunamadı');
    } else if (assign[1].trim() !== 'null') {
      fail(`release ads-testcfg.js null DEĞİL: ADS_TESTCFG = ${assign[1].trim()} ` +
           '— debug kaynak kümesi release paketine sızmış');
    } else {
      ok('release ads-testcfg.js → ADS_TESTCFG = null');
    }
  }

  /* Yukarıdaki kontrol tek dosyaya bakıyor; bu, aynı ayarın BAŞKA bir yoldan
     release ağacına girmediğini sorar.

     Aranan şey "debugGeography kelimesi" DEĞİL: o kelime release'e giden
     ads-testcfg.js'in kendi açıklamasında ve js/ads.js'teki okuyucuda
     (adsTestOpts) meşru olarak geçiyor — kelimeyi aramak her koşuda yanlış
     alarm üretirdi. Aranan, null OLMAYAN bir ADS_TESTCFG ATAMASI: anlamı olan
     tek şey o.

     isTesting'e bakılmıyor: paket hâlâ bilerek test reklam birimleriyle
     çalışıyor ve bu bir hata değil. */
  const assigns = [];
  for (const p of relFiles) {
    if (!/\.js$/i.test(p)) continue;
    let txt;
    try { txt = fs.readFileSync(p, 'utf8'); } catch { continue; }
    /* Yalnız BİLDİRİM biçimi aranıyor (`const ADS_TESTCFG = …;`). Düz bir
       `ADS_TESTCFG\s*=` deseni js/ads.js:443'teki
       `typeof ADS_TESTCFG === 'undefined'` karşılaştırmasının ilk `=`'ine
       takılıyor ve yanlış alarm veriyordu. Değeri belirleyen tek yer bildirim. */
    for (const m of txt.matchAll(/(?:const|let|var)\s+ADS_TESTCFG\s*=\s*([^\n;]*);/g)) {
      assigns.push({ file: p, value: m[1].trim() });
    }
  }
  const bad = assigns.filter(a => a.value !== 'null');
  if (bad.length) {
    for (const b of bad) {
      fail(`release varlığında null olmayan ADS_TESTCFG ataması: ` +
           `${norm(path.relative(process.cwd(), b.file))} → ${b.value}`);
    }
  } else {
    ok(`release varlıklarında null olmayan ADS_TESTCFG ataması yok ` +
       `(${assigns.length} atama / ${relFiles.length} dosya)`);
  }
}

/* ---- 4. Depodaki release kaynağı da null olmalı ------------------------ */

const repoCfg = path.join('js', 'ads-testcfg.js');
if (fs.existsSync(repoCfg)) {
  const a = fs.readFileSync(repoCfg, 'utf8').match(/const\s+ADS_TESTCFG\s*=\s*([^\n;]*);/);
  if (!a || a[1].trim() !== 'null') {
    fail(`js/ads-testcfg.js (release'e giden sürüm) null değil: ${a ? a[1].trim() : '?'}`);
  } else {
    ok("js/ads-testcfg.js (release kaynağı) → null");
  }
} else {
  fail('js/ads-testcfg.js yok');
}

/* ---- rapor ------------------------------------------------------------ */

for (const n of notes) console.log(`  ok   ${n}`);
if (fails.length) {
  console.error('');
  for (const f of fails) console.error(`  HATA ${f}`);
  console.error('');
  console.error(`release yapılandırma kontrolü DÜŞTÜ (${fails.length} sorun)`);
  process.exit(1);
}
console.log('release yapılandırma kontrolü tamam');
