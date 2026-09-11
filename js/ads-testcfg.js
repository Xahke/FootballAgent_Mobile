'use strict';
/* js/ads-testcfg.js — UMP izin sorgusunun TEST yapılandırması.

   ===== BU DOSYANIN TAMAMI YAYIN İÇİN ETKİSİZDİR =====

   Depodaki bu sürüm null. Yani web, PWA, tek dosya ve Android RELEASE
   yapılarının hepsinde izin sorgusu bugüne kadar olduğu gibi BOŞ seçenekle
   çağrılıyor; bir bölge ya da test cihazı varsayımı kod tarafında yapılmıyor.

   ===== AYRIM NEREDE KURULUYOR =====

   Ayrım bir yoruma ya da bir tercih anahtarına DAYANMIYOR. Android'in kendi
   varyant birleştirmesine dayanıyor:

     android/app/src/main/assets/public/js/ads-testcfg.js   ← bu dosya (cap sync)
     android/app/src/debug/assets/public/js/ads-testcfg.js  ← YALNIZ debug

   Derleme türüne ait kaynak kümesi main'i ezdiği için, debug APK'sında ikinci
   dosya paketleniyor; release paketinde ise ezecek bir dosya olmadığı için bu
   null sürüm gidiyor. İkisi ayrı ayrı üretilebilir ve paketin içi açılıp
   karşılaştırılabilir — iddia ölçülebilir.

   Release tarafına sızmanın yolu, debug kaynak kümesindeki bir dosyayı release
   paketine koymak olurdu; bu da Android'in varyant modelini kırmadan mümkün
   değil.

   ===== NE GEÇEBİLİR, NE GEÇEMEZ =====

   Buradan geçebilen TEK alan debugGeography. Rıza kararını etkileyen hiçbir
   şey — tagForUnderAgeOfConsent, canRequestAds, test cihazı listesi — bu
   dosyadan verilmiyor ve adsTestOpts() tarafından okunmuyor. debugGeography
   yalnız UMP'ye "bu cihazı şu bölgedeymiş gibi değerlendir" diyor; kullanıcının
   formda ne seçtiğini değiştirmiyor ve seçimi bizim adımıza yapmıyor.

   Test cihazı kimliği de VERİLMİYOR: UMP 2.2.0'dan beri emülatörler zaten
   varsayılan test cihazı sayılıyor, dolayısıyla listeye ihtiyaç yok ve gerçek
   bir cihazın kimliğini koda yazmak gerekmiyor. */
const ADS_TESTCFG = null;
