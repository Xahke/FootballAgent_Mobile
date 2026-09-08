'use strict';
/* js/ads.js — ödüllü reklam adaptörü (@capacitor-community/admob).

   ===== NE OLDUĞU, NE OLMADIĞI =====

   Bu dosya YALNIZCA bir teknik deneme kapsamıdır: Android'de Google'ın ÖRNEK
   (test) ödüllü reklam birimini oynatıp sonucunu js/reward.js'in mevcut hak ve
   teslimat muhasebesine bağlar. Para muhasebesi burada YOK — bu dosya S.cash'e
   hiç dokunmuyor, tek yaptığı doğru anda rwRequest/rwEarned/rwAbandon çağırmak.

   Kapsam dışı ve bilerek yok: mediation, otomatik geçiş reklamı, banner,
   satın alma, UMP izin akışı, gerçek reklam birimi. Sahte ödül sağlayıcısı,
   hata ayıklama bayrağı ya da kullanıcının açabileceği bir test yolu da yok:
   ödül yalnız SDK'nın gerçek sonucundan geliyor.

   ===== KAPSAM SINIRI: SIRA BAĞIMLILIĞI =====

   Aşağıdaki akış, Google'ın KENDİ SUNDUĞU reklamlar için belgelediği sıraya
   dayanıyor: onUserEarnedReward, onAdDismissedFullScreenContent'ten ÖNCE
   çağrılır (developers.google.com/admob/android/rewarded). Mediation'da sırayı
   üçüncü taraf reklam kaynağı belirler ve bu garanti kalkar — bu yüzden bu
   kapsamda mediation yapılandırılmıyor ve gerçek reklam birimine geçilmiyor.

   Ters sıra (önce ödülsüz kapanış, sonra ödül) DESTEKLENMİYOR ve gizlenmiyor:
   o durumda kapanış rwAbandon() ile 'req' kaydını siler, arkasından gelen ödül
   rwEarned()'den 'unknown' alır ve KAYBOLUR. Para yanlış yazılmaz, günün hakkı
   da yanmaz — ama ödül kurtarılmaz. Bunu telafi edecek bir zamanlayıcı
   (grace) eklenmedi: kullanmadığımız mediation için ölçülmemiş bir mekanizma
   kurmak, çözdüğünden fazlasını gizlerdi.

   ===== İKİ AYRI YAŞAM SÜRESİ =====

   Bunları birbirine bağlamak bu tasarımdaki en kolay hatadır, çünkü ikisi de
   "gösterim" gibi görünür ama farklı zamanlarda biter:

     ADS.cur  EKRANDAKİ gösterim — yalnızca arayüz kilidi. İlk terminal olayda
              (kapatma / gösterilemedi / yüklenemedi) temizlenir.
     att      TESLİMAT kaydı — ödülün kaderi. Yalnız closure'larda yaşar ve
              ADS.cur temizlendikten SONRA da yaşamaya devam eder.

   Ödül sonucu handler'ı (adsReward) ADS.cur'u HİÇ OKUMAZ. Okusaydı, reklam
   kapandıktan sonra gelen doğru sonuç "artık ekranda gösterim yok" diye
   düşerdi. Aynı biçimde att.cl (kapanış) ödül işlemesini, att.rw (ödül) da
   kilidin açılmasını engellemiyor. Tek çapraz okuma şurada: kapanış, ödül
   görülmüşse rwAbandon çağırmıyor — kayıt zaten 'earned' olduğu için
   rwAbandon ona dokunamazdı, çağrı sadece gereksiz olurdu.

   ===== KORELASYON: NEYE DAYANIYOR, NEYE DAYANMIYOR =====

   Ödülün doğru gösterime bağlanması UYDURMA bir kimliğe değil, köprünün kendi
   kimliğine dayanıyor: her showRewardVideoAd() çağrısı native-bridge'de
   benzersiz bir callbackId alıyor, MessageHandler o mesaj için ayrı bir
   PluginCall kuruyor, eklenti ödül dinleyicisini O call üzerinde çözüyor ve
   köprü promise'i ilk çözümde siliyor. Yani "bu ödül bu gösterime ait" bilgisi
   promise'in kendisinde; att da o promise'in closure'ında taşınıyor.

   Buna karşılık TERMİNAL OLAYLARIN KİMLİĞİ YOK — onRewardedVideoAdDismissed
   boş bir nesne taşıyor. Bir gösterim için ikinci bir terminal olay yayılır VE
   kullanıcı bu arada yeni bir gösterim başlatmışsa, eski olay yenisini
   kapatabilir. Bu kapsamda çözülmüyor; hasarı sınırlı ve biliniyor: ödeme yolu
   promise olduğu için yanlış ya da çift ödeme imkânsız, olabilecek en kötü şey
   yeni denemenin ödülünün kaybolmasıdır.

   Global onRewardedVideoAdReward olayı BİLEREK dinlenmiyor. Ne ödeme yolu ne
   de iptal vetosu olarak: kimliksiz olduğu için eski bir gösterimin ödülü yeni
   bir denemeyi etkileyebilirdi.

   ===== ZAMAN AŞIMI YOK =====

   Hiçbir terminal olay gelmezse ADS.cur oturum boyunca dolu kalır ve düğme
   kilitli görünür. Ölçmeden zamanlayıcı koymuyoruz: zaman aşımıyla kilidi açan
   bir kod, yukarıdaki "aynı anda tek gösterim" varsayımını da çökertirdi. */

const ADS = {
  /* Google'ın yayımladığı ÖRNEK ödüllü reklam birimi (Android). Gerçek birim
     değil ve bu kapsamda gerçek birim kullanılmıyor.
     developers.google.com/admob/android/test-ads */
  unit: 'ca-app-pub-3940256099942544/5224354917',
  /* off = native eklenti yok (web/PWA/tek dosya) ya da henüz başlatılmadı
     init = initialize() uçuşta · ready = dinleyiciler kuruldu · fail = kurulamadı */
  st: 'off',
  /* Ekrandaki gösterim (att) ya da null. Kayda GİRMEZ — CAM/MKQ/SKTAB gibi
     yalnız görünüm durumu. */
  cur: null,
  /* Son ödül sonucunun rwEarned() dönüşü. TANI amaçlı: hiçbir karar buna
     bakmıyor, hiçbir para yolu buradan geçmiyor. Cihazda hangi sıranın
     gerçekleştiğini ölçmek ve testte "ödül işlendi mi" sorusunu cevaplamak
     için var. */
  lastRw: ''
};

/* Native eklenti burada mı? Web, PWA ve tek dosya sürümünde Capacitor hiç
   yoktur; eklentinin JS paketi de paketlenmediği için Plugins.AdMob orada
   oluşmaz. Reklamı kapatmak için ayrı bir bayrağa gerek yok — bu kontrol
   yetiyor ve tek kaynak o. */
function adsPlugin() {
  try {
    const C = (typeof Capacitor !== 'undefined' && Capacitor) ? Capacitor
      : ((typeof window !== 'undefined' && window.Capacitor) ? window.Capacitor : null);
    const P = C && C.Plugins && C.Plugins.AdMob;
    return (P && typeof P.showRewardVideoAd === 'function'
      && typeof P.prepareRewardVideoAd === 'function') ? P : null;
  } catch (e) { return null; }
}
function adsAvailable() { return !!adsPlugin(); }

/* Açılışta bir kez, main.js'ten. Sıra bilerek bu ve önemli:
   1) SDK başlat, 2) dinleyicileri kur, 3) ancak bundan sonra reklam yüklenebilir.
   Dinleyiciler gösterim başına değil, ÖMÜRDE BİR KEZ kuruluyor: gösterim başına
   kurulsaydı bir öncekinin dinleyicisi hayatta kalıp yeni gösterime karışırdı.

   initialize()'ın çözülmesi "SDK hazır" demek DEĞİL — eklenti MobileAds'in
   onInitializationComplete'ini beklemeden resolve ediyor. Burada beklediğimiz
   şey SDK'nın hazır olması değil, köprünün eklentiyi tanıması. */
function adsInit() {
  const P = adsPlugin();
  if (!P) { ADS.st = 'off'; return Promise.resolve('off'); }
  if (ADS.st !== 'off') return Promise.resolve(ADS.st);
  ADS.st = 'init';
  return P.initialize({}).then(() => {
    adsBind(P);
    ADS.st = 'ready';
    adsRepaint();
    return 'ready';
  }, () => {
    /* Başlatılamadıysa düğme hiç çizilmiyor: her dokunuşta başarısız olacak bir
       düğme göstermek yalan olurdu. */
    ADS.st = 'fail';
    adsRepaint();
    return 'fail';
  });
}
/* Yalnız TERMİNAL olaylar dinleniyor. Ödül olayı bilerek listede yok
   (yukarıdaki korelasyon notu). */
function adsBind(P) {
  ['onRewardedVideoAdDismissed', 'onRewardedVideoAdFailedToShow', 'onRewardedVideoAdFailedToLoad']
    .forEach(ev => { try { P.addListener(ev, adsTerminal); } catch (e) {} });
}
/* ui.js yüklenmeden önce çağrılabilir (açılış), o yüzden varlığı kontrol
   ediliyor — store.js'in fireSaveHealth() kancasıyla aynı gerekçe. */
function adsRepaint() {
  if (typeof render === 'function') { try { render(); } catch (e) {} }
}

/* ================= DÜĞMENİN DURUMU =================
   Dönüş: null = satır hiç çizilmez · 'go' · 'busy' · 'used'.
   Görünüm ui.js'te (adsRowHtml); burada yalnız durum var. */
function adsRowState() {
  if (!adsAvailable() || ADS.st === 'fail') return null;
  if (ADS.cur || ADS.st !== 'ready') return 'busy';
  return rwCanClaim() ? 'go' : 'used';
}

/* ================= AKIŞ ================= */
/* Düğmeye basma anı. rwRequest() gün ve hedef kariyeri BURADA sabitliyor
   (js/reward.js) — 23.59'da başlayıp 00.01'de biten reklam önceki günün
   hakkını kullanır.

   Sıra önemli: hak ÖNCE alınıyor, reklam SONRA yükleniyor. Tersi olsaydı hakkı
   olmayan bir kullanıcıya reklam yüklenir ve boşa bir gösterim harcanırdı. */
function adsWatch() {
  if (!adsAvailable() || ADS.st !== 'ready' || ADS.cur) return;
  const nonce = rwRequest();
  if (!nonce) { adsRepaint(); return; }
  const att = { n: nonce, rw: false, cl: false };
  ADS.cur = att;
  adsRepaint();                       // düğme kilitli görünsün
  const P = adsPlugin();
  P.prepareRewardVideoAd({ adId: ADS.unit, isTesting: true }).then(() => {
    /* adId VERİLMİYOR ve verilmemeli: preparedAds haritası reklamın GERÇEKTEN
       yüklendiği birimle anahtarlanıyor, isTesting altında bu örnek birimdir.
       İstenen id'yi göndermek aramayı boşa düşürür (AdRewardExecutor). */
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
