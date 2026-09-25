'use strict';
/* js/main.js — kayıt yönlendirmesi ve başlatma.
   Yuva işlemlerinin kendisi js/saves.js içinde; burada yalnızca oyunun her yerden
   çağırdığı save() ve açılış var. */
/* ================= SAVE ================= */
/* Açık kariyer yoksa (ana menü) yazacak bir şey yok — çağrı sessizce düşer,
   böylece çağıran taraflar curSlot'u kontrol etmek zorunda kalmaz.
   Hâlâ senkron: 25 çağrı yerinin hiçbiri beklemek istemiyor. Gerçek yazma
   arkadan oluyor (js/store.js), başarısızlığı da ekranda görünüyor. */
function save(){if(curSlot&&S)saveToSlot(curSlot);}
/* ================= AÇILIŞ =================
   Menü hemen çiziliyor, kayıtlar arkadan geliyor. Sıra bu: storeInit()'i
   beklemek açılışta boş bir kare bırakırdı, beklemeden boş yuva çizmek ise
   kayıt silinmiş gibi görünürdü — bu yüzden storeReady false iken menü
   "yükleniyor" satırı gösteriyor ve göç bitince yeniden çiziliyor. */
stack=[{v:'menu'}];
render();
storeInit().then(()=>{
  render();
  /* Çakışan bir kayıt başka bir yuvaya kurtarıldıysa kullanıcı bunu bilmeli:
     menüde beklemediği bir kariyer belirdi ve nedeni görünmüyor. */
  if(rescuedCount())toast(t('rescueDone'));
},()=>{render();});

/* Ödüllü reklam adaptörü (js/ads.js). Açılışta bir kez ve şu sırayla: izin
   bilgisi tazeleniyor, gerekiyorsa UMP formu gösteriliyor, canRequestAds
   okunuyor ve Mobile Ads SDK'sı ANCAK uygunluk true ise başlatılıyor —
   Google'ın kurulum belgesi izni SDK başlatmadan önce şart koşuyor, eklentinin
   initialize()'ı ise bunu kendisi yapmıyor.

   BEKLENMİYOR ve beklenmemeli: menü çizimi, gezinme ve kayıt yüklemesi izin
   akışına takılmamalı — çevrimdışı bir cihazda bu akış hiç tamamlanmayabilir.
   Hazır olunca ads.js kendisi yeniden çizdiriyor. Native eklenti yoksa
   (web/PWA/tek dosya) sessizce 'off' dönüyor ve hiçbir şey çizilmiyor. */
adsInit();

/* Play Billing (js/iap.js). Aynı gerekçeyle BEKLENMİYOR: ürün ve hak sorgusu
   ağ üzerinden gidiyor, menü onu bekleyemez. Açılışta yaptığı iş üç şey —
   faturalandırma destekleniyor mu, ürünlerin YERELLEŞTİRİLMİŞ fiyatları, ve
   ödenmiş ama kapanmamış işlemlerin uzlaştırılması. Sorgu başarısız olursa
   hiçbir hak düşmüyor ve satın alma kapalı kalıyor.

   BURADA storeInit() BEKLENMİYOR ve beklenmemeli — ama iapInit()'in içindeki
   ödeme kuyruğu okuması onu kendisi bekliyor (iapqLoad → storeReadyP). İkisi
   ayrı: fiyat sorgusu yerel diskin açılmasına takılmıyor, kuyruk ise arka uç
   seçilmeden okunmuyor. Yukarıdaki satırın storeInit()'i başlatmış olması da
   şart değil; kapı gerekirse kendisi başlatıyor. */
iapInit();

/* Uygulama arkaya alınırken son durumu kuyruğa bırak. Tarayıcı kapanışta
   tamamlanma sözü vermiyor, ama yazmayı başlatmak hiç başlatmamaktan iyi. */
function flushOnHide(){if(curSlot&&S)saveToSlot(curSlot);}
if(typeof document!=='undefined'&&document.addEventListener){
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden')flushOnHide();
  });
}
if(typeof window!=='undefined'&&window.addEventListener)
  window.addEventListener('pagehide',flushOnHide);

/* Çevrimdışı çalışma. file:// ile açıldığında service worker kaydı yapılamaz —
   tek dosya sürümü (dist/menajer.html) zaten kendi kendine yeterli olduğu için sorun değil.
   Capacitor içinde de kaydetmiyoruz: varlıklar zaten uygulamaya gömülü, service worker
   yalnızca güncelleme sonrası eski sürümü servis etme riski getirir. */
if('serviceWorker' in navigator&&location.protocol.startsWith('http')&&!window.Capacitor){
  window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
}
