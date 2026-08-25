/* Prosedürel takım arması prototipi — çizim, semantik eşleme ve ölçüm.
 * SADECE geliştirici aracı.
 *
 * Oyun çalışma zamanına hiçbir bağı yok: tmBadge() dokunulmadı, js/ui.js
 * dokunulmadı, index.html'e script eklenmedi. Bu dosya yalnız badge-lab.html
 * tarafından yükleniyor. js/data.js OKUNUYOR (aynı sayfada <script> ile), ama
 * değiştirilmiyor ve hiçbir kayıt alanı eklenmiyor.
 */

/* ------------------------------------------------------------------ hash */
/* FNV-1a. Kripto değil, dağılımı düzgün ve Math.random'a hiç ihtiyaç
 * duymadan deterministik: aynı tohum her açılışta aynı armayı verir. */
function hash32(str) {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/* Her katman AYRI tuzla hash'leniyor. Tek bir hash'in alt bitlerini üçe birden
 * dağıtmak katmanları birbirine kilitler; o zaman çerçeve değişince desen de
 * değişir ve gerçek çeşitlilik çıkmaz. */
function pick(seed, salt, n) {
  return hash32(seed + '|' + salt) % n;
}

/* ------------------------------------------------- takımın kanonik kimliği */
/* Neden ad + kısaltma?
 *  - tm.n hiçbir yerde çevrilmiyor: js/i18n.js ve js/ui.js'te tek bir takım adı
 *    geçmiyor, adlar js/data.js'ten olduğu gibi okunuyor. Yani dilden bağımsız.
 *  - tm.ab tek başına YETMEZ: 436 takımda yalnız 383 farklı kısaltma var
 *    (46 çakışma, ör. İSP = İstanbul Spires ve İstanbul Pastures).
 *  - tm.lg tohuma KATILMADI: küme düşen takımın ligi değişir, arması değişmemeli.
 *  - Takımın listedeki sırası da tohuma katılmadı, aynı sebeple.
 * Sonuç: ad + kısaltma, 436/436 benzersiz ve kariyer boyunca sabit. */
function canonicalKey(team) {
  return team.n + '|' + team.ab;
}

/* Kimlik kelimesi her zaman adın SON kelimesi: 436 adın 401'i iki, 34'ü üç,
 * 1'i dört kelime ve hepsinde şehir önde. Türkçe 'İ' bazı ortamlarda
 * toLowerCase ile birleşik noktalı 'i̇' veriyor; NFD + birleşen işaretleri atmak
 * aynı kelimenin iki ayrı token üretmesini engelliyor. */
function identityToken(name) {
  const parts = String(name).trim().split(/\s+/);
  return parts[parts.length - 1]
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z]/g, '');
}

const EMB_BY_ID = {};
EMBLEMS.forEach(e => { EMB_BY_ID[e.id] = e; });
const PAT_BY_ID = {};
PATTERNS.forEach(p => { PAT_BY_ID[p.id] = p; });
const SEM_INDEX = {};
SEMANTIC.forEach(c => c.words.forEach(w => { SEM_INDEX[w] = c; }));

/* ------------------------------------------------------------------ renk */
function hex2rgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgb2hex(r) {
  return '#' + r.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
function relLum(hex) {
  return hex2rgb(hex).map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(a, b) {
  const x = relLum(a), y = relLum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function mix(a, b, t) {
  const A = hex2rgb(a), B = hex2rgb(b);
  return rgb2hex(A.map((v, i) => v + (B[i] - v) * t));
}

/* Renkler TAKIMIN KENDİ verisinden geliyor. js/core.js'teki tmBadge() de aynı
 * iki alanı okuyor (tm.c1 zemin, tm.c2 köşe şeridi), yani bu prototip mevcut
 * kimlik renklerini değiştirmiyor, yalnız üzerine okunacak tonu seçiyor.
 * Yeni renk alanı eklenmedi.
 *
 * ink her zaman koyu: dış çerçevenin hem koyu saha zemininde hem açık zeminde
 * silueti tutması buna bağlı. Takımın ana rengine doğru karıştırıldığı için
 * nötr siyah değil, takımın tonunu taşıyor.
 *
 * accent nötr merdivenden seçiliyor (TONES): iki alan rengiyle en yüksek
 * ASGARİ kontrastı veren aday kazanıyor. Tek bir sabit beyaz kullanılsaydı
 * beyaz formalı takımlarda amblem alanın yarısında kaybolurdu. */
function teamColors(team) {
  const ok = h => typeof h === 'string' && /^#[0-9a-fA-F]{6}$/.test(h);
  /* Renk yoksa eski davranışla uyumlu deterministik yedek: tmBadge() de
     tm.c1/tm.c2 bekliyor, ikisi de her zaman dolu; yine de kırılmasın. */
  const key = canonicalKey(team);
  const primary = ok(team.c1) ? team.c1 : FALLBACK_C[pick(key, 'c1', FALLBACK_C.length)];
  const secondary = ok(team.c2) ? team.c2 : FALLBACK_C[pick(key, 'c2', FALLBACK_C.length)];
  const ink = mix(primary, '#0A0C10', 0.78);
  let best = TONES[0], bs = -1;
  TONES.forEach(t => {
    const s = Math.min(contrast(t.hex, primary), contrast(t.hex, secondary));
    if (s > bs) { bs = s; best = t; }
  });
  return { primary, secondary, accent: best.hex, ink, tone: best.id, toneMin: +bs.toFixed(2) };
}
const FALLBACK_C = ['#B5232B', '#1B45A8', '#0E7A54', '#D2661C', '#5B2A83', '#16294F'];

/* --------------------------------------------------------- descriptor */
/* Saf fonksiyon. Kayda veya çalışma zamanına hiçbir şey yazmaz; girdisi bir
 * takım nesnesi, çıktısı armayı tarif eden düz bir kayıt. */
function badgeDescriptor(team, salt) {
  const key = canonicalKey(team);
  const s = salt ? '#' + salt : '';
  const token = identityToken(team.n);
  const cat = SEM_INDEX[token] || null;
  let emblem, usedFallback = false;
  if (cat) {
    /* Kategori içinden seçim takımın kanonik anahtarına bağlı; aynı kimlik
       kelimesine sahip takımlar aynı amblemi almak zorunda değil. Kelimenin
       birebir amblem karşılığı varsa ayrı bir tuzla yarı yarıya o tercih edilir. */
    const exact = SEM_EXACT[token];
    if (exact && pick(key, 'exact' + s, 2) === 0) {
      emblem = EMB_BY_ID[exact];
    } else {
      emblem = EMB_BY_ID[cat.emblems[pick(key, 'emblem@' + cat.id + s, cat.emblems.length)]];
    }
  } else {
    emblem = EMBLEMS[pick(key, 'emblem*' + s, EMBLEMS.length)];
    usedFallback = true;
  }
  const frame = FRAMES[pick(key, 'frame' + s, FRAMES.length)];
  const pattern = PATTERNS[pick(key, 'pattern' + s, PATTERNS.length)];
  const c = teamColors(team);
  return {
    frame, pattern, emblem,
    primary: c.primary, secondary: c.secondary, accent: c.accent, ink: c.ink,
    tone: c.tone, toneMin: c.toneMin,
    semanticKey: token,
    semanticCategory: cat ? cat.id : null,
    semanticLoose: !!SEM_LOOSE[token],
    usedFallback, salt: salt || 0, key,
    combo: frame.id + '|' + pattern.id + '|' + emblem.id + '|' + c.primary + '|' + c.secondary,
    shape: frame.id + '|' + pattern.id + '|' + emblem.id,
  };
}

/* Aynı ligde iki takımın tam kombinasyonu çakışırsa deterministik yeniden
 * tuzlama. Çözüm sırası GİRİŞ SIRASINA bağlı olamaz — küme düşme veya puan
 * sıralaması listeyi karıştırdığında armalar değişirdi. Bu yüzden liste önce
 * kanonik anahtara göre sıralanıyor; hangi sırada verilirse verilsin sonuç
 * aynı. Renkler takımdan geldiği için tuzlama yalnız çerçeve/desen/amblemi
 * kaydırır, kimlik renklerine dokunmaz. */
function resolveLeague(teams) {
  const order = [...teams].sort((a, b) => (canonicalKey(a) < canonicalKey(b) ? -1 : 1));
  const used = new Set(), out = new Map();
  order.forEach(t => {
    for (let s = 0; s < 64; s++) {
      const d = badgeDescriptor(t, s);
      if (!used.has(d.combo)) { used.add(d.combo); out.set(canonicalKey(t), d); return; }
    }
    throw new Error('kombinasyon tükendi: ' + t.n);
  });
  return out;
}

/* ------------------------------------------------------------------ çizim */
/* 26px ve altında mikro amblem geometrisi. 20px ve altında ayrıca NANO
 * politikası: iç accent keyline yok, taban çubuğu yok, desen sadeleşmiş
 * karşılığına düşüyor, amblem daha geniş fitS kutusuna oturuyor. */
const MICRO_AT = 26;

/* Amblemin oranına en yakın merdiven satırını seçer. Logaritmik uzaklık, çünkü
 * 0.55 ile 0.7 arasındaki fark 1.75 ile 2.1 arasındaki farkla aynı ölçüde
 * önemli. Seçilen satır çerçeveye sığdığı ölçülmüş olduğu için amblem de sığar. */
function fitRow(frame, emblem, nano) {
  const bb = emblem.bb;
  const a = (bb[2] - bb[0]) / (bb[3] - bb[1]);
  let bi = 0, bd = Infinity;
  FIT_ASPECTS.forEach((v, i) => {
    const dd = Math.abs(Math.log(v) - Math.log(a));
    if (dd < bd) { bd = dd; bi = i; }
  });
  return (nano ? frame.fitAS : frame.fitA)[bi];
}

function emblemTransform(frame, emblem, nano) {
  const fit = fitRow(frame, emblem, nano);
  const bb = emblem.bb;
  const bw = bb[2] - bb[0], bh = bb[3] - bb[1];
  const s = Math.min(fit[0] / bw, fit[1] / bh);
  return { s, tx: 32 - s * (bb[0] + bb[2]) / 2, ty: fit[2] - s * (bb[1] + bb[3]) / 2, fit };
}

function badgeSVG(d, px, opts) {
  const nano = px <= NANO_AT;
  const o = opts || {};
  const p = { primary: d.primary, secondary: d.secondary };
  const t = emblemTransform(d.frame, d.emblem, nano);
  const path = px <= MICRO_AT ? d.emblem.dm : d.emblem.d;
  const pat = nano ? PAT_BY_ID[d.pattern.nano] : d.pattern;
  const dd = d.frame.d();
  const edge = nano ? NANO_EDGE : EDGE_INK;
  let g = pat.f(p).join('');
  if (!nano) {
    g += '<rect x="20" y="' + d.frame.bar + '" width="24" height="1.5" fill="' + d.accent + '"/>'
      + '<path d="' + dd + '" fill="none" stroke="' + d.accent + '" stroke-width="' + (EDGE_KEY * 2) + '" stroke-linejoin="round"/>';
  }
  g += '<path d="' + dd + '" fill="none" stroke="' + d.ink + '" stroke-width="' + (edge * 2) + '" stroke-linejoin="round"/>';
  return '<svg class="bdg" width="' + px + '" height="' + px + '" viewBox="0 0 64 64" '
    + 'role="img" aria-label="' + esc(o.label || d.key.split('|')[0]) + '">'
    + '<g clip-path="url(#bclip-' + d.frame.id + ')">' + g + '</g>'
    + '<g transform="translate(' + R2(t.tx) + ' ' + R2(t.ty) + ') scale(' + R2(t.s) + ')">'
    + '<path d="' + path + '" fill="' + d.accent + '" fill-rule="evenodd" '
    + 'stroke="' + d.ink + '" stroke-width="' + R2((nano ? EMB_EDGE_NANO : EMB_EDGE) / t.s) + '" '
    + 'stroke-linejoin="round" paint-order="stroke"/>'
    + '</g></svg>';
}

/* Çerçeve clip'leri sayfada TEK kez tanımlanıyor. Her armaya kopyalansaydı aynı
 * id defalarca tekrar ederdi; artan sayaçla üretilseydi de "aynı takım → aynı
 * SVG" bozulurdu. */
function clipDefs() {
  return '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>'
    + FRAMES.map(f => '<clipPath id="bclip-' + f.id + '"><path d="' + f.d() + '"/></clipPath>').join('')
    + '</defs></svg>';
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* Dört katmanı tek satırda okunur kılan kısa kod. Etiket yığını yerine bu,
 * çünkü asıl soru "hangi dörtlü bu?" */
function blazon(d) {
  const ab = s => s.replace(/-/g, '').slice(0, 4).toUpperCase();
  return ab(d.frame.id) + ' · ' + ab(d.pattern.id) + ' · ' + ab(d.emblem.id)
    + (d.usedFallback ? ' · HASH' : ' · ' + ab(d.semanticCategory));
}

/* ------------------------------------------------- gerçek takım verisi */
/* js/data.js'teki TEAMS'i newGame() ile AYNI şekilde düzleştiriyor: id sırası
 * S.teams.length ile birebir aynı, böylece laboratuvarın gördüğü takım nesnesi
 * oyunun kuracağı nesneyle aynı alanları taşıyor. */
function labTeams() {
  const out = [];
  TEAMS.forEach((lgTeams, lg) => {
    lgTeams.forEach(([n, ab, c1, c2, str]) => {
      out.push({ id: out.length, n, ab, c1, c2, lg, str, lgCode: LEAGUES[lg].c });
    });
  });
  return out;
}

/* Vitrin seçimi: en az beş farklı ligden 30 takım. Önce özellikle görülmesi
 * istenen takımlar, kalanı ligler arasında gezerek deterministik dolduruluyor.
 *
 * NOT: istenen sekiz addan yalnız "Manchester Ironworks" gerçek veride var.
 * Diğer yedisi (Liverpool Harbour, Leeds Kiln, Hamburg Beacon, Lisbon Compass,
 * Córdoba Signal, Monterrey Cobalt, Sapporo Stonebridge) 1. turun UYDURMA
 * laboratuvar adlarıydı; js/data.js'te böyle takım yok. Yerlerine aynı şehrin
 * gerçek takımı konuldu, çünkü asıl soru "bu şehrin takımı ne alıyor?". */
const WANTED = [
  'Manchester Ironworks',   // istendi, gerçek
  'Merseyside Summit',      // Liverpool Harbour yerine — veride Liverpool yok, Merseyside var
  'Leeds Aqueduct',         // Leeds Kiln yerine
  'Hamburg Harbour',        // Hamburg Beacon yerine
  'Lisboa Heralds',         // Lisbon Compass yerine
  'Córdoba Foundry',        // Córdoba Signal yerine
  'Monterrey Lighthouse',   // Monterrey Cobalt yerine
  'Sapporo Cliffs',         // Sapporo Stonebridge yerine
];

function showcase(all) {
  const out = [], seen = new Set();
  WANTED.forEach(n => {
    const t = all.find(x => x.n === n);
    if (t) { out.push(t); seen.add(t.id); }
  });
  /* Kalanı: her ligden sırayla bir takım alarak dolaş, böylece tek lig
     baskın olmasın. */
  const byLg = {};
  all.forEach(t => { (byLg[t.lg] = byLg[t.lg] || []).push(t); });
  const lgs = Object.keys(byLg).map(Number).sort((a, b) => a - b);
  let round = 0;
  while (out.length < 30 && round < 40) {
    for (const lg of lgs) {
      if (out.length >= 30) break;
      const pool = byLg[lg];
      const t = pool[(round * 7 + lg * 3) % pool.length];
      if (!seen.has(t.id)) { out.push(t); seen.add(t.id); }
    }
    round++;
  }
  return out.slice(0, 30);
}

/* Ölçek/nano testleri için anlamlı şekilde farklı kategorilerden takımlar. */
function pickByCategory(all, wantCats, n) {
  const out = [], seen = new Set();
  wantCats.forEach(cid => {
    const t = all.find(x => !seen.has(x.id) && SEM_INDEX[identityToken(x.n)] &&
      SEM_INDEX[identityToken(x.n)].id === cid);
    if (t) { out.push(t); seen.add(t.id); }
  });
  for (let i = 0; out.length < n && i < all.length; i++) {
    if (!seen.has(all[i].id)) { out.push(all[i]); seen.add(all[i].id); }
  }
  return out.slice(0, n);
}
/* Belirli bir amblemi taşıyan ilk takımı bulur — nano testi amblem bazlı. */
function firstWithEmblem(all, D, eid, frameId) {
  return all.find(t => {
    const d = D.get(canonicalKey(t));
    return d && d.emblem.id === eid && (!frameId || d.frame.id === frameId);
  });
}

/* --------------------------------------------------------------- bölümler */
let LANG = 'tr';
const T = {
  tr: {
    s1: '1 · Toplam bileşen havuzu', s2: '2 · Gerçek takım eşlemesi',
    s3: '3 · Önce / sonra', s4: '4 · Ölçek testi', s5: '5 · Lig tablosu',
    s6: '6 · Nano testi (18px)', s7: '7 · Ölçüm',
    emb: 'Amblemler', frm: 'Çerçeveler', pat: 'Desenler', sem: 'Semantik kategoriler',
    before: 'önce · saf hash + laboratuvar paleti', after: 'sonra · semantik + gerçek renk',
    hp: 'O', hgd: 'Av', hpt: 'P', team: 'Takım',
    pass: 'geçti', fail: 'KALDI', fb: 'yedek', cat: 'kategori',
  },
  en: {
    s1: '1 · Full component pool', s2: '2 · Real team mapping',
    s3: '3 · Before / after', s4: '4 · Scale test', s5: '5 · League table',
    s6: '6 · Nano test (18px)', s7: '7 · Measurement',
    emb: 'Emblems', frm: 'Frames', pat: 'Patterns', sem: 'Semantic categories',
    before: 'before · pure hash + lab palette', after: 'after · semantic + real colours',
    hp: 'P', hgd: 'GD', hpt: 'Pts', team: 'Team',
    pass: 'pass', fail: 'FAIL', fb: 'fallback', cat: 'category',
  },
};
const t = k => T[LANG][k];
const nm = o => o.name[LANG];

const SIZES = [64, 34, 26, 18];

function section1() {
  const cell = (label, art, meta) =>
    '<figure class="cell"><div class="cell-art">' + art + '</div>'
    + '<figcaption><b>' + esc(label) + '</b>' + (meta ? '<span>' + esc(meta) + '</span>' : '') + '</figcaption></figure>';

  const embs = EMBLEMS.map(e => cell(nm(e),
    '<svg width="50" height="50" viewBox="0 0 64 64" role="img" aria-label="' + esc(nm(e)) + '">'
    + '<path d="' + e.d + '" fill-rule="evenodd" fill="var(--spec)"/></svg>',
    e.cell + ' · ' + e.pts + 'n/' + e.sub + ' · m' + e.mpts)).join('');

  const frms = FRAMES.map(f => cell(nm(f),
    '<svg width="50" height="50" viewBox="0 0 64 64" role="img" aria-label="' + esc(nm(f)) + '">'
    + '<path d="' + f.d() + '" fill="none" stroke="var(--spec)" stroke-width="2"/></svg>',
    'kare fit ' + f.fitA[3][0] + '×' + f.fitA[3][1] + ' · nano ' + f.fitAS[3][0] + '×' + f.fitAS[3][1])).join('');

  const demo = { primary: '#8d949c', secondary: '#33383e' };
  const pats = PATTERNS.map(p => cell(nm(p),
    '<svg width="50" height="50" viewBox="0 0 64 64" role="img" aria-label="' + esc(nm(p)) + '">'
    + p.f(demo).join('') + '</svg>', 'nano → ' + p.nano)).join('');

  const sems = SEMANTIC.map(c =>
    '<figure class="cell sem"><figcaption><b>' + esc(nm(c)) + '</b>'
    + '<span class="code">' + c.emblems.join(' · ') + '</span>'
    + '<span>' + c.words.join(', ') + '</span></figcaption></figure>').join('');

  return '<section id="s1"><h2>' + t('s1') + '</h2>'
    + '<h3>' + t('emb') + ' <em>24</em></h3><div class="grid g6">' + embs + '</div>'
    + '<h3>' + t('frm') + ' <em>10</em></h3><div class="grid g6">' + frms + '</div>'
    + '<h3>' + t('pat') + ' <em>10</em></h3><div class="grid g6">' + pats + '</div>'
    + '<h3>' + t('sem') + ' <em>13</em></h3><div class="grid g3">' + sems + '</div>'
    + '</section>';
}

function section2(show, D) {
  const cells = show.map((tm, i) => {
    const d = D.get(canonicalKey(tm));
    return '<figure class="cell spec"><div class="cell-art">' + badgeSVG(d, 64, { label: tm.n }) + '</div>'
      + '<figcaption><b>' + esc(tm.n) + '</b>'
      + '<span class="code">' + esc(tm.lgCode) + ' · ' + blazon(d) + '</span>'
      + '<span>' + esc(d.semanticKey) + ' → '
      + (d.usedFallback ? '<i class="warn">' + t('fb') + '</i>' : esc(nm(SEM_INDEX[d.semanticKey])))
      + ' · ' + esc(nm(d.emblem)) + '</span>'
      + '<span>' + esc(nm(d.frame)) + ' / ' + esc(nm(d.pattern)) + '</span>'
      + '<span class="sw"><i style="background:' + d.primary + '"></i>' + d.primary
      + ' <i style="background:' + d.secondary + '"></i>' + d.secondary + '</span>'
      + '</figcaption></figure>';
  }).join('');
  return '<section id="s2"><h2>' + t('s2') + '</h2><div class="grid g5">' + cells + '</div></section>';
}

/* 1. turun algoritması: amblem tamamen hash, renk laboratuvar paletinden.
 * Karşılaştırma dürüst olsun diye AYNI takımlara uygulanıyor. */
function legacyDescriptor(team) {
  const seed = team.n;
  const pal = PALETTES[pick(seed, 'palette', PALETTES.length)];
  return {
    frame: FRAMES[pick(seed, 'frame', FRAMES.length)],
    pattern: PATTERNS[pick(seed, 'pattern', PATTERNS.length)],
    emblem: EMBLEMS[pick(seed, 'emblem', EMBLEMS.length)],
    primary: pal.primary, secondary: pal.secondary, accent: pal.accent, ink: pal.ink,
    semanticKey: '—', semanticCategory: null, usedFallback: true, salt: 0, key: seed,
  };
}

function section3(picks, D) {
  const rows = picks.map(tm => {
    const a = legacyDescriptor(tm), b = D.get(canonicalKey(tm));
    return '<tr><th scope="row">' + esc(tm.n) + '<span class="code">' + esc(tm.lgCode) + '</span></th>'
      + '<td><div class="sz">' + badgeSVG(a, 64, { label: tm.n }) + '<i>' + blazon2(a) + '</i></div></td>'
      + '<td><div class="sz">' + badgeSVG(b, 64, { label: tm.n }) + '<i>' + blazon(b) + '</i></div></td></tr>';
  }).join('');
  return '<section id="s3"><h2>' + t('s3') + '</h2><div class="scroll">'
    + '<table class="scale"><thead><tr><th></th><th>' + t('before') + '</th><th>' + t('after') + '</th></tr></thead>'
    + '<tbody>' + rows + '</tbody></table></div></section>';
}
function blazon2(d) {
  const ab = s => s.replace(/-/g, '').slice(0, 4).toUpperCase();
  return ab(d.frame.id) + ' · ' + ab(d.pattern.id) + ' · ' + ab(d.emblem.id);
}

function section4(picks, D) {
  const rows = picks.map(tm => {
    const d = D.get(canonicalKey(tm));
    return '<tr><th scope="row">' + esc(tm.n) + '<span class="code">'
      + esc(d.usedFallback ? t('fb') : d.semanticCategory) + ' · ' + esc(d.emblem.id) + '</span></th>'
      + SIZES.map(px => '<td><div class="sz">' + badgeSVG(d, px, { label: tm.n }) + '<i>' + px + '</i></div></td>').join('')
      + '</tr>';
  }).join('');
  return '<section id="s4"><h2>' + t('s4') + '</h2><div class="scroll">'
    + '<table class="scale"><thead><tr><th></th>' + SIZES.map(s => '<th>' + s + 'px</th>').join('')
    + '</tr></thead><tbody>' + rows + '</tbody></table></div></section>';
}

function section5(rows, D) {
  const body = LEAGUE_ROWS.map((r, i) => {
    const tm = rows[i], d = D.get(canonicalKey(tm));
    return '<tr><td class="rk">' + (i + 1) + '</td>'
      + '<td class="bd">' + badgeSVG(d, 26, { label: tm.n }) + '</td>'
      + '<td class="tm">' + esc(tm.n) + '</td>'
      + '<td>' + r.pl + '</td><td>' + (r.gd > 0 ? '+' : '') + r.gd + '</td><td class="pt">' + r.pts + '</td></tr>';
  }).join('');
  return '<section id="s5"><h2>' + t('s5') + '</h2>'
    + '<div class="ground dark tablewrap"><table class="league"><thead><tr>'
    + '<th></th><th></th><th>' + t('team') + '</th><th>' + t('hp') + '</th><th>' + t('hgd') + '</th><th>' + t('hpt') + '</th>'
    + '</tr></thead><tbody>' + body + '</tbody></table></div></section>';
}

/* Nano testi: 18px'te en çok zorlanan amblemler ve baklava çerçeve yan yana.
 * Solda 18px (gerçek boyut), sağda aynı armanın 64px'i referans olsun diye. */
const NANO_WATCH = ['anchor', 'oak', 'torch-spear', 'lighthouse', 'compass',
  'industrial-cog', 'sailor-knot', 'stone-bridge', 'mill-wheel'];

function section6(all, D) {
  const items = [];
  NANO_WATCH.forEach(eid => {
    const tm = firstWithEmblem(all, D, eid);
    if (tm) items.push({ tm, tag: eid });
  });
  const dia = all.find(x => { const d = D.get(canonicalKey(x)); return d && d.frame.id === 'diamond'; });
  if (dia) items.push({ tm: dia, tag: 'diamond frame' });

  const cells = items.map(it => {
    const d = D.get(canonicalKey(it.tm));
    return '<figure class="cell nano"><div class="cell-art nanoart">'
      + '<span class="on-d">' + badgeSVG(d, 18, { label: it.tm.n }) + '</span>'
      + '<span class="on-l">' + badgeSVG(d, 18, { label: it.tm.n }) + '</span>'
      + badgeSVG(d, 26, { label: it.tm.n }) + badgeSVG(d, 64, { label: it.tm.n })
      + '</div><figcaption><b>' + esc(it.tag) + '</b><span>' + esc(it.tm.n) + '</span></figcaption></figure>';
  }).join('');
  return '<section id="s6"><h2>' + t('s6') + '</h2><div class="grid g4">' + cells + '</div></section>';
}

/* --------------------------------------------------------------- ölçüm */
function selfTest(all, show, D, leagues) {
  const out = [];
  const add = (label, ok, detail) => out.push({ label, ok, detail });

  add('24/24 amblem geçerli path',
    EMBLEMS.length === 24 && EMBLEMS.every(e => /^M[-\d.]/.test(e.d) && /Z$/.test(e.d)
      && /^M[-\d.]/.test(e.dm) && /Z$/.test(e.dm)),
    EMBLEMS.length + ' amblem · ' + EMBLEMS.reduce((s, e) => s + e.pts, 0) + ' nokta · mikro '
    + EMBLEMS.reduce((s, e) => s + e.mpts, 0));

  const raster = EMBLEMS.filter(e => /<image|data:|href/i.test(e.d + e.dm));
  add('24/24 amblemde raster yok', raster.length === 0, 'yalnız M/L/Z komutları');

  const glyph = EMBLEMS.filter(e => /[A-Za-z]/.test(e.d.replace(/[MLZ]/g, '')));
  add('pusulada harf/metin path\'i yok',
    glyph.length === 0 && EMB_BY_ID.compass.sub === 6,
    'pusula ' + EMB_BY_ID.compass.sub + ' alt yol: halka + 4 ana ok + 4 ara ışın + merkez');

  add('10/10 çerçeve kapalı clip alanı',
    FRAMES.length === 10 && FRAMES.every(f => /Z$/.test(f.d()) && document.getElementById('bclip-' + f.id)),
    FRAMES.reduce((s, f) => s + f.d().length, 0) + ' karakter path');

  const drawn = document.querySelectorAll('#s2 .bdg').length;
  add('30/30 gerçek takım çiziliyor', drawn === 30,
    drawn + ' SVG · ' + new Set(show.map(x => x.lg)).size + ' farklı lig');

  const r1 = show.map(x => JSON.stringify(strip(badgeDescriptor(x))));
  const r2 = show.map(x => JSON.stringify(strip(badgeDescriptor(x))));
  add('30 takımın descriptor\'ı iki render\'da aynı',
    r1.every((v, i) => v === r2[i]), 'iki bağımsız çağrı karşılaştırıldı');

  /* Dil değişimi: adlar çevrilmediği için anahtar da değişmemeli. LANG'ı geçici
     olarak çevirip aynı takımlara bakıyoruz. */
  const keep = LANG;
  LANG = LANG === 'tr' ? 'en' : 'tr';
  const rl = show.map(x => JSON.stringify(strip(badgeDescriptor(x))));
  LANG = keep;
  add('TR/EN geçişinde descriptor aynı', rl.every((v, i) => v === r1[i]),
    'takım adı hiçbir dilde çevrilmiyor, anahtar ad+kısaltma');

  const shuffled = [...show].reverse();
  const rs = new Map(shuffled.map(x => [canonicalKey(x), JSON.stringify(strip(badgeDescriptor(x)))]));
  add('takım sıralaması değişince descriptor aynı',
    show.every((x, i) => rs.get(canonicalKey(x)) === r1[i]), 'liste ters çevrilip karşılaştırıldı');

  let clash = 0, resalt = 0, shapeClash = 0;
  leagues.forEach(list => {
    const seen = new Set(), shapes = new Set();
    list.forEach(tm => {
      const d = D.get(canonicalKey(tm));
      if (seen.has(d.combo)) clash++;
      seen.add(d.combo);
      if (shapes.has(d.shape)) shapeClash++;
      shapes.add(d.shape);
      if (d.salt > 0) resalt++;
    });
  });
  add('aynı ligde tam kombinasyon çakışması yok', clash === 0,
    all.length + ' takım · yeniden tuzlanan ' + resalt + ' · yalnız biçim çakışan (renk ayırıyor) ' + shapeClash);

  const mismatch = all.filter(tm => {
    const d = badgeDescriptor(tm);
    return d.primary !== tm.c1 || d.secondary !== tm.c2;
  });
  add('gerçek takım renkleri tmBadge() ile aynı alanlardan', mismatch.length === 0,
    'primary=tm.c1, secondary=tm.c2 · ' + all.length + ' takımda doğrulandı');

  const semTeams = all.filter(tm => SEM_INDEX[identityToken(tm.n)]);
  const semBad = semTeams.filter(tm => badgeDescriptor(tm).usedFallback);
  add('semantik eşleşmesi olan takım yedek kullanmıyor', semBad.length === 0,
    semTeams.length + '/' + all.length + ' takım semantik eşleşti (%'
    + (100 * semTeams.length / all.length).toFixed(1) + ')');

  const noSem = all.filter(tm => !SEM_INDEX[identityToken(tm.n)]);
  const fbOK = noSem.every(tm => {
    const d = badgeDescriptor(tm);
    return d.usedFallback && EMB_BY_ID[d.emblem.id];
  });
  add('eşleşmeyen takım güvenli yedek kullanıyor', fbOK,
    noSem.length + ' takım · kelimeler: ' + [...new Set(noSem.map(x => identityToken(x.n)))].join(', '));

  /* 18px'te amblemin çizilen genişlik/yüksekliği. fit kutusu birim cinsinden,
     18px'e oranlanıyor. */
  /* Ölçüt amblemin UZUN kenarı. Kısa kenarı zorlamak, oranı kareden uzak bir
     amblemi (taş köprü 1.9, şimşek 0.57) esnetmeyi gerektirirdi ve oran bozmak
     yasak; kısa kenar dağılımı ayrıca raporlanıyor. Bütün 10x24 = 240 çift
     ölçülüyor, yalnız sahnedekiler değil. */
  let minLong = 99, longWho = '', minShort = 99, shortWho = '';
  FRAMES.forEach(f => EMBLEMS.forEach(e => {
    const tr = emblemTransform(f, e, true);
    const w = (e.bb[2] - e.bb[0]) * tr.s * 18 / 64;
    const h = (e.bb[3] - e.bb[1]) * tr.s * 18 / 64;
    if (Math.max(w, h) < minLong) { minLong = Math.max(w, h); longWho = f.id + '/' + e.id; }
    if (Math.min(w, h) < minShort) { minShort = Math.min(w, h); shortWho = f.id + '/' + e.id; }
  }));
  add('18px\'te hiçbir amblem kaybolmuyor', minLong >= 6,
    '240 çiftin en kısa uzun-kenarı ' + minLong.toFixed(2) + 'px (' + longWho
    + ') · en dar kısa-kenar ' + minShort.toFixed(2) + 'px (' + shortWho + ')');

  const overflow = EMBLEMS.filter(e => e.bb[0] < 0 || e.bb[1] < 0 || e.bb[2] > 64 || e.bb[3] > 64);
  add('viewBox taşması ve kırpma yok', overflow.length === 0
    && [...document.querySelectorAll('.bdg')].every(s => s.getAttribute('viewBox') === '0 0 64 64'),
    document.querySelectorAll('.bdg').length + ' SVG · en dar pay '
    + Math.min(...EMBLEMS.map(e => Math.min(e.bb[0], e.bb[1], 64 - e.bb[2], 64 - e.bb[3]))).toFixed(2) + ' birim');

  add('yatay taşma yok', document.documentElement.scrollWidth <= window.innerWidth + 1,
    document.documentElement.scrollWidth + 'px / ' + window.innerWidth + 'px');

  add('Math.random yok',
    !/Math\s*\.\s*random/.test([badgeDescriptor, badgeSVG, pick, resolveLeague, teamColors].map(f => f.toString()).join('')),
    'descriptor, çizim ve çakışma çözümü saf');

  const html = document.body.innerHTML;
  add('raster/data: URI/harici yol yok',
    !/<image[\s>]/i.test(html) && !/data:/i.test(html)
    && !/(https?:)?\/\//i.test(html.replace(/xmlns[^"]*"[^"]*"/g, '')), '');

  /* ---- kapsam tablosu */
  const words = new Map();
  all.forEach(tm => {
    const w = identityToken(tm.n);
    if (!words.has(w)) words.set(w, 0);
    words.set(w, words.get(w) + 1);
  });
  const total = words.size;
  const matched = [...words.keys()].filter(w => SEM_INDEX[w]);
  const missing = [...words.entries()].filter(([w]) => !SEM_INDEX[w]);
  const pct = (100 * matched.length / total).toFixed(1);

  const rows = out.map(r => '<tr class="' + (r.ok ? 'ok' : 'no') + '"><td>' + (r.ok ? '✓' : '✕')
    + '</td><td>' + esc(r.label) + '</td><td>' + (r.ok ? t('pass') : t('fail')) + '</td><td>'
    + esc(r.detail) + '</td></tr>').join('');

  const catRows = SEMANTIC.map(c => {
    const teams = all.filter(tm => SEM_INDEX[identityToken(tm.n)] === c);
    return '<tr><td>' + esc(nm(c)) + '</td><td>' + c.words.length + '</td><td>' + teams.length
      + '</td><td>' + c.emblems.join(', ') + '</td></tr>';
  }).join('')
    + '<tr class="no"><td>— (yedek)</td><td>' + missing.length + '</td><td>'
    + missing.reduce((s, m) => s + m[1], 0) + '</td><td>24 amblemlik havuzdan hash</td></tr>';

  return '<section id="s7"><h2>' + t('s7') + '</h2>'
    + '<p class="lead">Semantik kapsama: <b>' + matched.length + ' / ' + total
    + '</b> kimlik kelimesi = <b>%' + pct + '</b>. Kapsanmayan: '
    + (missing.length ? missing.map(m => esc(m[0]) + ' (' + m[1] + ')').join(', ') : 'yok') + '.</p>'
    + '<div class="scroll"><table class="report"><tbody>' + rows + '</tbody></table></div>'
    + '<h3>Kategori dağılımı</h3><div class="scroll"><table class="report">'
    + '<thead><tr><th>kategori</th><th>kelime</th><th>takım</th><th>amblemler</th></tr></thead>'
    + '<tbody>' + catRows + '</tbody></table></div></section>';
}

/* Karşılaştırmada nesne kimliği değil içerik önemli. */
function strip(d) {
  return [d.frame.id, d.pattern.id, d.emblem.id, d.primary, d.secondary, d.accent, d.ink,
    d.semanticKey, d.semanticCategory, d.usedFallback];
}

/* ---------------------------------------------------------------- boot */
function render() {
  const all = labTeams();
  const leagues = [];
  TEAMS.forEach((_, lg) => leagues.push(all.filter(t => t.lg === lg)));
  const D = new Map();
  leagues.forEach(list => resolveLeague(list).forEach((v, k) => D.set(k, v)));

  const show = showcase(all);
  const scalePicks = pickByCategory(all,
    ['maritime', 'industry', 'craft', 'agriculture', 'geography', 'sky',
      'defence', 'civic', 'navigation', 'heraldry', 'wildlife', 'light'], 12);
  const tablePicks = leagues[1].slice(0, 10);

  document.getElementById('defs').innerHTML = clipDefs();
  document.getElementById('view').innerHTML =
    section1() + section2(show, D) + section3(scalePicks, D) + section4(scalePicks, D)
    + section5(tablePicks, D) + section6(all, D);
  document.getElementById('view').insertAdjacentHTML('beforeend', selfTest(all, show, D, leagues));
  document.getElementById('lang').textContent = LANG === 'tr' ? 'EN' : 'TR';
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('lang').addEventListener('click', () => {
    LANG = LANG === 'tr' ? 'en' : 'tr';
    document.documentElement.lang = LANG;
    render();
  });
  render();
});
