'use strict';
/* js/iap.js — mağazanın ÜRÜN KATALOĞU, KAPSAMI ve satın alma durumu.

   ===== NE OLDUĞU, NE OLMADIĞI =====

   Bu dosya HİÇBİR ŞEY SATMIYOR ve hiçbir hak VERMİYOR. Play Billing köprüsü
   depoda kurulu değil; dolayısıyla burada ne bir satın alma çağrısı, ne bir
   makbuz doğrulaması, ne de "satın alındı" diyen bir yol var. Mağaza ekranı
   ürünleri GÖRÜNÜR kılıyor ve satın almanın neden kullanılamadığını açıkça
   yazıyor — başarılı bir satın alma taklidi yapmıyor.

   Bir bayrağı true yapmak da ücretli hak VERMEZ: hak yalnız aşağıdaki
   DEFTERDEN okunuyor ve deftere yalnız doğrulanmış bir satın alma tokenı
   yazılabilir. Öyle bir yazıcı bugün yok — ne burada, ne başka bir dosyada.

   ===== NEDEN DEFTER, NEDEN SAYAÇ DEĞİL =====

   js/core.js'teki iapCap() yorumu bunu zaten söylüyordu: bir sayı, hangi satın
   alma tokenlarının işlendiğini yeniden kuramaz. "Kapasite +3" yazan bir alan,
   satın almaları geri yükleme (restore) geldiğinde aynı tokenı ikinci kez
   sayıp saymadığını bilemez. Bu yüzden kapasite TÜRETİLİYOR: defterde teslim
   edilmiş tokenlar duruyor, kapasite onların toplamı. S.known ve rakip
   ajansların portföyüyle aynı gerekçe — türetilen şey saklanmaz.

   ===== İKİ KAPSAM, İKİ DEFTER =====

   Kapsam ürünün özelliği, sunumun değil; bu yüzden ürün kaydının kendisinde
   duruyor (sc alanı) ve mağaza ekranı onu okuyup yazıyor.

     'career'  → AÇIK KARİYERE ait. Defter kariyer kaydında (S.iap.t), çünkü
                 kapasite o kariyerin oyuncu müşteri tavanını büyütüyor ve
                 kariyer silinince gitmesi gereken şey bu.
     'device'  → CİHAZDAKİ BÜTÜN KARİYERLERE ait. Defter PREFS.iap.t içinde,
                 tema/dil/doğum yılı ile aynı yerde: kariyer kaydı açık olmadan
                 da (ana menü) okunabilmek zorunda.

   ===== KAPASİTE TAVANI =====

   Kariyer başına satın alınabilecek toplam kapasite artışı IAP.capMax (+10).
   Tavan TEK yerde, iapCapOwned()'ın sonundaki clamp'te: defter bir şekilde
   fazlasını taşısa bile oyuna giren sayı tavanı aşamaz. Mağaza ekranı aynı
   tavanı ayrıca ÇİZİYOR (kalan hak), ama karar orada değil burada.

   KAPASİTE = OYUNCU MÜŞTERİ KAPASİTESİ. Üç kariyer kayıt yuvasıyla (js/saves.js,
   SLOTS) hiçbir ilgisi yok ve olmayacak: yuva sayısı bir depolama biçimi,
   kapasite bir oyun dengesi terimi (core.js maxClients). */

const IAP = {
  /* Play Console'da açılacak ürün kimlikleri. Şimdiden sabit ve kodda tek
     yerde: uygulama planı ile mağaza kaydı aynı dizeyi kullansın, sonradan
     "hangisiydi" sorusu doğmasın. Yayımlandıktan sonra DEĞİŞTİRİLEMEZ. */
  sku: {
    cap1: 'cap_plus_1',
    cap3: 'cap_plus_3',
    cap5: 'cap_plus_5',
    cap10: 'cap_plus_10',
    noads: 'remove_auto_ads'
  },
  /* Kariyer başına satın alınabilecek toplam kapasite artışı. */
  capMax: 10,
  /* Play Billing köprüsünün Capacitor eklenti adı. Eklenti henüz SEÇİLMEDİ ve
     kurulu değil; ad, plan hangi eklentiyi sabitlerse onunla değişecek. */
  plugin: 'InAppPurchase',
  /* Satın alma akışı BAĞLI DEĞİL. Bu bayrak yalnızca REDDEDER — hiçbir hakkı
     açmaz, hiçbir defteri yazmaz. Köprü gerçekten geldiğinde bu satırı
     değiştirmek TEK BAŞINA yetmez: iapBuy()'ın gövdesi de yazılmak zorunda. */
  wired: false
};

/* Ürün kaydı:
     id    iç kimlik (mağaza ekranı ve defter bunu kullanır)
     sku   Play ürün kimliği
     sc    kapsam: 'career' | 'device'
     cap   kaç müşteri kapasitesi ekler (kapasite ürünleri)
     noads otomatik (sezon geçişi) reklamları kapatır mı
     k     başlık çeviri anahtarı (js/i18n.js)
   Ürünün ne yaptığı BURADA duruyor; hiçbir ekran kendi listesini tutmuyor. */
const IAP_PRODUCTS = [
  { id: 'cap1', sku: IAP.sku.cap1, sc: 'career', cap: 1, k: 'shopCap1' },
  { id: 'cap3', sku: IAP.sku.cap3, sc: 'career', cap: 3, k: 'shopCap3' },
  { id: 'cap5', sku: IAP.sku.cap5, sc: 'career', cap: 5, k: 'shopCap5' },
  { id: 'cap10', sku: IAP.sku.cap10, sc: 'career', cap: 10, k: 'shopCap10' },
  { id: 'noads', sku: IAP.sku.noads, sc: 'device', noads: true, k: 'shopNoAds' }
];
function iapById(id) { return IAP_PRODUCTS.find(p => p.id === id) || null; }

/* ================= DEFTER =================
   Biçim: { t: { <satın alma tokenı>: <ürün id> } }. Anahtar tokenın kendisi,
   çünkü aynı ürün birden çok kez satın alınabilir ve ikisini ayıran tek şey
   token. Defter yoksa (bugünkü hâl, ve her eski kayıt) okuma boş küme döner —
   CLAUDE.md'nin "her yeni alan yokken de çalışmalı" kuralı. */
function iapTokens(box) {
  const t = box && box.iap && box.iap.t;
  return (t && typeof t === 'object') ? t : null;
}
/* Defterdeki tokenların gösterdiği ürünler. Tanımadığı bir id sessizce
   düşüyor: ileride kaldırılmış bir ürünün tokenı kayıtta kalabilir. */
function iapOwnedOf(box) {
  const t = iapTokens(box);
  if (!t) return [];
  return Object.keys(t).map(k => iapById(t[k])).filter(Boolean);
}

/* AÇIK KARİYERDE satın alınmış kapasite. core.js iapCap() bunu okuyor ve
   maxClients() de yalnız oradan geçiyor — kapasitenin oyuna girdiği tek yol.
   Tavan burada uygulanıyor (yukarıdaki gerekçe). */
function iapCapOwned() {
  if (typeof S === 'undefined' || !S) return 0;
  const n = iapOwnedOf(S).reduce((s, p) => s + (p.cap || 0), 0);
  return Math.min(n, IAP.capMax);
}
/* Bu kariyerde kalan kapasite hakkı — mağaza ekranı bunu yazıyor. */
function iapCapLeft() { return Math.max(0, IAP.capMax - iapCapOwned()); }

/* CİHAZ kapsamı: otomatik reklamlar kapatılmış mı. Kariyer açık olmasa da
   okunabiliyor, çünkü PREFS ana menüde de var. */
function iapNoAdsOwned() {
  return iapOwnedOf(typeof PREFS === 'undefined' ? null : PREFS).some(p => !!p.noads);
}

/* Bir ürün bu bağlamda zaten alınmış mı. Kapasite ürünleri tekrar alınabilir
   (tavan izin verdiği sürece), reklam kaldırma alınmaz. */
function iapOwned(id) {
  const p = iapById(id);
  if (!p) return false;
  return p.noads ? iapNoAdsOwned() : false;
}

/* ================= SATIN ALMANIN DURUMU =================
   Köprü: kurulu bir faturalandırma eklentisi var mı. Bugün yok, bu yüzden
   null; kontrol yine de gerçek bir sorgu — eklenti geldiğinde burası kendi
   kendine doğruyu söylemeye başlasın diye. */
function iapBridge() {
  try {
    const C = (typeof Capacitor !== 'undefined' && Capacitor) ? Capacitor
      : ((typeof window !== 'undefined' && window.Capacitor) ? window.Capacitor : null);
    const P = (C && C.Plugins && C.Plugins[IAP.plugin]) || null;
    return (P && typeof P.purchase === 'function') ? P : null;
  } catch (e) { return null; }
}
/* Satın alma yapılabilir mi. İKİ koşul birden: akış bağlanmış olacak VE köprü
   bulunacak. Birincisi olmadan ikincisi yetmez — bağlanmamış bir akışta köprü
   bulunsa bile ne doğrulama ne de teslimat kodu var. */
function iapAvailable() { return IAP.wired && !!iapBridge(); }
/* Neden kullanılamıyor — mağaza ekranı bunu kullanıcıya YAZIYOR.
   'nobill'  → faturalandırma bu sürümde bağlı değil (bugünkü hâl)
   'noplay'  → akış bağlı ama bu cihazda köprü yok (web/PWA/tek dosya)
   ''        → kullanılabilir */
function iapWhy() {
  if (!IAP.wired) return 'nobill';
  if (!iapBridge()) return 'noplay';
  return '';
}

/* Bir ürünün BU BAĞLAMDA satın alınabilirliği. Kapsamı ve tavanı da okuyor,
   çünkü "satın alma kapalı" ile "bu kariyerde hakkın kalmadı" farklı iki
   cümle ve kullanıcıya farklı görünmeli.
   Dönüş: 'go' | 'off' | 'full' | 'owned' | 'nocareer'. */
function iapState(id) {
  const p = iapById(id);
  if (!p) return 'off';
  if (p.sc === 'career' && (typeof S === 'undefined' || !S || !S.agent)) return 'nocareer';
  if (iapOwned(id)) return 'owned';
  if (p.cap && p.cap > iapCapLeft()) return 'full';
  return iapAvailable() ? 'go' : 'off';
}

/* Satın alma denemesi. GÖVDESİ BİLEREK BOŞ: akış bağlanmadan bir şey yapmak,
   yapmadığı bir işi yaptığını söylemek olurdu. Defter burada YAZILMIYOR ve
   akış bağlandığında da buradan yazılmayacak — yazma yeri, makbuzu doğrulayan
   teslimat yolu olacak. */
function iapBuy(id) {
  const st = iapState(id);
  if (st === 'go') return false;   // bugün ulaşılamaz: iapAvailable() false
  if (typeof toast === 'function') {
    toast(t(st === 'full' ? 'shopCapFull' : st === 'owned' ? 'shopOwned'
      : st === 'nocareer' ? 'shopNeedCareer' : 'shopOff'));
  }
  return false;
}
