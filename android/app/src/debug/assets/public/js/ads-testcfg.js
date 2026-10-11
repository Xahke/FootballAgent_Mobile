'use strict';
/* android/app/src/debug/assets/public/js/ads-testcfg.js
   YALNIZ DEBUG PAKETİNDE. Release paketine giden sürüm js/ads-testcfg.js'tir
   ve null'dır; ayrımın nasıl kurulduğu orada anlatılıyor.

   Bu dosya, main kaynak kümesindeki aynı adlı varlığı Android'in derleme türü
   önceliğiyle eziyor. Yani "debug'da açık, release'de kapalı" bir bayrak değil:
   release paketinde bu dosya HİÇ YOK.

   Ne yapıyor: UMP'ye cihazı AEA'daymış gibi değerlendirmesini söylüyor
   (debugGeography = EEA). Gerekçesi, AdMob'da yayımlanan Avrupa izin mesajının
   yalnız AEA/BK/İsviçre hedefli olması — test cihazı başka bir bölgede
   göründüğü sürece form hiç çizilmiyor ve akışın o dalı ölçülemiyor.

   Ne YAPMIYOR: rızayı vermiyor, reddetmiyor, varsaymıyor. canRequestAds yine
   yalnız SDK'nın gerçek cevabından geliyor; form yine Google'ın aracı
   tarafından çiziliyor ve kullanıcının seçimi olduğu gibi okunuyor.

   testAds: reklam İSTEKLERİ isTesting ile gidiyor, yani eklenti gerçek birim
   yerine Google'ın örnek birimini istiyor (js/ads.js adsTestAds). Emülatörde
   ve CI'ın debug APK'sında gerçek birime istek atmak, geliştiricinin kendi
   reklamını izlemesi demek olurdu — AdMob bunu geçersiz trafik sayar.

   Test cihazı kimliği de yok: UMP 2.2.0'dan beri emülatörler zaten varsayılan
   test cihazı, bu yüzden gerçek bir cihazın kimliğini depoya yazmak gerekmiyor.

   AdmobConsentDebugGeography.EEA = 1 (@capacitor-community/admob 8.1.0,
   consent/consent-debug-geography.enum) — sayı doğrudan yazılıyor çünkü bu
   dosya eklentinin modül kapsamına erişmiyor. */
const ADS_TESTCFG = { debugGeography: 1, testAds: true };
