/* Prosedürel takım arması prototipi — veri katmanı (SADECE geliştirici aracı).
 *
 * Bu dosya oyuna dahil DEĞİLDİR: index.html, build.js order dizisi ve sw.js SHELL
 * listesi bilerek dokunulmadan bırakıldı. Amaç, tmBadge() yerine geçecek modüler
 * bir arma sisteminin önce görsel olarak onaylanması; onay gelmeden çalışma
 * zamanına hiçbir şey taşınmaz.
 *
 * Amblem geometrisi team-emblems-source.png'den (4x4 tabaka) çıkarıldı ve gerçek
 * SVG path verisine çevrildi — raster gömülü DEĞİL. Çerçeveler ise kaynak tabaka
 * referans alınarak parametrik yeniden çizildi, çünkü mekanik iz sürme ne simetriyi
 * ne de tutarlı kenar kalınlığını koruyabiliyor.
 */

/* Tüm geometri 0 0 64 64 kutusunda. Tek birim kutusu, ölçekleri tek yerden
 * yönetmeyi ve "amblem kutu dışına taşmasın" testini tek satıra indirmeyi sağlıyor. */
const BOX = 64;

/* Kenar, iç içe path yerine CLIP'LENMIŞ STROKE ile çiziliyor. Bir stroke tanımı
 * gereği her yerde aynı genişlikte; iç içe path'te sivri uçtaki inset çarpanını
 * elle tutturmak gerekiyordu ve armanın alt ucunda kenar iki katına çıkıyordu
 * (ölçüldü: hedef 2.0 birime karşı 4.14). Şeritler dıştan içe: önce 0..EDGE_KEY
 * accent, onun üstüne 0..EDGE_INK ink. Yani dışta ink, içte accent keyline —
 * brief'in istediği "dış sınır + iç sınır" tek path'ten çıkıyor.
 * Stroke genişliği bunun iki katı verilir, clip yarısını keser. */
const EDGE_INK = 2.3;
const EDGE_KEY = 3.5;

/* Amblemin etrafındaki kontur. Paletlerin bir kısmı açık/koyu karışık alanlar
 * ürettiği için tek renk amblem bazı desenlerin yarısında kayboluyor; kontur
 * bunu tek ve tutarlı bir tasarım aracıyla çözüyor. */
const EMB_EDGE = 1.7;

/* Amblemin kenardan koruma payı: EDGE_KEY (3.5) + boşluk (1.25) + konturun
 * yarısı (0.85). fit dikdörtgenleri bu paya göre RASTERDE ölçülerek bulundu,
 * elle tahmin edilmedi — "amblem çerçeveye değmesin" böyle garanti ediliyor. */
const EMB_CLEAR = 5.6;

const R2 = v => Math.round(v * 100) / 100;

/* ---------------------------------------------------------------- amblemler */
/* cell = kaynak tabakadaki satırxsütun. bb = normalize edilmiş sınır kutusu.
 * d = 34px ve üzeri için tam geometri, dm = 26px ve altı için sadeleştirilmiş
 * mikro sürüm (bulanıklaştırma değil, path noktası azaltma). */
const EMBLEMS = [
  { id:'lion', cell:'1x1', name:{tr:'Aslan',en:'Lion'},
    bb:[8.2,7.93,55.78,57.78], pts:84, sub:4, mpts:39, msub:2,
    d:'M22.55 7.93L18.02 10.5L21.64 12.01L21.79 12.92L17.56 13.22L14.54 14.28L11.37 18.2L11.37 19.11L14.09 18.96L14.39 19.41L10.47 23.19L8.35 26.97L8.2 30.14L8.8 32.25L11.52 30.44L12.58 30.59L10.16 35.73L10.01 39.81L11.22 42.98L12.88 45.09L14.24 42.22L15.15 41.92L16.36 47.66L19.23 51.74L22.7 53.7L22.7 50.53L23.46 50.08L28.14 55.36L31.16 57.63L32.52 57.78L35.39 55.82L40.53 50.23L41.28 50.83L41.28 53.7L45.66 50.98L47.47 47.96L48.83 41.77L49.74 42.37L50.8 45.09L51.55 44.79L53.52 41.32L54.12 38.75L53.82 35.73L51.55 30.74L52.91 30.74L55.18 32.4L55.78 27.72L53.67 23.34L49.59 19.56L49.89 18.96L52.76 18.96L51.4 16.09L47.78 13.52L42.04 12.62L43.24 11.56L45.96 10.8L44.3 9.14L41.58 7.93L38.11 8.08L31.76 12.31L26.78 8.39ZM27.99 32.4L35.69 32.25L35.84 32.86L32.67 36.63L33.43 37.54L36.6 38.9L37.05 40.56L36.6 40.86L31.61 39.05L27.23 40.71L26.93 39.35L31.01 36.78ZM39.62 24.4L38.41 25.91L35.69 27.27L34.79 26.97L36.6 25L39.02 24.1ZM24.36 24.4L26.63 24.55L29.2 26.97L28.29 27.27L25.57 25.91Z',
    dm:'M22.8 7.81L18.69 10.09L20.36 12.67L14.59 14.19L11.7 17.53L13.37 19.81L8.05 28.17L8.81 31.67L11.7 31.36L9.88 39.57L12.31 44.43L15.2 43.52L19 51.73L22.04 53.25L23.71 50.97L32.52 57.81L40.27 51.12L41.79 53.25L44.98 51.73L49.09 42.91L52.43 43.67L54.1 39.57L52.43 31.51L55.47 31.51L55.77 27.11L50.61 19.81L52.43 18.29L51.22 15.71L43.46 12.37L45.29 10.54L44.07 8.87L38.3 7.96L31.91 11.91ZM29.18 32.27L35.11 32.73L32.98 36.68L36.32 40.33L27.36 39.87L30.7 36.83Z' },
  { id:'eagle', cell:'1x2', name:{tr:'Kartal',en:'Eagle'},
    bb:[5.15,7.88,55.15,55.96], pts:54, sub:3, mpts:24, msub:1,
    d:'M55.15 42.39L54.86 38.7L53.82 35.46L49.69 29.26L50.58 28.67L53.38 29.41L53.38 28.67L48.51 23.07L41.88 18.35L43.79 15.7L43.06 11.42L41.43 7.88L38.34 13.04L35.53 16.14L27.28 16.73L24.47 17.76L20.93 20.12L18.57 22.92L16.66 27.2L7.66 32.95L5.89 34.87L5.15 36.93L5.45 41.51L10.02 38.11L16.8 37.82L17.25 38.56L12.53 42.83L23.74 40.18L27.28 40.47L30.81 41.8L34.06 44.6L35.98 48L36.71 50.8L36.42 55.96L40.11 52.86L45.56 45.05L47.19 46.52L48.37 49.91L48.96 50.21L50.73 46.08L51.91 40.18L54.71 42.69ZM14 32.07L13.12 33.69L11.49 33.25L13.41 31.77ZM27.72 23.51L25.36 24.99L24.62 26.9L23.29 27.05L22.56 26.31L22.41 25.28L23.15 24.54L25.95 23.36Z',
    dm:'M55.17 41.29L50.59 29.75L52.8 27.83L42.6 18.51L43.78 14.37L41.56 8.6L35.94 15.7L27.36 16.73L21.59 19.69L16.86 26.79L7.54 33.15L5.17 37.29L5.76 40.84L10.2 38.18L15.53 37.89L16.56 39.07L14.34 42.32L22.18 40.4L30.91 41.88L36.09 48.09L37.27 55.34L45.7 45.58L49.25 49.42L51.92 41.14Z' },
  { id:'wolf', cell:'1x3', name:{tr:'Kurt',en:'Wolf'},
    bb:[10.98,8.32,53.06,58.32], pts:83, sub:7, mpts:38, msub:2,
    d:'M29.02 42.48L29.46 46.15L34.59 46L34.74 42.34ZM21.39 10.81L22.27 12.28L25.79 10.37L38.11 10.37L41.04 12.28L42.65 11.4L42.36 10.52L39.57 8.32L24.33 8.32ZM14.06 8.32L13.62 24.89L11.28 28.26L11.13 29.58L13.92 29.87L14.35 30.75L10.98 35.59L17.73 35.88L18.31 36.62L18.46 42.19L25.79 48.93L25.79 50.4L24.62 50.4L15.82 43.66L15.53 37.64L14.94 37.2L13.48 37.64L13.48 44.39L31.36 58.17L32.24 58.32L50.57 44.39L50.57 37.79L49.11 37.2L48.37 37.94L48.08 43.8L38.84 50.69L38.26 50.4L38.4 48.64L45.59 42.04L45.73 36.32L53.06 35.44L49.55 30.61L50.13 29.87L52.48 29.87L52.92 29.29L50.28 24.74L50.28 8.76L49.4 8.61L39.72 17.7L36.2 18L31.95 19.61L27.7 18L24.18 17.7ZM27.11 51.87L35.91 51.43L36.79 52.16L31.8 55.68ZM18.17 29.58L26.67 29.43L28.87 40.14L35.47 39.84L37.23 29.43L45.44 29.29L45.73 29.87L38.55 34.71L36.64 49.67L36.06 50.11L27.84 50.11L27.11 48.93L25.35 34.56ZM46.61 16.68L46.91 21.95L46.17 22.69L43.24 20.93L42.8 19.9ZM17.43 16.68L21.1 19.9L20.66 20.93L18.02 22.54L17.14 22.25Z',
    dm:'M14.07 8.07L13.17 23.68L11.07 27.44L13.17 30.89L11.22 34.64L17.53 36.15L18.43 42L25.19 49.36L15.88 43.65L14.07 36.9L13.17 43.8L32.69 57.92L50.86 43.8L49.81 36.9L48.01 43.8L38.85 49.36L45.61 41.85L46.36 36.3L52.81 34.49L50.71 30.74L52.96 27.74L50.71 23.38L50.56 8.82L48.61 8.67L40.35 16.33L31.49 18.43L23.83 16.48ZM19.48 28.94L26.69 29.54L28.19 38.4L30.29 39.9L35.55 38.85L37.8 28.94L44.7 29.24L38.7 34.64L36 49.81L27.29 49.21L25.34 34.79Z' },
  { id:'bull', cell:'1x4', name:{tr:'Boğa',en:'Bull'},
    bb:[7.2,10.16,56.78,60.16], pts:88, sub:4, mpts:46, msub:3,
    d:'M24.85 44.76L25.97 46.16L27.37 46.58L27.37 48.12L27.93 48.54L36.62 48.26L36.62 46.58L38.58 45.6L39.28 43.78L38.16 42.24L25.97 42.24ZM14.07 27.25L14.35 40.69L31.99 60.16L49.92 40.55L50.06 27.25L48.52 26.69L47.96 27.39L47.68 39.99L33.68 55.54L31.71 56.94L16.31 39.71L16.17 27.39L15.75 26.69ZM7.2 13.1L7.34 21.23L11.27 25.01L19.39 25.01L20.37 25.57L20.51 33.13L23.87 34.53L25.83 40.83L27.09 40.83L27.65 40.13L27.65 31.87L25.83 30.05L23.45 29.21L23.87 27.53L28.91 30.75L28.91 39.99L29.75 40.83L35.08 40.41L35.22 30.75L40.4 27.53L40.68 29.21L38.02 30.19L36.48 31.59L36.48 40.27L38.16 40.83L38.86 40.13L40.26 34.53L43.62 32.99L43.76 25.57L44.74 25.01L52.72 25.01L56.78 20.95L56.78 12.96L54.96 13.24L52.72 10.44L52.44 17.03L51.04 18.71L49.64 19.13L42.5 18.99L41.52 18.01L37.32 18.01L35.22 18.99L29.05 18.99L26.95 18.01L22.47 18.01L21.35 18.99L13.51 18.99L11.69 17.17L11.41 10.44L9.03 13.38L7.76 12.68ZM14.07 10.72L14.07 16.89L14.63 17.45L16.03 17.17L16.17 12.68L17.01 12.12L47.26 12.12L47.96 12.68L48.1 17.17L49.5 17.45L50.06 16.89L49.64 10.16L14.49 10.16Z',
    dm:'M14.21 27.53L14.63 41.24L31.58 59.88L49.94 40.53L49.1 26.97L47.54 40.39L31.3 56.63L16.47 40.11L15.9 27.96ZM7.01 14.82L7.71 21.74L11.24 24.85L19.58 25.42L20.42 32.34L23.81 35.02L25.51 40.39L28.33 39.4L30.31 41.52L25.09 43.78L29.18 48.72L35.54 48.58L38.64 45.47L38.22 42.51L33.98 41.38L35.82 39.68L38.79 40.11L40.34 35.02L43.59 32.62L44.15 25.84L52.77 24.85L57.01 20.19L56.86 13.83L53.62 11.57L52.06 17.51L48.67 18.92L13.93 18.78L11.81 17.22L10.96 11.57ZM13.93 11.72L14.63 16.94L17.74 12L46.41 12L48.81 16.94L50.23 15.53L48.81 10.02L15.34 10.02Z' },
  { id:'crown', cell:'2x1', name:{tr:'Taç',en:'Crown'},
    bb:[7.01,12.71,57.01,48.14], pts:69, sub:5, mpts:46, msub:5,
    d:'M14.9 44.8L15.7 48.14L48.19 48.14L49.13 45.33L48.86 44.66ZM44.18 17.92L42.17 18.73L41.91 20.33L42.44 21.4L39.77 25.95L40.44 28.62L42.04 29.56L43.78 29.42L44.85 27.82L44.18 22.07L45.52 20.46L45.52 19.13ZM19.85 17.92L18.64 18.86L18.38 19.8L19.85 22.07L19.18 27.82L20.25 29.42L21.85 29.56L23.72 28.49L24.26 25.95L21.59 21.53L22.12 20.46L21.99 18.86L20.78 17.92ZM7.28 19.13L7.01 20.87L9.29 22.87L13.7 40.92L14.77 41.99L49.79 41.86L54.61 23L56.21 21.94L57.01 20.6L56.34 18.73L55.54 18.33L53.8 18.73L53.14 20.06L53.4 21.8L50.33 25.01L45.78 31.29L44.45 32.36L40.97 31.96L38.97 31.03L37.76 29.56L33.08 17.12L33.88 14.18L32.95 12.98L31.61 12.71L30.14 14.05L30.94 16.86L26 29.96L23.86 31.69L19.58 32.36L10.62 21.94L10.49 19.26L9.15 18.33ZM31.75 29.56L32.55 29.96L35.22 34.64L35.09 35.57L32.15 39.58L31.34 39.18L28.67 35.3Z',
    dm:'M14.89 45.22L15.96 48.17L48 48.17L49.07 45.89L48.54 44.69ZM43.98 17.88L42.1 18.95L42.37 21.63L39.82 26.19L42.24 29.54L44.78 27.93L44.38 21.9L45.59 19.22ZM20.12 17.88L18.51 19.22L19.85 22.44L19.31 27.93L21.86 29.54L24.27 26.19L21.73 21.77L21.86 18.68ZM7.11 19.35L7.11 21.1L9.39 23.37L13.82 41.2L15.29 42.01L49.88 41.74L54.7 23.11L56.98 20.83L56.18 18.55L54.17 18.55L53.23 22.03L45.72 31.42L41.03 31.95L38.08 29.94L33.25 17.34L33.79 13.86L31.38 12.78L26.02 29.94L19.85 32.36L10.87 22.17L10.33 19.09ZM31.78 29.81L35.27 34.77L32.18 39.46L28.7 35.04Z' },
  { id:'star', cell:'2x2', name:{tr:'Yıldız',en:'Star'},
    bb:[7.0,6.83,57.0,54.72], pts:15, sub:1, mpts:12, msub:1,
    d:'M32.07 6.83L31.62 7.13L25.73 24.66L7 25.11L21.95 36.59L16.21 54.11L16.36 54.72L31.92 43.69L47.48 54.72L47.78 54.41L42.19 36.29L56.84 25.56L57 24.96L38.42 24.81L37.81 24.05Z',
    dm:'M32.07 6.83L25.73 24.66L7 25.11L21.95 36.59L16.36 54.72L31.92 43.69L46.87 54.41L47.78 54.41L42.19 36.29L56.84 25.56L57 24.96L38.42 24.81Z' },
  { id:'castle', cell:'2x3', name:{tr:'Kale',en:'Castle'},
    bb:[7.14,7.78,56.97,53.93], pts:74, sub:1, mpts:47, msub:1,
    d:'M7.14 8.11L7.14 15.81L10.15 18.48L8.48 50.59L7.14 53.77L25.53 53.77L24.2 50.76L24.03 44.57L24.36 44.23L27.04 53.1L27.88 53.93L36.57 53.77L39.58 44.23L39.92 44.4L39.75 50.92L38.58 53.77L56.97 53.77L55.64 50.92L53.96 20.49L54.13 17.98L56.97 15.64L56.97 8.28L56.64 7.95L53.29 7.95L52.96 11.12L52.29 11.79L49.95 11.46L49.78 8.28L49.11 7.78L46.44 7.78L45.77 8.28L45.77 11.12L45.1 11.79L43.26 11.79L42.59 11.29L42.26 7.95L39.25 7.78L38.58 8.11L38.41 15.3L39.25 16.47L41.42 17.98L41.09 27.85L40.75 28.68L39.92 29.02L38.24 28.85L37.74 28.35L37.41 23.5L34.06 23.5L33.73 26.51L33.23 27.34L30.89 27.34L30.38 26.84L30.05 23.5L26.71 23.5L26.2 28.51L24.03 29.02L23.03 28.35L22.52 18.48L23.19 17.48L25.53 15.81L25.53 8.28L25.2 7.95L21.86 7.95L21.52 10.96L20.69 11.79L18.51 11.46L18.34 8.28L17.68 7.78L14.5 7.95L14.33 10.96L13.49 11.79L11.32 11.46L10.82 7.95L7.81 7.78Z',
    dm:'M7.18 8.19L7.02 15.57L10.04 18.93L7.52 53.82L24.63 53.99L24.47 45.77L28.16 53.99L36.55 53.66L39.4 45.77L39.4 53.99L56.68 53.66L55.51 49.13L54.16 18.09L57.02 15.23L56.68 8.02L53.32 8.02L51.81 11.71L49.97 11.04L48.63 7.68L45.94 8.19L44.6 11.71L42.59 10.87L41.92 7.85L38.56 8.35L38.56 15.57L41.41 18.25L40.24 28.82L37.89 28.32L37.05 23.46L34.03 23.62L32.86 27.31L30.51 26.81L29.67 23.46L26.98 23.46L26.14 28.15L23.12 28.32L22.45 18.93L25.47 15.4L25.14 8.02L21.78 8.02L20.1 11.71L18.43 11.04L17.59 7.85L14.57 8.02L13.06 11.71L11.21 11.04L10.71 8.02Z' },
  { id:'mountain', cell:'2x4', name:{tr:'Dağ',en:'Mountain'},
    bb:[6.99,7.5,56.86,50.87], pts:46, sub:6, mpts:34, msub:6,
    d:'M43.73 40.23L41.25 45.48L42.63 49.07L43.73 50.87L48.84 50.87L45.25 42.44ZM20.12 40.09L15.42 49.35L15.14 50.87L20.25 50.87L22.05 47.69L22.74 45.48ZM32.13 34.29L24.54 49.35L24.26 50.87L28.54 50.73L31.99 44.1L35.45 50.73L39.87 50.73ZM43.73 22.97L37.24 36.64L38.62 40.51L39.59 41.48L43.46 33.33L44.15 33.05L52.57 50.59L56.86 50.87L56.44 49.07L44.98 24.62ZM20.39 22.97L19.42 23.93L6.99 50.18L7.13 50.87L11.41 50.59L20.12 32.91L24.54 41.48L26.19 38.85L26.75 36.64ZM32.27 7.5L31.72 7.77L24.12 23.1L28.68 33.05L31.99 27.11L35.31 33.05L39.87 23.8L39.87 22.97Z',
    dm:'M43.8 40.53L41.58 46.78L43.8 50.81L48.52 50.95ZM20.19 40.53L15.46 50.95L20.05 50.95L22.55 46.51ZM32.13 34.56L24.63 50.95L28.38 50.81L31.99 44.42L35.6 50.81L39.77 50.53ZM43.8 23.17L37.55 35.95L37.69 38.45L39.63 41.23L44.21 33.31L52.55 50.4L56.58 50.95ZM20.33 23.17L7.41 50.95L11.44 50.4L19.91 33.31L24.49 41.23L26.16 38.87L26.58 36.37ZM32.27 7.62L24.21 22.76L28.66 32.76L31.99 27.34L35.6 32.62L39.91 23.45Z' },
  { id:'anchor', cell:'3x1', name:{tr:'Çapa',en:'Anchor'},
    bb:[8.95,4.56,55.05,54.56], pts:67, sub:2, mpts:46, msub:2,
    d:'M30.83 4.56L28.02 5.66L26.45 7.06L24.89 10.66L25.36 14.25L26.3 15.97L29.42 18.47L29.42 20.19L23.02 20.5L22.24 21.13L22.55 24.56L28.64 24.56L29.42 25.03L29.42 47.53L28.49 48L24.27 47.22L18.33 44.41L16.45 42.69L16.45 42.06L18.17 40.5L17.55 39.56L9.74 36.28L8.95 36.44L9.58 42.22L10.99 46.44L13.33 45.19L18.33 50.03L23.95 53.16L29.58 54.56L34.58 54.56L38.33 53.78L43.02 51.75L46.45 49.41L50.67 45.19L53.02 46.28L54.42 41.91L55.05 36.44L54.11 36.28L46.14 39.72L45.83 40.35L47.55 42.06L47.55 42.69L43.95 45.5L38.49 47.53L35.36 48L34.58 47.38L34.58 25.35L35.52 24.56L41.45 24.56L41.77 21.28L40.83 20.5L34.74 20.19L34.74 18.31L38.49 14.56L39.11 12.38L38.95 9.88L37.86 7.53L35.99 5.66L33.8 4.72ZM31.3 8.47L33.64 8.94L35.05 10.81L34.74 13.16L32.55 14.72L30.05 14.1L28.8 11.91L29.42 9.72Z',
    dm:'M30.99 4.58L27.24 6.3L24.89 10.67L25.36 14.26L29.42 19.89L22.24 21.61L22.86 24.58L29.42 25.36L29.42 47.23L27.39 47.86L21.92 46.45L16.77 43.01L17.39 39.58L10.05 36.45L8.95 38.01L10.99 46.14L13.64 45.51L18.8 50.36L24.42 53.33L34.42 54.58L42.7 51.92L50.83 45.36L52.86 46.14L55.05 37.08L53.8 36.45L46.61 39.58L47.39 42.7L43.95 45.51L38.49 47.55L34.74 47.39L34.58 25.67L36.14 24.58L41.14 24.58L41.77 21.76L41.14 20.67L34.74 19.89L38.64 14.11L38.95 10.05L36.14 5.83ZM31.61 8.48L33.64 8.95L35.05 10.98L34.58 13.33L32.39 14.73L28.95 12.55L29.27 10.05Z' },
  { id:'torch-spear', cell:'3x3', name:{tr:'Meşale ve mızrak',en:'Torch and spear'},
    bb:[11.52,8.41,52.44,58.41], pts:65, sub:7, mpts:31, msub:6,
    d:'M14.5 52.07L13.01 53.31L11.52 53.19L11.64 57.91L15.12 54.8L16.37 54.56ZM26.69 39.63L16.24 49.7L16.24 50.58L17.36 51.69L18.86 51.07L27.07 42.74ZM26.32 36.52L28.93 39.51L30.3 52.81L30.05 55.67L30.67 58.29L31.67 58.41L32.41 55.8L32.29 51.57L33.53 39.63L36.27 36.65ZM24.2 32.91L25.08 34.78L37.39 34.78L38.38 32.66L24.45 32.29ZM42.61 26.45L40.75 25.08L38.01 27.94L36.89 30.55L39.25 30.55L42.74 27.07ZM52.44 15.38L42.86 20.23L42.36 22.71L44.6 25.33L46.84 25.2L47.84 24.46ZM29.8 8.41L29.18 15.63L28.43 16.12L25.95 14.63L26.69 18.61L24.2 25.08L24.7 28.56L26.57 30.55L28.31 25.2L28.81 24.95L29.3 25.82L32.04 21.72L32.54 22.09L32.54 24.08L31.42 28.31L31.79 28.68L34.4 26.2L34.65 27.32L33.78 30.3L36.39 28.06L38.51 23.59L38.63 20.97L37.64 17.99L36.64 16.62L35.77 17.74L33.41 12.02Z',
    dm:'M24.8 41.01L15.06 49.98L14.93 52.16L24.16 44.98ZM26.47 37.03L29.93 59.08L31.98 41.39L34.03 37.67ZM22.88 33.57L25.19 35.49L35.32 35.37L36.73 33.95ZM40.57 26.01L36.6 28.19L36.34 30.88L40.83 28.19ZM50.57 16.13L41.98 20.24L42.75 24.85L47.11 24.21ZM29.16 9.08L27.62 14.98L24.93 15.62L22.62 24.85L24.42 30.24L30.19 23.31L30.44 27.8L32.62 27.54L33.39 29.6L37.11 24.21L36.34 18.19Z' },
  { id:'lightning', cell:'4x3', name:{tr:'Şimşek',en:'Lightning'},
    bb:[17.82,9.82,46.14,59.82], pts:13, sub:1, mpts:12, msub:1,
    d:'M46.14 9.82L32.28 9.82L31.38 10.58L17.82 37.53L17.97 38.14L27.46 38.14L27.91 38.59L18.43 59.82L20.08 58.47L46.14 28.35L45.83 27.74L36.05 27.44L45.68 11.48Z',
    dm:'M46.14 9.82L32.28 9.82L31.38 10.58L17.82 37.53L17.97 38.14L27.46 38.14L27.91 38.59L18.43 59.82L46.14 28.35L45.83 27.74L36.05 27.44L45.68 11.48Z' },
  { id:'oak', cell:'4x4', name:{tr:'Meşe yaprağı',en:'Oak leaf'},
    bb:[11.51,8.19,51.98,58.03], pts:67, sub:2, mpts:35, msub:2,
    d:'M47.92 8.5L44.48 8.19L39.17 11.16L35.42 8.82L33.08 9.28L31.83 11.32L31.67 16.63L30.89 17.57L29.48 17.1L26.83 14.75L25.11 14.75L23.7 15.69L23.08 19.28L24.79 25.69L23.54 25.85L20.26 23.66L17.92 24.28L17.14 25.38L16.98 27.25L19.95 34.75L18.86 35.07L14.95 33.97L13.39 34.91L12.76 36.47L13.54 39.6L15.89 44.13L15.89 45.53L14.79 47.57L17.45 50.38L11.51 55.85L13.39 57.88L14.33 58.03L19.48 52.57L21.83 53.82L25.42 51.32L33.08 51.78L34.48 51.16L35.42 50.07L35.58 48.35L33.08 44.75L33.7 43.66L40.11 44.44L43.08 43.03L43.39 40.22L39.79 36.78L39.79 36L40.73 35.53L46.51 35.53L49.48 33.82L49.95 32.72L49.48 30.53L45.58 28.19L45.11 27.25L45.73 26.32L50.26 24.44L51.67 22.88L51.98 21.63L51.36 19.75L48.39 17.88L49.64 11.78L48.86 9.44ZM37.76 23.97L37.76 25.85L33.23 33.03L22.14 47.72L21.04 48.19L20.42 47.25Z',
    dm:'M48 8.45L44.21 8.14L39.32 10.66L33.96 8.77L32.07 10.5L30.81 16.97L26.07 14.61L23.71 15.55L24.18 25.02L18.98 23.75L16.93 25.8L19.29 34.32L14.56 34.16L12.82 35.74L16.77 51.04L12.04 55.61L12.67 57.67L14.88 57.51L19.13 53.25L26.86 51.36L33.33 51.83L35.38 49.78L33.96 44.26L42.79 43.31L43.27 40.16L40.27 36.69L49.42 33.85L49.58 30.69L45.63 27.07L51.94 21.86L48.79 17.44L49.58 10.98ZM36.8 25.96L30.65 36.37L21.18 47.41Z' },
];

/* ---------------------------------------------------------------- çerçeveler */
/* Her çerçeve tek bir KAPALI dış path (d) veriyor. Aynı path üç iş yapıyor:
 * desenin clip alanı, accent keyline stroke'u ve ink kenar stroke'u. Tek kaynak
 * olduğu için üçü birbirinden kaçamaz.
 *
 * fit = amblemin sığdırıldığı dikdörtgen [genişlik, yükseklik, merkez y].
 * Değerler raster üzerinde ölçüldü: alan EMB_CLEAR kadar aşındırılıp içine sığan
 * en büyük dikdörtgen arandı. bar = accent taban çubuğunun y'si.
 * En/boy oranları kaynak tabakadan ölçüldü (0.81–0.99). */
const FRAMES = [
  { id: 'classic-point', cell: '1x1',  name: { tr: 'Klasik sivri', en: 'Classic point' },
    fit: [26.5, 31.2, 26.0], bar: 50,
    d() {
      const hw = 25, t = 2, b = 62, y1 = t + (b - t) * 0.42, dy = b - y1;
      return 'M' + (32 - hw) + ' ' + t + 'H' + (32 + hw) + 'V' + y1
        + 'C' + (32 + hw) + ' ' + R2(y1 + dy * 0.44) + ' ' + R2(32 + hw * 0.36) + ' ' + R2(b - dy * 0.24) + ' 32 ' + b
        + 'C' + R2(32 - hw * 0.36) + ' ' + R2(b - dy * 0.24) + ' ' + (32 - hw) + ' ' + R2(y1 + dy * 0.44) + ' ' + (32 - hw) + ' ' + y1 + 'Z';
    } },

  { id: 'ornate-shield', cell: '1x2',  name: { tr: 'Pahlı arma', en: 'Ornate shield' },
    fit: [25.3, 29.8, 26.0], bar: 50,
    d() {
      const hw = 25, t = 2, b = 62, c = 4.6, y1 = t + (b - t) * 0.38, dy = b - y1;
      return 'M' + (32 - hw + c) + ' ' + t + 'H' + (32 + hw - c) + 'L' + (32 + hw) + ' ' + (t + c) + 'V' + R2(y1)
        + 'C' + (32 + hw) + ' ' + R2(y1 + dy * 0.44) + ' ' + R2(32 + hw * 0.34) + ' ' + R2(b - dy * 0.25) + ' 32 ' + b
        + 'C' + R2(32 - hw * 0.34) + ' ' + R2(b - dy * 0.25) + ' ' + (32 - hw) + ' ' + R2(y1 + dy * 0.44) + ' ' + (32 - hw) + ' ' + R2(y1)
        + 'V' + (t + c) + 'Z';
    } },

  { id: 'modern-double', cell: '1x3',  name: { tr: 'Modern çift', en: 'Modern double' },
    fit: [32.8, 38.6, 27.0], bar: 51,
    d() {
      const hw = 25, t = 2, b = 62, r = 3.4, y1 = t + (b - t) * 0.48, dy = b - y1;
      return 'M' + (32 - hw) + ' ' + (t + r) + 'Q' + (32 - hw) + ' ' + t + ' ' + (32 - hw + r) + ' ' + t
        + 'H' + (32 + hw - r) + 'Q' + (32 + hw) + ' ' + t + ' ' + (32 + hw) + ' ' + (t + r)
        + 'V' + R2(y1)
        + 'C' + (32 + hw) + ' ' + R2(y1 + dy * 0.66) + ' ' + R2(32 + hw * 0.62) + ' ' + R2(b - dy * 0.04) + ' 32 ' + b
        + 'C' + R2(32 - hw * 0.62) + ' ' + R2(b - dy * 0.04) + ' ' + (32 - hw) + ' ' + R2(y1 + dy * 0.66) + ' ' + (32 - hw) + ' ' + R2(y1) + 'Z';
    } },

  { id: 'angular-shield', cell: '1x4',  name: { tr: 'Köşeli arma', en: 'Angular shield' },
    fit: [26.6, 31.3, 26.0], bar: 50,
    d() {
      const hw = 26.3, t = 2, b = 62, e = 6.2, y1 = t + (b - t) * 0.40, dy = b - y1;
      return 'M' + R2(32 - hw) + ' ' + (t + e) + 'Q' + R2(32 - hw) + ' ' + t + ' ' + R2(32 - hw + e) + ' ' + t
        /* Kaynaktaki ayırt edici detay: köşeler yukarıda kalıp tepe çizgisi
         * ortada çukurlaşıyor. Kontrol noktası t+2.6 iken çukur 1.3 birimdi ve
         * 64px'te diğer dört armadan ayrılmıyordu; t+5.4 çukuru 2.7'ye çıkarıyor. */
        + 'Q32 ' + (t + 5.4) + ' ' + R2(32 + hw - e) + ' ' + t
        + 'Q' + R2(32 + hw) + ' ' + t + ' ' + R2(32 + hw) + ' ' + (t + e)
        + 'V' + R2(y1)
        + 'C' + R2(32 + hw) + ' ' + R2(y1 + dy * 0.44) + ' ' + R2(32 + hw * 0.34) + ' ' + R2(b - dy * 0.25) + ' 32 ' + b
        + 'C' + R2(32 - hw * 0.34) + ' ' + R2(b - dy * 0.25) + ' ' + R2(32 - hw) + ' ' + R2(y1 + dy * 0.44) + ' ' + R2(32 - hw) + ' ' + R2(y1) + 'Z';
    } },

  { id: 'narrow-shield', cell: '1x5',  name: { tr: 'Dar arma', en: 'Narrow shield' },
    fit: [28.2, 33.2, 26.0], bar: 50,
    d() {
      const hw = 24.2, t = 2, b = 62, y1 = t + (b - t) * 0.50, dy = b - y1;
      return 'M' + R2(32 - hw) + ' ' + t + 'H' + R2(32 + hw) + 'V' + R2(y1)
        + 'C' + R2(32 + hw) + ' ' + R2(y1 + dy * 0.42) + ' ' + R2(32 + hw * 0.40) + ' ' + R2(b - dy * 0.22) + ' 32 ' + b
        + 'C' + R2(32 - hw * 0.40) + ' ' + R2(b - dy * 0.22) + ' ' + R2(32 - hw) + ' ' + R2(y1 + dy * 0.42) + ' ' + R2(32 - hw) + ' ' + R2(y1) + 'Z';
    } },

  { id: 'round', cell: '2x1',  name: { tr: 'Yuvarlak', en: 'Round' },
    fit: [34.3, 32.7, 31.8], bar: 50,
    d() { return 'M32 2.6A29.4 29.4 0 1 1 31.99 2.6Z'; } },

  { id: 'compact-shield', cell: '2x3',  name: { tr: 'Kompakt arma', en: 'Compact shield' },
    fit: [34.7, 36.5, 26.0], bar: 51,
    d() {
      const hw = 26.6, t = 2, b = 62, y1 = t + (b - t) * 0.55, dy = b - y1;
      return 'M' + R2(32 - hw) + ' ' + t + 'H' + R2(32 + hw) + 'V' + R2(y1)
        + 'C' + R2(32 + hw) + ' ' + R2(y1 + dy * 0.50) + ' ' + R2(32 + hw * 0.46) + ' ' + R2(b - dy * 0.18) + ' 32 ' + b
        + 'C' + R2(32 - hw * 0.46) + ' ' + R2(b - dy * 0.18) + ' ' + R2(32 - hw) + ' ' + R2(y1 + dy * 0.50) + ' ' + R2(32 - hw) + ' ' + R2(y1) + 'Z';
    } },

  { id: 'oval', cell: '2x5',  name: { tr: 'Oval', en: 'Oval' },
    fit: [29.9, 31.5, 32.0], bar: 50,
    d() { return 'M32 2.2A25.4 29.8 0 1 1 31.99 2.2Z'; } },

  /* Kaynak baklavanın en/boy oranı 0.67 ile çok dar: içine sığan en büyük
   * dikdörtgen amblemi 18px'te lekeye çeviriyordu. 0.82'ye genişletildi —
   * çerçeveler yeniden çizildiği için bu serbest, amblemlerde oran bozmak değil. */
  { id: 'diamond', cell: '3x1',  name: { tr: 'Baklava', en: 'Diamond' },
    fit: [18.0, 21.2, 32.0], bar: 52,
    d() {
      const hw = 24.6, t = 2, b = 62, k = 2.6;
      return 'M32 ' + t + 'L' + R2(32 + hw - k * 0.7) + ' ' + R2(32 - k * 1.1)
        + 'Q' + R2(32 + hw) + ' 32 ' + R2(32 + hw - k * 0.7) + ' ' + R2(32 + k * 1.1)
        + 'L32 ' + b + 'L' + R2(32 - hw + k * 0.7) + ' ' + R2(32 + k * 1.1)
        + 'Q' + R2(32 - hw) + ' 32 ' + R2(32 - hw + k * 0.7) + ' ' + R2(32 - k * 1.1) + 'Z';
    } },

  { id: 'hexagon', cell: '3x4',  name: { tr: 'Altıgen', en: 'Hexagon' },
    fit: [36.4, 25.1, 32.0], bar: 51,
    d() {
      const hw = 25.5, t = 2, b = 62, k = 15.4;
      return 'M32 ' + t + 'L' + R2(32 + hw) + ' ' + (t + k) + 'L' + R2(32 + hw) + ' ' + R2(b - k)
        + 'L32 ' + b + 'L' + R2(32 - hw) + ' ' + R2(b - k) + 'L' + R2(32 - hw) + ' ' + (t + k) + 'Z';
    } },
];

/* ------------------------------------------------------------------ desenler */
/* Desenler yalnız primary + secondary kullanıyor; accent ambleme ve halkaya
 * ayrıldı. İki renkle sınırlamak, 18px'te alanların birbirine karışmasını
 * engelleyen asıl şey. Şerit sayısı da bilerek düşük: 5 dikey / 4 yatay bant,
 * 18px'te bant başına ≈3.6px kalıyor. */
const PATTERNS = [
  { id: 'solid', name: { tr: 'Düz', en: 'Solid' },
    f: p => ['<rect x="0" y="0" width="64" height="64" fill="' + p.primary + '"/>'] },

  { id: 'vertical-halves', name: { tr: 'Dikey yarım', en: 'Vertical halves' },
    f: p => ['<rect x="0" y="0" width="32" height="64" fill="' + p.primary + '"/>',
      '<rect x="32" y="0" width="32" height="64" fill="' + p.secondary + '"/>'] },

  { id: 'horizontal-halves', name: { tr: 'Yatay yarım', en: 'Horizontal halves' },
    f: p => ['<rect x="0" y="0" width="64" height="32" fill="' + p.primary + '"/>',
      '<rect x="0" y="32" width="64" height="32" fill="' + p.secondary + '"/>'] },

  { id: 'vertical-stripes', name: { tr: 'Dikey çubuk', en: 'Vertical stripes' },
    f: p => ['<rect x="0" y="0" width="64" height="64" fill="' + p.primary + '"/>',
      '<rect x="12.8" y="0" width="12.8" height="64" fill="' + p.secondary + '"/>',
      '<rect x="38.4" y="0" width="12.8" height="64" fill="' + p.secondary + '"/>'] },

  { id: 'horizontal-hoops', name: { tr: 'Yatay bant', en: 'Horizontal hoops' },
    f: p => ['<rect x="0" y="0" width="64" height="64" fill="' + p.primary + '"/>',
      '<rect x="0" y="16" width="64" height="16" fill="' + p.secondary + '"/>',
      '<rect x="0" y="48" width="64" height="16" fill="' + p.secondary + '"/>'] },

  { id: 'center-stripe', name: { tr: 'Orta şerit', en: 'Centre stripe' },
    f: p => ['<rect x="0" y="0" width="64" height="64" fill="' + p.primary + '"/>',
      '<rect x="23" y="0" width="18" height="64" fill="' + p.secondary + '"/>'] },

  { id: 'diagonal-split', name: { tr: 'Çapraz bölünme', en: 'Diagonal split' },
    f: p => ['<rect x="0" y="0" width="64" height="64" fill="' + p.primary + '"/>',
      '<path d="M0 0L64 64L0 64Z" fill="' + p.secondary + '"/>'] },

  { id: 'diagonal-sash', name: { tr: 'Çapraz kuşak', en: 'Diagonal sash' },
    f: p => ['<rect x="0" y="0" width="64" height="64" fill="' + p.primary + '"/>',
      '<path d="M12 0L64 52L64 64L52 64L0 12L0 0Z" fill="' + p.secondary + '"/>'] },

  { id: 'quarters', name: { tr: 'Çeyrekler', en: 'Quarters' },
    f: p => ['<rect x="0" y="0" width="32" height="32" fill="' + p.primary + '"/>',
      '<rect x="32" y="0" width="32" height="32" fill="' + p.secondary + '"/>',
      '<rect x="0" y="32" width="32" height="32" fill="' + p.secondary + '"/>',
      '<rect x="32" y="32" width="32" height="32" fill="' + p.primary + '"/>'] },

  { id: 'chevron', name: { tr: 'Ters V', en: 'Chevron' },
    f: p => ['<rect x="0" y="0" width="64" height="64" fill="' + p.primary + '"/>',
      '<path d="M0 16L32 40L64 16L64 32L32 56L0 32Z" fill="' + p.secondary + '"/>'] },
];

/* ------------------------------------------------------------------ paletler */
/* primary/secondary desen alanları, accent amblem ve halka, ink dış kenar ve
 * amblem konturu. Gerçek kulüplerin bilinen arma kombinasyonları taklit
 * edilmedi; neon tonlar bilerek kısıtlı ve doygunlukları düşürüldü. */
const PALETTES = [
  { id: 'p01', name: { tr: 'Kırmızı / krem / lacivert', en: 'Red / cream / navy' },
    primary: '#B5232B', secondary: '#14243F', accent: '#F0E4CC', ink: '#0C1526' },
  { id: 'p02', name: { tr: 'Kraliyet mavisi / beyaz / altın', en: 'Royal blue / white / gold' },
    primary: '#1B45A8', secondary: '#F2F4F8', accent: '#E5B23C', ink: '#0E1F49' },
  { id: 'p03', name: { tr: 'Zümrüt / siyah / beyaz', en: 'Emerald / black / white' },
    primary: '#0E7A54', secondary: '#14171B', accent: '#EFF3F1', ink: '#05100B' },
  { id: 'p04', name: { tr: 'Turuncu / lacivert / beyaz', en: 'Orange / navy / white' },
    primary: '#D2661C', secondary: '#16294A', accent: '#F4F6F9', ink: '#0B1730' },
  { id: 'p05', name: { tr: 'Mor / altın / beyaz', en: 'Purple / gold / white' },
    primary: '#5B2A83', secondary: '#E8C25A', accent: '#F5F0FA', ink: '#2A0F42' },
  { id: 'p06', name: { tr: 'Gök mavisi / lacivert / beyaz', en: 'Sky / navy / white' },
    primary: '#3A8FD0', secondary: '#172C52', accent: '#F3F7FB', ink: '#0C1A34' },
  { id: 'p07', name: { tr: 'Bordo / açık mavi / altın', en: 'Maroon / light blue / gold' },
    primary: '#7A1F35', secondary: '#8FBFD9', accent: '#DFB65C', ink: '#3B0E1D' },
  { id: 'p08', name: { tr: 'Kırmızı / siyah / beyaz', en: 'Red / black / white' },
    primary: '#C02A24', secondary: '#18191C', accent: '#F2F3F5', ink: '#0A0B0D' },
  { id: 'p09', name: { tr: 'Turkuaz / mercan / krem', en: 'Teal / coral / cream' },
    primary: '#1D8C93', secondary: '#E1674F', accent: '#F6EDD9', ink: '#0B3C41' },
  { id: 'p10', name: { tr: 'Sarı / siyah / beyaz', en: 'Yellow / black / white' },
    primary: '#E8C21E', secondary: '#1A1A1C', accent: '#FAFAF7', ink: '#0E0E10' },
  { id: 'p11', name: { tr: 'Orman yeşili / lime / krem', en: 'Forest / lime / cream' },
    primary: '#1E5533', secondary: '#8FBF3F', accent: '#F1EEDC', ink: '#0B2415' },
  { id: 'p12', name: { tr: 'İndigo / camgöbeği / beyaz', en: 'Indigo / cyan / white' },
    primary: '#2B2F7A', secondary: '#2FA8C4', accent: '#F0F4F8', ink: '#14163F' },
  { id: 'p13', name: { tr: 'Vişne / pembe / krem', en: 'Burgundy / pink / cream' },
    primary: '#6B1B33', secondary: '#D98BA5', accent: '#F5E9DE', ink: '#330C19' },
  { id: 'p14', name: { tr: 'Kobalt / turuncu / beyaz', en: 'Cobalt / orange / white' },
    primary: '#1A50B0', secondary: '#E07A28', accent: '#F3F6FA', ink: '#0A2258' },
  { id: 'p15', name: { tr: 'Kömür / gümüş / yeşil', en: 'Charcoal / silver / green' },
    primary: '#2C3138', secondary: '#4FA96B', accent: '#C9D0D8', ink: '#12151A' },
  { id: 'p16', name: { tr: 'Lacivert / mint / altın', en: 'Navy / mint / gold' },
    primary: '#16294F', secondary: '#6FC9A8', accent: '#DDB963', ink: '#08132B' },
];

/* ------------------------------------------------------- laboratuvar takımları */
/* SAHTE girdiler. js/data.js'teki CLUBS'a dokunulmadı; buradaki adlar yalnız
 * deterministik eşlemenin tohumu. Adlandırma yine de proje politikasına uyuyor:
 * şehir + tarafsız sıfat, kulüp lakabı veya marka yok. */
const SAMPLES = [
  'İzmir Halyard', 'Ankara Granite', 'Trabzon Tideway', 'Manchester Ironworks',
  'Liverpool Harbour', 'Leeds Kiln', 'München Anvil', 'Dortmund Foundry',
  'Hamburg Beacon', 'Lyon Meridian', 'Marseille Lantern', 'Torino Vault',
  'Napoli Ember', 'Sevilla Bastion', 'Bilbao Quarry', 'Rotterdam Weir',
  'Eindhoven Lattice', 'Porto Steeple', 'Lisboa Compass', 'Salvador Cinder',
  'Rosario Verge', 'Córdoba Signal', 'Portland Vanguard', 'Denver Ridge',
  'Monterrey Cobalt', 'Osaka Northgate', 'Sapporo Stonebridge', 'Lagos Kestrel',
  'Göteborg Mill', 'Antwerpen Clasp',
];

/* Lig tablosu simülasyonu için sahte sezon verisi. Oyunun S.fx / S.teams
 * yapısına bilerek bağlanmadı — bu bölüm yalnız 26px okunabilirlik testi. */
const LEAGUE_ROWS = [
  { pl: 34, gd: 41, pts: 78 }, { pl: 34, gd: 33, pts: 71 }, { pl: 34, gd: 25, pts: 67 },
  { pl: 34, gd: 12, pts: 60 }, { pl: 34, gd: 8, pts: 55 }, { pl: 34, gd: 1, pts: 48 },
  { pl: 34, gd: -4, pts: 44 }, { pl: 34, gd: -11, pts: 39 }, { pl: 34, gd: -19, pts: 33 },
  { pl: 34, gd: -28, pts: 26 },
];
