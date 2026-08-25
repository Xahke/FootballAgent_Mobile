/* Arma laboratuvarı — SADECE geliştirici aracı, oyuna dahil değil.
 *
 * Artık kendi geometri kopyası YOK: sayfa js/badges.js'i doğrudan yüklüyor ve
 * bu dosya yalnız onu ekrana döküyor. Yani laboratuvarda gördüğün arma ile
 * oyunda çizilen arma aynı fonksiyonun çıktısı; senkronu bozacak ikinci bir
 * tanım olmadığı için "eşitlik testi" de yapısal olarak garanti. Ölçüm bölümü
 * bu iddiayı yine de açıkça denetliyor.
 *
 * js/data.js ve js/badges.js OKUNUYOR, değiştirilmiyor.
 */

let LANG = 'tr';
const T = {
  tr: {
    s1: '1 · Toplam bileşen havuzu', s2: '2 · Gerçek takım eşlemesi',
    s3: '3 · Önce / sonra', s4: '4 · Ölçek testi', s5: '5 · Lig tablosu',
    s6: '6 · Nano testi', s7: '7 · Ölçüm',
    emb: 'Amblemler', frm: 'Çerçeveler', pat: 'Desenler', sem: 'Semantik aileler',
    exact: 'Birebir eşleşmeler',
    before: 'önce · saf hash + laboratuvar paleti', after: 'sonra · semantik + gerçek renk',
    hp: 'O', hgd: 'Av', hpt: 'P', team: 'Takım',
    pass: 'geçti', fail: 'KALDI', fb: 'yedek', ex: 'birebir', call: 'Gerçek çağrı boyutları',
  },
  en: {
    s1: '1 · Full component pool', s2: '2 · Real team mapping',
    s3: '3 · Before / after', s4: '4 · Scale test', s5: '5 · League table',
    s6: '6 · Nano test', s7: '7 · Measurement',
    emb: 'Emblems', frm: 'Frames', pat: 'Patterns', sem: 'Semantic families',
    exact: 'Exact matches',
    before: 'before · pure hash + lab palette', after: 'after · semantic + real colours',
    hp: 'P', hgd: 'GD', hpt: 'Pts', team: 'Team',
    pass: 'pass', fail: 'FAIL', fb: 'fallback', ex: 'exact', call: 'Real call sizes',
  },
};
const t = k => T[LANG][k];
const nm = o => (o && o.name ? o.name[LANG] : '—');
const lesc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const SIZES = [64, 34, 26, 18];
/* Oyunda gerçekten geçen boyutlar (js/ui.js + js/actions.js taraması). */
const CALL_SIZES = [16, 18, 20, 22, 24, 26, 30, 32, 34, 36, 42, 44, 46, 48, 62];

/* Oyunun TEAMS'ini newGame() ile aynı şekilde düzleştirir. */
function labTeams() {
  const out = [];
  TEAMS.forEach((lgTeams, lg) => lgTeams.forEach(function (r) {
    out.push({ id: out.length, n: r[0], ab: r[1], c1: r[2], c2: r[3], str: r[4], lg: lg, lgCode: LEAGUES[lg].c });
  }));
  return out;
}

/* Katmanları tek satırda okunur kılan kısa kod. */
function blazon(d) {
  const ab = s => String(s || '').replace(/-/g, '').slice(0, 4).toUpperCase();
  return ab(d.frame.id) + ' · ' + ab(d.pattern.id) + ' · ' + ab(d.emblem.id)
    + (d.usedFallback ? ' · HASH' : ' · ' + ab(d.semanticCategory));
}

const WANTED = ['Manchester Ironworks', 'Merseyside Summit', 'Leeds Aqueduct', 'Hamburg Harbour',
  'Córdoba Foundry', 'Monterrey Lighthouse', 'Sapporo Cliffs'];

function showcase(all) {
  const out = [], seen = new Set();
  WANTED.forEach(n => { const x = all.find(v => v.n === n); if (x) { out.push(x); seen.add(x.id); } });
  const byLg = {};
  all.forEach(x => { (byLg[x.lg] = byLg[x.lg] || []).push(x); });
  const lgs = Object.keys(byLg).map(Number).sort((a, b) => a - b);
  for (let round = 0; out.length < 30 && round < 40; round++) {
    for (const lg of lgs) {
      if (out.length >= 30) break;
      const pool = byLg[lg], x = pool[(round * 7 + lg * 3) % pool.length];
      if (!seen.has(x.id)) { out.push(x); seen.add(x.id); }
    }
  }
  return out.slice(0, 30);
}

function pickByCategory(all, cats, n) {
  const out = [], seen = new Set();
  cats.forEach(cid => {
    const x = all.find(v => !seen.has(v.id) && badgeDescriptor(v).semanticCategory === cid);
    if (x) { out.push(x); seen.add(x.id); }
  });
  for (let i = 0; out.length < n && i < all.length; i++) {
    if (!seen.has(all[i].id)) { out.push(all[i]); seen.add(all[i].id); }
  }
  return out.slice(0, n);
}
function firstWithEmblem(all, eid) {
  return all.find(x => badgeDescriptor(x).emblem.id === eid);
}

/* --------------------------------------------------------------- bölümler */
function section1() {
  const cell = (label, art, meta) =>
    '<figure class="cell"><div class="cell-art">' + art + '</div>'
    + '<figcaption><b>' + lesc(label) + '</b>' + (meta ? '<span>' + lesc(meta) + '</span>' : '') + '</figcaption></figure>';

  const embs = EMBLEMS.map(e => cell(nm(e),
    '<svg width="50" height="50" viewBox="0 0 64 64" role="img" aria-label="' + lesc(nm(e)) + '">'
    + '<path d="' + e.d + '" fill-rule="evenodd" fill="var(--spec)"/></svg>',
    e.cell + ' · ' + e.pts + 'n/' + e.sub + ' · m' + e.mpts)).join('');

  const frms = FRAMES.map(f => cell(nm(f),
    '<svg width="50" height="50" viewBox="0 0 64 64" role="img" aria-label="' + lesc(nm(f)) + '">'
    + '<path d="' + f.d() + '" fill="none" stroke="var(--spec)" stroke-width="2"/></svg>',
    'kare fit ' + f.fitA[3][0] + '×' + f.fitA[3][1] + ' · nano ' + f.fitAS[3][0] + '×' + f.fitAS[3][1])).join('');

  const demo = { primary: '#8d949c', secondary: '#33383e' };
  const pats = PATTERNS.map(p => cell(nm(p),
    '<svg width="50" height="50" viewBox="0 0 64 64" role="img" aria-label="' + lesc(nm(p)) + '">'
    + p.f(demo).join('') + '</svg>', 'nano → ' + p.nano)).join('');

  const sems = SEMANTIC.map(c =>
    '<figure class="cell sem"><figcaption><b>' + lesc(nm(c)) + '</b>'
    + '<span class="code">' + c.emblems.join(' · ') + '</span>'
    + '<span>' + c.words.join(', ') + '</span></figcaption></figure>').join('');

  const exRows = Object.keys(SEM_EXACT).sort().map(k =>
    '<span class="exk">' + lesc(k) + ' <b>→</b> ' + lesc([].concat(SEM_EXACT[k]).join(' / ')) + '</span>').join('');

  return '<section id="s1"><h2>' + t('s1') + '</h2>'
    + '<h3>' + t('emb') + ' <em>' + EMBLEMS.length + '</em></h3><div class="grid g6">' + embs + '</div>'
    + '<h3>' + t('frm') + ' <em>' + FRAMES.length + '</em></h3><div class="grid g6">' + frms + '</div>'
    + '<h3>' + t('pat') + ' <em>' + PATTERNS.length + '</em></h3><div class="grid g6">' + pats + '</div>'
    + '<h3>' + t('sem') + ' <em>' + SEMANTIC.length + '</em></h3><div class="grid g3">' + sems + '</div>'
    + '<h3>' + t('exact') + ' <em>' + Object.keys(SEM_EXACT).length + '</em></h3>'
    + '<div class="exact">' + exRows + '</div></section>';
}

function section2(show) {
  const cells = show.map(tm => {
    const d = badgeDescriptor(tm);
    return '<figure class="cell spec"><div class="cell-art">' + badgeSVG(d, 64) + '</div>'
      + '<figcaption><b>' + lesc(tm.n) + '</b>'
      + '<span class="code">' + lesc(tm.lgCode) + ' · ' + blazon(d) + '</span>'
      + '<span>' + lesc(d.semanticKey) + ' → ' + lesc(nm(d.emblem))
      + (d.usedFallback ? ' <i class="warn">' + t('fb') + '</i>'
        : (d.semanticExact ? ' <i class="good">' + t('ex') + '</i>' : ''))
      + '</span>'
      + '<span>' + lesc(nm(d.frame)) + ' / ' + lesc(nm(d.pattern)) + '</span>'
      + '<span class="sw"><i style="background:' + d.primary + '"></i>' + d.primary
      + ' <i style="background:' + d.secondary + '"></i>' + d.secondary + '</span>'
      + '</figcaption></figure>';
  }).join('');
  return '<section id="s2"><h2>' + t('s2') + '</h2><div class="grid g5">' + cells + '</div></section>';
}

function section3(picks) {
  const rows = picks.map(tm => {
    const a = legacyDescriptor(tm), b = badgeDescriptor(tm);
    return '<tr><th scope="row">' + lesc(tm.n) + '<span class="code">' + lesc(tm.lgCode) + '</span></th>'
      + '<td><div class="sz">' + badgeSVG(a, 64) + '<i>' + blazon(a) + '</i></div></td>'
      + '<td><div class="sz">' + badgeSVG(b, 64) + '<i>' + blazon(b) + '</i></div></td></tr>';
  }).join('');
  return '<section id="s3"><h2>' + t('s3') + '</h2><div class="scroll">'
    + '<table class="scale"><thead><tr><th></th><th>' + t('before') + '</th><th>' + t('after') + '</th></tr></thead>'
    + '<tbody>' + rows + '</tbody></table></div></section>';
}

function section4(picks) {
  const rows = picks.map(tm => {
    const d = badgeDescriptor(tm);
    return '<tr><th scope="row">' + lesc(tm.n) + '<span class="code">'
      + lesc(d.usedFallback ? t('fb') : d.semanticCategory) + ' · ' + lesc(d.emblem.id) + '</span></th>'
      + SIZES.map(px => '<td><div class="sz">' + badgeSVG(d, px) + '<i>' + px + '</i></div></td>').join('')
      + '</tr>';
  }).join('');
  return '<section id="s4"><h2>' + t('s4') + '</h2><div class="scroll">'
    + '<table class="scale"><thead><tr><th></th>' + SIZES.map(s => '<th>' + s + 'px</th>').join('')
    + '</tr></thead><tbody>' + rows + '</tbody></table></div></section>';
}

function section5(rows) {
  const body = LEAGUE_ROWS.map((r, i) => {
    const tm = rows[i], d = badgeDescriptor(tm);
    return '<tr><td class="rk">' + (i + 1) + '</td>'
      + '<td class="bd">' + badgeSVG(d, 26) + '</td>'
      + '<td class="tm">' + lesc(tm.n) + '</td>'
      + '<td>' + r.pl + '</td><td>' + (r.gd > 0 ? '+' : '') + r.gd + '</td><td class="pt">' + r.pts + '</td></tr>';
  }).join('');
  return '<section id="s5"><h2>' + t('s5') + '</h2>'
    + '<div class="ground dark tablewrap"><table class="league"><thead><tr>'
    + '<th></th><th></th><th>' + t('team') + '</th><th>' + t('hp') + '</th><th>' + t('hgd') + '</th><th>' + t('hpt') + '</th>'
    + '</tr></thead><tbody>' + body + '</tbody></table></div></section>';
}

/* 16–24px'te en çok zorlanan amblemler; nano politikası burada sınanıyor. */
const NANO_WATCH = ['anchor', 'oak', 'torch-spear', 'lighthouse', 'compass',
  'industrial-cog', 'sailor-knot', 'stone-bridge', 'mill-wheel', 'ocean-wave'];

function section6(all) {
  const items = NANO_WATCH.map(eid => ({ tm: firstWithEmblem(all, eid), tag: eid })).filter(x => x.tm);
  const dia = all.find(x => badgeDescriptor(x).frame.id === 'diamond');
  if (dia) items.push({ tm: dia, tag: 'diamond → ' + DIAMOND_ALT });
  const cells = items.map(it => {
    const d = badgeDescriptor(it.tm);
    return '<figure class="cell nano"><div class="cell-art nanoart">'
      + '<span class="on-d">' + badgeSVG(d, 18) + '</span>'
      + '<span class="on-l">' + badgeSVG(d, 18) + '</span>'
      + badgeSVG(d, 24) + badgeSVG(d, 26) + badgeSVG(d, 64)
      + '</div><figcaption><b>' + lesc(it.tag) + '</b><span>' + lesc(it.tm.n) + '</span></figcaption></figure>';
  }).join('');
  return '<section id="s6"><h2>' + t('s6') + '</h2><div class="grid g4">' + cells + '</div></section>';
}

/* --------------------------------------------------------------- ölçüm */
function strip(d) {
  return [d.frame.id, d.pattern.id, d.emblem.id, d.primary, d.secondary, d.ink,
    d.accent, d.embEdge, d.semanticKey, d.semanticCategory, d.usedFallback, d.salt];
}

function selfTest(all, show) {
  const out = [];
  const add = (label, ok, detail) => out.push({ label: label, ok: ok, detail: detail });

  add(EMBLEMS.length + '/' + EMBLEMS.length + ' amblem geçerli path',
    EMBLEMS.length === 24 && EMBLEMS.every(e => /^M[-\d.]/.test(e.d) && /Z$/.test(e.d) && /Z$/.test(e.dm)),
    EMBLEMS.reduce((s, e) => s + e.pts, 0) + ' nokta · mikro ' + EMBLEMS.reduce((s, e) => s + e.mpts, 0));

  add('pusulada harf/metin path\'i yok',
    !EMBLEMS.some(e => /[A-Za-z]/.test((e.d + e.dm).replace(/[MLZ]/g, ''))),
    'pusula ' + EMB_BY_ID.compass.sub + ' alt yol: halka + 4 ana ok + 4 ara ışın + merkez');

  add(FRAMES.length + '/' + FRAMES.length + ' çerçeve kapalı clip alanı',
    FRAMES.every(f => /Z$/.test(f.d()) && document.getElementById('bcl-' + f.id)),
    'clip tanımları sayfada tek kez');

  /* Laboratuvar ile çalışma zamanı AYNI fonksiyonu çağırıyor. window[k] ile
     bakılamaz: klasik bir script'te const/let bildirimleri window'a düşmez,
     o yüzden isimler doğrudan yoklanıyor. Ayrıca badgeSVG'nin gerçekten
     js/badges.js'ten geldiği, ürettiği işaretlerden doğrulanıyor. */
  const names = { badgeDescriptor: typeof badgeDescriptor, badgeSVG: typeof badgeSVG,
    badgeTransform: typeof badgeTransform, badgeToken: typeof badgeToken,
    EMBLEMS: typeof EMBLEMS, FRAMES: typeof FRAMES, SEM_EXACT: typeof SEM_EXACT };
  const missing = Object.keys(names).filter(k => names[k] === 'undefined');
  const probe = badgeSVG(badgeDescriptor(all[0]), 34);
  add('laboratuvar üretim motorunu kullanıyor',
    missing.length === 0 && probe.indexOf('class="tbSvg"') >= 0
    && probe.indexOf('url(#bcl-') >= 0 && probe.indexOf('href="#bfr-') >= 0,
    'js/badges.js yüklendi, ikinci kopya yok');

  const r1 = show.map(x => JSON.stringify(strip(badgeDescriptor(x))));
  const keep = LANG; LANG = LANG === 'tr' ? 'en' : 'tr';
  const r2 = show.map(x => JSON.stringify(strip(badgeDescriptor(x))));
  LANG = keep;
  add('TR/EN geçişinde descriptor aynı', r1.every((v, i) => v === r2[i]));

  const rev = [].concat(show).reverse();
  const rmap = new Map(rev.map(x => [badgeKey(x), JSON.stringify(strip(badgeDescriptor(x)))]));
  add('sıra değişince descriptor aynı', show.every((x, i) => rmap.get(badgeKey(x)) === r1[i]));

  const releg = show.map(x => JSON.stringify(strip(badgeDescriptor(
    Object.assign({}, x, { lg: (x.lg + 5) % LEAGUES.length, id: x.id + 999 })))));
  add('lig değişince descriptor aynı', releg.every((v, i) => v === r1[i]), 'tohumda lg/id/sıra yok');

  let clash = 0;
  LEAGUES.forEach((_, lg) => {
    const seen = new Set();
    all.filter(x => x.lg === lg).forEach(x => {
      const c = badgeDescriptor(x).combo;
      if (seen.has(c)) clash++;
      seen.add(c);
    });
  });
  add('aynı ligde tam kombinasyon çakışması yok', clash === 0,
    all.length + ' takım · yeniden tuzlanan ' + all.filter(x => badgeDescriptor(x).salt > 0).length);

  add('renkler takımın c1/c2 alanından',
    all.every(x => { const d = badgeDescriptor(x); return d.primary === x.c1 && d.secondary === x.c2; }),
    all.length + ' takımda doğrulandı');

  const exBad = all.filter(x => {
    const w = SEM_EXACT[badgeToken(x.n)];
    return w && [].concat(w).indexOf(badgeDescriptor(x).emblem.id) < 0;
  });
  add('birebir anahtarlar doğru ambleme gidiyor', exBad.length === 0,
    all.filter(x => SEM_EXACT[badgeToken(x.n)]).length + ' takım birebir eşleşti');

  const fbTeams = all.filter(x => badgeDescriptor(x).usedFallback);
  add('eşleşmeyen takım güvenli yedek kullanıyor',
    fbTeams.every(x => badgeDescriptor(x).emblem && badgeDescriptor(x).emblem.d),
    fbTeams.length + ' takım · ' + [...new Set(fbTeams.map(x => badgeToken(x.n)))].join(', '));

  const dias = all.filter(x => badgeDescriptor(x).frame.id === 'diamond');
  add('baklava ' + DIAMOND_MIN + 'px altında çizilmiyor',
    dias.every(x => badgeSVG(badgeDescriptor(x), 18).indexOf('bcl-diamond') < 0
      && badgeSVG(badgeDescriptor(x), 26).indexOf('bcl-diamond') >= 0),
    dias.length + ' baklava takımı · yerine ' + DIAMOND_ALT);

  let worst = { v: 99, who: '', px: 0 };
  [16, 18, 20, 22, 24].forEach(px => FRAMES.forEach(f => {
    if (f.id === 'diamond' && px < DIAMOND_MIN) return;
    NANO_WATCH.forEach(eid => {
      const e = EMB_BY_ID[eid], tr = badgeTransform(f, e, px <= NANO_AT);
      const w = (e.bb[2] - e.bb[0]) * tr.s * px / 64, h = (e.bb[3] - e.bb[1]) * tr.s * px / 64;
      if (Math.max(w, h) < worst.v) worst = { v: Math.max(w, h), who: f.id + '/' + eid, px: px };
    });
  }));
  add('16–24px izlenen amblemler kaybolmuyor', worst.v >= 5,
    'en kısa uzun-kenar ' + worst.v.toFixed(2) + 'px @' + worst.px + ' (' + worst.who + ')');

  const badges = [].slice.call(document.querySelectorAll('.tbSvg'));
  add('SVG viewBox ve boyut doğru',
    badges.every(s => s.getAttribute('viewBox') === '0 0 64 64'
      && s.getAttribute('width') === s.getAttribute('height')),
    badges.length + ' SVG denetlendi');

  const ids = [].slice.call(document.querySelectorAll('[id^="bcl-"],[id^="bfr-"],[id^="bem"]')).map(e => e.id);
  add('yinelenen SVG id yok', new Set(ids).size === ids.length,
    ids.length + ' tanım · hepsi #bdgDefs içinde tek kez');

  add('yatay taşma yok', document.documentElement.scrollWidth <= window.innerWidth + 1,
    document.documentElement.scrollWidth + 'px / ' + window.innerWidth + 'px');

  const html = document.body.innerHTML;
  add('raster/data: URI/harici yol yok',
    !/<image[\s>]/i.test(html) && !/data:/i.test(html)
    && !/(https?:)?\/\//i.test(html.replace(/xmlns[^"]*"[^"]*"/g, '')));

  const words = new Map();
  all.forEach(x => { const w = badgeToken(x.n); words.set(w, (words.get(w) || 0) + 1); });
  const miss = [].slice.call(words.entries ? [...words.entries()] : []).filter(m => !SEM_EXACT[m[0]] && !SEM_INDEX[m[0]]);
  const cov = (100 * (words.size - miss.length) / words.size).toFixed(1);

  const rows = out.map(r => '<tr class="' + (r.ok ? 'ok' : 'no') + '"><td>' + (r.ok ? '✓' : '✕')
    + '</td><td>' + lesc(r.label) + '</td><td>' + (r.ok ? t('pass') : t('fail')) + '</td><td>'
    + lesc(r.detail || '') + '</td></tr>').join('');

  const d0 = badgeDescriptor(all.find(x => x.n === 'Manchester Ironworks') || all[0]);
  const scale = CALL_SIZES.map(px =>
    '<div class="sz">' + badgeSVG(d0, px) + '<i>' + px + '</i></div>').join('');

  return '<section id="s7"><h2>' + t('s7') + '</h2>'
    + '<p class="lead">Semantik kapsama: <b>' + (words.size - miss.length) + ' / ' + words.size
    + '</b> kimlik kelimesi = <b>%' + cov + '</b>. Yedeğe düşen: '
    + (miss.length ? miss.map(m => lesc(m[0]) + ' (' + m[1] + ')').join(', ') : 'yok') + '.</p>'
    + '<div class="scroll"><table class="report"><tbody>' + rows + '</tbody></table></div>'
    + '<h3>' + t('call') + '</h3><div class="ground dark"><div class="row">' + scale + '</div></div>'
    + '</section>';
}

/* ---------------------------------------------------------------- boot */
function render() {
  const all = labTeams();
  const show = showcase(all);
  const picks = pickByCategory(all,
    ['maritime', 'industry', 'craft', 'agriculture', 'geography', 'sky',
      'defence', 'civic', 'navigation', 'heraldry', 'wildlife', 'light'], 12);
  const table = all.filter(x => x.lg === 1).slice(0, 10);

  document.getElementById('defs').innerHTML = badgeDefsHTML();
  document.getElementById('view').innerHTML =
    section1() + section2(show) + section3(picks) + section4(picks)
    + section5(table) + section6(all);
  document.getElementById('view').insertAdjacentHTML('beforeend', selfTest(all, show));
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
