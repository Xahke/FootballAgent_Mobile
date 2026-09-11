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

   Aşağıdaki yaş kapısı bunların hiçbiri DEĞİL: SDK'ya bir bayrak geçirmiyor,
   izin sorgusunun seçeneklerine dokunmuyor. Yaptığı tek şey, reklam yolunun
   çağrılarını hiç başlatmamak.

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

   ===== YAŞ KAPISI: RIZA UYGUNLUĞUNDAN AYRI =====

   Reklam yolunun önünde ikinci ve BAĞIMSIZ bir kapı var: cihazda saklanan
   doğum yılından türeyen yaş uygunluğu (adsAgeOk). Rıza uygunluğuyla (adsEligible)
   asla aynı fonksiyona konmuyor, çünkü ikisi farklı şeyler: biri kullanıcının
   SDK'ya verdiği izni, diğeri bizim koyduğumuz erişim eşiğini okuyor. İkisini
   birleştirmek, izin sonucunu yaş kararıyla kirletirdi.

   Eşik (AD_AGE_MIN) OYUNUN hedef kitlesi DEĞİL — oyun 13+. Bu sayı yalnız
   ödüllü reklam yolunun açılıp açılmayacağını belirliyor. Beyansız ya da eşik
   altındaki kullanıcı oyunu ve kayıtlarını tam olarak kullanır; yalnız reklam
   ve onun günlük ödülü kapalıdır, yerine başka bir kazanç KONMUYOR.

   Beyan öz beyandır: yaş doğrulaması değil. Yalnız doğum YILI saklanıyor, ay ve
   gün istenmiyor; doğum günü bilinmediği için kişi küçük yaş sayılıyor
   (adsAgeOk'taki karşılaştırma bu yüzden > ile yazıldı).

   ===== SAHİPLİK: ESKİ ZİNCİR YENİYİ EZMEZ =====

   Yaş beyanı bir izin işlemi uçuştayken değişebilir. Giriş kontrolü tek başına
   yetmez, çünkü zincirin her adımı yeni bir native çağrı başlatıyor. İki ayrı
   belirteç var ve ikisi ayrı şeyi koruyor:

     ADS.ageSeq  Beyan her değiştiğinde artıyor. Zincir başlarken yakalanıyor;
                 her asenkron adımdan SONRA, yeni native çağrıdan ÖNCE
                 adsAgeHolds() ile bakılıyor — hem belirteç hem anlık kapı.
     ADS.op      İşlem kimliği. Kilidi ve uçuş sözünü KİMİN tuttuğunu söylüyor.
                 Temizlik yalnız sahibi tarafından yapılıyor (busyOp/cpOp), yoksa
                 geciken eski bir zincir yeni turun kilidini açardı.

   Sahipliği yitirmek uçuştaki native işlemi İPTAL ETMEZ — öyle bir API yok ve
   olmadığı hâlde varmış gibi yazmak yalan olurdu. Yaptığı tek şey bir SONRAKİ
   adımı başlatmamak. Kilit de erken bırakılmıyor: çakışan ikinci bir form
   açılmasın diye, biten zincir kendi done'ında bırakıyor.

   Bu kapı YALNIZ başlatmayı bağlıyor. Doğru bir gösterime ait ödül teslimatı
   (adsReward → rwEarned → rwSync) yaş ya da yaş-seq değişikliğinden ETKİLENMEZ:
   gösterim başlarken kapı açıktı, ödül o gösterime ait ve muhasebe nonce
   üzerinden yürüyor.

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
  /* Açılış akışı TAMAMLANDI mı. "Başladı" değil tamamlandı: yaş değişikliği
     yarıda kesen tek şey ve o hâlde false kalıyor ki sonraki uygun beyan akışı
     baştan koşturabilsin. Tamamlanmış akış ikinci kez koşmuyor. */
  boot: false,
  /* İşlem kimliği ve sahipleri. Temizliği yalnız sahibi yapıyor. */
  op: 0,
  busyOp: 0,
  cpOp: 0,
  /* Yaş beyanı sahiplik sayacı — beyan her yazıldığında/silindiğinde artıyor. */
  ageSeq: 0,

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

/* ================= YAŞ KAPISI =================
   Reklam erişim eşiği. Oyunun hedef kitlesi değil (oyun 13+); bu sayı yalnız
   ödüllü reklam yolunu bağlıyor. */
const AD_AGE_MIN = 18;
/* Cihaz tercihlerindeki anahtarlar. Kariyer kaydına GİRMİYOR: beyan cihaza ait,
   kariyere değil — üç yuva da silinse yerinde kalmalı. */
const AD_BY_KEY = 'adBY';       // doğum yılı (sayı)
const AD_PORS_KEY = 'adPors';   // gizlilik girişi ipucu (1 = gerekli görülmüştü)

/* Saklanan doğum yılı ya da null. Geçersiz, gelecek tarihli, kesirli, metin ya
   da başka türlü bozuk her değer null: bozuk bir tercih dosyası reklam yolunu
   AÇMAMALI, kapatmalı. */
function adsBirthYear() {
  const v = pref(AD_BY_KEY, null);
  if (typeof v !== 'number' || !isFinite(v) || Math.floor(v) !== v) return null;
  const now = new Date().getFullYear();
  if (v > now || v < now - 130) return null;
  return v;
}
/* Yaş uygunluğu. Yalnız YIL saklandığı için doğum gününün geçip geçmediği
   bilinmiyor; fark eşikten BİR FAZLA olmadıkça kapı açılmıyor, yani kişi küçük
   yaş sayılıyor. Bedeli kabul edilmiş bir gecikmedir: 2008 doğumlu kullanıcı
   1 Ocak 2027'de uygun olur. */
function adsAgeOk() {
  const y = adsBirthYear();
  return y !== null && (new Date().getFullYear() - y) > AD_AGE_MIN;
}
/* 'ask' = beyan yok ya da bozuk · 'under' = eşik altı · 'ok' = uygun. */
function adsAgeState() {
  if (adsBirthYear() === null) return 'ask';
  return adsAgeOk() ? 'ok' : 'under';
}
/* Zincir hâlâ sahibi mi VE kapı hâlâ açık mı. İkisi ayrı: birincisi geciken eski
   zinciri, ikincisi anlık durumu yakalıyor. */
function adsAgeHolds(tok) { return ADS.ageSeq === tok && adsAgeOk(); }
/* Beyan değişti. Uygun hâle gelindiyse akış BURADAN tetikleniyor — yarıda kalmış
   bir açılış akışı da böylece baştan koşabiliyor (bkz. ADS.boot).

   Çizim her iki dalda da ÖNCE yapılıyor ve akışın asenkron sonuna bırakılmıyor:
   izin okuması saniyeler sürebilir (çevrimdışı cihazda daha da uzun) ve o süre
   boyunca satırın hâlâ "doğum yılın sorulacak" demesi, kullanıcının az önce
   verdiği beyanın kaydedilmediği anlamına gelirdi. */
function adsAgeApply() {
  ADS.ageSeq++;
  adsRepaint();
  if (adsAgeOk()) adsInit();
}
/* Serbest girdi YALNIZ burada sayıya çevriliyor ve yalnız geçerliyse yazılıyor.
   Ham metin ne saklanıyor ne de bir yere basılıyor. Dönüş: yazıldı mı. */
function adsAgeSet(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!/^[0-9]{4}$/.test(s)) return false;
  const y = parseInt(s, 10), now = new Date().getFullYear();
  if (y > now || y < now - 130) return false;
  setPref(AD_BY_KEY, y);
  adsAgeApply();
  return true;
}
/* Beyanı unut. Bu bir RIZA GERİ ÇEKME DEĞİL: verilmiş UMP rızası olduğu yerde
   kalır ve gizlilik seçenekleri yolu açık kalmaya devam eder (adsPrivacyState). */
function adsAgeClear() {
  delete PREFS[AD_BY_KEY];   // alan gerçekten kalkıyor, null bırakılmıyor
  savePrefs();
  adsAgeApply();
}

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
/* REKLAM KAPISI. SDK'nın 'on' olması tek başına yetmez. Yaş kapısı burada da
   ayrı bir terim: rıza uygunluğunun içine karıştırılmıyor. */
function adsReady() {
  return ADS.sdk === 'on' && adsBound() && adsEligible() && adsAgeOk() && !adsBusy();
}

/* ================= İZİN ================= */
/* Okumayı benimse. privacyOptionsRequirementStatus YALNIZ başarılı okumada
   yazılıyor: düşen bir yenileme onu silmemeli. */
function adsAdopt(info, src, op) {
  if (!info || typeof info !== 'object') return false;
  /* SAHİPLİK: geciken eski bir zincirin okuması yeni durumu EZEMEZ. op verilmişse
     kilidin hâlâ o zincirde olması şart; değilse hiçbir alan yazılmıyor —
     ADS.seq de artmıyor, pors da korunuyor. */
  if (op !== undefined && ADS.busyOp !== op) return false;
  ADS.seq++;
  ADS.cs = {
    can: info.canRequestAds === true,
    status: info.status || 'UNKNOWN',
    avail: info.isConsentFormAvailable === true,
    src: src, seq: ADS.seq
  };
  if (info.privacyOptionsRequirementStatus) adsPorsAdopt(info.privacyOptionsRequirementStatus);
  ADS.stale = false;
  return true;
}
/* Gizlilik girişi ipucu. ADS.pors bellekte, PREFS'teki iz ise SOĞUK AÇILIŞ için:
   yaş kapısı kapalıyken açılışta hiç okuma yapılmadığından bellekteki değer
   'UNKNOWN' kalır ve satır kaybolurdu — verilmiş rızayı yönetme yolu kapanırdı.

   İz YALNIZ bir ipucudur: rızanın ya da reklam uygunluğunun otoritesi değil,
   kopyası da değil. Yalnız başarılı bir SDK okumasının AÇIK sonucuyla değişir —
   hata, çevrimdışılık ya da 'UNKNOWN' onu SİLMEZ, çünkü bunlar "artık gerekli
   değil" demek değildir. Hata metnini ayrıştırıp karar vermek de yok. */
function adsPorsAdopt(v) {
  ADS.pors = v;
  if (v === 'REQUIRED') setPref(AD_PORS_KEY, 1);
  else if (v === 'NOT_REQUIRED') { delete PREFS[AD_PORS_KEY]; savePrefs(); }
}
/* Gizlilik girişi gerekli mi? Bu oturumda başarılı okuma varsa ONA, yoksa
   PREFS'teki ize bakılıyor. */
function adsPorsRequired() {
  if (ADS.pors === 'REQUIRED') return true;
  if (ADS.pors === 'UNKNOWN') return pref(AD_PORS_KEY, 0) === 1;
  return false;
}
/* Tek okuma denemesi. Reddi yutuyor — çağıran taraf ne yapacağına kendi karar
   veriyor (açılışta hiçbir şey, form sonrasında 'doğrulanamadı'). */
function adsAsk(P, src, op) {
  try { return P.requestConsentInfo({}).then(i => adsAdopt(i, src, op), () => false); }
  catch (e) { return Promise.resolve(false); }
}
/* Güncel uygunluğu okumanın tek yolu — yalnız formun kendisi taze bir değer
   VERMEDİĞİ yerlerden çağrılıyor. Düşerse uygunluk bayatlıyor. Döngü yok:
   çağrı başına tam olarak bir deneme. */
function adsRefresh(P, src, op) {
  return adsAsk(P, src || 'refresh', op).then(ok => { if (!ok) ADS.stale = true; return ok; });
}

/* Açılış izin akışı. TEK uçuş: eşzamanlı çağrılar aynı promise'i paylaşır,
   yoksa iki requestConsentInfo ve iki form denemesi olurdu. */
function adsConsentFlow() {
  const P = adsConsentApi();
  if (!P) return Promise.resolve(false);
  if (adsBusy() === 'ad') return Promise.resolve(false);   // reklam sürerken izin işlemi başlamaz
  if (ADS.cp) return ADS.cp;
  const op = ++ADS.op, tok = ADS.ageSeq;
  ADS.busy = 'consent'; ADS.busyOp = op;
  /* Temizliği YALNIZ sahibi yapıyor: geciken eski bir zincir yeni turun kilidini
     açamaz, uçuş sözünü de silemez. adsClose()'daki deyimin aynısı. */
  const done = r => {
    if (ADS.busyOp === op) { ADS.busy = ''; ADS.busyOp = 0; }
    if (ADS.cpOp === op) { ADS.cp = null; ADS.cpOp = 0; }
    return r;
  };
  ADS.cpOp = op;
  ADS.cp = adsAsk(P, 'boot', op).then(okBoot => {
    /* Okuma sürerken beyan değiştiyse bir SONRAKİ native adım başlamıyor.
       Uçuşta olan işlem iptal edilmiyor — öyle bir API yok — ve kilit erken
       bırakılmıyor ki çakışan bir form açılmasın. */
    if (!adsAgeHolds(tok)) return 'abort';
    /* Açılış okuması düştüyse elimizde hiçbir değer yok; form denemenin de
       anlamı yok (loadAndShowConsentFormIfRequired güncel bilgi olmadan
       çalışmaz). Bu oturumda uygunluk kurulmuyor, sonraki açılışta yeniden
       denenir — otomatik döngü kurmuyoruz. */
    if (!okBoot) return false;
    /* GEREKMİYORSA hiçbir şey göstermez; "gerekli mi" kapısı SDK'nın kendisinde,
       bizim status'e dallanmamıza gerek yok. Çözüm yükü zaten TAZE bir okuma. */
    return P.showConsentForm().then(
      i => adsAdopt(i, 'form', op),
      /* Ret "form gösterilmedi, durum değişmedi" DEMEK DEĞİL: hata hangi
         aşamada olduğunu söylemiyor. Desteklenen yöntemle bir kez yeniden
         okuyoruz; o da düşerse uygunluk doğrulanamamış sayılır.

         Ama yenileme de bir native çağrı: form ekrandayken beyan değişmiş
         olabilir, o yüzden kapı ve sahiplik burada YENİDEN okunuyor — reklam
         amaçlı bu zincirde her yeni native adımın önünde aynı kontrol var.

         Yenilemeyi atlamak, elimizdeki eski canRequestAds kopyasını "hâlâ
         geçerli" saymak DEĞİL: uygunluk bayat işaretleniyor (adsEligible false)
         ve akış tamamlanmamış sayılıyor ('abort' → ADS.boot false), böylece
         sonraki uygun beyan güncel bir izin akışından geçiyor. Kullanıcının
         kendi açtığı gizlilik yönetimi yolu bundan etkilenmiyor: adsPrivacy()
         ayrı bir giriş ve yaş kapısına bakmıyor. */
      () => {
        if (!adsAgeHolds(tok)) { ADS.stale = true; return 'abort'; }
        return adsRefresh(P, 'formfail', op);
      }
    );
  }).then(
    /* boot YALNIZ tamamlanmış akış için işaretleniyor. Yaş değişikliği kestiyse
       false kalıyor ve sonraki uygun beyan akışı BAŞTAN koşturuyor. Okuma hatası
       tamamlanma sayılıyor — bugünkü davranış: aynı oturumda döngü kurulmuyor. */
    r => { if (r !== 'abort') ADS.boot = true; return done(r); },
    () => { ADS.boot = true; return done(false); }
  );
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
  const op = ++ADS.op;
  ADS.busy = 'consent'; ADS.busyOp = op;
  adsRepaint();                          // satır meşgul görünsün
  const done = r => {
    if (ADS.busyOp === op) { ADS.busy = ''; ADS.busyOp = 0; }
    /* adsApply() reklam BAŞLATMAZ: SDK yalnız rıza VE yaş uygunken kuruluyor.
       Yaş kapısı kapalıyken bu yol yalnız rızayı yönetir. */
    adsApply();
    return r;
  };
  /* SOĞUK AÇILIŞ ÖN OKUMASI. Yaş kapısı kapalıyken açılışta hiç okuma yapılmıyor,
     dolayısıyla UMP'nin bu süreçteki gizlilik durumu kurulmamış oluyor; forma
     doğrudan gitmek başarısız olurdu. Bu okuma KULLANICI dokunuşuyla başlıyor,
     açılışta değil, ve tek denemedir. */
  const pre = ADS.cs ? Promise.resolve(true) : adsRefresh(P, 'privacypre', op);
  return pre.then(ok => {
    /* Okuma tuttuysa artık AÇIK bir sonucumuz var. Gizlilik girişi gerekmiyorsa
       formu hiç denemiyoruz: satır zaten kaybolacak. Bu karar başarılı okumadan
       geliyor, hata metninden değil. */
    if (ok && !adsPorsRequired()) {
      if (typeof toast === 'function') toast(t('adPrivacyNot'));
      return false;
    }
    /* Okuma düştüyse forma gitmiyoruz — güncel bilgi olmadan çalışmaz — ve izi
       SİLMİYORUZ: hata "artık gerekli değil" demek değildir. */
    if (!ok) {
      if (typeof toast === 'function') toast(t('adPrivacyFail'));
      return false;
    }
    return P.showPrivacyOptionsForm().then(
      () => adsRefresh(P, 'privacy', op),
      /* Ret de "hiçbir şey olmadı" sayılmıyor — aynı gerekçe. */
      () => adsRefresh(P, 'privacyfail', op)
    );
  }).then(done, () => done(false));
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
  else if (adsEligible() && adsAgeOk() && ADS.sdk !== 'init') adsSdkInit();
  adsRepaint();
}

/* Açılışta bir kez, main.js'ten. BEKLENMİYOR: menü çizimi ve kayıt yüklemesi
   izin akışına takılmamalı.
   Dönüş: 'off' | 'noage' | 'noconsent' | 'ready' | 'fail'. */
function adsInit() {
  if (!adsPlugin()) { ADS.sdk = 'off'; return Promise.resolve('off'); }
  /* Eklenti var ama izin yüzeyi yok: uygunluk kurulamaz, reklam da açılmaz. */
  if (!adsConsentApi()) { ADS.sdk = 'off'; return Promise.resolve('noconsent'); }
  /* YAŞ KAPISI — reklam yolunun İLK native çağrısından önce. Beyan yoksa ya da
     eşiğin altındaysa açılış izin okuması da initialize de yapılmıyor.
     ADS.boot burada İŞARETLENMİYOR: sonraki uygun beyan akışı baştan koşmalı. */
  if (!adsAgeOk()) return Promise.resolve('noage');
  /* Uçuştaki bir akışa katılıyoruz. O akış yaş değişikliğiyle YARIDA kesilmiş
     olabilir; kesilen akış kilidini uçuştaki native çağrı bitmeden bırakmıyor,
     bu yüzden yeni tur ancak burada, beklenen söz çözüldükten sonra açılabilir
     (bkz. adsResume). */
  if (ADS.cp) return ADS.cp.then(() => adsResume());
  /* İkinci çağrı yeni bir izin turu başlatmıyor; yalnız mevcut duruma göre
     uygunluğu uygular ve etiketi döndürür. Yarıda kesilmiş bir akıştan sonra
     boot false kaldığı için buraya düşülmez ve akış yeniden koşar. */
  if (ADS.boot) { adsApply(); return adsSettle(); }
  return adsConsentFlow().then(() => adsSettle());
}
/* Beklenen akış bittikten SONRAKİ karar. Eski zincir kendi kilidini bıraktıktan
   sonra çalışıyor; o zincir yaş değişikliğiyle kesilmişse ADS.boot false kalır
   ve gereken izin akışı hiç koşmamıştır. Bu durumda — ve yalnız bu durumda —
   tek bir yeni tur açılıyor. Olmasaydı, okuma uçuştayken beyanını düzelten
   kullanıcı o oturumda izin ekranını hiç göremez, reklam satırı da açıklamasız
   kaybolurdu; toparlanma ancak uygulama yeniden açılınca gelirdi.

   DÖNGÜ OLMUYOR, çünkü ADS.boot'u false bırakan tek şey yaş kesintisi: ağ ya da
   form hatası akışı TAMAMLANMIŞ sayıyor (boot = true) ve buradan bir daha tur
   açılmıyor. Yeni tur ancak kullanıcı beyanını bir kez daha değiştirirse doğar.

   TEKİLLİK adsConsentFlow'un kendi ADS.cp kapısından geliyor: aynı eski sözü
   bekleyen birden çok çağrı uyandığında ilki turu açıyor, kalanları aynı sözü
   alıyor — ikinci bir requestConsentInfo, ikinci bir form, ikinci bir
   initialize ya da çoğalan dinleyici olmuyor. */
function adsResume() {
  /* Kullanıcı bu arada kapıyı yeniden kapattıysa yeni tur YOK. */
  if (!adsPlugin() || !adsConsentApi() || !adsAgeOk()) return adsSettle();
  if (ADS.boot) return adsSettle();
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
  if (!adsAgeOk()) return 'noage';
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
  /* Yaş kapısı SDK'dan ÖNCE okunuyor: beyan istenen hâlde SDK zaten hiç
     başlatılmadığı için aşağıdaki koşullara düşülse satır hiç çizilmez ve
     kullanıcı soruya ulaşamazdı. */
  const ag = adsAgeState();
  if (ag === 'ask') return 'age';       // nötr beyan ekranına giriş
  if (ag === 'under') return 'noage';   // nötr bilgi; yükseltme daveti YOK
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
  /* Yaş kapısına BAKMIYOR. Beyanı silmek rızayı geri çekmek değil: verilmiş
     rızayı yönetme yolu, reklam yolu kapalıyken de açık kalmalı. Soğuk açılışta
     bellekte okuma olmadığı için PREFS'teki ipucu devreye giriyor. */
  if (!adsPorsRequired()) return null;
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
  if (!adsAgeOk()) return;                     // yaş kapısı — rızadan AYRI terim
  const nonce = rwRequest();
  if (!nonce) { adsRepaint(); return; }
  const att = { n: nonce, rw: false, cl: false, seq: ADS.cs.seq, ageSeq: ADS.ageSeq };
  ADS.cur = att;                               // buradan itibaren adsBusy()==='ad'
  adsRepaint();                                // düğme kilitli görünsün
  P.prepareRewardVideoAd({ adId: ADS.unit, isTesting: true }).then(() => {
    /* adId VERİLMİYOR ve verilmemeli: preparedAds haritası reklamın GERÇEKTEN
       yüklendiği birimle anahtarlanıyor, isTesting altında bu örnek birimdir.
       İstenen id'yi göndermek aramayı boşa düşürür (AdRewardExecutor). */
    if (!adsEligible() || !adsAgeHolds(att.ageSeq)) {
      /* Yükleme ile gösterim arasında uygunluk ya da yaş kapısı düştü. Kilit
         sayesinde bu aralıkta bir izin işlemi başlayamaz, yine de kapı burada
         da var. Reklam yüklü kaldı ve düşürülemiyor (yukarıdaki not).
         Günün hakkı adsClose → rwAbandon ile iade ediliyor: yanmıyor. */
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
   turuna kayar ve kapanış öne geçer.

   YAŞ KONTROLÜ YOK ve olmamalı: gösterim başlarken kapı açıktı, ödül o
   gösterime ait ve muhasebe nonce üzerinden yürüyor. Yaş ya da yaş-seq
   değişikliği burada bir veto olsaydı, kazanılmış bir ödül düşerdi — kapı
   BAŞLATMAYI bağlıyor, teslimatı değil. Aynı gerekçeyle rwSync() de bir sonraki
   açılışta kapı kapalıyken beklemedeki kaydı teslim eder. */
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
