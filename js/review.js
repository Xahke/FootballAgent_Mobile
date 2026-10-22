/* ================= UYGULAMA İÇİ DEĞERLENDİRME =================
   Google Play'in In-App Review penceresi (@capawesome/capacitor-app-review 8.1.0,
   Play Review 2.0.2). Yıldız ve yorum Play'in kendi arayüzünde, oyunun üstünde
   açılıyor; oyuncu mağazaya gitmiyor.

   PLAY HİÇBİR ŞEY SÖYLEMİYOR, bütün tasarım bunun üstüne kurulu:
   - requestReview()'ün çözülmesi pencerenin GÖSTERİLDİĞİ anlamına gelmiyor.
     Play kendi kotası dolduysa ya da oyuncu zaten değerlendirdiyse hiçbir şey
     çizmeden yine "başarılı" diyor.
   - Oyuncunun puan verip vermediği hiçbir yoldan öğrenilemiyor.
   Bu yüzden "değerlendirmediyse sor" filtresini Play uyguluyor, biz değil.
   Bizim payımız iki şey: doğru anda istemek ve kendi istek sayımızı sınırlamak —
   sınırsız çağrı Play'in kotasını boşa harcar, sonra gerçekten iyi bir anda
   pencere hiç çıkmaz.

   Google'ın kuralı: önce "Oyunu beğendin mi?" diye sorup yalnız "evet" diyene
   pencere açmak, değerlendirme karşılığı ödül vermek ya da puanı yönlendiren bir
   metin koymak YASAK. Bu dosyada hiçbiri yok ve olmamalı; istek hiçbir oyun
   durumuna (S) dokunmuyor, hiçbir para yolu buradan geçmiyor.

   Kayıt CİHAZIN (PREFS.rv), kariyerin değil: Play'in değerlendirmesi kuruluma
   ait, üç kariyer üç ayrı hak doğurmamalı. Alan eski tercihlerde yok; yokken ya
   da bozukken varsayılana düşüyor. */
const RV = {
  max: 3,          // cihaz başına en fazla otomatik istek
  gapD: 30,        // iki istek arasında en az gün
  minSe: 2,        // sezon sonu düğmesine basıldığında S.season — yani en az bir sezon bitmiş
  store: 'com.android.vending'
};
/* Çalışma zamanı kilidi; kayda girmiyor. Bir istek havadayken ikincisi açılmasın. */
const RVS = { busy: false };

/* Web, PWA ve tek dosya sürümünde Capacitor yok; eklentinin JS paketi de
   paketlenmediği için Plugins.AppReview orada oluşmuyor. Ayrı bir bayrak yok,
   tek kaynak bu kontrol — ads.js/iap.js ile aynı desen. */
function rvBridge() {
  try {
    const C = (typeof Capacitor !== 'undefined' && Capacitor) ? Capacitor
      : ((typeof window !== 'undefined' && window.Capacitor) ? window.Capacitor : null);
    const P = (C && C.Plugins && C.Plugins.AppReview) || null;
    return (P && typeof P.requestReview === 'function'
      && typeof P.openAppStore === 'function') ? P : null;
  } catch (e) { return null; }
}

/* PREFS.rv = {n: otomatik istek sayısı, at: son isteğin zamanı (ms), st: mağaza
   sayfası Ayarlar'dan açıldı mı}. Sayı olmayan bir n sıfır, ileride duran bir at
   "hiç sorulmadı" sayılıyor: saati geri alınmış ya da bozulmuş bir alan isteği
   sonsuza kadar kapatmasın (S.adb ile aynı kural). */
function rvState(now) {
  const r = (typeof PREFS !== 'undefined' && PREFS && PREFS.rv && typeof PREFS.rv === 'object') ? PREFS.rv : {};
  const n = (typeof r.n === 'number' && r.n >= 0) ? Math.floor(r.n) : 0;
  const at = (typeof r.at === 'number' && r.at >= 0 && r.at <= now) ? r.at : 0;
  return { n, at, st: r.st === true };
}

/* Neden sorulmayacağı; boş dize "şimdi sorulabilir". Her koşul ayrı bir dize
   döndürüyor ki test hangi kapının kapattığını görebilsin. */
function rvWhy(now) {
  if (!rvBridge()) return 'nobridge';
  if (RVS.busy) return 'busy';
  const st = rvState(now);
  /* Ayarlar'dan mağaza sayfasını açan oyuncu büyük olasılıkla değerlendirdi;
     Play bunu söylemediği için elimizdeki en iyi işaret bu. Otomatik istek
     orada bitiyor. */
  if (st.st) return 'store';
  if (st.n >= RV.max) return 'max';
  if (st.at && now - st.at < RV.gapD * 864e5) return 'gap';
  if (typeof S === 'undefined' || !S || !S.agent) return 'nocareer';
  if ((S.season || 0) < RV.minSe) return 'early';
  /* Borçtaki bir oyuncu kötü bir anda: Google da isteği olumlu bir ana
     bağlamayı öneriyor. */
  if ((S.cash || 0) < 0) return 'debt';
  /* Bu hafta reklam arasıysa iki tam ekran pencere üst üste binmesin. Hakkın
     reklam gösterilmese de yandığı (adBreakClaim) biliniyor; o sezonun fırsatı
     gidiyor, bir sonrakine kalıyor — ara sezon sonuna ancak arada bir denk
     geliyor. */
  if (S.adb && typeof S.adb === 'object' && S.adb.w === (S.tw || 0)) return 'adbreak';
  if (typeof adsBusy === 'function' && adsBusy()) return 'ads';
  if (typeof modalOpen === 'function' && modalOpen()) return 'modal';
  return '';
}

/* Sezon özeti kapandıktan sonra (showSeasonModal'ın düğmesi). Hak isteğin
   ÖNCESİNDE yazılıyor: Play'in cevabı ne olursa olsun — çizdi, çizmedi, hata —
   o istek sayıldı. Hata durumunda geri vermek, Play'in reddettiği bir kurulumda
   her sezon yeniden denemek olurdu. Sonuç hiçbir yere geri dönmüyor. */
function rvSeasonEnd() {
  const now = Date.now();
  const why = rvWhy(now);
  if (why) return why;
  const st = rvState(now);
  setPref('rv', { n: st.n + 1, at: now, st: false });
  RVS.busy = true;
  const done = () => { RVS.busy = false; };
  try { rvBridge().requestReview().then(done, done); }
  catch (e) { done(); }
  return 'ask';
}

/* Ayarlar satırı. Pencereyi DEĞİL mağaza sayfasını açıyor: Play'in kotası
   dolduysa requestReview() hiçbir şey çizmez ve oyuncu düğmeye basıp hiçbir şey
   olmadığını görür. Mağaza sayfası her zaman açılır. Satır yalnız köprü varken
   çiziliyor — web'de ne açacağı bir Play kaydı var ne de yolu. */
function rvRowHtml() {
  if (!rvBridge()) return '';
  return `<div class="pitem" onclick="rvOpenStore()">
    <div class="pinfo"><div class="pname">${t('rateApp')}</div>
    <div class="psub" style="white-space:normal;line-height:1.45">${t('rateHint')}</div></div>
    <span class="faint">↗</span></div>`;
}
function rvOpenStore() {
  const P = rvBridge();
  if (!P) return Promise.resolve('nobridge');
  const fail = () => { if (typeof toast === 'function') toast(t('rateFail')); return 'fail'; };
  try {
    return P.openAppStore({ androidStorePackageName: RV.store }).then(() => {
      const st = rvState(Date.now());
      setPref('rv', { n: st.n, at: st.at, st: true });
      return 'open';
    }, fail);
  } catch (e) { return Promise.resolve(fail()); }
}
