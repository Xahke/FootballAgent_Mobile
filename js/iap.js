'use strict';
/* js/iap.js — mağazanın ÜRÜN KATALOĞU, KAPSAMI ve Play Billing akışı.

   ===== NE OLDUĞU, NE OLMADIĞI =====

   Burada gerçek bir satın alma akışı var: @capgo/native-purchases (8.7.0,
   Play Billing 8.3.0) üzerinden ürün sorgulanıyor, satın alınıyor, hak teslim
   ediliyor ve ancak ONDAN SONRA consume/acknowledge yapılıyor.

   SUNUCU YOK, KULLANICI HESABI YOK. Bunun iki sonucu var ve ikisi de gizlenmiyor:

     1) DOĞRULAMA KRİPTOGRAFİK DEĞİL. Elimizdeki tek kontrol, Play'in döndürdüğü
        purchaseState'in PURCHASED olması ve tokenın kendi defterimizde daha önce
        görülmemiş olması. Bu "makbuz doğrulaması" DEĞİLDİR; değiştirilmiş bir
        istemciye karşı koruma sağlamaz. Hiçbir yorumda, hiçbir dizede bu
        "doğrulanmış" diye adlandırılmıyor. İstemcide gizli anahtar da yok —
        olsaydı zaten gizli olmazdı.
     2) TÜKETİLMİŞ ÜRÜNÜN İADESİ TAKİP EDİLEMİYOR. Play, iade edilen satın almayı
        getPurchases() sonucundan düşürüyor; tüketilmiş bir paket zaten orada
        değil. Sunucu (RTDN / Voided Purchases) olmadan bu fark görülemez.

   Kabul edilen bu iki sınır, EKSİK TESLİMATA ya da KAYBOLAN ÖDEME KAYDINA izin
   vermez — dosyanın geri kalanı büyük ölçüde bunun için var.

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
   kapasite bir oyun dengesi terimi (core.js maxClients).

   ===== ÜÇ KALICI YAPI =====

     S.iap.t   teslim edilmiş tokenlar → ürün id. Kapasitenin kaynağı.
     S.iap.r   REZERVASYONLAR: {att: {cap, at, tok}}. Ödeme BAŞLAMADAN önce
               yazılıyor, teslimatla AYNI yazmada siliniyor — böylece aynı
               kapasite bir an bile iki kez sayılmıyor.
     iapq      cihaz genelinde ödenmiş-ama-kapanmamış işlemler (js/store.js'te
               kendi anahtarı). Kariyer silinse de DURUYOR; ücretli bir işlem
               kaydı hiçbir yolda silinerek kaybedilmiyor.

   ===== SIRA, VE NEDEN BU SIRA =====

     rezervasyon yaz → (doğrula) → purchaseProduct → PURCHASED mi →
     hedef kariyeri çöz → hakkı YAZ → (tanıkla doğrula) → consume/ack → kapat

   Acknowledge/consume en sonda, çünkü Play onaylanan satın almayı ödenmiş
   sayar: arada bir çökme olsaydı Play "teslim edildi" derken defter boş
   kalırdı.

   TERS YÖNDE DE RİSK VAR ve bu sıra onu ortadan kaldırmıyor, yalnız YERİNİ
   değiştiriyor: hak yazıldıktan sonra consume/ack başarısız olursa hak ile
   ödemenin durumu AYRIŞABİLİR. Play, onaylanmayan satın almayı kendi kurallarına
   göre iade edebilir; bu olduğunda kullanıcıda teslim edilmiş bir hak ile iade
   edilmiş bir ödeme aynı anda bulunur ve sunucusuz mimaride bunu FARK EDEMEYİZ
   (tüketilmiş token zaten getPurchases()'ta dönmüyor). Bu ayrışmayı daraltan
   şey kapanışın ısrarla yeniden denenmesi; ortadan kaldıran bir şey yok.

   ===== EKLENTİNİN ÜÇ YOLU (8.7.0 KAYNAĞINDA DOĞRULANDI) =====

     purchaseProduct({isConsumable:false, autoAcknowledgePurchases:false})
       → hiçbir şeyi kendiliğinden bitirmiyor. BİZ bitiriyoruz.
     getPurchases()
       → saf sorgu; hiçbir şeyi acknowledge/consume etmiyor. Uzlaştırma yolu bu.
     restorePurchases()
       → processUnfinishedPurchases() → handlePurchases() içinde autoAcknowledge
         BAYRAĞINA BAKMADAN acknowledge ediyor (decide(false, purchase)).
         BU YÜZDEN HİÇ ÇAĞRILMIYOR. Geri yükleme için gereken her şeyi
         getPurchases() zaten veriyor. */

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
  /* @capgo/native-purchases'ın registerPlugin adı (dist/esm/index.js). */
  plugin: 'NativePurchases',
  /* Akış bağlı. Bayrak tek başına hâlâ hiçbir hak AÇMIYOR: hak yalnız
     iapDeliver() üzerinden, yalnız PURCHASED bir tokenla deftere giriyor. */
  wired: true,
  /* Reklam kaldırma hakkı, başarılı sorguda ART ARDA kaç kez görünmezse
     düşürülür. 1 değil: tek bir sorgu (hesap değişimi, geçici Play durumu)
     ödenmiş bir hakkı silmeye yetmemeli.

     DİKKAT — bu sayı rezervasyonlar için KULLANILMIYOR ve kullanılamaz. Burada
     kabul edilebilir olmasının sebebi, yanlış karar verdiğinde kaybedilen şeyin
     geri getirilebilir olması: hak yanlışlıkla düşerse sonraki başarılı sorgu
     tokenı yeniden görüp geri yazıyor (iapReapNoAds/iapIngest). Rezervasyonda
     ise yanlış karar geri alınamaz — bu arada satılan ikinci paket satılmıştır. */
  missMax: 3
};
/* REZERVASYONUN SÜRE YA DA SORGU SAYISI İLE DÜŞÜRÜLMESİ YOK ve olmayacak; bu
   yüzden burada resTtl/resMiss diye bir sabit de yok. Önce "TTL + tek boş
   sorgu", sonra "TTL + 3 ardışık boş sorgu" denendi; ikincisi kusuru yalnız
   GECİKTİRİYORDU. Boş sorgu, ödemenin olmadığını kanıtlamaz: yavaş bir kart
   Play tarafından istediği kadar uzun süre döndürülmeyip sonra PURCHASED
   gelebilir. Sayı ne olursa olsun bu bir kanıt değil, bir tahmindir — ve tahmin,
   ödenmiş bir işlemin yerini bu arada satılmış başka bir pakete verdirir.
   Rezervasyonu yalnız KANITLANMIŞ geçişler bırakıyor: ödeme akışının hiç
   başlamadığı (iapNotStarted) ya da teslimatın kalıcılaştığı durumlar. */

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
/* Bu kariyerdeki REZERVE kapasite. Rezervasyon, ödeme başlamadan önce
   kalıcılaştırılan "bu kadarını almak üzereyim" kaydı. Tavan hesabına katılıyor
   ki iki paket aynı boşluğu paylaşamasın — pencere açıkken tutulan bir bellek
   kilidi bunu yapamazdı, çünkü süreç ölümünden sağ çıkmaz. */
function iapResOf(st) {
  const r = st && st.iap && st.iap.r;
  return (r && typeof r === 'object') ? r : null;
}
function iapCapReserved() {
  if (typeof S === 'undefined' || !S) return 0;
  const r = iapResOf(S);
  if (!r) return 0;
  return Object.keys(r).reduce((s, k) => s + ((r[k] && r[k].cap) || 0), 0);
}
/* Herhangi bir DURUMUN ham kapasitesi (clamp'siz). Teslimat kararı hedef
   kariyerin kendi durumu üzerinden verilmek zorunda — açık kariyerin değil. */
function iapCapOfState(st) {
  return iapOwnedOf(st).reduce((s, p) => s + (p.cap || 0), 0);
}
/* Bu kariyerde kalan kapasite hakkı — mağaza ekranı bunu yazıyor.
   Rezerve edilmiş kapasite BURADA düşülüyor: satın alınabilirlik kararı ile
   tavan kararı aynı sayıyı okusun. */
function iapCapLeft() { return Math.max(0, IAP.capMax - iapCapOwned() - iapCapReserved()); }

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

/* ================= İŞLEM KUYRUĞU (iapq) =================
   Ödenmiş ama henüz kapanmamış her işlem burada. Anahtar satın alma tokenı.

   DURUMLAR — her biri farklı bir kurtarma yolu demek:
     pending        Play PENDING dedi. HAK YOK. Ödeme tamamlanırsa PURCHASED'a döner.
     ready          PURCHASED, henüz teslim edilmedi.
     granted        Hak kalıcı olarak YAZILDI ve diskten doğrulandı; consume/ack değil.
     finishing      consume/ack ÇAĞRILDI, sonucu bilinmiyor. (Yanıt kaybolursa
                    buradan toparlanıyoruz — yalnız Play sorgusuna güvenmiyoruz.)
     done           Kapandı. Kayıt SİLİNMİYOR: "bu token zaten bitti" bilgisi,
                    consume yanıtı kaybolduğunda tek dayanağımız.
     orphan         Hedef kariyer yok (silinmiş ya da bulunamıyor). Hak YOK.
     unbound        Hedef kimliği gelmedi. Hak YOK, TAHMİN DE YOK.
     undeliverable  Tam teslim edilemiyor (tavan/miktar). Hak YOK, consume YOK.

   orphan/unbound/undeliverable kayıtları hiçbir yolda silinmiyor; consume/ack
   de yapılmıyor. Onaylanmayan satın almayı Play kendisi iade ediyor — ama biz
   onu "iade edildi" diye YAZMIYORUZ, çünkü doğrulayamıyoruz. */
let IAPQ = null;                      // {v, q:{tok:rec}, cf?} — diskteki kaydın aynası
let IAPQL = null;                     // yükleme sözü (tekilleştirme)
let IAPQE = '';                       // '' | 'read' | 'bad' | 'merge' — yükleme neden tutmadı

/* ================= KUYRUĞUN YÜKLENMESİ =================
   Üç ayrı hata, ve üçü de bir zamanlar "kuyruk boş" diye okunuyordu:

   1) DEPOLAMA HENÜZ HAZIR DEĞİLKEN OKUMAK. SAVEH.backend 'ls' değeriyle
      başlıyor ve storeBackendInit() bitene kadar öyle kalıyor. iapInit() ilk
      çizimden hemen sonra, storeInit() BEKLENMEDEN çağrılıyor — o anda yapılan
      recGet('iapq') IndexedDB'li bir cihazda localStorage'a bakar, orayı boş
      bulur ve kuyruğu "yüklendi, boş" diye işaretlerdi. Sonraki her iapqSave()
      o boş aynayı IndexedDB'ye yazar, yani diskteki ÖDENMİŞ işlem kayıtlarını
      silerdi. Bu yüzden okuma storeReadyP()'nin arkasında: arka uç seçilmeden
      kuyruğa bakılmıyor.

   2) OKUMA HATASI ve BOZUK KAYIT. "Okuyamadım" ile "orada bir şey yok" aynı
      cevap değil — js/saves.js'teki göç aynı ayrımı aynı sebeple yapıyor.
      Gerçekten bulunmayan kayıt boş kuyruktur ve ilk işlemde yazılır; okuma
      hatası ya da tanınmayan bir yük ise KUYRUK YOK demektir: IAPQ null kalıyor,
      hiçbir şey yazılmıyor ve satın alma kapalı kalıyor (iapAvailable).
      localStorage tarafında bu ayrım recReadLs() ile yapılıyor, çünkü
      lsGet/jparse/recGet zincirinin üçü de hatayı null'a çeviriyor.

   3) ÖNCEKİ OTURUMUN localStorage KUYRUĞUNU GÖRMEMEK. IndexedDB bir açılışta
      açılamazsa katman localStorage'a düşüyor ve o oturumda ödenen işlemler
      'menajerIapQV1' anahtarına yazılıyor. Bir sonraki açılışta IndexedDB
      açılınca recGet() yalnız oraya bakıyordu: önceki oturumun ücretli kayıtları
      görünmez kalıyordu. Artık IndexedDB açılışında localStorage kaynağı da
      okunuyor ve BİRLEŞTİRİLİYOR (iapqAdopt).

   Sonuç null dönüyor, REDDETMİYOR: çağıranların yarısı açılış yolunda ve
   yakalanmamış bir ret orada hiçbir şey kazandırmaz. */
function iapqBlank() { return { v: 1, q: {} }; }
function iapqReady() { return !!IAPQ; }
function iapqErr() { return IAPQE; }

/* Alan sırasından bağımsız karşılaştırma anahtarı. "İki kayıt aynı mı" sorusu
   göçte tam eşdeğerlikle cevaplanıyor (js/saves.js moveVerdict ile aynı kural);
   JSON.stringify'ın anahtar sırası kaynağa göre değiştiği için kendi başına
   yetmiyor. */
function iapqKey(o) {
  if (o === null || typeof o !== 'object') return JSON.stringify(o === undefined ? null : o);
  if (Array.isArray(o)) return '[' + o.map(iapqKey).join(',') + ']';
  return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + iapqKey(o[k])).join(',') + '}';
}
/* Tanıdığımız bir kuyruk mu. Tanımadığımız her yük 'bad': üstüne yazmak yerine
   olduğu yerde bırakılıyor. */
function iapqShape(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  if (!v.q || typeof v.q !== 'object' || Array.isArray(v.q)) return null;
  if (v.cf !== undefined && (!v.cf || typeof v.cf !== 'object' || Array.isArray(v.cf))) return null;
  const bad = Object.keys(v.q).some(k => {
    const r = v.q[k];
    return !r || typeof r !== 'object' || Array.isArray(r) || typeof r.st !== 'string';
  });
  return bad ? null : v;
}

/* ================= İKİ DEPODAKİ KUYRUĞUN BİRLEŞTİRİLMESİ =================
   Bu birleştirme bir UZLAŞTIRICI DEĞİL. Yaptığı tek şey kaybı önlemek: iki
   depodaki kayıtları yan yana getirmek, güvenle tekilleştirilebilenleri
   tekilleştirmek ve geri kalanı OLDUĞU GİBİ saklayıp o tokenı eylemsiz
   bırakmak.

   Neden bir sıralama YOK. Aynı tokenın kimlik alanlarının uyuşması, iki kaydın
   TESLİMAT ve KAPANIŞ bilgisinin eşdeğer olduğunu kanıtlamaz: 'done' diyen
   kopya o kapanışın gerçekten olduğunu bize kanıtlamıyor (sunucu yok,
   getPurchases tüketilmiş tokenı zaten göstermiyor) ve 'ready' diyen kopya da
   teslimatın yapılmadığını kanıtlamıyor. Yerel defterin ikinci bir hak
   yazmaması ayrı bir güvence ve iyi bir şey — ama atılan kaydın taşıdığı
   bilgiyi geri getirmiyor. Bu yüzden bir enum sırası ya da 'done' etiketi
   yüzünden diğer özgün kayıt ATILMIYOR.

   Alan sınıfları:
     KİMLİK    bu tokenın hangi satın alma olduğu
     DURUM     teslimat ve kapanış bilgisi — çelişirse UZLAŞTIRILMIYOR
     KÖKEN     kaydın yerelde ne zaman ve hangi yolla oluştuğu; teslimat
               hakkında hiçbir şey söylemiyor, bu yüzden farkı çelişki değil */
const IAPQ_IDF = ['pid', 'sku', 'sc', 'cid', 'att'];
const IAPQ_PROV = { at: 1, src: 1 };

/* Bir tarafın bu token için taşıdığı SÜRÜMLER. Çelişki daha önce kaydedildiyse
   özgün sürümler onlardır — kaydın kendisi yalnızca onların yerini tutan
   eylemsiz bir işaret. Bu, yeniden benimsemenin kaydı büyütmemesinin de sebebi:
   sürümler her zaman ÖZGÜN kayıtlar, türetilmiş olan değil. */
function iapqVers(side, tok) {
  const cf = side && side.cf && side.cf[tok];
  if (cf && cf.length) return cf.slice();
  const r = side && side.q && side.q[tok];
  return r ? [r] : [];
}
/* Aynı sürümü iki kez saklamıyoruz: aynı kaynak tekrar tekrar benimsenirse
   liste büyümemeli. */
function iapqUniq(list) {
  const seen = {}, out = [];
  list.forEach(r => { const k = iapqKey(r); if (!seen[k]) { seen[k] = 1; out.push(r); } });
  return out;
}
/* İki sürüm TEK bir kayda indirgenebilir mi. Yalnız iki şey yapılıyor:
     - eksik bir alan diğer taraftan tamamlanıyor (yokluk çelişki değil),
     - köken alanlarının farkı yok sayılıyor (at'ta en erken olan kalıyor;
       src yalnız tanı amaçlı ve ikisinden biri yeterli).
   BAŞKA hiçbir farkı çözmüyor. Dönüş null ise indirgenemez. */
function iapqFold2(a, b) {
  const out = {};
  const keys = {};
  Object.keys(a).forEach(k => { keys[k] = 1; });
  Object.keys(b).forEach(k => { keys[k] = 1; });
  let clash = false;
  Object.keys(keys).forEach(k => {
    const x = a[k], y = b[k];
    const hx = (x !== undefined && x !== null), hy = (y !== undefined && y !== null);
    if (!hx) { out[k] = y; return; }
    if (!hy) { out[k] = x; return; }
    if (x === y) { out[k] = x; return; }
    if (IAPQ_PROV[k]) { out[k] = (k === 'at') ? Math.min(x, y) : x; return; }
    clash = true;                       // durum/teslimat ya da tanımadığımız bir alan
  });
  return clash ? null : out;
}
/* Çelişkinin yerini tutan EYLEMSİZ kayıt. Kendisi bir sürüm değil: özgün
   sürümler cf'te duruyor. Yalnız BÜTÜN sürümlerin hemfikir olduğu kimlik
   alanlarını taşıyor; çelişen her alan null — özellikle att, çünkü yanlış bir
   att başka bir denemenin rezervasyonunu düşürürdü (iapReapRes). */
function iapqDisputedRec(tok, vers) {
  const rec = { tok: tok };
  IAPQ_IDF.forEach(f => {
    let v = null, seen = false, clash = false;
    vers.forEach(r => {
      const x = r[f];
      if (x === undefined || x === null) return;
      if (!seen) { v = x; seen = true; } else if (x !== v) clash = true;
    });
    rec[f] = (clash || !seen) ? null : v;
  });
  /* 'disputed' YENİ BİR ÇÖZÜM YOLU DEĞİL, bir durdurma işareti: iapAdvance'ın
     bilinen dallarının hiçbirine uymuyor ve iapIngest onu ilerletmiyor, yani
     teslimat da consume/ack de BAŞLAMIYOR. */
  rec.st = 'disputed';
  rec.at = Math.min.apply(null, vers.map(r => r.at || 0).filter(n => n > 0).concat([Date.now()]));
  rec.note = 'merge';
  return rec;
}
/* Bir tokenın bütün sürümlerinden tek kayıt + (gerekiyorsa) çelişki listesi. */
function iapqFold(tok, vers) {
  vers = iapqUniq(vers);
  if (!vers.length) return null;
  if (vers.length === 1) return { rec: vers[0], cf: null };
  if (vers.length === 2) {
    const one = iapqFold2(vers[0], vers[1]);
    if (one) return { rec: one, cf: null };
  }
  return { rec: iapqDisputedRec(tok, vers), cf: vers };
}
/* İki kuyruğun birleşimi. Bir tarafta olan token her zaman korunuyor; iki
   tarafta olan token indirgenebiliyorsa indirgeniyor, indirgenemiyorsa
   sürümleriyle birlikte saklanıyor. */
function iapqMergeAll(dst, src) {
  const out = { v: 1, q: {} };
  const cf = {};
  const toks = {};
  [dst, src].forEach(s => {
    Object.keys((s && s.q) || {}).forEach(k => { toks[k] = 1; });
    Object.keys((s && s.cf) || {}).forEach(k => { toks[k] = 1; });
  });
  Object.keys(toks).forEach(tok => {
    const f = iapqFold(tok, iapqVers(dst, tok).concat(iapqVers(src, tok)));
    if (!f) return;
    out.q[tok] = f.rec;
    if (f.cf) cf[tok] = f.cf;
  });
  if (Object.keys(cf).length) out.cf = cf;
  return out;
}

/* localStorage kaynağını IndexedDB hedefine devralır.
   Sıra, s1..s3 göçününkiyle aynı ve aynı sebeple: YAZ → TANIK → GERİ OKU →
   ANCAK O ZAMAN KAYNAĞI SİL. Tanık "içeriğim depolamaya verildi" diyor; yalnız
   taze bir okuma "araya kimse yazmadı" diyor. Her doğrulanamayan adımda kaynak
   yerinde kalıyor ve kuyruk YÜKLENMEMİŞ sayılıyor — bir sonraki iapRetry()
   kaldığı yerden devam ediyor. */
function iapqAdopt(dst) {
  const r = recReadLs('iapq');
  if (r.st === 'err') return Promise.resolve({ ok: false, err: 'read' });
  if (r.st === 'bad') return Promise.resolve({ ok: false, err: 'bad' });
  if (r.st === 'none') return Promise.resolve({ ok: true, q: dst });
  const src = iapqShape(r.v);
  if (!src) return Promise.resolve({ ok: false, err: 'bad' });
  /* Kaynak boşsa taşınacak bir şey yok: hedefte hiç kayıt olmayabilir ve
     olmayan bir kaydı "geri okuyup doğrulamak" mümkün değil. */
  if (!Object.keys(src.q).length && !Object.keys(src.cf || {}).length) {
    recDelLs('iapq');
    return Promise.resolve({ ok: true, q: dst });
  }
  const merged = iapqMergeAll(dst, src);
  const done = () => { recDelLs('iapq'); return { ok: true, q: merged }; };
  const prove = () => recGet('iapq').then(
    back => (back && iapqKey(back) === iapqKey(merged)) ? done() : { ok: false, err: 'merge' },
    () => ({ ok: false, err: 'merge' }));
  if (iapqKey(merged) === iapqKey(dst)) return prove();   // hedef zaten kapsıyor
  return queueRec('iapq', () => merged, w => iapqKey(w) === iapqKey(merged))
    .then(ok => ok ? prove() : { ok: false, err: 'merge' });
}

/* Arka uca göre okuma. Arka uç zaten localStorage ise KAYNAK İLE HEDEF AYNI
   ANAHTAR olur ve göç diye bir şey yoktur — js/saves.js'in migrateLsSlots()'u
   aynı tuzağa aynı cevabı veriyor. */
function iapqRead() {
  if (saveBackend() === 'ls') {
    const r = recReadLs('iapq');
    if (r.st === 'err') return Promise.resolve({ ok: false, err: 'read' });
    if (r.st === 'bad') return Promise.resolve({ ok: false, err: 'bad' });
    if (r.st === 'none') return Promise.resolve({ ok: true, q: iapqBlank() });
    const q = iapqShape(r.v);
    return Promise.resolve(q ? { ok: true, q: q } : { ok: false, err: 'bad' });
  }
  return recGet('iapq').then(rec => {
    let dst;
    if (rec === null || rec === undefined) dst = iapqBlank();
    else { dst = iapqShape(rec); if (!dst) return { ok: false, err: 'bad' }; }
    return iapqAdopt(dst);
  }, () => ({ ok: false, err: 'read' }));
}

function iapqLoad() {
  if (IAPQ) return Promise.resolve(IAPQ);
  if (IAPQL) return IAPQL;                  // uçuştaki okuma: ikinci bir okuma DA, ikinci bir göç DE açılmıyor
  IAPQL = storeReadyP().then(iapqRead).then(r => {
    if (r.ok) { IAPQ = r.q; IAPQE = ''; return IAPQ; }
    IAPQL = null; IAPQE = r.err; return null;
  }, () => { IAPQL = null; IAPQE = 'read'; return null; });
  return IAPQL;
}

/* ================= HAZIRLIK: YÜKLEME + İLK UZLAŞTIRMA, TEK SEFER =================
   Üç yol aynı işi isteyebiliyor: açılış (iapInit), kariyer açma
   (iapOnCareerOpen) ve mağaza açma (js/ui.js pushV → iapRetry). iapqLoad()
   okumayı ve göçü zaten tekilleştiriyor, ama ONDAN SONRAKİ uzlaştırma ayrı bir
   iş: üç yol da kendi turunu açsaydı aynı anda üç getPurchases() ve üç ingest
   zinciri koşardı. Uçuş kilidi (IAPS.flight) yalnız AYNI TOKENIN teslimatını
   tekilleştiriyor — bütün uzlaştırmayı değil, ve ona öyleymiş gibi
   güvenilemez. Bu yüzden ikisi tek bir söze bağlı.

   Başarısızlıkta söz siliniyor, yani bir sonraki kullanıcı eylemi yeniden
   deneyebiliyor. Başarıda kalıyor: ikinci bir açılış uzlaştırması yok. Satın
   alma sonrasındaki uzlaştırma (iapBuy'ın PENDING yolu) bilerek buradan
   GEÇMİYOR — o taze bir sorgu istiyor ve uçuştaki eski bir tura bağlanmamalı. */
let IAPQP = null;
function iapqPrepare() {
  if (IAPQP) return IAPQP;
  IAPQP = iapqLoad().then(q => {
    if (!q) { IAPQP = null; return null; }
    return iapReconcile().then(() => q, () => q);
  }, () => { IAPQP = null; return null; });
  return IAPQP;
}
/* Kontrollü yeniden deneme. Kuyruk yüklenemediyse tek giriş noktası bu:
   mağaza açılırken (js/ui.js pushV) ve kariyer açılırken çağrılıyor, zamanlayıcı
   YOK. Tekilleştirme iapqPrepare()'de: aynı anda gelen çağrılar aynı sözü alır,
   ikinci bir okuma da, ikinci bir göç de, ikinci bir uzlaştırma da açılmaz. */
function iapRetry() {
  if (IAPQ) return Promise.resolve('again');
  /* Köprü yokken (web/PWA/tek dosya) yüklenecek bir şey de yok: kuyruk yalnız
     Play işlemleri için var ve o sürümlerde hiç yazılmıyor. */
  if (!iapBridge()) return Promise.resolve('nobridge');
  return iapqPrepare().then(q => { iapRepaint(); return q ? 'ok' : 'noq'; },
    () => { iapRepaint(); return 'noq'; });
}
/* Kuyruğu diske verir ve GERÇEKTEN yazıldığını tanıkla doğrular. Ücretli bir
   kaydın "yazıldı sanılıp" kaybolduğu yol kapalı olsun diye söz döndürüyor. */
function iapqSave(tok) {
  if (!IAPQ) return Promise.resolve(false);
  const snap = IAPQ;
  return queueRec('iapq', () => snap,
    w => !!(w && w.q && (!tok || w.q[tok])));
}
function iapqAll() { return (IAPQ && IAPQ.q) ? IAPQ.q : {}; }
function iapqOf(tok) { return iapqAll()[tok] || null; }
function iapqCount(st) {
  const q = iapqAll();
  return Object.keys(q).filter(k => q[k].st === st).length;
}
/* Ekranın okuduğu özet: kaç işlem beklemede, kaç tanesi kullanıcının ilgisini
   gerektiriyor. Sayı değil DURUM taşıyor — mağaza ekranı cümleyi kendisi kurar. */
function iapPendingN() { return iapqCount('pending'); }
function iapStuckN() {
  return iapqCount('orphan') + iapqCount('unbound') + iapqCount('undeliverable');
}
/* Durumu NETLEŞTİRİLEMEYEN işlemler. 'stuck' ile bilerek AYRI sayılıyor:
   shopTxStuck "hiçbir hak verilmedi" diyor ve bu, çelişen sürümlerden biri
   teslimatın yapıldığını söylüyorken DOĞRU DEĞİL. shopTxUnclear yalnız
   kanıtlayabildiğimizi söylüyor — durumu netleştiremedik, kaydı saklıyoruz,
   başka adım atmıyoruz ve kullanıcının halihazırdaki hakları değişmiyor. */
function iapUnclearN() { return iapqCount('disputed'); }
/* Hak verilmiş ama kapanışı DOĞRULANAMAMIŞ işlemler. 'stuck' değil — kullanıcı
   aldığını aldı; ama "tamamlandı" da değil, çünkü tamamlandığını kanıtlayamıyoruz. */
function iapUnverifiedN() { return iapqCount('unverified'); }

/* ================= HEDEF KİMLİĞİ =================
   Play'e verdiğimiz obfuscatedAccountId, satın almayla birlikte GERİ GELİYOR
   (eklenti: appAccountToken). Hedefi buradan okumak, yerel bir "açık deneme"
   kaydından okumaktan üstün: süreç ölümünden, uygulamanın kapanmasından ve
   günler sonra tamamlanan bir PENDING ödemeden sağ çıkıyor.

   Biçim: "<cid|dev>.<att>" — 32+1+8 = 41 karakter. cid hedef kariyeri, att bu
   satın alma DENEMESİNİ (ve dolayısıyla rezervasyonu) gösteriyor. İkisi birlikte
   "hangi rezervasyon hangi tokena dönüştü" sorusunu cevaplıyor.

   Kişisel veri taşımıyor: cid 16 bayt rastgele (saves.js newCid), att da öyle. */
function iapAtt() { return newCid().slice(0, 8); }
function iapTag(cid, att) { return (cid || 'dev') + '.' + att; }
function iapParseTag(s) {
  if (typeof s !== 'string') return null;
  const i = s.indexOf('.');
  if (i <= 0 || i === s.length - 1) return null;
  const cid = s.slice(0, i), att = s.slice(i + 1);
  if (!/^[0-9a-f]+$/.test(att)) return null;
  return { cid: cid === 'dev' ? null : cid, att: att };
}

/* ================= REZERVASYON =================
   Ödeme BAŞLAMADAN yazılıyor ve yazıldığı DOĞRULANMADAN satın alma açılmıyor.
   Dönüş: att (söz) ya da null. */
function iapReserve(p) {
  if (!S || !curSlot || !p.cap) return Promise.resolve(null);
  if (!S.iap || typeof S.iap !== 'object') S.iap = {};
  if (!S.iap.r || typeof S.iap.r !== 'object') S.iap.r = {};
  const att = iapAtt();
  S.iap.r[att] = { cap: p.cap, at: Date.now() };
  const cid = S.cid;
  return saveSlotConfirmed(curSlot,
    w => !!(w && w.S && w.S.cid === cid && w.S.iap && w.S.iap.r && w.S.iap.r[att])
  ).then(ok => {
    if (ok) return att;
    /* Yazılamadıysa rezervasyon YOK sayılıyor ve satın alma HİÇ başlamıyor:
       kalıcı olmayan bir rezervasyon tavanı koruyamaz. */
    if (S && S.iap && S.iap.r) delete S.iap.r[att];
    return null;
  });
}
/* Rezervasyonu düşürmenin TEK yeri. reason ayrımı önemli:
     'cancel'  kullanıcı vazgeçti — KESİN, hemen düşer
     'failed'  akış hiç başlamadı — KESİN, hemen düşer
     'stale'   BELİRSİZ — burada DÜŞMEZ; yalnız iapReconcile() düşürebilir
   Teslimatta düşme ayrı yoldan (iapApplyTo), çünkü orada defter yazımıyla
   AYNI yazmada olmak zorunda. */
function iapRelease(att, reason) {
  if (!S || !curSlot || !att) return Promise.resolve(false);
  const r = iapResOf(S);
  if (!r || !r[att]) return Promise.resolve(false);
  if (reason === 'stale') return Promise.resolve(false);
  delete r[att];
  return saveSlotConfirmed(curSlot);
}

/* ================= KÖPRÜ ================= */
function iapBridge() {
  try {
    const C = (typeof Capacitor !== 'undefined' && Capacitor) ? Capacitor
      : ((typeof window !== 'undefined' && window.Capacitor) ? window.Capacitor : null);
    const P = (C && C.Plugins && C.Plugins[IAP.plugin]) || null;
    return (P && typeof P.purchaseProduct === 'function'
      && typeof P.getPurchases === 'function') ? P : null;
  } catch (e) { return null; }
}
/* Çalışma zamanı durumu. Hiçbiri kayda girmiyor. */
const IAPS = {
  sup: null,        // isBillingSupported sonucu (null = sorulmadı)
  price: {},        // ürün id → Play'in YERELLEŞTİRİLMİŞ fiyat dizesi
  prod: null,       // 'ok' | 'fail' | null — ürün sorgusunun sonucu
  busy: '',         // '' | ürün id — akış açıkken
  flight: {},       // token → 1: aynı token için uçuştaki TESLİMAT (geri almayı güvenli kılar)
  fin: {},          // token → 1: aynı token için uçuştaki KAPANIŞ (consume/ack)
  qErr: false,      // son hak sorgusu başarısız mı
  boot: false
};
/* Satın alma yapılabilir mi. Fiyat sorgusu tutmadıysa da KAPALI: fiyatı
   bilinmeyen bir ürünü satmak, kullanıcıya ne ödeyeceğini söylememek olurdu. */
function iapAvailable() {
  /* IAPQ olmadan satın alma YOK. Kuyruk, ödenmiş işlemin tek yerel izi; onu
     okuyamamışken yeni bir ödeme başlatmak, kaydedilemeyecek bir işlem
     başlatmak olurdu. */
  return !!(IAP.wired && iapBridge() && IAPS.sup === true && IAPS.prod === 'ok' && IAPQ);
}
function iapWhy() {
  if (!IAP.wired) return 'nobill';
  if (!iapBridge()) return 'noplay';
  if (IAPS.sup === false) return 'nostore';
  if (!IAPQ) return 'noq';
  if (!iapAvailable()) return 'noprod';
  return '';
}
function iapPrice(id) { return IAPS.price[id] || ''; }

/* Bir ürünün BU BAĞLAMDA satın alınabilirliği.
   Dönüş: 'go' | 'off' | 'full' | 'owned' | 'nocareer' | 'busy'. */
function iapState(id) {
  const p = iapById(id);
  if (!p) return 'off';
  if (p.sc === 'career' && (typeof S === 'undefined' || !S || !S.agent || !curSlot)) return 'nocareer';
  if (iapOwned(id)) return 'owned';
  if (p.cap && p.cap > iapCapLeft()) return 'full';
  if (IAPS.busy) return 'busy';
  return iapAvailable() ? 'go' : 'off';
}

/* ================= TESLİMAT =================
   Tokenı bir kariyer durumuna işler. İki iş AYNI nesnede, dolayısıyla AYNI
   yazmada oluyor: token deftere giriyor ve rezervasyon düşüyor. Ayrı yazmalar
   olsaydı arada bir çökme aynı kapasiteyi iki kez saydırırdı. */
function iapApplyTo(st, tok, pid, att) {
  if (!st.iap || typeof st.iap !== 'object') st.iap = {};
  if (!st.iap.t || typeof st.iap.t !== 'object') st.iap.t = {};
  if (st.iap.t[tok]) {                       // zaten teslim edilmiş: no-op
    if (att && st.iap.r) delete st.iap.r[att];
    return 'again';
  }
  st.iap.t[tok] = pid;
  if (att && st.iap.r) delete st.iap.r[att];
  return 'ok';
}
/* Kalıcılaşmayan bir teslimatın bellekten geri alınması. Rezervasyon da geri
   konuyor: teslimat olmadıysa o kapasite hâlâ "almak üzere olduğumuz" kapasite
   ve tavandan yer tutmaya devam etmeli. */
/* Geri alma, MUTASYONU YAPTIĞI NESNEYİ takip eder — o an S'de ne varsa onu
   değil. Eskiden zincirin sonunda `iapRollback(S, ...)` çağrılıyordu ve S bu
   arada BAŞKA bir kariyer olabiliyordu: eski kariyerin rezervasyonu yeni
   kariyere yazılabilir, yeni kariyerin defterinden aynı adlı token silinebilirdi.

   Üç koruma birden:
     m.st    mutasyonun yapıldığı NESNE (S ya da kayıttan okunan kopya)
     m.cid   o nesnenin o anki kimliği — yeniden yükleme sonrası S başka bir
             nesnedir, bu yüzden kimlik ayrıca doğrulanıyor
     m.did   iapApplyTo GERÇEKTEN yazdı mı ('again' ise yazmadı, silmemeli) */
function iapMark(st, tok, pid, att) {
  const had = !!(st.iap && st.iap.t && st.iap.t[tok]);
  const resBack = (st.iap && st.iap.r && att) ? (st.iap.r[att] || null) : null;
  const r = iapApplyTo(st, tok, pid, att);
  return { st: st, cid: st.cid, tok: tok, pid: pid, att: att, res: resBack, did: (r === 'ok' && !had) };
}
function iapRollback(m) {
  if (!m || !m.did) return false;
  const st = m.st;
  /* Nesne hâlâ aynı kariyer mi. Değilse dokunmuyoruz: yanlış kariyeri
     düzeltmeye çalışmak, düzeltmeye çalıştığımız hatadan beterdir. */
  if (!st || !st.iap || st.cid !== m.cid) return false;
  /* Araya giren bir yeniden deneme bu tokenı KALICI olarak yazmış olabilir;
     o zaman geri alınacak bir şey yok. Aynı token için ikinci bir teslimatın
     paralel başlamadığını iapDeliverCareer'ın uçuş kilidi garanti ediyor. */
  if (!st.iap.t || st.iap.t[m.tok] !== m.pid) return false;
  delete st.iap.t[m.tok];
  if (m.att && m.res) {
    if (!st.iap.r || typeof st.iap.r !== 'object') st.iap.r = {};
    st.iap.r[m.att] = m.res;
  }
  return true;
}
/* Kaydın gerçekten bu teslimatı taşıyıp taşımadığı. Canlı nesne kimliğine
   bakmıyor: kariyer yeniden yüklendiğinde S başka bir nesne olur, cid ve token
   aynı kalır. */
function iapPersisted(w, cid, tok, pid) {
  return !!(w && w.S && w.S.cid === cid && w.S.iap && w.S.iap.t && w.S.iap.t[tok] === pid);
}
/* Hedef kariyerin yuvasını bulur. META bir ÖZET; kaydın kendisi otorite — yuva
   yeniden kullanılmış olabilir, o yüzden teslimat sırasında kaydın içindeki cid
   ayrıca doğrulanıyor. Dönüş: yuva numarası ya da 0. */
function iapSlotOfCid(cid) {
  if (!cid || typeof META === 'undefined') return 0;
  for (let n = 1; n <= SLOTS; n++) {
    const m = META['s' + n];
    if (m && m.cid === cid) return n;
  }
  return 0;
}

/* Hakkı hedef kariyere yazar. Kullanıcı BAŞKA bir kariyerdeyse bile yazılıyor —
   hedefin açılması BEKLENMİYOR, çünkü teslimat kullanıcı eylemine bağlanamaz
   (3 günlük acknowledge süresi bunu yasaklıyor).

   Üç güvenlik, üçü de ayrı bir hatayı kapatıyor:
     1) queueRec anahtar başına SERİ — açık olmayan bir yuvanın tek diğer
        yazıcısı deleteSlot'un queueDel'i ve o da aynı kuyrukta.
     2) build() FLUSH ANINDA yeniden bakıyor: kullanıcı bu arada o kariyeri
        açtıysa canlı S'ye uygulanıyor ve canlı durum EZİLMİYOR.
     3) Yazmadan sonra kayıt YENİDEN OKUNUYOR. Tanık yalnız "benim verdiğim
        içerik depolandı" der; arkadan gelen bir yazmanın onu ezmediğini ancak
        taze okuma söyler. consume/ack yalnız bu okuma geçerse yapılıyor.

   Dönüş (söz): 'ok' | 'again' | 'gone' | 'full' | 'writefail'. */
function iapDeliverCareer(rec) {
  const cid = rec.cid, tok = rec.tok, pid = rec.pid, att = rec.att;
  const p = iapById(pid);
  if (!p) return Promise.resolve('gone');
  const n = iapSlotOfCid(cid);
  if (!n) return Promise.resolve('gone');

  /* Açık kariyer: bellekteki S otorite, kayıttan okumak eski durumu geri yazardı.

     YAZMA TUTMAZSA BELLEKTEKİ DEĞİŞİKLİK GERİ ALINIYOR. Eskiden geri alınmıyordu
     ve sonuç şuydu: ekran kapasiteyi artmış gösteriyor, oysa diskte yok; araya
     giren normal bir save() onu "teslim edilmiş" hâline getirebiliyor, ama biz
     consume etmediğimiz için durum iki yerde iki türlü duruyordu. Hak ancak
     KALICI olduğunda hak sayılır. */
  /* AYNI TOKEN İÇİN İKİ TESLİMAT AYNI ANDA UÇMAZ. Bu kilit olmadan geri alma
     güvenli olamazdı: paralel bir deneme kalıcılaşırken bizimki düşerse, bizim
     geri almamız onun yazdığını silerdi. */
  if (IAPS.flight[tok]) return Promise.resolve('inflight');
  IAPS.flight[tok] = 1;
  const release = r => { delete IAPS.flight[tok]; return r; };

  if (curSlot === n && S && S.cid === cid) {
    if (S.iap && S.iap.t && S.iap.t[tok]) return Promise.resolve(release('again'));
    if (iapCapOfState(S) + (p.cap || 0) > IAP.capMax) return Promise.resolve(release('full'));
    const m = iapMark(S, tok, pid, att);
    return saveSlotConfirmed(curSlot, w => iapPersisted(w, cid, tok, pid))
      .then(ok => ok ? iapConfirm(n, cid, tok, pid) : 'writefail')
      .then(r => {
        if (r === 'writefail') iapRollback(m);
        return release(r);
      }, e => { iapRollback(m); release(0); throw e; });
  }

  return recGet('s' + n).then(raw => {
    const d = migrateSave(raw);
    if (!d || !d.S || d.S.cid !== cid) return 'gone';   // yuva yeniden kullanılmış / kayıt yok
    if (d.S.iap && d.S.iap.t && d.S.iap.t[tok]) return 'again';
    if (iapCapOfState(d.S) + (p.cap || 0) > IAP.capMax) return 'full';
    /* Mutasyon flush anında ya canlı S'ye ya okunan kopyaya yapılıyor; hangisine
       yapıldığı m'de duruyor. Kopyaya yapıldıysa geri alma zaten etkisiz (kopya
       atılıyor), canlıya yapıldıysa DOĞRU nesnede geri alınıyor. */
    let m = null;
    const built = queueRec('s' + n, () => {
      /* FLUSH ANI. Kullanıcı bu arada hedef kariyeri açmış olabilir. */
      if (curSlot === n && S && S.cid === cid) {
        m = iapMark(S, tok, pid, att);
        return { v: SAVE_SCHEMA, S: S, PID: PID };
      }
      m = iapMark(d.S, tok, pid, att);
      return d;
    }, w => iapPersisted(w, cid, tok, pid));
    return built.then(ok => ok ? iapConfirm(n, cid, tok, pid) : 'writefail')
      .then(r => {
        if (r === 'writefail') iapRollback(m);
        return r;
      });
  }, () => 'writefail').then(release, e => { release(0); throw e; });
}
/* Yazmanın ARKASINDAN taze okuma. Tanık geçse bile araya giren bir yazma bizi
   ezmiş olabilir; consume/ack'in önündeki son kapı bu. */
function iapConfirm(n, cid, tok, pid) {
  return recGet('s' + n).then(raw => {
    const d = migrateSave(raw);
    return iapPersisted(d, cid, tok, pid) ? 'ok' : 'writefail';
  }, () => 'writefail');
}

/* CİHAZ kapsamı (remove_auto_ads). Defter PREFS'te; savePrefs() durum
   döndürmediği için yazma localStorage'dan GERİ OKUNARAK doğrulanıyor. */
function iapDeliverDevice(rec) {
  if (typeof PREFS === 'undefined' || !PREFS) return Promise.resolve('writefail');
  if (!PREFS.iap || typeof PREFS.iap !== 'object') PREFS.iap = {};
  if (!PREFS.iap.t || typeof PREFS.iap.t !== 'object') PREFS.iap.t = {};
  const again = !!PREFS.iap.t[rec.tok];
  PREFS.iap.t[rec.tok] = rec.pid;
  PREFS.iap.miss = 0;
  savePrefs();
  return Promise.resolve(iapDevicePersisted(rec.tok, rec.pid)
    ? (again ? 'again' : 'ok') : 'writefail');
}
/* Cihaz defterinin DİSKTEKİ hâli bu tokenı taşıyor mu. Bellekteki PREFS bu
   soruyu cevaplayamaz: yazması tutmamış bir teslimat hakkı bellekte bırakıyor
   ve ona bakan bir yeniden deneme hiç koşmazdı. */
function iapDevicePersisted(tok, pid) {
  const back = jparse(lsGet(PREFKEY));
  return !!(back && back.iap && back.iap.t && back.iap.t[tok] === pid);
}

/* ================= İŞLEMİ İŞLEME =================
   Play'den gelen bir Transaction'ı kuyruğa alır ve mümkünse sonuna kadar
   götürür. TEK giriş noktası: satın alma da, açılıştaki uzlaştırma da buradan
   geçiyor, böylece iki farklı teslimat yolu oluşmuyor.

   Android'de purchaseState dizesi: "1" = PURCHASED, "2" = PENDING. */
function iapIngest(tx, src) {
  /* KUYRUK YOKSA HİÇBİR ŞEY İŞLENMİYOR. iapqAll() null kuyrukta boş bir nesne
     döndürüyor, yani buradaki kayıt hiçbir yere yazılmadan teslimata ve
     consume'a kadar gidebilirdi: para ödenmiş, hak verilmiş, yerel iz YOK. */
  if (!IAPQ) return Promise.resolve('noq');
  const tok = tx && (tx.purchaseToken || tx.transactionId);
  if (!tok) return Promise.resolve('notoken');
  const pid = iapPidOfSku(tx.productIdentifier);
  if (!pid) return Promise.resolve('unknown');        // bizim ürünümüz değil
  const q = iapqAll();
  let rec = q[tok];
  if (!rec) {
    rec = q[tok] = { tok: tok, sku: tx.productIdentifier, pid: pid,
      sc: iapById(pid).sc, cid: null, att: null, st: 'pending', at: Date.now(), src: src };
  }
  /* KAPANMIŞ KAYIT. 'İşlem kapandı' ile 'hak bu cihazda duruyor' AYRI iki
     şey ve buradaki tek satırlık çıkış ikisini birbirine bağlıyordu: cihaz
     kapsamlı hak iapReapNoAds tarafından düşürülmüş olabilir ve token geri
     geldiğinde bir daha yazılmazdı. Kararı veren PLAY'in bu taze yanıtı. */
  if (rec.st === 'done') return iapRestoreDevice(rec, tx, pid);

  /* Hedef kimliği: satın almanın KENDİSİNDEN. Yerel bir tahmin yok. */
  const tag = iapParseTag(tx.appAccountToken);
  if (tag) { rec.cid = rec.cid || tag.cid; rec.att = rec.att || tag.att; }

  /* Yalnız açıkça "1" hak veriyor; eksik durum PURCHASED VARSAYILMIYOR
     (iapTxPs). Eskiden burada `undefined → '1'` vardı ve bu, durumu
     bildirmeyen bir yanıtı satın alınmış saymak demekti. */
  const ps = iapTxPs(tx);
  if (ps === '2') { rec.st = 'pending'; return iapqSave(tok).then(() => 'pending'); }
  if (ps !== '1') { rec.st = 'pending'; return iapqSave(tok).then(() => 'unknownstate'); }

  /* Miktar yine de KONTROL ediliyor (iapTxQty). */
  const qty = iapTxQty(tx);
  if (qty !== 1) {
    rec.st = 'undeliverable'; rec.note = 'qty';
    return iapqSave(tok).then(() => 'undeliverable');
  }
  /* KAYIT NE DERSE DESİN, HAK YERİNDE Mİ. 'granted'/'finishing'/'unverified'
     hepsi 'teslim edildi' diyor; cihaz defterinden hak düşmüş olabilir. O
     zaman teslimata geri dönülüyor — kapanış zaten yapılacaktı, yani
     fazladan bir acknowledge doğmuyor. */
  if (rec.sc === 'device' && !iapDevicePersisted(tok, rec.pid)
    && (rec.st === 'granted' || rec.st === 'finishing' || rec.st === 'unverified')) rec.st = 'ready';
  if (rec.st === 'pending' || rec.st === 'orphan' || rec.st === 'unbound') rec.st = 'ready';
  /* Doğrulanamamış bir kapanışın tokenı GERİ GELDİYSE satın alma hâlâ açıktır:
     hak zaten yazılı, yalnız kapanış yeniden denenmeli. */
  else if (rec.st === 'unverified') rec.st = 'granted';
  return iapqSave(tok).then(() => iapAdvance(rec));
}
/* purchaseState eklentinin TS tanımında İSTEĞE BAĞLI (`purchaseState?: string`)
   ve Android'de `String.valueOf(int)` ile geliyor: '0' UNSPECIFIED, '1'
   PURCHASED, '2' PENDING. Eksikse PURCHASED VARSAYILMIYOR; okuma tek yerde
   duruyor ki geri yükleme yolu da AYNI kapıdan geçsin. */
function iapTxPs(tx) {
  return (tx.purchaseState === undefined || tx.purchaseState === null)
    ? '' : String(tx.purchaseState);
}
/* Play tek adetten fazlasını vermiyor ve biz desteklemiyoruz; yine de
   okunuyor — desteklenmeyen bir miktarı sessizce tek adet saymak eksik
   teslimat olurdu. */
function iapTxQty(tx) {
  return (tx.quantity === undefined || tx.quantity === null) ? 1 : tx.quantity;
}

/* KAPANMIŞ BİR CİHAZ İŞLEMİNİN YEREL HAKKINI YENİDEN YAZAR.

   iapReapNoAds, art arda IAP.missMax başarılı-ama-boş sorgudan sonra reklam
   kaldırma hakkını düşürüyor. Bu bilerek kabul edildi ÇÜNKÜ geri alınabilir
   sayılmıştı (IAP.missMax'in yorumu); geri almanın gerçekten olduğu yer burası.

   KARARI VEREN PLAY'İN BU TAZE YANITI, eski 'done' kaydı DEĞİL. Bu yola yalnız
   iapIngest'ten, yani elde bir Transaction varken geliniyor: kayıt tek başına
   hiçbir hakkı diriltmiyor.

   YENİ ÖDEME, CONSUME YA DA ACKNOWLEDGE YOK: kapanış zaten olmuştu ve kayıt
   'done' kalıyor. Yazma tutmazsa 'restored' RAPORLANMIYOR; kayıt da yerinde
   kaldığı için bir sonraki başarılı sorgu aynı yolu yeniden deniyor. */
function iapRestoreDevice(rec, tx, pid) {
  /* YALNIZ TÜKETİLMEYEN CİHAZ HAKKI. Kapasite paketi tüketiliyor; tüketilmiş
     token zaten sorguda görünmüyor ve kariyer defterine bu yoldan
     dokunulmuyor. Ürün eşleşmiyorsa da hak yok: token bizim kaydımızın
     ürününü taşımak zorunda. */
  if (rec.sc !== 'device' || rec.pid !== pid) return Promise.resolve('done');
  /* Normal teslimat yolundaki AYNI kapılar: PENDING, durumu bildirilmeyen
     yanıt ve desteklenmeyen miktar hak vermiyor. */
  if (iapTxPs(tx) !== '1' || iapTxQty(tx) !== 1) return Promise.resolve('done');
  if (iapDevicePersisted(rec.tok, rec.pid)) return Promise.resolve('done');
  return iapDeliverDevice(rec).then(r =>
    (r === 'ok' || r === 'again') ? 'restored' : 'restorefail');
}
function iapPidOfSku(sku) {
  const p = IAP_PRODUCTS.find(x => x.sku === sku);
  return p ? p.id : null;
}

/* Kaydı bulunduğu durumdan bir adım ileri götürür. Yeniden çağrılabilir:
   her adım kendi ön koşulunu okuyor. */
function iapAdvance(rec) {
  if (!IAPQ) return Promise.resolve('noq');          // kaydı yazacak yer yok
  if (rec.st === 'done') return Promise.resolve('done');
  if (rec.st === 'undeliverable') return Promise.resolve('undeliverable');
  /* Token artık sorguda yok: consume'u yeniden denemenin anlamı yok ve
     denemek, olmayan bir başarıyı varsaymak olurdu. Yalnız token geri
     gelirse (iapIngest) yeniden açılıyor. */
  if (rec.st === 'unverified') return Promise.resolve('unverified');

  if (rec.st === 'ready') {
    if (rec.sc === 'device') {
      return iapDeliverDevice(rec).then(r => iapAfterDeliver(rec, r));
    }
    if (!rec.cid) { rec.st = 'unbound'; return iapqSave(rec.tok).then(() => 'unbound'); }
    return iapDeliverCareer(rec).then(r => iapAfterDeliver(rec, r));
  }
  if (rec.st === 'granted' || rec.st === 'finishing') return iapFinish(rec);
  return Promise.resolve(rec.st);
}
function iapAfterDeliver(rec, r) {
  if (r === 'ok' || r === 'again') {
    rec.st = 'granted'; rec.gt = Date.now();
    return iapqSave(rec.tok).then(() => iapFinish(rec));
  }
  if (r === 'gone') { rec.st = 'orphan'; return iapqSave(rec.tok).then(() => 'orphan'); }
  if (r === 'full') {
    /* TAVAN. Kısmi hak VERİLMİYOR ve ürün TÜKETİLMİYOR: kullanıcı +5 ödediyse
       +2 verip işlemi kapatmak eksik teslimattır. Kayıt duruyor, kullanıcıya
       söyleniyor, onaylanmadığı için Play kendi iade yolunu işletiyor. */
    rec.st = 'undeliverable'; rec.note = 'cap';
    return iapqSave(rec.tok).then(() => 'undeliverable');
  }
  return Promise.resolve('writefail');                 // durum değişmiyor, yeniden denenecek
}

/* consume/ack — YALNIZ hak kalıcı olarak yazılıp diskten doğrulandıktan sonra.
   'finishing' çağrıdan ÖNCE yazılıyor: yanıt kaybolursa (süreç ölümü, ağ)
   yeniden açılışta bu kaydı görüp Play'e tekrar soruyoruz; kuyruk kaydı
   olmasaydı yalnız Play sorgusuna kalırdık ve tüketilmiş token orada yok. */
function iapFinish(rec) {
  /* 'finishing' KAYDEDİLEMEDEN consume/ack çağrılmamalı: yanıt kaybolursa
     toparlanmanın tek dayanağı o kayıt. */
  if (!IAPQ) return Promise.resolve('noq');
  /* KAPANMIŞ KAYIT YENİDEN KAPATILMAZ. Bugün buraya yalnız iapAdvance'tan
     geliniyor ve o zaten 'done'u eliyor — ama consume/ack'i GÖNDEREN yer burası,
     yani koşulu burada tutmak doğrusu: her çağıranın önce kontrol etmesine
     güvenmek, bir gün etmeyen bir çağıran demek. */
  if (rec.st === 'done') return Promise.resolve('done');
  const P = iapBridge();
  if (!P) return Promise.resolve('nobridge');
  const consume = rec.sc === 'career';                 // kapasite tüketilebilir
  if (consume && typeof P.consumePurchase !== 'function') return Promise.resolve('nobridge');
  if (!consume && typeof P.acknowledgePurchase !== 'function') return Promise.resolve('nobridge');
  /* AYNI TOKENIN KAPANIŞI İKİ KEZ UÇMAZ. IAPS.flight yalnız TESLİMATI
     tekilleştiriyor; kapanışın kendi kilidi olmadan iki zincir aynı tokena iki
     consume gönderebiliyordu — ölçüldü: açılıştaki uzlaştırma 'finishing'te
     iken kullanıcının kariyeri açması (iapOnCareerOpen) ikinci bir çağrı
     açıyor. İkincisi Play'de zaten tüketilmiş bir token üzerinde koşar, yani
     hata döner ve kaydı gereksiz yere 'finishing'te bırakır. */
  if (IAPS.fin[rec.tok]) return Promise.resolve('inflight');
  IAPS.fin[rec.tok] = 1;
  const free = r => { delete IAPS.fin[rec.tok]; return r; };
  rec.st = 'finishing'; rec.ft = Date.now();
  return iapqSave(rec.tok).then(() => {
    const call = consume ? P.consumePurchase({ purchaseToken: rec.tok })
      : P.acknowledgePurchase({ purchaseToken: rec.tok });
    return call.then(() => {
      rec.st = 'done'; rec.dt = Date.now();
      return iapqSave(rec.tok).then(() => 'done');
    }, () => 'finishfail');                            // 'finishing' kalıyor, yeniden denenecek
  }).then(free, e => { free(); throw e; });
}

/* ================= UZLAŞTIRMA =================
   Açılışta ve her satın almadan sonra. Play'in BAŞARILI bir yanıtı olmadan
   hiçbir hak düşürülmüyor ve hiçbir rezervasyon iptal edilmiyor. */
function iapReconcile() {
  /* Play sorgusu yerel kuyruğun YEDEĞİ DEĞİL: tüketilmiş bir token
     getPurchases()'ta hiç görünmüyor, dolayısıyla kuyruk okunmadan yapılan bir
     uzlaştırma eksik bir dünya görüntüsü üzerinde karar verirdi. */
  if (!IAPQ) return Promise.resolve('noq');
  const P = iapBridge();
  if (!P) return Promise.resolve('nobridge');
  return P.getPurchases({ productType: 'inapp' }).then(res => {
    IAPS.qErr = false;
    const list = (res && res.purchases) || [];
    const seen = {};
    list.forEach(tx => { const k = tx.purchaseToken || tx.transactionId; if (k) seen[k] = tx; });
    /* 1) Play'in bildirdiği her işlem kuyruğa giriyor ve ilerletiliyor. */
    let p = Promise.resolve();
    list.forEach(tx => { p = p.then(() => iapIngest(tx, 'query').catch(() => 0)); });
    return p.then(() => iapReapQueue(seen)).then(() => iapReapNoAds(seen))
      .then(() => iapReapRes(seen)).then(() => 'ok');
  }, () => {
    /* BAŞARISIZ SORGU "satın alma yok" DEMEK DEĞİL. Hiçbir hak silinmiyor,
       hiçbir rezervasyon düşmüyor, hiçbir kayıt kapanmıyor. */
    IAPS.qErr = true;
    return 'queryfail';
  });
}
/* Kuyruktaki kayıtları başarılı bir sorgunun ışığında ilerletir.
   'finishing' + Play artık görmüyor → consume/ack GERÇEKTEN olmuş (ya da iade
   edilmiş); iki durumda da bizim için kapanmış demektir ve hak geri alınmıyor —
   tüketilmiş bir paketin iadesini sunucusuz ayırt etmek mümkün değil. */
function iapReapQueue(seen) {
  const q = iapqAll();
  let p = Promise.resolve(), dirty = false;
  Object.keys(q).forEach(tok => {
    const rec = q[tok];
    const gone = !seen[tok];
    /* HAK YAZILMIŞ, AMA TOKEN ARTIK SORGUDA YOK.
       Bunun EN AZ üç sebebi var ve istemci bunları AYIRT EDEMEZ:
         - consume/acknowledge gerçekten tuttu, yalnız yanıtı bize ulaşmadı
         - satın alma iade/iptal edildi
         - Play başka bir sebeple listelemiyor (hesap değişimi dahil)
       Bu yüzden 'done' DEĞİL, ayrı bir durum: 'unverified'. Hak yerinde kalıyor
       ve ikinci kez VERİLMİYOR; ama bu ne "başarıyla tamamlandı" ne de "iade
       edildi" diye raporlanıyor — ikisi de kanıtlanmış değil. Ekran da öyle
       yazıyor (shopTxUnverified). */
    if ((rec.st === 'finishing' || rec.st === 'granted') && gone) {
      rec.st = 'unverified'; rec.ut = Date.now(); dirty = true;
    } else if (rec.st === 'granted' || rec.st === 'finishing' || rec.st === 'ready') {
      p = p.then(() => iapAdvance(rec).catch(() => 0));
    } else if (rec.st === 'unverified' && seen[tok]) {
      /* Token GERİ GELDİ: demek ki kapanış tutmamış ve satın alma hâlâ açık.
         Hak zaten yazılı, yapılacak tek iş kapanışı yeniden denemek. */
      rec.st = 'granted'; dirty = true;
      p = p.then(() => iapAdvance(rec).catch(() => 0));
    }
  });
  return p.then(() => dirty ? iapqSave() : true);
}
/* Reklam kaldırma hakkının uzlaştırılması. YALNIZ başarılı sorguda ve YALNIZ
   art arda IAP.missMax kez görünmediğinde düşüyor: tek bir sorgu (hesap
   değişimi, geçici Play durumu) ödenmiş bir hakkı silmeye yetmemeli.
   Çoklu Google hesabı davranışı burada VARSAYILMIYOR — ölçülmedi. */
function iapReapNoAds(seen) {
  if (typeof PREFS === 'undefined' || !PREFS) return Promise.resolve(true);
  const t = iapTokens(PREFS);
  if (!t) return Promise.resolve(true);
  const toks = Object.keys(t).filter(k => { const p = iapById(t[k]); return p && p.noads; });
  if (!toks.length) return Promise.resolve(true);
  const alive = toks.some(k => !!seen[k]);
  if (!PREFS.iap) PREFS.iap = {};
  if (alive) { if (PREFS.iap.miss) { PREFS.iap.miss = 0; savePrefs(); } return Promise.resolve(true); }
  PREFS.iap.miss = (PREFS.iap.miss || 0) + 1;
  if (PREFS.iap.miss >= IAP.missMax) toks.forEach(k => { delete t[k]; });
  savePrefs();
  return Promise.resolve(true);
}
/* Rezervasyon toplama — TEK KANIT: teslimatın kalıcılaşmış olması.
   att'ye ait kuyruk kaydının tokenı bu kariyerin DEFTERİNDE ise, o deneme
   gerçekten sonuçlanmıştır ve rezervasyonu artık yer tutmamalı. (Normalde
   rezervasyon teslimatla AYNI yazmada düşer; burası yalnız o yazmanın araya
   giren bir yeniden yükleme yüzünden eksik kaldığı hâli toparlıyor.)

   BAŞKA HİÇBİR GEREKÇE rezervasyonu düşürmüyor. Özellikle:
     - "Play bu tokenı N sorgudur görmüyor"  → kanıt değil
     - "rezervasyon eskidi"                  → kanıt değil
     - orphan / unbound / undeliverable      → ÖDEME açısından sonuçlanmış
       değiller. Hedefi bulunamayan bir kayıt kariyer yeniden göründüğünde
       ready'ye dönebiliyor (iapOnCareerOpen) ve geç gelen bir ödeme aynı
       denemeyi canlandırabiliyor; rezervasyonu şimdi bırakmak, o teslimatın
       yerini bu arada alınmış başka bir pakete verdirirdi.

   Bunun bedeli açık: sonucu hiç öğrenilemeyen bir deneme o kariyerin
   kapasitesinden yer tutmaya devam eder. Bu bilerek seçildi — kullanıcıya
   yanlışlıkla iki kez sattırmaktansa mağazada durumu YAZMAK (iapHeldN →
   shopTxHeld) tercih edildi. */
function iapReapRes() {
  if (!S || !curSlot) return Promise.resolve(true);
  const r = iapResOf(S);
  if (!r) return Promise.resolve(true);
  const t = iapTokens(S) || {};
  const done = {};
  const q = iapqAll();
  Object.keys(q).forEach(tok => { if (q[tok].att && t[tok]) done[q[tok].att] = true; });
  let changed = false;
  Object.keys(r).forEach(att => { if (done[att]) { delete r[att]; changed = true; } });
  return changed ? saveSlotConfirmed(curSlot) : Promise.resolve(true);
}
/* Sonucu öğrenilememiş, hâlâ yer tutan rezervasyon sayısı. Mağaza bunu yazıyor:
   kapasitenin neden kullanılamadığı kullanıcıya görünmeden tutulamaz. */
function iapHeldN() {
  if (typeof S === 'undefined' || !S) return 0;
  const r = iapResOf(S);
  return r ? Object.keys(r).length : 0;
}

/* Kariyer silinirken çağrılıyor (js/saves.js deleteSlot). Kayıt SİLİNMİYOR —
   ücretli bir işlem kaydı kaybedilemez; yalnız "hedefi yok" diye işaretleniyor.
   Hak başka bir kariyere OTOMATİK TAŞINMIYOR: kullanıcı +5'i o kariyer için
   aldı ve nereye gideceğine biz karar veremeyiz. */
function iapOrphanCid(cid) {
  if (!cid) return Promise.resolve(false);
  const q = iapqAll();
  let dirty = false;
  Object.keys(q).forEach(tok => {
    const rec = q[tok];
    if (rec.cid !== cid) return;
    if (rec.st === 'done') return;
    if (rec.st === 'granted' || rec.st === 'finishing' || rec.st === 'unverified') return;   // hak zaten yazılmış
    rec.st = 'orphan'; rec.note = 'deleted'; dirty = true;
  });
  return dirty ? iapqSave() : Promise.resolve(true);
}

/* ================= SATIN ALMA ================= */
function iapBuy(id) {
  const st = iapState(id);
  if (st !== 'go') {
    if (typeof toast === 'function') {
      toast(t(st === 'full' ? 'shopCapFull' : st === 'owned' ? 'shopOwned'
        : st === 'nocareer' ? 'shopNeedCareer' : st === 'busy' ? 'shopBusy' : 'shopOff'));
    }
    return false;
  }
  const p = iapById(id), P = iapBridge();
  if (!p || !P) return false;
  IAPS.busy = id;
  iapRepaint();
  const cid = (p.sc === 'career' && S) ? S.cid : null;

  /* Rezervasyon ÖNCE ve kalıcı. Yazılamazsa ödeme HİÇ başlamıyor. */
  const pre = p.cap ? iapReserve(p) : Promise.resolve(iapAtt());
  pre.then(att => {
    if (!att) { IAPS.busy = ''; iapRepaint(); iapToast('shopBuyFail'); return; }
    return P.purchaseProduct({
      productIdentifier: p.sku,
      productType: 'inapp',
      appAccountToken: iapTag(cid, att),
      /* İKİSİ DE FALSE: eklenti hiçbir şeyi kendiliğinden bitirmesin.
         isConsumable true olsaydı eklenti call.resolve()'dan ÖNCE consume
         ederdi (PurchaseActionDecider) — teslimattan önce kapatmak olurdu. */
      isConsumable: false,
      autoAcknowledgePurchases: false
    }).then(tx => {
      return iapIngest(tx, 'buy').then(r => {
        IAPS.busy = '';
        iapAfterBuy(r, att);
      });
    }, err => {
      /* Ret geldi. ÜÇ SINIF, ve fark rezervasyonun kaderi:
           - BU denemenin açık USER_CANCELED'ı        → KESİN, düşer
           - ödeme ekranının hiç açılmadığı sonuç      → KESİN, düşer
           - PENDING, bağlantı kaybı, her belirsiz şey → KALIR
         Sınıflandırma yalnız yamanın taşıdığı yapılandırılmış alandan; genel
         hata metninden iptal çıkarımı YOK. */
      IAPS.busy = '';
      const tag = iapTag(cid, att);
      const cancel = iapIsCancel(err, tag);
      const notStarted = !cancel && iapNotStarted(err, tag);
      const pending = iapIsPending(err);
      const sure = cancel || notStarted;
      return iapRelease(att, sure ? 'failed' : 'stale').then(() => {
        iapRepaint();
        iapToast(cancel ? 'shopCancelled' : pending ? 'shopPending'
          : notStarted ? 'shopBuyFail' : 'shopBuyUnsure');
        /* PENDING bir satın alma purchaseProduct'tan RET olarak döndüğü için
           kuyruğa girmiyor. Hemen bir uzlaştırma turu onu getPurchases()
           üzerinden kayda geçiriyor; yoksa ekranda "bekleyen ödeme" satırı
           bir sonraki açılışa kadar görünmezdi. */
        if (pending) return iapReconcile().then(() => iapRepaint(), () => 0);
      });
    });
  }).catch(() => { IAPS.busy = ''; iapRepaint(); iapToast('shopBuyFail'); });
  return true;
}
/* ================= RET SINIFLANDIRMASI =================

   Yayımlanan 8.7.0, OK OLMAYAN HER SONUCU — USER_CANCELED dahil — tek bir
   `call.reject("Purchase is not purchased")` çağrısına indiriyordu ve
   BillingResponseCode'u yalnız logluyordu. Bu yüzden "kullanıcı vazgeçti" ile
   "bağlantı koptu" ayırt edilemiyor, vazgeçen kullanıcının kapasitesi süresiz
   ayrılı kalıyordu.

   patches/@capgo+native-purchases+8.7.0.patch bunu kapatıyor: ret artık
   `err.code` içinde `npx:<aşama>:<kod>:<appAccountToken>` taşıyor.
     aşama  launch  → launchBillingFlow OK dönmedi; ödeme ekranı HİÇ açılmadı
            updated → onPurchasesUpdated OK dışı bir sonuç verdi (kod = BRC)
            state   → satın alma geldi ama PURCHASED değil (kod = PurchaseState)
     token  o çağrıya verilen appAccountToken — hangi DENEME olduğu.

   Metinden çıkarım YOK: yalnız bu yapılandırılmış alan okunuyor. Yama
   uygulanmamış bir ortamda `err.code` boş kalır ve her ret BELİRSİZ sayılır,
   yani davranış yamasız hâlde de güvenli tarafta kalır. */
const IAP_BRC_USER_CANCELED = 1;   // BillingClient.BillingResponseCode.USER_CANCELED

/* Ödeme ekranı açılmadan ÖNCE dönen argüman/ürün doğrulama hataları. Bunlar
   deterministik ve para almaları mümkün değil. Dizeler sabitlenen sürümün
   kaynağından birebir; eklenti yükseltilirse bu liste yeniden okunmalı. */
const IAP_NOT_STARTED = [
  'productIdentifier is empty',
  'productType is empty',
  'planIdentifier cannot be empty',
  'quantity is less than 1',
  'productIdentifiers array missing',
  'Product not found',
  'Offer token not found',
  'No one-time purchase offer details found'
];
/* err.code'u çözer. Yama yoksa ya da biçim tanınmıyorsa null — ve null,
   çağıran tarafta "belirsiz" demektir. */
function iapErrInfo(err) {
  const c = ((err && err.code) || '') + '';
  if (c.indexOf('npx:') !== 0) return null;
  const parts = c.split(':');
  if (parts.length < 4) return null;
  const n = parseInt(parts[2], 10);
  return { stage: parts[1], code: isNaN(n) ? null : n, tag: parts.slice(3).join(':') };
}
/* Bu ret, BU DENEMENİN kesin iptali mi.
   ÜÇ koşul birden — biri eksikse belirsiz sayılıyor:
     1) aşama 'updated' (satın alma akışı gerçekten açılmış ve sonuç vermiş),
     2) kod USER_CANCELED,
     3) taşınan appAccountToken BİZİM denemenin etiketi.
   (3) olmadan, gecikmiş bir callback yeni bir denemenin rezervasyonunu
   düşürebilirdi. */
function iapIsCancel(err, tag) {
  const i = iapErrInfo(err);
  return !!(i && i.stage === 'updated' && i.code === IAP_BRC_USER_CANCELED && i.tag === tag);
}
/* Ödeme akışı hiç başlamadı mı — rezervasyonu düşürmeye yeten ikinci sınıf.
   İki kaynak: yamanın 'launch' aşaması (launchBillingFlow OK dönmedi, yani
   ekran açılmadı) ve eklentinin ödeme öncesi doğrulama retleri. */
function iapNotStarted(err, tag) {
  const i = iapErrInfo(err);
  if (i && i.stage === 'launch') return i.tag === tag || !i.tag;
  const s = ((err && (err.message || err.code)) || '') + '';
  if (!s) return false;
  return IAP_NOT_STARTED.some(m => s.indexOf(m) !== -1);
}
/* Ret, satın almanın PENDING olduğunu mu söylüyor. Yamalı eklenti PENDING'i
   reddediyor (resolve etmiyor) — bu bir hata değil, bilinen bir aşama ve
   rezervasyon KESİNLİKLE korunmalı. */
function iapIsPending(err) {
  const i = iapErrInfo(err);
  return !!(i && i.stage === 'state' && i.code === 2);
}
function iapAfterBuy(r, att) {
  iapRepaint();
  if (r === 'done' || r === 'again') return iapToast('shopThanks');
  if (r === 'pending') return iapToast('shopPending');
  if (r === 'orphan' || r === 'unbound') return iapToast('shopStuck');
  if (r === 'undeliverable') return iapToast('shopUndeliver');
  if (r === 'finishfail' || r === 'writefail' || r === 'restorefail') return iapToast('shopLater');
  return iapToast('shopThanks');
}
function iapToast(k) { if (typeof toast === 'function' && typeof t === 'function') toast(t(k)); }
/* Mağaza açıksa yeniden çiz. Başka bir ekranı asla yenilemiyor. */
function iapRepaint() {
  try {
    if (typeof cur === 'function' && cur() && cur().v === 'shop' && typeof render === 'function') render();
  } catch (e) {}
}

/* ================= AÇILIŞ =================
   İLK ÇİZİMDEN SONRA çağrılıyor (js/main.js), hiçbir şey beklemiyor: Play
   sorgusu saniyeler sürebilir ve menü onu beklememeli. */
function iapInit() {
  if (IAPS.boot) return Promise.resolve('again');
  const P = iapBridge();
  /* Köprü yokken açılış İŞARETLENMİYOR: "çalıştı" demek, hiçbir şey yapmadan
     kapıyı kapatmak olurdu. Web/PWA/tek dosya sürümünde köprü zaten hiç
     gelmiyor ve bu yol her seferinde aynı ucuz cevabı veriyor. */
  if (!P) return Promise.resolve('nobridge');
  IAPS.boot = true;
  /* Kuyruk yüklemesi depolamanın hazır olmasını bekliyor (iapqLoad), ama ÜRÜN
     SORGUSU onu beklemiyor: ikisi paralel gidiyor ve yalnız UZLAŞTIRMA kuyruğa
     bağlı. Fiyatların gelmesi yerel diskin açılmasına takılmamalı.

     Kuyruk gelmezse uzlaştırma da YAPILMIYOR ve satın alma kapalı kalıyor;
     kurtarma yolu bir zamanlayıcı değil, iapRetry(). */
  const ql = iapqLoad();
  return P.isBillingSupported().then(res => {
    IAPS.sup = !!(res && res.isBillingSupported);
    if (!IAPS.sup) return 'nostore';
    /* Uzlaştırma iapqPrepare() üzerinden, yani mağaza ya da kariyer açılışıyla
       aynı tek turdan. ql yalnız "hazırlık zaten başladı" demek için erken
       çağrılıyor; ürün sorgusu onu beklemiyor. */
    return iapProducts().then(() => ql).then(q => q ? iapqPrepare().then(() => 'ok') : 'noq');
  }, () => { IAPS.sup = false; return 'nostore'; }).then(r => { iapRepaint(); return r; });
}
/* Fiyatlar Play'den, YERELLEŞTİRİLMİŞ olarak. Kodda hiçbir fiyat yok ve
   sorgu tutmazsa satın alma KAPALI kalıyor (iapAvailable). */
function iapProducts() {
  const P = iapBridge();
  if (!P || typeof P.getProducts !== 'function') { IAPS.prod = 'fail'; return Promise.resolve('fail'); }
  return P.getProducts({ productIdentifiers: IAP_PRODUCTS.map(p => p.sku) }).then(res => {
    const list = (res && res.products) || [];
    let n = 0;
    list.forEach(pr => {
      const pid = iapPidOfSku(pr.identifier || pr.productIdentifier);
      const px = pr.priceString || pr.displayPrice || '';
      if (pid && px) { IAPS.price[pid] = px; n++; }
    });
    IAPS.prod = n === IAP_PRODUCTS.length ? 'ok' : 'fail';
    return IAPS.prod;
  }, () => { IAPS.prod = 'fail'; return 'fail'; });
}
/* Kariyer açıldığında: bekleyen bir teslimat varsa hedefi artık bulunabilir. */
function iapOnCareerOpen() {
  /* Kuyruk yüklenememişse burası sessizce geçilmiyor: kariyeri açmak
     kullanıcının bir eylemi ve kontrollü bir yeniden deneme için doğru an.
     Yükleme yine tutmazsa hiçbir teslimat denenmiyor. */
  if (!IAPQ) return iapRetry().then(() => IAPQ ? iapOnCareerOpen() : 'noq');
  const q = iapqAll();
  let p = Promise.resolve();
  Object.keys(q).forEach(tok => {
    const rec = q[tok];
    if (rec.st === 'orphan' && rec.cid && iapSlotOfCid(rec.cid)) rec.st = 'ready';
    if (rec.st === 'ready' || rec.st === 'granted' || rec.st === 'finishing') {
      p = p.then(() => iapAdvance(rec).catch(() => 0));
    }
  });
  return p.then(() => 'ok');
}
