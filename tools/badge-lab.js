/* Prosedürel takım arması prototipi — çizim ve ölçüm (SADECE geliştirici aracı).
 *
 * Oyun çalışma zamanına hiçbir bağı yok: tmBadge() dokunulmadı, js/ui.js
 * dokunulmadı, index.html'e script eklenmedi. Bu dosya yalnız badge-lab.html
 * tarafından yükleniyor.
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

/* Her katman AYRI tuzla hash'leniyor. Tek bir hash'in alt bitlerini dört yere
 * birden dağıtmak katmanları birbirine kilitler — çerçeve değiştiğinde palet de
 * değişir, o zaman da 30 örnekte gerçek çeşitlilik çıkmaz. */
function pick(seed, salt, n) {
  return hash32(seed + '|' + salt) % n;
}

/* Aynı dörtlü ikinci kez düşerse tuz turlanır. Deterministik açık adresleme:
 * Math.random yok, aynı liste her zaman aynı sonucu verir. */
function assign(seeds) {
  const used = new Set();
  return seeds.map(seed => {
    for (let a = 0; a < 64; a++) {
      const sfx = a === 0 ? '' : '#' + a;
      const d = {
        seed,
        frame: FRAMES[pick(seed, 'frame' + sfx, FRAMES.length)],
        palette: PALETTES[pick(seed, 'palette' + sfx, PALETTES.length)],
        pattern: PATTERNS[pick(seed, 'pattern' + sfx, PATTERNS.length)],
        emblem: EMBLEMS[pick(seed, 'emblem' + sfx, EMBLEMS.length)],
        salt: a,
      };
      const key = d.frame.id + '|' + d.palette.id + '|' + d.pattern.id + '|' + d.emblem.id;
      if (!used.has(key)) { used.add(key); d.key = key; return d; }
    }
    throw new Error('kombinasyon tükendi: ' + seed);
  });
}

/* ------------------------------------------------------------------ çizim */
/* 26px ve altında mikro amblem geometrisi kullanılıyor. Eşik burada, tek yerde:
 * ölçek testinin 34px sütunu tam geometriyi, 26 ve 18 mikroyu gösteriyor. */
const MICRO_AT = 26;

function emblemTransform(frame, emblem) {
  const bb = emblem.bb;
  const bw = bb[2] - bb[0], bh = bb[3] - bb[1];
  const s = Math.min(frame.fit[0] / bw, frame.fit[1] / bh);
  return {
    s,
    tx: 32 - s * (bb[0] + bb[2]) / 2,
    ty: frame.fit[2] - s * (bb[1] + bb[3]) / 2,
  };
}

/* Katmanlar: (1) çerçeve zemini = desen, (2) clip'lenmiş desen, (3) accent
 * keyline + ink dış sınır, (4) accent taban çubuğu — tek ve sınırlı vurgu,
 * (5) ortalanmış amblem. Sıra önemli: çubuk sınırlardan ÖNCE çiziliyor ki
 * sınır onu alan kenarında kessin. */
function badgeSVG(d, px) {
  const p = d.palette;
  const t = emblemTransform(d.frame, d.emblem);
  const path = px <= MICRO_AT ? d.emblem.dm : d.emblem.d;
  const dd = d.frame.d();
  return '<svg class="bdg" width="' + px + '" height="' + px + '" viewBox="0 0 64 64" '
    + 'role="img" aria-label="' + esc(d.seed) + '">'
    + '<g clip-path="url(#bclip-' + d.frame.id + ')">'
    + d.pattern.f(p).join('')
    + '<rect x="20" y="' + d.frame.bar + '" width="24" height="1.5" fill="' + p.accent + '"/>'
    + '<path d="' + dd + '" fill="none" stroke="' + p.accent + '" stroke-width="' + (EDGE_KEY * 2) + '" stroke-linejoin="round"/>'
    + '<path d="' + dd + '" fill="none" stroke="' + p.ink + '" stroke-width="' + (EDGE_INK * 2) + '" stroke-linejoin="round"/>'
    + '</g>'
    + '<g transform="translate(' + R2(t.tx) + ' ' + R2(t.ty) + ') scale(' + R2(t.s) + ')">'
    + '<path d="' + path + '" fill="' + p.accent + '" fill-rule="evenodd" '
    + 'stroke="' + p.ink + '" stroke-width="' + R2(EMB_EDGE / t.s) + '" '
    + 'stroke-linejoin="round" paint-order="stroke"/>'
    + '</g></svg>';
}

/* Çerçeve clip'leri sayfada TEK kez tanımlanıyor. Her armaya kopyalansaydı
 * aynı id defalarca tekrar ederdi; ayrıca badgeSVG çıktısı tohuma göre birebir
 * aynı kalsın diye artan sayaçlı id üretmek de yasak. */
function clipDefs() {
  return '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>'
    + FRAMES.map(f => '<clipPath id="bclip-' + f.id + '"><path d="' + f.d() + '"/></clipPath>').join('')
    + '</defs></svg>';
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* Dört katmanı tek satırda okunur kılan kısa kod — armanın "blazon"u.
 * Etiket yığını yerine bu, çünkü asıl soru "hangi dörtlü bu?" */
function blazon(d) {
  const ab = s => s.replace(/-/g, '').slice(0, 4).toUpperCase();
  return ab(d.frame.id) + ' · ' + d.palette.id.toUpperCase() + ' · ' + ab(d.pattern.id) + ' · ' + ab(d.emblem.id);
}

/* --------------------------------------------------------------- bölümler */
let LANG = 'tr';
const T = {
  tr: {
    a: 'A · Kaynak bileşenleri', b: 'B · 30 takım arması', c: 'C · Ölçek testi',
    dd: 'D · Zemin testi', e: 'E · Lig tablosu', f: 'F · Ölçüm',
    emb: 'Amblemler', frm: 'Çerçeveler', pat: 'Desenler', pal: 'Paletler',
    dark: 'Saha zemini', light: 'Açık zemin',
    hp: 'O', hgd: 'Av', hpt: 'P', team: 'Takım',
    cell: 'hücre', pts: 'nokta', sub: 'alt yol', pass: 'geçti', fail: 'KALDI',
  },
  en: {
    a: 'A · Source components', b: 'B · 30 team badges', c: 'C · Scale test',
    dd: 'D · Background test', e: 'E · League table', f: 'F · Measurement',
    emb: 'Emblems', frm: 'Frames', pat: 'Patterns', pal: 'Palettes',
    dark: 'Pitch ground', light: 'Light ground',
    hp: 'P', hgd: 'GD', hpt: 'Pts', team: 'Team',
    cell: 'cell', pts: 'points', sub: 'subpaths', pass: 'pass', fail: 'FAIL',
  },
};
const t = k => T[LANG][k];
const nm = o => o.name[LANG];

/* Ölçek testinde gösterilecek 12 örnek. Sabit ve elle seçili: çerçeve, desen ve
 * amblem çeşitliliğini kapsasın diye 30'un içinden serpiştirildi. */
const SCALE_PICKS = [0, 3, 5, 8, 11, 13, 16, 18, 21, 24, 26, 29];
const SIZES = [64, 34, 26, 18];

function sectionA(all) {
  const swatch = (label, inner, meta) =>
    '<figure class="cell"><div class="cell-art">' + inner + '</div>'
    + '<figcaption><b>' + esc(label) + '</b>' + (meta ? '<span>' + esc(meta) + '</span>' : '') + '</figcaption></figure>';

  const embs = EMBLEMS.map(e =>
    swatch(nm(e),
      '<svg width="52" height="52" viewBox="0 0 64 64" role="img" aria-label="' + esc(nm(e)) + '">'
      + '<path d="' + e.d + '" fill-rule="evenodd" fill="var(--spec)"/></svg>',
      e.cell + ' · ' + e.pts + ' ' + t('pts') + ' / ' + e.sub)).join('');

  const frms = FRAMES.map(f =>
    swatch(nm(f),
      '<svg width="52" height="52" viewBox="0 0 64 64" role="img" aria-label="' + esc(nm(f)) + '">'
      + '<path d="' + f.d() + '" fill="none" stroke="var(--spec)" stroke-width="2"/></svg>',
      f.cell + ' · fit ' + f.fit[0] + '×' + f.fit[1])).join('');

  const demo = { primary: '#8d949c', secondary: '#33383e', accent: '#e8ebef', ink: '#15171a' };
  const pats = PATTERNS.map(p =>
    swatch(nm(p),
      '<svg width="52" height="52" viewBox="0 0 64 64" role="img" aria-label="' + esc(nm(p)) + '">'
      + p.f(demo).join('') + '</svg>', p.id)).join('');

  const pals = PALETTES.map(p =>
    '<figure class="cell pal"><div class="pal-bar">'
    + ['primary', 'secondary', 'accent', 'ink'].map(k => '<i style="background:' + p[k] + '" title="' + k + ' ' + p[k] + '"></i>').join('')
    + '</div><figcaption><b>' + esc(nm(p)) + '</b><span>' + p.id + '</span></figcaption></figure>').join('');

  return '<section id="a"><h2>' + t('a') + '</h2>'
    + '<h3>' + t('emb') + ' <em>12</em></h3><div class="grid g6">' + embs + '</div>'
    + '<h3>' + t('frm') + ' <em>10</em></h3><div class="grid g6">' + frms + '</div>'
    + '<h3>' + t('pat') + ' <em>10</em></h3><div class="grid g6">' + pats + '</div>'
    + '<h3>' + t('pal') + ' <em>16</em></h3><div class="grid g4">' + pals + '</div>'
    + '</section>';
}

function sectionB(all) {
  const cells = all.map((d, i) =>
    '<figure class="cell spec"><div class="cell-art">' + badgeSVG(d, 64) + '</div>'
    + '<figcaption><b>' + String(i + 1).padStart(2, '0') + ' ' + esc(d.seed) + '</b>'
    + '<span class="code">' + blazon(d) + '</span>'
    + '<span>' + esc(nm(d.frame)) + ' / ' + esc(nm(d.pattern)) + ' / ' + esc(nm(d.emblem)) + '</span>'
    + '</figcaption></figure>').join('');
  return '<section id="b"><h2>' + t('b') + '</h2><div class="grid g6">' + cells + '</div></section>';
}

function sectionC(all) {
  const rows = SCALE_PICKS.map(i => {
    const d = all[i];
    return '<tr><th scope="row">' + esc(d.seed) + '<span class="code">' + blazon(d) + '</span></th>'
      + SIZES.map(px => '<td><div class="sz">' + badgeSVG(d, px) + '<i>' + px + '</i></div></td>').join('')
      + '</tr>';
  }).join('');
  return '<section id="c"><h2>' + t('c') + '</h2>'
    + '<div class="scroll"><table class="scale"><thead><tr><th></th>'
    + SIZES.map(s => '<th>' + s + 'px</th>').join('') + '</tr></thead><tbody>' + rows + '</tbody></table></div></section>';
}

function sectionD(all) {
  const strip = (cls, label) => '<div class="ground ' + cls + '"><h4>' + label + '</h4><div class="row">'
    + SCALE_PICKS.map(i => '<div class="stack">'
      + badgeSVG(all[i], 64) + badgeSVG(all[i], 34) + badgeSVG(all[i], 26) + badgeSVG(all[i], 18)
      + '</div>').join('') + '</div></div>';
  return '<section id="d"><h2>' + t('dd') + '</h2>'
    + '<div class="scroll">' + strip('dark', t('dark')) + '</div>'
    + '<div class="scroll">' + strip('light', t('light')) + '</div></section>';
}

function sectionE(all) {
  const rows = LEAGUE_ROWS.map((r, i) => {
    const d = all[i];
    return '<tr><td class="rk">' + (i + 1) + '</td>'
      + '<td class="bd">' + badgeSVG(d, 26) + '</td>'
      + '<td class="tm">' + esc(d.seed) + '</td>'
      + '<td>' + r.pl + '</td><td>' + (r.gd > 0 ? '+' : '') + r.gd + '</td><td class="pt">' + r.pts + '</td></tr>';
  }).join('');
  return '<section id="e"><h2>' + t('e') + '</h2>'
    + '<div class="ground dark tablewrap"><table class="league"><thead><tr>'
    + '<th></th><th></th><th>' + t('team') + '</th><th>' + t('hp') + '</th><th>' + t('hgd') + '</th><th>' + t('hpt') + '</th>'
    + '</tr></thead><tbody>' + rows + '</tbody></table></div></section>';
}

/* --------------------------------------------------------------- ölçüm */
/* Kabul kriterlerinin sayfa içinde çalışan hâli. Konsola değil ekrana yazıyor;
 * "30/30 çiziliyor" gibi bir iddia raporda değil, sayfada görünsün. */
function lum(hex) {
  const v = [1, 3, 5].map(i => {
    const c = parseInt(hex.substr(i, 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
function contrast(a, b) {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function selfTest(all) {
  const out = [];
  const add = (label, ok, detail) => out.push({ label, ok, detail });

  add('12/12 amblem geçerli SVG geometrisi',
    EMBLEMS.length === 12 && EMBLEMS.every(e => /^M[-\d.]/.test(e.d) && /Z$/.test(e.d) && /^M[-\d.]/.test(e.dm)),
    EMBLEMS.length + ' amblem, toplam ' + EMBLEMS.reduce((s, e) => s + e.pts, 0) + ' nokta');

  add('10/10 çerçeve kapalı clip alanı',
    FRAMES.length === 10 && FRAMES.every(f => /Z$/.test(f.d()) && document.getElementById('bclip-' + f.id)),
    FRAMES.map(f => f.d().length).reduce((a, b) => a + b, 0) + ' karakter path');

  const drawn = document.querySelectorAll('#b .bdg').length;
  add('30/30 logo çiziliyor', drawn === 30, drawn + ' SVG');

  const keys = new Set(all.map(d => d.key));
  add('tam kombinasyon tekrarı yok', keys.size === all.length,
    keys.size + '/' + all.length + ' benzersiz, yeniden tuzlama: ' + all.filter(d => d.salt > 0).length);

  const a1 = assign(SAMPLES), a2 = assign(SAMPLES);
  const same = a1.every((d, i) => d.key === a2[i].key && badgeSVG(d, 64) === badgeSVG(a2[i], 64));
  add('aynı tohum → aynı descriptor ve SVG', same, 'iki bağımsız render karşılaştırıldı');

  const html = document.body.innerHTML;
  add('raster <image> yok', !/<image[\s>]/i.test(html), '');
  add('data: URI yok', !/data:/i.test(html), '');
  add('harici kaynak yolu yok', !/(https?:)?\/\//i.test(html.replace(/xmlns[^"]*"[^"]*"/g, '')), '');
  add('Math.random yok', !/Math\s*\.\s*random/.test(badgeSVG.toString() + pick.toString() + assign.toString()), '');

  const vbOK = [...document.querySelectorAll('.bdg')].every(s => s.getAttribute('viewBox') === '0 0 64 64');
  add('logo viewBox 0 0 64 64', vbOK, document.querySelectorAll('.bdg').length + ' SVG denetlendi');

  const overflow = EMBLEMS.filter(e => e.bb[0] < 0 || e.bb[1] < 0 || e.bb[2] > 64 || e.bb[3] > 64);
  add('amblem viewBox dışına taşmıyor', overflow.length === 0,
    'en dar pay ' + Math.min(...EMBLEMS.map(e => Math.min(e.bb[0], e.bb[1], 64 - e.bb[2], 64 - e.bb[3]))).toFixed(2) + ' birim');

  /* Amblem ile çerçeve arasındaki en dar boşluk: fit dikdörtgeni EMB_CLEAR
   * payıyla ölçüldüğü için burada sadece dönüşümün o kutuyu aşmadığı denetleniyor. */
  let worst = Infinity;
  all.forEach(d => {
    const tr = emblemTransform(d.frame, d.emblem);
    const w = (d.emblem.bb[2] - d.emblem.bb[0]) * tr.s, h = (d.emblem.bb[3] - d.emblem.bb[1]) * tr.s;
    worst = Math.min(worst, d.frame.fit[0] - w, d.frame.fit[1] - h);
  });
  add('amblem fit kutusunu aşmıyor', worst >= -0.01, 'artan pay ' + worst.toFixed(2) + ' birim');

  const bad = [];
  all.forEach(d => {
    const c1 = contrast(d.palette.accent, d.palette.primary);
    const c2 = contrast(d.palette.accent, d.palette.secondary);
    const ce = contrast(d.palette.accent, d.palette.ink);
    if (ce < 3) bad.push(d.seed + ' kontur ' + ce.toFixed(2));
    if (Math.max(c1, c2) < 1.6) bad.push(d.seed + ' alan ' + c1.toFixed(2) + '/' + c2.toFixed(2));
  });
  add('amblem ile alan arasında görünür ayrım', bad.length === 0,
    bad.length ? bad.join(', ') : 'amblem/kontur kontrastı en düşük '
      + Math.min(...PALETTES.map(p => contrast(p.accent, p.ink))).toFixed(2) + ':1');

  add('yatay taşma yok', document.documentElement.scrollWidth <= window.innerWidth + 1,
    document.documentElement.scrollWidth + 'px / ' + window.innerWidth + 'px');

  const rows = out.map(r => '<tr class="' + (r.ok ? 'ok' : 'no') + '"><td>' + (r.ok ? '✓' : '✕')
    + '</td><td>' + esc(r.label) + '</td><td>' + (r.ok ? t('pass') : t('fail')) + '</td><td>' + esc(r.detail) + '</td></tr>').join('');

  const bbrows = EMBLEMS.map(e => {
    const cx = (e.bb[0] + e.bb[2]) / 2 - 32, cy = (e.bb[1] + e.bb[3]) / 2 - 32;
    return '<tr><td>' + esc(nm(e)) + '</td><td>' + e.cell + '</td><td>'
      + e.bb.join(', ') + '</td><td>' + cx.toFixed(2) + ', ' + cy.toFixed(2) + '</td><td>'
      + e.pts + ' / ' + e.sub + '</td><td>' + e.mpts + ' / ' + e.msub + '</td></tr>';
  }).join('');

  return '<section id="f"><h2>' + t('f') + '</h2>'
    + '<div class="scroll"><table class="report"><tbody>' + rows + '</tbody></table></div>'
    + '<h3>Amblem sınır kutuları</h3>'
    + '<div class="scroll"><table class="report"><thead><tr><th>amblem</th><th>' + t('cell')
    + '</th><th>bbox x0,y0,x1,y1</th><th>kutu merkezi sapması</th><th>path</th><th>mikro</th></tr></thead>'
    + '<tbody>' + bbrows + '</tbody></table></div></section>';
}

/* ---------------------------------------------------------------- boot */
function render() {
  const all = assign(SAMPLES);
  document.getElementById('defs').innerHTML = clipDefs();
  document.getElementById('view').innerHTML =
    sectionA(all) + sectionB(all) + sectionC(all) + sectionD(all) + sectionE(all);
  document.getElementById('view').insertAdjacentHTML('beforeend', selfTest(all));
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
