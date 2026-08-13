'use strict';
/* tools/build-geo.js → js/worldgeo.js
   Natural Earth 1:110m "map units" (kamu malı / public domain, atıf gerekmez)
   → Robinson izdüşümü → sadeleştirme → tam sayı + göreli SVG yolu.

   GELİŞTİRME ARACI. Oyun bunu asla çalıştırmaz ve hiçbir zaman ağa çıkmaz;
   üretilen js/worldgeo.js depoya işlenir ve oyun yalnızca onu okur.

   Neden "map units" değil de "countries" değil:
   Birleşik Krallık tek parça geliyor, oysa oyunun EN bölgesi İngiltere.
   map_units veri kümesi 110m'de İngiltere / İskoçya / Galler / K. İrlanda'yı
   ayrı veriyor. Aynı dosya Fransa'yı da metropol Fransa ile Fransız Guyanası
   olarak ayırıyor — Guyana Güney Amerika'da duruyor ve bir keşif bölgesi
   işaretini oraya taşımak yanlış olurdu.

   Çalıştırmak için:  node tools/build-geo.js
   Kaynak bir kez tools/.geocache/ içine indirilir (bkz. .gitignore). */

const fs = require('fs');
const path = require('path');

const SRC_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_map_units.geojson';
const CACHE = path.join(__dirname, '.geocache', 'ne_110m_admin_0_map_units.geojson');
const OUT = path.join(__dirname, '..', 'js', 'worldgeo.js');

/* ===== oyunun 16 keşif bölgesi → Natural Earth birimleri =====
   [A3] tüm birimleri alır; [A3, 'Ad'] yalnızca o birimi alır.
   NAF ve WAF birer ülke değil: oyunun data.js'indeki NAF/AFR uyruk listelerinin
   coğrafi karşılığı. Tek bölge, çok poligon. */
const TERR = {
  TR: [['TUR']],
  EN: [['GBR', 'England']],          // Birleşik Krallık değil, İngiltere
  ES: [['ESP']],
  DE: [['DEU']],
  IT: [['ITA']],
  FR: [['FRA', 'France']],           // metropol Fransa; Fransız Guyanası hariç
  NL: [['NLD']],
  PT: [['PRT']],
  BR: [['BRA']],
  AR: [['ARG']],
  US: [['USA']],
  MX: [['MEX']],
  SA: [['SAU']],
  JP: [['JPN']],
  /* data.js → NAF=['eg','ma','dz','tn'] */
  NAF: [['EGY'], ['MAR'], ['DZA'], ['TUN']],
  /* data.js → AFR=['ng','sn','gh','cm','ci','ml','cd'] — 'cd' Kongo DC,
     coğrafi olarak Orta Afrika ama oyunun Batı Afrika bölgesine dahil. */
  WAF: [['NGA'], ['SEN'], ['GHA'], ['CMR'], ['CIV'], ['MLI'], ['COD']]
};
/* İşaretin konacağı ülke — yalnız çok ülkeli bölgeler için.
   Varsayılan kural "en büyük parçanın erişilemezlik kutbu" tek ülkeli 14 bölgede
   doğru sonucu veriyor, ama WAF'ta en büyük parça Kongo DC: "Batı Afrika" yazan
   işaret Kongo havzasına düşüyordu. Bölge bir oyun bölgesi olduğu için işaretin
   nereye konacağı coğrafi değil tasarım kararı. */
const ANCHOR_IN = { WAF: 'NGA' };

/* Antarktika 180. meridyeni geçen tek parça; hiçbir ligi de yok. */
const SKIP = ['ATA'];
const SCALE = 750;        // Robinson yarıçapı × bu → ~10 km / birim
/* Bölgeler etkileşimli ve vurgulanan şekiller: daha ince sadeleştirme.
   Zemin ülkeleri yalnız arka plan; orada kabalık dosya boyutuna dönüşüyor. */
const TOL_T = 1.1;        // bölge Douglas–Peucker toleransı (birim)
const TOL_C = 2.6;        // zemin toleransı
const MIN_AREA_T = 2;     // bölge poligonlarında en küçük ada (birim²)
const MIN_AREA_C = 10;    // zemin ülkelerinde daha cömert eleme

/* ===== Robinson =====
   5°'lik standart katsayı tablosu, aralarda doğrusal ara değer. */
const RX = [1, .9986, .9954, .99, .9822, .973, .96, .9427, .9216, .8962, .8679,
  .835, .7986, .7597, .7186, .6732, .6213, .5722, .5322];
const RY = [0, .062, .124, .186, .248, .31, .372, .434, .4958, .5571, .6176,
  .6769, .7346, .7903, .8435, .8936, .9394, .9761, 1];
function project(lon, lat) {
  const a = Math.min(Math.abs(lat), 90) / 5;
  const i = Math.min(17, Math.floor(a)), t = a - i;
  const X = RX[i] + (RX[i + 1] - RX[i]) * t;
  const Y = RY[i] + (RY[i + 1] - RY[i]) * t;
  /* SVG'de y aşağı doğru büyür — kuzey yukarıda kalsın diye işaret ters */
  return [0.8487 * X * (lon * Math.PI / 180) * SCALE,
          -1.3523 * Y * Math.sign(lat) * SCALE];
}

/* ===== geometri yardımcıları ===== */
function area(r) { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return Math.abs(a / 2); }
function segDist2(px, py, ax, ay, bx, by) {
  let dx = bx - ax, dy = by - ay;
  const L = dx * dx + dy * dy;
  let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  dx = px - (ax + t * dx); dy = py - (ay + t * dy);
  return dx * dx + dy * dy;
}
/* Douglas–Peucker — özyineleme yerine yığın, uzun kıyılarda taşmasın diye. */
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const t2 = tol * tol, stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop();
    let idx = -1, best = t2;
    for (let i = lo + 1; i < hi; i++) {
      const d = segDist2(pts[i][0], pts[i][1], pts[lo][0], pts[lo][1], pts[hi][0], pts[hi][1]);
      if (d > best) { best = d; idx = i; }
    }
    if (idx > 0) { keep[idx] = 1; stack.push([lo, idx], [idx, hi]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function pointInRing(x, y, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function distToRing(x, y, r) {
  let m = Infinity;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++)
    m = Math.min(m, segDist2(x, y, r[j][0], r[j][1], r[i][0], r[i][1]));
  return Math.sqrt(m);
}
/* Erişilemezlik kutbu: poligonun kıyıdan en uzak iç noktası. Ağırlık merkezi
   içbükey ülkelerde (ya da çok parçalı bölgelerde) dışarı düşebiliyor —
   işaretin kara üstünde durması bunu gerektiriyor. Kaba ızgara + kademeli
   daraltma; bu ölçekte hassas bir çözücüye gerek yok. */
function poleOfInaccessibility(ring) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  ring.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
  let bx = (x0 + x1) / 2, by = (y0 + y1) / 2, bd = -Infinity;
  let w = x1 - x0, h = y1 - y0;
  for (let pass = 0; pass < 6; pass++) {
    const stepX = w / 12, stepY = h / 12;
    for (let i = 0; i <= 12; i++) for (let j = 0; j <= 12; j++) {
      const x = x0 + i * stepX, y = y0 + j * stepY;
      if (!pointInRing(x, y, ring)) continue;
      const d = distToRing(x, y, ring);
      if (d > bd) { bd = d; bx = x; by = y; }
    }
    /* en iyi noktanın çevresine daral */
    x0 = bx - w / 8; x1 = bx + w / 8; y0 = by - h / 8; y1 = by + h / 8;
    w = x1 - x0; h = y1 - y0;
  }
  return { x: Math.round(bx), y: Math.round(by), clearance: +bd.toFixed(1) };
}
/* Göreli, tam sayı yol verisi: "M x y l dx dy dx dy … z".
   Mutlak koordinata göre belirgin daha kısa — sayılar küçük kalıyor. */
function pathOf(rings) {
  return rings.map(r => {
    let d = 'M' + r[0][0] + ' ' + r[0][1], px = r[0][0], py = r[0][1];
    for (let i = 1; i < r.length; i++) {
      d += (i === 1 ? 'l' : ' ') + (r[i][0] - px) + ' ' + (r[i][1] - py);
      px = r[i][0]; py = r[i][1];
    }
    return d + 'z';
  }).join('').replace(/ -/g, '-');
}

/* ===== kaynak ===== */
async function source() {
  if (fs.existsSync(CACHE)) return JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  process.stdout.write('kaynak indiriliyor… ');
  const res = await fetch(SRC_URL);
  if (!res.ok) throw new Error('indirilemedi: HTTP ' + res.status);
  const txt = await res.text();
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, txt);
  console.log('tamam (' + Math.round(txt.length / 1024) + 'KB)');
  return JSON.parse(txt);
}

(async () => {
  const geo = await source();
  const feats = geo.features.filter(f => SKIP.indexOf(f.properties.ADM0_A3) < 0);

  /* birim → hangi bölgeye ait (yoksa zemin) */
  const owner = new Map();
  Object.keys(TERR).forEach(code => TERR[code].forEach(([a3, unit]) => {
    feats.forEach(f => {
      if (f.properties.ADM0_A3 !== a3) return;
      if (unit && f.properties.NAME !== unit) return;
      owner.set(f, code);
    });
  }));

  /* her birimin halkalarını izdüşür, sadeleştir, ele */
  const partsOf = f => f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const terrRings = {}, ctxRings = [];
  /* işaret seçimi için: her bölgede ülke → halkaları */
  const terrByUnit = {};
  let ringsIn = 0, ringsOut = 0, ptsIn = 0, ptsOut = 0;
  Object.keys(TERR).forEach(c => { terrRings[c] = []; terrByUnit[c] = {}; });

  feats.forEach(f => {
    const code = owner.get(f) || null;
    const minA = code ? MIN_AREA_T : MIN_AREA_C;
    const tol = code ? TOL_T : TOL_C;
    partsOf(f).forEach(poly => poly.forEach(ring => {
      ringsIn++; ptsIn += ring.length;
      let pts = ring.map(([lon, lat]) => project(lon, lat)).map(([x, y]) => [Math.round(x), Math.round(y)]);
      /* aynı noktaya yuvarlanan ardışık köşeleri at */
      pts = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
      pts = simplify(pts, tol);
      if (pts.length < 4 || area(pts) < minA) return;
      ringsOut++; ptsOut += pts.length;
      if (code) {
        terrRings[code].push(pts);
        const a3 = f.properties.ADM0_A3;
        (terrByUnit[code][a3] = terrByUnit[code][a3] || []).push(pts);
      } else ctxRings.push(pts);
    }));
  });

  /* bölge künyesi: yol, sınır kutusu, işaret noktası */
  const out = {};
  const report = [];
  Object.keys(TERR).forEach(code => {
    const rings = terrRings[code];
    if (!rings.length) { report.push({ code, ok: false }); return; }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    rings.forEach(r => r.forEach(([x, y]) => {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }));
    /* İşaret, bir ülkenin en büyük parçasının erişilemezlik kutbuna konuyor:
       ortalama bir nokta içbükey ülkelerde ve çok ülkeli bölgelerde denize düşer.
       Hangi ülke: ANCHOR_IN söylüyorsa o, yoksa bölgenin en büyük parçası. */
    const host = ANCHOR_IN[code];
    const pool = (host && terrByUnit[code][host] && terrByUnit[code][host].length)
      ? terrByUnit[code][host] : rings;
    const big = pool.slice().sort((a, b) => area(b) - area(a))[0];
    const pia = poleOfInaccessibility(big);
    const inside = rings.some(r => pointInRing(pia.x, pia.y, r));
    out[code] = { d: pathOf(rings), bb: [x0, y0, x1, y1], a: [pia.x, pia.y] };
    report.push({ code, ok: true, rings: rings.length, pia, inside, host: host || null, bb: [x0, y0, x1, y1] });
  });

  /* tuval: tüm çizilen geometrinin sınırları */
  let X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity;
  const scan = r => r.forEach(([x, y]) => { X0 = Math.min(X0, x); Y0 = Math.min(Y0, y); X1 = Math.max(X1, x); Y1 = Math.max(Y1, y); });
  ctxRings.forEach(scan); Object.keys(terrRings).forEach(c => terrRings[c].forEach(scan));
  const pad = 20;
  const vb = [X0 - pad, Y0 - pad, (X1 - X0) + pad * 2, (Y1 - Y0) + pad * 2];

  const body =
`'use strict';
/* js/worldgeo.js — ÜRETİLMİŞ DOSYA, elle düzenleme.
   Kaynak: Natural Earth 1:110m map units (kamu malı).
   Üretmek için: node tools/build-geo.js

   GEO.vb    görünüm kutusu [x,y,w,h]
   GEO.t[c]  bölge: d = SVG yolu (çok altyol), bb = [x0,y0,x1,y1], a = [x,y] işaret
   GEO.ctx   oyunun bölgesi olmayan ülkeler — tek yol, tek zemin katmanı
   Delikler için yollar fill-rule="evenodd" ile çizilmeli. */
const GEO={
vb:[${vb.join(',')}],
t:{
${Object.keys(out).map(c => `"${c}":{a:[${out[c].a.join(',')}],bb:[${out[c].bb.join(',')}],d:"${out[c].d}"}`).join(',\n')}
},
ctx:"${pathOf(ctxRings)}"
};
`;
  fs.writeFileSync(OUT, body);

  /* ===== rapor ===== */
  const kb = n => (n / 1024).toFixed(1) + 'KB';
  console.log('\n=== kaynak ===');
  console.log('  birim (Antarktika hariç):', feats.length);
  console.log('  halka  ', ringsIn, '→', ringsOut, ' nokta', ptsIn, '→', ptsOut,
    '(-' + Math.round((1 - ptsOut / ptsIn) * 100) + '%)');
  console.log('\n=== bölgeler ===');
  report.forEach(r => {
    if (!r.ok) { console.log('  ' + r.code.padEnd(4) + 'POLİGON YOK'); return; }
    console.log('  ' + r.code.padEnd(4) + String(r.rings).padStart(2) + ' poligon  işaret ' +
      ('[' + r.pia.x + ',' + r.pia.y + ']').padEnd(14) +
      'kıyıya ' + String(r.pia.clearance).padStart(6) + 'br  ' +
      (r.inside ? 'İÇERİDE' : '*** DIŞARIDA ***') +
      (r.host ? '  (' + r.host + ' seçildi)' : ''));
  });
  console.log('\n=== çıktı ===');
  console.log('  js/worldgeo.js', kb(body.length));
  console.log('  viewBox', vb.join(' '));
  console.log('  bölge yolları', kb(Object.keys(out).reduce((s, c) => s + out[c].d.length, 0)),
    '· zemin', kb(pathOf(ctxRings).length));
  const bad = report.filter(r => !r.ok || !r.inside);
  console.log('\n' + (bad.length ? bad.length + ' SORUN' : 'sorun yok') +
    ' · ' + report.filter(r => r.ok).length + '/' + Object.keys(TERR).length + ' bölge eşlendi');
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
