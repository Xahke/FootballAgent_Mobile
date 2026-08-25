/* Laboratuvara özel yardımcılar — SADECE geliştirici aracı, oyuna dahil değil.
 *
 * Burada YALNIZ laboratuvarın kendi ihtiyacı olan şeyler var: "önce/sonra"
 * karşılaştırması için 1. turun paleti ve eski algoritması, bir de lig tablosu
 * simülasyonu için sahte sezon satırları.
 *
 * Amblem/çerçeve/desen geometrisi ve semantik eşleme burada YOK — onların tek
 * kaynağı js/badges.js ve laboratuvar o dosyayı doğrudan yüklüyor. Böylece
 * senkron kaçağı diye bir şey mümkün değil.
 */

/* 1. turun laboratuvar paleti. Üretimde KULLANILMIYOR: gerçek sistem takımın
   kendi c1/c2'sini okuyor. Yalnız "eskiden neye benziyordu" sorusuna cevap. */
const LEGACY_PALETTES = [
  { id: 'p01', primary: '#B5232B', secondary: '#14243F', accent: '#F0E4CC', ink: '#0C1526' },
  { id: 'p02', primary: '#1B45A8', secondary: '#F2F4F8', accent: '#E5B23C', ink: '#0E1F49' },
  { id: 'p03', primary: '#0E7A54', secondary: '#14171B', accent: '#EFF3F1', ink: '#05100B' },
  { id: 'p04', primary: '#D2661C', secondary: '#16294A', accent: '#F4F6F9', ink: '#0B1730' },
  { id: 'p05', primary: '#5B2A83', secondary: '#E8C25A', accent: '#F5F0FA', ink: '#2A0F42' },
  { id: 'p06', primary: '#3A8FD0', secondary: '#172C52', accent: '#F3F7FB', ink: '#0C1A34' },
  { id: 'p07', primary: '#7A1F35', secondary: '#8FBFD9', accent: '#DFB65C', ink: '#3B0E1D' },
  { id: 'p08', primary: '#C02A24', secondary: '#18191C', accent: '#F2F3F5', ink: '#0A0B0D' },
  { id: 'p09', primary: '#1D8C93', secondary: '#E1674F', accent: '#F6EDD9', ink: '#0B3C41' },
  { id: 'p10', primary: '#E8C21E', secondary: '#1A1A1C', accent: '#FAFAF7', ink: '#0E0E10' },
  { id: 'p11', primary: '#1E5533', secondary: '#8FBF3F', accent: '#F1EEDC', ink: '#0B2415' },
  { id: 'p12', primary: '#2B2F7A', secondary: '#2FA8C4', accent: '#F0F4F8', ink: '#14163F' },
  { id: 'p13', primary: '#6B1B33', secondary: '#D98BA5', accent: '#F5E9DE', ink: '#330C19' },
  { id: 'p14', primary: '#1A50B0', secondary: '#E07A28', accent: '#F3F6FA', ink: '#0A2258' },
  { id: 'p15', primary: '#2C3138', secondary: '#4FA96B', accent: '#C9D0D8', ink: '#12151A' },
  { id: 'p16', primary: '#16294F', secondary: '#6FC9A8', accent: '#DDB963', ink: '#08132B' },
];

/* 1. turun algoritması: amblem tamamen hash, renk laboratuvar paletinden,
   semantik hiç yok. Üretim fonksiyonlarını kullanıyor ki karşılaştırma yalnız
   ALGORİTMA farkını göstersin, çizim farkını değil. */
function legacyDescriptor(tm) {
  const seed = tm.n;
  const pal = LEGACY_PALETTES[bPick(seed, 'palette', LEGACY_PALETTES.length)];
  const emb = EMBLEMS[bPick(seed, 'emblem', EMBLEMS.length)];
  return {
    frame: FRAMES[bPick(seed, 'frame', FRAMES.length)],
    pattern: PATTERNS[bPick(seed, 'pattern', PATTERNS.length)],
    emblem: emb,
    primary: pal.primary, secondary: pal.secondary,
    ink: pal.ink, accent: pal.accent, embEdge: pal.ink,
    semanticKey: '—', semanticCategory: null, semanticExact: false,
    usedFallback: true, salt: 0, key: seed,
  };
}

/* Lig tablosu simülasyonu için sahte sezon verisi. Oyunun S.fx / S.teams
   yapısına bilerek bağlanmadı — bu bölüm yalnız 26px okunabilirlik testi. */
const LEAGUE_ROWS = [
  { pl: 34, gd: 41, pts: 78 }, { pl: 34, gd: 33, pts: 71 }, { pl: 34, gd: 25, pts: 67 },
  { pl: 34, gd: 12, pts: 60 }, { pl: 34, gd: 8, pts: 55 }, { pl: 34, gd: 1, pts: 48 },
  { pl: 34, gd: -4, pts: 44 }, { pl: 34, gd: -11, pts: 39 }, { pl: 34, gd: -19, pts: 33 },
  { pl: 34, gd: -28, pts: 26 },
];
