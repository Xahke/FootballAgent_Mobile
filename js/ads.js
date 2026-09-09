'use strict';
/* js/ads.js — ödüllü reklam adaptörü + UMP izin akışı
   (@capacitor-community/admob 8.1.0, com.google.android.ump 4.0.0).

   ===== NE OLDUĞU, NE OLMADIĞI =====

   Bu dosya YALNIZCA bir teknik deneme kapsamıdır: Android'de Google'ın ÖRNEK
   (test) uygulama kimliği ve ÖRNEK ödüllü reklam birimiyle çalışır, izin
   akışını kurar ve ödülü js/reward.js'in mevcut hak ve teslimat muhasebesine
   bağlar. Para muhasebesi burada YOK — bu dosya S.cash'e hiç dokunmuyor, tek
   yaptığı doğru anda rwRequest/rwEarned/rwAbandon çağırmak.

   Kapsam dışı ve bilerek yok: mediation, otomatik geçiş reklamı, banner,
   satın alma, gerçek reklam birimi, yaş/hedef kitle bayrağı (
   tagForUnderAgeOfConsent) ve debugGeography/test cihazı yapılandırması.
   requestConsentInfo BOŞ seçenekle çağrılıyor: bir bölge ya da yaş tercihini
   kod tarafında varsaymak, o tercihi kullanıcı adına vermek olurdu.

   Sahte ödül sağlayıcısı, hata ayıklama bayrağı, izin atlama yolu ya da
   canRequestAds'i elle true yapan bir kapı da YOK: hem ödül hem uygunluk
   yalnız SDK'nın gerçek sonucundan geliyor.

   ===== SIRA: İZİN → UYGUNLUK → SDK → REKLAM =====

   Google'ın kendi kurulum belgesi açık: izin, Mobile Ads SDK'sı BAŞLATILMADAN
   ÖNCE toplanmalı (developers.google.com/admob/android/quick-start). Eklentinin
   initialize()'ı bunu kendisi yapmıyor — AdMob.java doğrudan MobileAds.initialize()
   çağırıyor, UMP'ye hiç bakmıyor. Sıralamayı bu yüzden burada kuruyoruz:

     requestConsentInfo()  → her açılışta, izin bilgisini tazele
     showConsentForm()     → loadAndShowConsentFormIfRequired; GEREKMİYORSA
                             hiçbir şey göstermez, "gerekli mi" kapısı SDK'da
     canRequestAds         → TEK karar alanı
     initialize()          → ancak uygunluk true iken
     prepare/show          → ancak düğmeye basınca

   ===== TEK KARAR ALANI: canRequestAds =====

   Kullanıcının formda ne seçtiğini biz yorumlamıyoruz ve status'ü uygunluğa
   çevirmiyoruz. 'OBTAINED' "her amaca izin verildi" demek değildir; 'REQUIRED'
   de tek başına "reklam yasak" demek değildir. Karar tek bir yerde okunuyor:
   adsEligible(). status ve isConsentFormAvailable yalnız tanı amaçlı taşınıyor.

   ===== ÜÇ AYRI DURUM, ÜÇÜNÜ DE KARIŞTIRMAMAK GEREKİYOR =====

     ADS.sdk   Mobile Ads SDK'sının ömrü. Bir kez 'on' olduktan sonra GERİ
               DÖNMEZ: MobileAds.initialize()'ın iptali diye bir şey yok ve
               olmadığı hâlde olmuş gibi yazmak yalan olurdu.
     ADS.cs    İzin anlık görüntüsü — SDK'dan SON BAŞARILI okuma. Bu, "SDK'nın
               şu andaki cevabı" DEĞİL; bir kopya. Eklentide canRequestAds'i tek
               başına okuyan bir çağrı yok, tazelemenin tek yolu
               requestConsentInfo().
     adsReady()  Reklam KAPISI. Yukarıdaki ikisinin ve kilidin birleşimi:
               SDK açık + dinleyiciler kurulu + uygunluk güncel ve true +
               çakışan işlem yok. 'on' olmuş bir SDK kapıyı tek başına açmaz.

   ===== BAYAT UYGUNLUK: ADS.stale =====

   Bir form çağrısından sonra izin durumu değişmiş OLABİLİR ve elimizdeki kopya
   bunu bilmiyor olabilir. Ne yapıldığı, formun ne döndürdüğüne bağlı — hepsinde
   yeniden sorgu YOK, çünkü bazılarında gerek de yok:

     showConsentForm() başarılı  → çözüm yükü ZATEN taze bir okuma; doğrudan
                                   benimseniyor, EK SORGU YAPILMIYOR.
     showConsentForm() hatalı    → ret yalnız "başarısız" diyor, hangi aşamada
                                   olduğunu söylemiyor; "durum değişmedi"
                                   varsayamayız, bu yüzden BİR yenileme.
     showPrivacyOptionsForm()    → YÜK DÖNDÜRMÜYOR, dolayısıyla başarı da hata
                                   da tek başına hiçbir şey söylemiyor: iki
                                   yolda da BİR yenileme.

   Yapılan yenileme düşerse ADS.stale=true: elimizdeki canRequestAds=true artık
   güncel olduğunu bilmediğimiz bir kopyadır ve onunla reklam BAŞLATILMAZ.

   Bu "kullanıcı reddetti" DEĞİLDİR ve öyle yazılmıyor (t('adEligUnknown') ile
   t('adRewardFail') ayrı anahtarlar). Otomatik yeniden deneme döngüsü de yok:
   yenileme gereken yerde tam olarak bir deneme. Toparlanma yolu açık —
   ADS.pors ayrı tutulduğu için "gizlilik seçenekleri" satırı kaybolmuyor ve
   kullanıcı dokunarak yeniden okutabiliyor.

   ===== KARŞILIKLI DIŞLAMA =====

   İzin işlemiyle reklam işlemi aynı anda yürümez, iki yönde de:
     - izin/yenileme sürerken yeni rwRequest/prepare/show başlamaz,
     - reklam hazırlanıyor ya da gösteriliyorken gizlilik formu açılmaz.
   Kilit adsBusy() ile tek yerden okunuyor ve 'ad' hâli ADS.cur'dan türüyor.
   ADS.cur prepareRewardVideoAd()'den ÖNCE kuruluyor, yani YÜKLEME BEKLEMESİ
   de kilidin içinde. Kontroller görünür düğmede değil, FONKSİYON GİRİŞİNDE:
   disabled bir düğme sunum, kapı değil.

   Kilit yalnız bu üç fonksiyonu bağlıyor. Oyun, gezinme ve kayıt hiçbir
   noktada izin akışını beklemiyor: adsInit() açılışta await EDİLMİYOR.

   ===== YÜKLENMİŞ AMA GÖSTERİLMEMİŞ REKLAM VARDIR =====

   prepareRewardVideoAd() çözüldükten sonra eklentinin preparedAds haritasında
   gerçek bir reklam durur. Uygunluk o aralıkta düşerse göstermiyoruz; ama
   8.1.0'da o reklamı haritadan düşürecek bir API YOK — süreç bitene ya da bir
   sonraki gösterime kadar orada kalır. Bunu kurtarılmış gibi sunmuyoruz.

   ===== KAPSAM SINIRI: SIRA BAĞIMLILIĞI =====

   Aşağıdaki ödül akışı, Google'ın KENDİ SUNDUĞU reklamlar için belgelediği
   sıraya dayanıyor: onUserEarnedReward, onAdDismissedFullScreenContent'ten
   ÖNCE çağrılır (developers.google.com/admob/android/rewarded). Mediation'da
   sırayı üçüncü taraf reklam kaynağı belirler ve bu garanti kalkar — bu yüzden
   bu kapsamda mediation yapılandırılmıyor ve gerçek reklam birimine geçilmiyor.

   Ters sıra (önce ödülsüz kapanış, sonra ödül) DESTEKLENMİYOR ve gizlenmiyor:
   o durumda kapanış rwAbandon() ile 'req' kaydını siler, arkasından gelen ödül
   rwEarned()'den 'unknown' alır ve KAYBOLUR. Para yanlış yazılmaz, günün hakkı
   da yanmaz — ama ödül kurtarılmaz. Bunu telafi edecek bir zamanlayıcı
   (grace) eklenmedi: kullanmadığımız mediation için ölçülmemiş bir mekanizma
   kurmak, çözdüğünden fazlasını gizlerdi.

   ===== İKİ AYRI YAŞAM SÜRESİ =====

   Bunları birbirine bağlamak bu tasarımdaki en kolay hatadır, çünkü ikisi de
   "gösterim" gibi görünür ama farklı zamanlarda biter:

     ADS.cur  EKRANDAKİ gösterim — arayüz kilidi ve 'ad' meşguliyeti. İlk
              terminal olayda (kapatma / gösterilemedi / yüklenemedi) temizlenir.
     att      TESLİMAT kaydı — ödülün kaderi. Yalnız closure'larda yaşar ve
              ADS.cur temizlendikten SONRA da yaşamaya devam eder.

   Ödül sonucu handler'ı (adsReward) ADS.cur'u HİÇ OKUMAZ. Okusaydı, reklam
   kapandıktan sonra gelen doğru sonuç "artık ekranda gösterim yok" diye
   düşerdi. Aynı biçimde att.cl (kapanış) ödül işlemesini, att.rw (ödül) da
   kilidin açılmasını engellemiyor.

   ===== KORELASYON: NEYE DAYANIYOR, NEYE DAYANMIYOR =====

   Ödülün doğru gösterime bağlanması UYDURMA bir kimliğe değil, köprünün kendi
   kimliğine dayanıyor: her showRewardVideoAd() çağrısı native-bridge'de
   benzersiz bir callbackId alıyor, MessageHandler o mesaj için ayrı bir
   PluginCall kuruyor, eklenti ödül dinleyicisini O call üzerinde çözüyor ve
   köprü promise'i ilk çözümde siliyor.

   Buna karşılık TERMİNAL OLAYLARIN KİMLİĞİ YOK — onRewardedVideoAdDismissed
   boş bir nesne taşıyor. Hasar sınırlı ve biliniyor: ödeme yolu promise olduğu
   için yanlış ya da çift ödeme imkânsız, olabilecek en kötü şey yeni denemenin
   ödülünün kaybolmasıdır. Global onRewardedVideoAdReward olayı BİLEREK
   dinlenmiyor: kimliksiz olduğu için eski bir gösterimin ödülü yeni bir
   denemeyi etkileyebilirdi.

   ===== ZAMAN AŞIMI YOK =====

   Hiçbir terminal olay gelmezse ADS.cur oturum boyunca dolu kalır ve düğme
   kilitli görünür. Ölçmeden zamanlayıcı koymuyoruz: zaman aşımıyla kilidi açan
   bir kod, yukarıdaki "aynı anda tek gösterim" varsayımını da çökertirdi. */

/* Yalnız TERMİNAL olaylar. Ödül olayı bilerek listede yok (korelasyon notu). */
const ADS_EV = ['onRewardedVideoAdDismissed', 'onRewardedVideoAdFailedToShow',
                'onRewardedVideoAdFailedToLoad'];

const ADS = {
  /* Google'ın yayımladığı ÖRNEK ödüllü reklam birimi (Android). Gerçek birim
     değil ve bu kapsamda gerçek birim kullanılmıyor. Örnek birimler hesaba
     bağlı değildir, bu yüzden ileride gerçek bir uygulama kimliğiyle birlikte
     de kullanılabilirler.
     developers.google.com/admob/android/test-ads */
  unit: 'ca-app-pub-3940256099942544/5224354917',

  /* ===== İZİN ANLIK GÖRÜNTÜSÜ ===== */
  /* SDK'dan son BAŞARILI okuma: {can,status,avail,src,seq}. null = hiç
     okunamadı. src okumanın hangi çağrıdan geldiğini, seq kaçıncı okuma
     olduğunu söyler — hangi kararın hangi okumaya dayandığı tanı için gerekli. */
  cs: null,
  /* Bir form çağrısından sonraki yeniden okuma düştü: elimizdeki değer artık
     "doğrulanamamış". Reklam başlatmaz; ret DEĞİLDİR. */
  stale: false,
  /* Son BİLİNEN privacyOptionsRequirementStatus. cs'nin DIŞINDA duruyor:
     yenileme düştüğünde gizlilik girişi kaybolmamalı, yoksa kullanıcının
     toparlanma yolu kapanır. */
  pors: 'UNKNOWN',
  seq: 0,

  /* ===== SDK ÖMRÜ ===== */
  /* off = hiç başlatılmadı · init = uçuşta · on = başlatıldı (GERİ DÖNMEZ)
     fail = başlatılamadı */
  sdk: 'off',
  sdkP: null,
  /* Kurulmuş dinleyiciler, OLAY BAŞINA. Kısmi başarıda yalnız eksik olan
     tamamlanır; bir olay iki kez bağlanmaz — bağlansaydı adsTerminal her
     bildirimde iki kez koşardı. */
  bnd: null,

  /* ===== KİLİT ===== */
  /* '' | 'consent'. 'ad' hâli ADS.cur'dan türüyor (bkz. adsBusy). */
  busy: '',
  cp: null,
  /* Açılış akışı bir kez koştu mu. adsInit() aynı oturumda ikinci kez
     çağrılırsa yeni bir requestConsentInfo + form denemesi başlatmasın. */
  boot: false,

  /* Ekrandaki gösterim (att) ya da null. Kayda GİRMEZ — CAM/MKQ/SKTAB gibi
     yalnız görünüm durumu. */
  cur: null,
  /* Son ödül sonucunun rwEarned() dönüşü. TANI amaçlı: hiçbir karar buna
     bakmıyor, hiçbir para yolu buradan geçmiyor. */
  lastRw: ''
};

/* ================= EKLENTİ VARLIĞI =================
   Web, PWA ve tek dosya sürümünde Capacitor hiç yoktur; eklentinin JS paketi de
   paketlenmediği için Plugins.AdMob orada oluşmaz. Reklamı kapatmak için ayrı
   bir bayrağa gerek yok — bu kontrol yetiyor ve tek kaynak o. */
function adsBridge() {
  try {
    const C = (typeof Capacitor !== 'undefined' && Capacitor) ? Capacitor
      : ((typeof window !== 'undefined' && window.Capacitor) ? window.Capacitor : null);
    return (C && C.Plugins && C.Plugins.AdMob) || null;
  } catch (e) { return null; }
}
/* Reklam yüzeyi. */
function adsPlugin() {
  const P = adsBridge();
  return (P && typeof P.showRewardVideoAd === 'function'
    && typeof P.prepareRewardVideoAd === 'function') ? P : null;
}
/* İzin yüzeyi AYRI sorgulanıyor: eklenti varsa da izin metotları yoksa
   uygunluk hiç kurulamaz, o zaman reklam da açılmamalı. */
function adsConsentApi() {
  const P = adsBridge();
  return (P && typeof P.requestConsentInfo === 'function'
    && typeof P.showConsentForm === 'function') ? P : null;
}
function adsAvailable() { return !!adsPlugin(); }

/* ================= TÜRETİLMİŞ YÜKLEMLER ================= */
/* Uygunluk: TEK karar. Güncel ve true olmalı; "doğrulanamadı" true saymaz. */
function adsEligible() { return !!(ADS.cs && ADS.cs.can === true && !ADS.stale); }
/* Meşguliyet. 'ad' ADS.cur'dan türüyor, o da prepare'den önce kurulduğu için
   yükleme beklemesini kapsıyor. */
function adsBusy() { return ADS.cur ? 'ad' : ADS.busy; }
function adsBound() {
  if (!ADS.bnd) return false;
  return ADS_EV.every(ev => ADS.bnd[ev] === true);
}
/* REKLAM KAPISI. SDK'nın 'on' olması tek başına yetmez. */
function adsReady() {
  return ADS.sdk === 'on' && adsBound() && adsEligible() && !adsBusy();
}

/* ================= İZİN ================= */
/* Okumayı benimse. privacyOptionsRequirementStatus YALNIZ başarılı okumada
   yazılıyor: düşen bir yenileme onu silmemeli. */
function adsAdopt(info, src) {
  if (!info || typeof info !== 'object') return false;
  ADS.seq++;
  ADS.cs = {
    can: info.canRequestAds === true,
    status: info.status || 'UNKNOWN',
    avail: info.isConsentFormAvailable === true,
    src: src, seq: ADS.seq
  };
  if (info.privacyOptionsRequirementStatus) ADS.pors = info.privacyOptionsRequirementStatus;
  ADS.stale = false;
  return true;
}
/* Tek okuma denemesi. Reddi yutuyor — çağıran taraf ne yapacağına kendi karar
   veriyor (açılışta hiçbir şey, form sonrasında 'doğrulanamadı'). */
function adsAsk(P, src) {
  try { return P.requestConsentInfo({}).then(i => adsAdopt(i, src), () => false); }
  catch (e) { return Promise.resolve(false); }
}
/* Güncel uygunluğu okumanın tek yolu — yalnız formun kendisi taze bir değer
   VERMEDİĞİ yerlerden çağrılıyor. Düşerse uygunluk bayatlıyor. Döngü yok:
   çağrı başına tam olarak bir deneme. */
function adsRefresh(P, src) {
  return adsAsk(P, src || 'refresh').then(ok => { if (!ok) ADS.stale = true; return ok; });
}

/* Açılış izin akışı. TEK uçuş: eşzamanlı çağrılar aynı promise'i paylaşır,
   yoksa iki requestConsentInfo ve iki form denemesi olurdu. */
function adsConsentFlow() {
  const P = adsConsentApi();
  if (!P) return Promise.resolve(false);
  if (adsBusy() === 'ad') return Promise.resolve(false);   // reklam sürerken izin işlemi başlamaz
  if (ADS.cp) return ADS.cp;
  ADS.busy = 'consent';
  const done = r => { ADS.busy = ''; ADS.cp = null; return r; };
  ADS.cp = adsAsk(P, 'boot').then(okBoot => {
    /* Açılış okuması düştüyse elimizde hiçbir değer yok; form denemenin de
       anlamı yok (loadAndShowConsentFormIfRequired güncel bilgi olmadan
       çalışmaz). Bu oturumda uygunluk kurulmuyor, sonraki açılışta yeniden
       denenir — otomatik döngü kurmuyoruz. */
    if (!okBoot) return false;
    /* GEREKMİYORSA hiçbir şey göstermez; "gerekli mi" kapısı SDK'nın kendisinde,
       bizim status'e dallanmamıza gerek yok. Çözüm yükü zaten TAZE bir okuma. */
    return P.showConsentForm().then(
      i => adsAdopt(i, 'form'),
      /* Ret "form gösterilmedi, durum değişmedi" DEMEK DEĞİL: hata hangi
         aşamada olduğunu söylemiyor. Desteklenen yöntemle bir kez yeniden
         okuyoruz; o da düşerse uygunluk doğrulanamamış sayılır. */
      () => adsRefresh(P, 'formfail')
    );
  }).then(done, () => done(false));
  return ADS.cp;
}

/* Gizlilik seçenekleri formu — Ayarlar'daki girişten. showPrivacyOptionsForm()
   YÜK DÖNDÜRMÜYOR (Promise<void>), yani kapanıştan sonra uygunluğu öğrenmenin
   tek yolu yeniden okumak. Bu yüzden yenileme opsiyonel değil, zorunlu. */
function adsPrivacy() {
  const P = adsConsentApi();
  if (!P) return Promise.resolve(false);
  if (adsBusy()) {                       // reklam ya da başka bir izin işlemi sürüyor
    if (typeof toast === 'function') toast(t('adBusy'));
    return Promise.resolve(false);
  }
  ADS.busy = 'consent';
  adsRepaint();                          // satır meşgul görünsün
  const done = r => { ADS.busy = ''; adsApply(); return r; };
  return P.showPrivacyOptionsForm().then(
    () => adsRefresh(P, 'privacy'),
    /* Ret de "hiçbir şey olmadı" sayılmıyor — aynı gerekçe. */
    () => adsRefresh(P, 'privacyfail')
  ).then(done, () => done(false));
}

/* ================= SDK ================= */
/* Dinleyici kurulumu SDK başlatmadan AYRI tekilleştiriliyor: initialize bir kez
   başarılı olsa da addListener çağrılarından biri patlayabilir; o zaman eksik
   olan bir sonraki denemede tamamlanmalı, kurulmuş olan ÇOĞALMAMALI. */
function adsBind(P) {
  if (!P) return;
  if (!ADS.bnd) ADS.bnd = {};
  ADS_EV.forEach(ev => {
    if (ADS.bnd[ev]) return;
    try { P.addListener(ev, adsTerminal); ADS.bnd[ev] = true; } catch (e) {}
  });
}

/* Tek seferlik SDK başlatma.

   initialize()'ın çözülmesi "SDK hazır" demek DEĞİL — eklenti MobileAds'in
   onInitializationComplete'ini beklemeden resolve ediyor. Burada beklediğimiz
   şey SDK'nın hazır olması değil, köprünün eklentiyi tanıması.

   Başarılı bir başlatma GERİ ALINAMAZ: uygunluk bu arada düşse bile sdk 'on'
   kalıyor, çünkü MobileAds gerçekten başlatıldı ve başlatılmamış gibi yazmak
   yalan olurdu. Uygunluğun düşmesinin etkisi başka yerde: adsReady() kapalı
   kalır, yeni reklam isteği başlamaz. */
function adsSdkInit() {
  if (ADS.sdkP) return ADS.sdkP;
  const P = adsPlugin();
  if (!P) { ADS.sdk = 'off'; return Promise.resolve('off'); }
  if (ADS.sdk === 'on') { adsBind(P); return Promise.resolve('on'); }
  ADS.sdk = 'init';
  ADS.sdkP = P.initialize({}).then(() => {
    ADS.sdkP = null;
    ADS.sdk = 'on';
    adsBind(P);
    adsRepaint();
    return 'on';
  }, () => {
    /* Başlatılamadıysa düğme hiç çizilmiyor: her dokunuşta başarısız olacak bir
       düğme göstermek yalan olurdu. sdkP temizleniyor ki kullanıcı kaynaklı bir
       sonraki adsApply() yeniden deneyebilsin — ama kendiliğinden tekrarlayan
       bir döngü yok. */
    ADS.sdkP = null;
    ADS.sdk = 'fail';
    adsRepaint();
    return 'fail';
  });
  return ADS.sdkP;
}

/* Uygunluğu uygulayan TEK nokta. Hem açılış hem gizlilik formu sonrası buradan
   geçiyor, böylece iki yol ayrışamaz.

   false→true: SDK burada başlatılır.
   true→false: yeni istek durur; 'on' olmuş SDK yeniden başlatılmaz ve
               kapatılmaz.
   true→false→true: sdk zaten 'on' olduğu için initialize BİR KEZ kalır. */
function adsApply() {
  if (ADS.sdk === 'on') adsBind(adsPlugin());             // eksik kalmış dinleyici varsa tamamla
  else if (adsEligible() && ADS.sdk !== 'init') adsSdkInit();
  adsRepaint();
}

/* Açılışta bir kez, main.js'ten. BEKLENMİYOR: menü çizimi ve kayıt yüklemesi
   izin akışına takılmamalı.
   Dönüş: 'off' | 'noconsent' | 'ready' | 'fail'. */
function adsInit() {
  if (!adsPlugin()) { ADS.sdk = 'off'; return Promise.resolve('off'); }
  /* Eklenti var ama izin yüzeyi yok: uygunluk kurulamaz, reklam da açılmaz. */
  if (!adsConsentApi()) { ADS.sdk = 'off'; return Promise.resolve('noconsent'); }
  if (ADS.cp) return ADS.cp.then(() => adsSettle());
  /* İkinci çağrı yeni bir izin turu başlatmıyor; yalnız mevcut duruma göre
     uygunluğu uygular ve etiketi döndürür. */
  if (ADS.boot) { adsApply(); return adsSettle(); }
  ADS.boot = true;
  return adsConsentFlow().then(() => adsSettle());
}
/* Akış bittikten sonra uygunluğu uygula ve — başlatma uçuşa geçtiyse — onu da
   bekleyip nihai etiketi döndür. Testler ve main.js tek bir söz görüyor. */
function adsSettle() {
  adsApply();
  return ADS.sdkP ? ADS.sdkP.then(() => adsInitLabel()) : Promise.resolve(adsInitLabel());
}
function adsInitLabel() {
  if (!adsPlugin()) return 'off';
  if (ADS.sdk === 'fail') return 'fail';
  if (ADS.sdk === 'on') return 'ready';
  return adsEligible() ? 'init' : 'noconsent';
}

/* ui.js yüklenmeden önce çağrılabilir (açılış), o yüzden varlığı kontrol
   ediliyor — store.js'in fireSaveHealth() kancasıyla aynı gerekçe. */
function adsRepaint() {
  if (typeof render === 'function') { try { render(); } catch (e) {} }
}

/* ================= DÜĞMELERİN DURUMU =================
   Görünüm ui.js'te; burada yalnız durum var. */
/* Ödül satırı. Dönüş: null = satır hiç çizilmez · 'go' · 'busy' · 'used'.
   Uygunluk kurulmadan ya da SDK açılmadan satır ÇİZİLMİYOR: tutamayacağımız
   bir söz göstermektense hiç göstermemek doğru. */
function adsRowState() {
  if (!adsPlugin()) return null;
  if (ADS.sdk !== 'on' || !adsBound()) return null;
  if (!adsEligible()) return null;
  if (adsBusy()) return 'busy';
  return rwCanClaim() ? 'go' : 'used';
}
/* Ayarlar'daki gizlilik seçenekleri girişi. Yalnız SDK gerekli dediğinde
   çiziliyor; ADS.pors son BİLİNEN değer olduğu için düşen bir yenileme onu
   kaybettirmiyor — kullanıcının toparlanma yolu bu satır. */
function adsPrivacyState() {
  if (!adsConsentApi()) return null;
  if (ADS.pors !== 'REQUIRED') return null;
  if (adsBusy()) return 'busy';
  return 'go';
}

/* ================= AKIŞ ================= */
/* Düğmeye basma anı. rwRequest() gün ve hedef kariyeri BURADA sabitliyor
   (js/reward.js) — 23.59'da başlayıp 00.01'de biten reklam önceki günün
   hakkını kullanır.

   Sıra önemli: hak ÖNCE alınıyor, reklam SONRA yükleniyor. Tersi olsaydı hakkı
   olmayan bir kullanıcıya reklam yüklenir ve boşa bir gösterim harcanırdı.

   Kapılar burada, FONKSİYON GİRİŞİNDE. Düğmenin gizli ya da disabled olması
   sunum; bu satırlar kapı. */
function adsWatch() {
  const P = adsPlugin();
  if (!P) return;
  if (ADS.sdk !== 'on' || !adsBound()) return;
  if (adsBusy()) return;                       // izin işlemi ya da süren gösterim
  if (!adsEligible()) return;                  // uygunluk yok ya da doğrulanamadı
  const nonce = rwRequest();
  if (!nonce) { adsRepaint(); return; }
  const att = { n: nonce, rw: false, cl: false, seq: ADS.cs.seq };
  ADS.cur = att;                               // buradan itibaren adsBusy()==='ad'
  adsRepaint();                                // düğme kilitli görünsün
  P.prepareRewardVideoAd({ adId: ADS.unit, isTesting: true }).then(() => {
    /* adId VERİLMİYOR ve verilmemeli: preparedAds haritası reklamın GERÇEKTEN
       yüklendiği birimle anahtarlanıyor, isTesting altında bu örnek birimdir.
       İstenen id'yi göndermek aramayı boşa düşürür (AdRewardExecutor). */
    if (!adsEligible()) {
      /* Yükleme ile gösterim arasında uygunluk düştü. Kilit sayesinde bu
         aralıkta bir izin işlemi başlayamaz, yine de kapı burada da var.
         Reklam yüklü kaldı ve düşürülemiyor (yukarıdaki not). */
      adsClose(att);                           // rwAbandon'ı adsClose yapıyor
      if (ADS.stale && typeof toast === 'function') toast(t('adEligUnknown'));
      return;
    }
    P.showRewardVideoAd().then(() => adsReward(att), () => {});
  }, () => {
    /* Yükleme başarısız. Eklenti ayrıca FailedToLoad da yayıyor; adsClose
       aynı denemede iki kez çalışmaya karşı korumalı. */
    adsFail(att);
  });
}

/* ===== ÖDÜL — TEK YETKİLİ GİRİŞ =====
   Yalnız gösterime özgü promise'ten çağrılıyor. ADS.cur OKUNMUYOR: reklam
   kapandıktan sonra gelen doğru sonuç düşmemeli.

   rwEarned()'den ÖNCE hiçbir await/mikrogörev olamaz. rwEarned ilk satırında
   kaydı senkron olarak 'earned'a yükseltiyor ve rwAbandon 'earned' kaydı
   silemiyor; desteklenen sırada (ödül önce, kapanış sonra) teslimatı koruyan
   şey tam olarak bu. Araya bir await girerse promosyon bir sonraki mikrogörev
   turuna kayar ve kapanış öne geçer. */
function adsReward(att) {
  if (att.rw) return Promise.resolve('dup');
  att.rw = true;
  return rwEarned(att.n).then(st => {
    ADS.lastRw = st;
    if (st === 'delivered' || st === 'again') {
      if (typeof toast === 'function') toast(t('adRewardOk'));
    }
    /* 'pending'  → hedef kariyer açık değil, rwSync() o kariyer açılınca teslim eder.
       'writefail'/'prefsfail' → kayıt 'earned' kalır, sonraki açılışta yeniden denenir.
       'unknown'  → desteklenmeyen sıra (kapanış önce işlendi); ödül kayıp.
                    Kurtarıldığını iddia etmiyoruz, sessizce geçiyoruz. */
    adsRepaint();
    return st;
  }, e => { ADS.lastRw = 'error'; adsRepaint(); return 'error'; });
}

/* ===== KAPANIŞ — ARAYÜZ KİLİDİ =====
   Terminal olayların kimliği olmadığı için "ekranda ne varsa o" kabul ediliyor.
   ADS.cur boşken gelen sahipsiz bir terminal olay düşürülüyor. */
function adsTerminal() {
  const att = ADS.cur;
  if (!att) return;
  adsClose(att);
}
function adsFail(att) {
  adsClose(att);
  if (typeof toast === 'function') toast(t('adRewardFail'));
}
function adsClose(att) {
  if (!att) return;
  if (ADS.cur === att) ADS.cur = null;   // kilit her hâlükârda açılır
  if (att.cl) return;                    // aynı deneme iki kez kapanmaz
  att.cl = true;
  /* Ödül işlendiyse kayıt 'earned'dır; rwAbandon ona dokunamaz, çağrı sadece
     gereksiz olur. att.rw ödül işlemesini DEĞİL, yalnız bu çağrıyı kapıyor. */
  if (!att.rw) rwAbandon(att.n);
  adsRepaint();
}
