'use strict';
/* js/reward.js — kariyer başına günlük ödül hakkı ve ödülün güvenilir teslimatı.

   BU DOSYA REKLAM GÖSTERMİYOR. Reklam SDK'sı, izin akışı, satın alma ve
   mağaza ekranı burada yok. Burada yalnız "hak" ve "teslimat" muhasebesi var.
   Tek çağıran js/ads.js: rwRequest()'i düğmeye basıldığında, rwEarned()'i
   yalnız gösterime özgü promise çözülünce çağırıyor. Sahte bir sağlayıcı, hata
   ayıklama bayrağı ya da bedava para yolu YOK — taklit reklam sonuçları yalnız
   tools/ altındaki test ortamından, bu fonksiyonlar doğrudan çağrılarak geliyor.

   İzin akışının bu dosyaya hiç dokunmadığına dikkat: UMP formunu görüntülemek
   ne ödül sayılıyor ne de günün hakkını tüketiyor, çünkü izin yolunda
   rwRequest() hiç çağrılmıyor.

   ===== İki durum birbirine karıştırılmıyor =====

   requested/showing  → kullanıcı düğmeye bastı, reklam oynuyor. HİÇBİR ŞEY
                        kazanılmadı. Bu kaydın varlığı ödül hakkı doğurmaz.
   earned/delivered   → SDK "ödül kazanıldı" dedi. Ancak bu andan sonra para
                        konuşulabilir.

   Ödülsüz kapatma ve yükleme hatası yalnız 'req' kaydını siler; hakka
   dokunmaz (bkz. rwAbandon).

   ===== Neyin nerede durduğu =====

   Kariyer kaydında (S.rw) — para, kullanılmış gün ve teslim edilmiş gösterim
   BİRLİKTE duruyor, çünkü tek bir IndexedDB kaydı tek bir yapısal kopyayla
   yazılıyor: üçü birbirine göre atomik. Ayrı depolara bölünselerdi "para
   yazıldı ama gün yazılmadı" hali mümkün olurdu.

     S.rw.d  bugünün hakkının kapalı olduğu gün anahtarı (teslimat ya da saat
             onarımı kapatır). Sayaç değil, kapı.
     S.rw.n  { <günAnahtarı>: <nonce> } — GERÇEKTEN ödenmiş günlerin TAM kaydı.
             Yetkili kayıt bu; budanmıyor (nedeni aşağıda). Gerçek takvim günü
             başına en fazla bir giriş büyüyor.
     S.rw.t  bu kariyerde en son gözlemlenen epoch — saat referansı.

   Cihaz tercihlerinde (PREFS.rw[cid]) — yalnız SÜRMEKTE olan bir gösterim.
   Kariyer kapalıyken de yaşamak zorunda olduğu için S'de duramaz; ana menüde
   S null'dır. Kariyer başına en fazla bir kayıt: eşzamanlı ikinci istek bu
   yüzden başlatılamıyor.

   ===== Neden çift ödeme imkânsız =====

   Teslimat şöyle sıralı: önce S mutasyonu (para + gün + nonce), sonra yazmanın
   GERÇEKTEN tamamlandığının doğrulanması (saveSlotConfirmed), ve ancak ondan
   sonra PREFS kaydının silinmesi. Üç halin üçü de doğru sonuçlanıyor:

   - Yazma düştü  → PREFS kaydı 'earned' olarak duruyor, sonraki açılışta
                    yeniden deneniyor. S.rw.n[gün] bellekte zaten nonce'u
                    taşıdığı için para İKİNCİ KEZ eklenmiyor; yalnız kalıcılık
                    yeniden doğrulanıyor.
   - Yazma tuttu, PREFS silinmeden çöküş → sonraki açılışta S.rw.n[gün] diskten
                    aynı nonce ile geliyor, "zaten uygulanmış" görülüyor, para
                    eklenmiyor, kayıt temizleniyor.
   - Aynı gösterimin bildirimi ikinci kez (ertesi gün bile) gelirse → aynı
                    kontrol yakalıyor.

   Gerçek sınır: SDK "kazanıldı" dedikten sonra, PREFS'e tek bir senkron yazma
   yapılmadan uygulama ölürse o ödül kurtarılamaz. Sunucusuz bunun çaresi yok
   (çaresi AdMob sunucu tarafı doğrulamasıdır ve sunucu ister). Kayıp penceresi
   bir ödülle sınırlı ve telafi edilmiyor. */

const RW={
  /* 50.000 € — S.cash bin € cinsinden tutuluyor (core.js: başlangıç 250 = 250K,
     fmtK 1000'in altını K basıyor). Onaylanmış değer. */
  amount:50,
  /* Epoch bu kadar milisaniyeden fazla geriye giderse saat geri alınmış
     sayılıyor. NTP düzeltmesi ve küçük kaymalar bunun altında kalır. Saat
     dilimi değişikliği epoch'u geriye ALMAZ — bu yüzden test yalnız epoch'a
     bakıyor, gün anahtarına değil. */
  back:60000
};

/* Uygulama oturumu kimliği. Süreç her başladığında yeniden üretiliyor, hiçbir
   yere yazılmıyor. İşi tek: PREFS'te duran 'req' kaydının HÂLÂ CANLI bir
   gösterime mi ait olduğunu söylemek. Reklam SDK'sı süreçle birlikte ölür, yani
   başka bir oturumda açılmış 'req' kaydının arkasında oynayan bir reklam yoktur
   ve o kayıt kariyeri sonsuza dek kilitler (bkz. rwReap). Aynı oturumdaki kayıt
   ise gerçekten canlı olabilir — kariyer değiştirmek onu iptal etmemeli. */
const RW_SESSION=newCid();

/* Gün anahtarı yerel yıl/ay/günden üretiliyor. toLocaleDateString kasten
   kullanılmıyor: çıktısı WebView'ın ICU'suna ve biçim tercihlerine bağlı, oysa
   burada karşılaştırılabilir ve kararlı bir değer gerekiyor. */
function rwDayKey(ms){
  const d=new Date(ms===undefined?Date.now():ms);
  return d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate();
}

/* ================= KARİYER TARAFI (S.rw) ================= */
/* Eski kayıtlarda S.rw yok ve olmak zorunda da değil: okumalar varsayılana
   düşüyor, alan yalnız gerçekten yazılacağı anda kuruluyor. */
function rwOf(st){return (st&&st.rw)||{};}
function rwEnsure(st){
  if(!st.rw||typeof st.rw!=='object')st.rw={d:0,t:0,n:{}};
  if(!st.rw.n||typeof st.rw.n!=='object')st.rw.n={};
  return st.rw;
}
/* ===== BUDAMA YOK — bilinçli =====
   Önceki tasarımda rw.n en yeni N günle sınırlanıyor, atılan günler bir "taban"
   (rw.f) ile korunuyordu: tabandan eski güne teslimat yapılmıyordu. İki kural
   birbiriyle çelişti ve ödemeyi ikiye katlayabildi:

   - Saat ileri alınmışken alınan ödüller rw.n'i gelecekteki gün anahtarlarıyla
     doldurup tabanı da geleceğe taşıyordu. Saat düzeltilince taban gerçek günün
     ilerisinde kalıyor ve her teslimatı reddediyordu — kullanıcı reklamı izleyip
     karşılığını alamıyordu.
   - Tabanı onarımda sıfırlamak bu kilidi açıyor, ama BUDANMIŞ bir gösterimin
     nonce'u rw.n'den zaten silinmiş olduğu için o ödül ikinci kez ödenebilir
     hâle geliyordu. rw.n'e dokunmamak yetmiyor: silinen bilgi orada değil.

   Bu aşamada budama tümüyle ertelendi. rw.n ödenmiş günlerin TAM kaydı; taban
   diye bir kavram yok, dolayısıyla onarımla çelişecek bir şey de yok. Maliyeti
   küçük: gerçek takvim günü başına bir giriş (~45 bayt), on yıllık bir kariyer
   için ~165 KB — 2-7,5 MB'lık kaydın yanında ihmal edilebilir.

   Budama ileride gerekirse, yerine getirmesi gereken kural şu: budanan bir
   gösterimin yeniden ödenmesini engelleyen bilgi, saat onarımından SAĞ ÇIKMAK
   zorunda. Bugünkü "taban" bunu sağlamıyordu. */

/* ================= CİHAZ TARAFI (PREFS.rw) ================= */
function rwPrefs(){
  if(!PREFS.rw||typeof PREFS.rw!=='object')PREFS.rw={};
  return PREFS.rw;
}
/* PREFS senkron yazılıyor ama başarısız olabilir (depolama kapalı/dolu).
   Yazdığını geri okuyup doğruluyoruz: "bellekte duruyor" kalıcı kayıt sayılmaz.
   Başarısızlık zaten savePrefs() içinden SAVEH'e düşüyor ve ekrandaki uyarı
   şeridine yansıyor. */
function rwWritePrefs(){
  savePrefs();
  /* Geri okunan değer bellektekiyle birebir eşleşmeli. "rw alanı var mı" diye
     bakmak yetmezdi: yazma düştüğünde diskte ÖNCEKİ rw duruyor olur ve o kontrol
     yanlışlıkla geçerdi. */
  try{
    const back=jparse(lsGet(PREFKEY));
    return !!back&&JSON.stringify(back.rw||{})===JSON.stringify(PREFS.rw||{});
  }catch(e){return false;}
}
function rwPendOf(cid){const r=rwPrefs()[cid];return r||null;}
function rwFindByNonce(nonce){
  const p=rwPrefs();
  const k=Object.keys(p).find(c=>p[c]&&p[c].n===nonce);
  return k?p[k]:null;
}
/* Ölü oturumdan kalan 'req' kayıtlarını sonlandırır.

   Neden gerekli: rwRequest() PREFS'e 'req' yazıyor, sonra uygulama kapanıyor.
   Yeniden açılışta o kayıt duruyor ve rwPendOf() dolu döndüğü için rwCanClaim()
   o kariyerde ARTIK HİÇBİR GÜN true dönmüyor — kalıcı kilit. Arkasında oynayan
   bir reklam da yok: SDK süreçle birlikte öldü.

   Sonlandırma para vermiyor, günlük hakka dokunmuyor (S hiç okunmuyor) ve
   'earned' kayıtlarını ASLA silmiyor — kazanılmış ödül burada değil, teslimat
   yolunda ilerler. Yalnız kendi oturumumuzun dışında açılmış 'req' kayıtları
   gidiyor; aynı oturumda süren gerçek bir gösterim, kariyer değiştirilse bile
   iptal edilmiyor.

   PREFS yazması düşerse bellekteki silme geri alınmıyor: kullanıcı bu oturumda
   kilitten çıkmalı, kayıt inert olduğu için diskte kalması zararsız ve bir
   sonraki açılışta yeniden sonlandırılır. Dönüş, yazmanın tuttuğunu söyler. */
function rwReap(){
  const p=rwPrefs();
  const dead=Object.keys(p).filter(c=>p[c]&&p[c].st==='req'&&p[c].sid!==RW_SESSION);
  if(!dead.length)return true;
  dead.forEach(c=>{delete p[c];});
  return rwWritePrefs();
}
/* Kariyer silindiğinde o kariyerin sürmekte olan gösterimi de gider: para
   yalnız o cid'ye aitti, başka kariyere aktarılmıyor. */
function rwDropCid(cid){
  if(!cid)return;
  const p=rwPrefs();
  if(!p[cid])return;
  delete p[cid];
  rwWritePrefs();
}

/* ================= SAAT ONARIMI =================
   Yalnız BU kariyeri ilgilendiriyor; cihaz genelinde bütün kariyerleri
   kilitleyen bir clockMax yok. Onarım para vermiyor, S.rw.n'e (gerçekten
   ödenmiş günlere) dokunmuyor, bekleyen kazanılmış ödülü silmiyor.

   Ceza yapısal olarak en fazla BİR gün: kapı bugüne kapanıyor, referans şimdiye
   çekiliyor, ertesi yerel takvim günü yeniden açılıyor. Saati ileri alıp geri
   düzelten bir kullanıcı aylarca kilitlenmiyor. */
function rwRepair(now){
  if(!S)return false;
  const rw=S.rw;
  if(!rw||!(rw.t>0))return false;
  if(now>=rw.t-RW.back)return false;
  /* Yalnız kapı ve saat referansı değişiyor. rw.n'e dokunulmuyor: ödenmiş
     günlerin kaydı onarımdan sağ çıkmak zorunda, yoksa saat oynatıp düzelten
     biri aynı ödülü ikinci kez alabilirdi. */
  rw.d=rwDayKey(now);
  rw.t=now;
  return true;
}

/* ================= HAK ================= */
/* Saf yüklem: yazmıyor. Saat onarımının çalışmış olması gerekiyorsa çağıran
   taraf (rwRequest / rwSync) onu önce yapar. */
function rwCanClaim(now){
  if(!S||!S.cid||!curSlot)return false;
  now=now||Date.now();
  if(rwPendOf(S.cid))return false;              // aynı kariyerde ikinci istek yok
  const rw=rwOf(S),day=rwDayKey(now);
  if(rw.d===day)return false;                   // bugünün kapısı kapalı
  if((rw.n||{})[day])return false;              // bugün zaten ödenmiş
  /* Başka eşik yok. Hak ile teslimat aynı iki şeyi okuyor (rw.d ve rw.n), bu
     yüzden "hak var" deyip sonra teslimatta reddetmek mümkün değil. */
  return true;
}

/* Düğmeye basma anı. Gün ve hedef kariyer BURADA sabitleniyor ve bir daha
   değişmiyor: 23.59'da başlayıp 00.01'de biten reklam önceki günün hakkını
   kullanır, yeni günün hakkı açık kalır.

   Hak tüketilmiyor — yalnız aynı kariyerde ikinci bir gösterim engelleniyor.
   Dönüş: nonce ya da null (hak yok / PREFS yazılamadı). */
function rwRequest(now){
  if(!S||!S.cid||!curSlot)return null;
  now=now||Date.now();
  /* Onarım para vermez ama kalıcı olmalı, yoksa her açılışta yeniden tetiklenir. */
  if(rwRepair(now))saveToSlot(curSlot);
  if(!rwCanClaim(now))return null;
  /* sid: bu kaydı açan uygulama oturumu. Süreç ölürse kayıt sahipsiz kalır ve
     rwReap() onu sonlandırır (bkz. orada). */
  const rec={n:newCid(),d:rwDayKey(now),cid:S.cid,st:'req',at:now,sid:RW_SESSION};
  rwPrefs()[S.cid]=rec;
  if(!rwWritePrefs()){delete rwPrefs()[S.cid];return null;}
  return rec.n;
}

/* Reklam yüklenemedi ya da ödül kazanılmadan kapatıldı. Yalnız 'req' siliniyor:
   kazanılmış bir ödül, arkasından gelen bir kapatma bildirimiyle yok edilemez.
   Hakka hiç dokunulmuyor — S.rw okunmuyor bile. */
function rwAbandon(nonce){
  const p=rwPrefs();
  const k=Object.keys(p).find(c=>p[c]&&p[c].n===nonce&&p[c].st==='req');
  if(!k)return false;
  delete p[k];
  rwWritePrefs();
  return true;
}

/* SDK "ödül kazanıldı" dedi. Hedef kariyeri AKTİF kariyerden değil, gösterimi
   başlatan kayıttan buluyoruz. Kayıt önce 'earned'a geçip kalıcılaşıyor; ancak
   ondan sonra teslimat deneniyor.

   Dönüş (söz): 'delivered' | 'again' | 'pending' | 'writefail' | 'prefsfail' |
   'dayused' | 'unknown'. 'pending' = ödül kazanıldı ama hedef kariyer açık
   değil; o kariyer açıldığında teslim edilecek. */
function rwEarned(nonce,now){
  now=now||Date.now();
  const rec=rwFindByNonce(nonce);
  if(!rec)return Promise.resolve('unknown');
  if(rec.st!=='earned'){
    rec.st='earned';rec.et=now;
    if(!rwWritePrefs())return Promise.resolve('prefsfail');
  }
  return rwDeliver(rec,now);
}

/* Kazanılmış bir ödülü sahibi kariyere işler. Aktif kariyer başkasıysa hiçbir
   şey yapmaz ve kayıt bekler — ödül sessizce düşürülmüyor. */
function rwDeliver(rec,now){
  now=now||Date.now();
  if(!S||!curSlot||S.cid!==rec.cid)return Promise.resolve('pending');
  const rw=rwEnsure(S),day=rec.d;
  let st;
  if(rw.n[day]===rec.n){
    /* Zaten uygulanmış — diskte ya da yalnız bellekte. Para İKİNCİ KEZ
       eklenmiyor; bu tur sadece kalıcılığı doğrulamak için. */
    st='again';
  }else if(rw.n[day]){
    st='dayused';                 // o günün hakkını başka bir gösterim tüketmiş
  }else{
    S.cash+=RW.amount;
    rw.n[day]=rec.n;
    /* Kapı yalnız ileri gider: geç teslim edilen ESKİ bir ödül, daha yeni bir
       günün kullanılmış hakkını geri açmaz. */
    if(day>(rw.d||0))rw.d=day;
    rw.t=now;
    st='delivered';
  }
  if(st==='dayused'){rwDropCid(rec.cid);return Promise.resolve(st);}
  /* save() dönmesi ya da nonce'un bellekte olması kalıcı kayıt SAYILMIYOR.
     Dahası "bir yazma tamamlandı" da yetmiyor: kuyruk anahtar başına birleşiyor,
     araya giren bir yuva değişimi ya da yeniden yükleme BAŞKA bir kariyerin
     snapshot'ını yazdırabilir. Bu yüzden içerik, depolamaya verildiği ANDA bir
     tanıkla doğrulanıyor (js/store.js — seal): doğru cid ve o güne yazılmış
     doğru nonce. Tanık canlı nesneyi sonradan okumadığı için, put'tan sonra
     eklenen bir nonce kanıta giremiyor. PREFS kaydı ancak bu doğrulama geçerse
     siliniyor; geçmezse 'earned' olarak durur ve yeniden denenir. */
  return saveSlotConfirmed(curSlot,w=>rwPersisted(w,rec.cid,day,rec.n)).then(ok=>{
    if(!ok)return 'writefail';
    rwDropCid(rec.cid);
    return st;
  });
}
/* Depolamaya verilen kayıt gerçekten BU teslimatı taşıyor mu. Canlı nesne
   kimliğine bakmıyor: kariyer yeniden yüklendiğinde S başka bir nesne olur, ama
   cid ve nonce aynı kalır — doğrulama onların üzerinden yürüyor. */
function rwPersisted(w,cid,day,nonce){
  return !!(w&&w.S&&w.S.cid===cid&&w.S.rw&&w.S.rw.n&&w.S.rw.n[day]===nonce);
}

/* Kariyer açılışında çalışır: saat onarımı + bekleyen kazanılmış ödülün
   teslimi. Üretimde bekleyen kayıt hiç oluşmadığı için bu yol para vermiyor —
   rwEarned() çağıran bir üretim kodu yok. */
function rwSync(now){
  /* Sonlandırma S'den bağımsız: ana menüden gelirken de ölü kayıtlar temizlensin. */
  rwReap();
  if(!S||!S.cid||!curSlot)return Promise.resolve('idle');
  now=now||Date.now();
  const repaired=rwRepair(now);
  const rec=rwPendOf(S.cid);
  if(rec&&rec.st==='earned')return rwDeliver(rec,now);   // kendi save'ini yapıyor
  if(repaired)return saveSlotConfirmed(curSlot).then(()=>'repaired');
  return Promise.resolve('idle');
}
