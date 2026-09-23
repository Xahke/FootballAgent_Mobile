'use strict';
/* js/saves.js — kayıt yuvaları ve cihaz tercihleri.

   Neden ayrı bir katman:

   1) Ana menü üç yuvayı da özetlemek zorunda, ama tam kayıt ~7000 oyuncu tutuyor.
      Menüyü her açışta üç kaydı da ayrıştırmak telefonda gözle görülür bir
      bekleme demekti. Bu yüzden her yazışta küçük bir özet ayrı bir anahtara
      düşüyor; menü yalnızca onu okuyor. Yuva sayısı artarsa maliyet değişmez.

   2) Tema, dil ve ses artık kayıttan bağımsız. Ana menüde açık bir kariyer yok —
      S null — ama Ayarlar oradan da açılabilmeli. Cihaza ait olan bu üç tercih
      PREFS'e taşındı. Kariyere ait olanlar (hafta raporu, olaylar) S'de kaldı.

   Kayıtların kendisi artık IndexedDB'de (js/store.js — nedeni orada yazıyor).
   Bu dosya yuva kavramını ve göçü tutuyor, depolamanın nasıl çalıştığını değil.

   İki şey senkron kalmak zorundaydı ve kaldı:

   - PREFS. Daha ilk çizimden önce, bu dosya yüklenirken okunuyor (dil menüden
     önce doğru olmalı). Küçük olduğu için localStorage'da kaldı; kotayı zorlayan
     kayıtlar oradan çıkınca yazması da güvene girdi.
   - Menü özeti. allMeta() bellekteki META'yı döndürüyor; render() her hafta
     çağrılıyor ve söz bekleyemez. META açılışta bir kez okunuyor, sonra her
     yazışta senkron güncelleniyor ve diske arkadan yazılıyor.

   Eski tek kayıtlı sürümden ve localStorage döneminden gelenler kayıpsız
   devralınıyor: göç önce yazar, yazdığını geri okuyup doğrular, ancak ondan
   sonra eskisini siler. Yarıda kesilirse hiçbir şey kaybolmaz, bir sonraki
   açılışta kaldığı yerden devam eder. */

const SLOTS=3;
const LEGACYKEY='menajerSaveV9';        // tek kayıtlı sürümün anahtarı
const SLOTKEY=n=>'menajerSaveV9s'+n;    // localStorage dönemi — yalnız göç okur
const PREFKEY='menajerPrefsV1';
/* 0 = açık kariyer yok (ana menüdeyiz). save() nereye yazacağını buradan bilir. */
let curSlot=0;
/* Açılış tamamlanana kadar menü "yükleniyor" gösteriyor; boş yuva göstermek
   kaydı silinmiş gibi görünürdü. */
let storeReady=false;

/* ================= CİHAZ TERCİHLERİ ================= */
let PREFS=jparse(lsGet(PREFKEY))||{};
function savePrefs(){
  if(lsSet(PREFKEY,JSON.stringify(PREFS)))noteSaveOk('prefs');
  else noteSaveFail('prefs',new Error('PrefsQuota'));
}
function pref(k,d){return PREFS[k]===undefined?d:PREFS[k];}
function setPref(k,v){PREFS[k]=v;savePrefs();}
/* dil tercihi kayıttan önce gelir: menü daha S yüklenmeden doğru dilde açılmalı */
if(PREFS.lang)L=PREFS.lang;

/* ================= KARİYER KİMLİĞİ =================
   Bir kariyeri bugüne kadar yalnız yuva numarası tanımlıyordu. Ama yuva
   numarası kariyerin kendisi değil, durduğu raf: silinip aynı yuvada kurulan
   yeni bir kariyer eskisiyle aynı 's1' anahtarını taşıyor. Kariyere bağlanacak
   herhangi bir şeyin yanlış kariyere düşmemesi için kimliğin yuvadan bağımsız
   olması gerekiyor.

   Kimlik addan, saatten ya da yuva numarasından TÜRETİLMİYOR — üçü de aynı
   kimliği iki kez üretebilir. 16 bayt rastgelelik yetiyor ve ortamda ne varsa
   ondan alınıyor: WebView'da crypto.getRandomValues her zaman var, olmadığı
   yerde Math.random'a düşüyor. Yeni bir bağımlılık yok.

   crypto.randomUUID kasten kullanılmıyor: güvenli bağlam istiyor, oysa tek
   dosya sürümü file:// üzerinden de açılıyor. getRandomValues'ın böyle bir
   koşulu yok. */
function newCid(){
  const b=new Uint8Array(16);
  const c=(typeof crypto!=='undefined'&&crypto&&typeof crypto.getRandomValues==='function')?crypto:null;
  if(c)c.getRandomValues(b);
  else for(let i=0;i<16;i++)b[i]=Math.floor(Math.random()*256);
  let s='';
  for(let i=0;i<16;i++)s+=(b[i]+256).toString(16).slice(1);
  return s;
}
/* Kimliği olmayan eski kayda kimlik verir. Dönüş "yeni kimlik atandı mı" —
   çağıran taraf yalnızca o zaman kaydetmek zorunda kalsın diye. Geçerli kimliği
   olan kayda dokunmuyor: kimlik bir kez yazıldıktan sonra kariyerin ömrü
   boyunca aynı kalır, yükleme de kaydetme de onu değiştirmez. */
function ensureCid(st){
  if(!st||(typeof st.cid==='string'&&st.cid))return false;
  st.cid=newCid();
  return true;
}

/* ================= YUVA ÖZETLERİ =================
   Bellekte tutuluyor; diske arkadan yazılıyor. Okuyanların hepsi senkron kalır. */
let META={};
function allMeta(){return META;}
function slotMeta(n){return META['s'+n]||null;}
function slotUsed(n){return !!slotMeta(n);}
function anySlot(){for(let n=1;n<=SLOTS;n++)if(META['s'+n])return true;return false;}
/* Özeti diske bırakır. metaDirtyC(), aynı işi yapıp "yazdığım özet gerçekten
   şunu taşıyordu" sorusunu cevaplayan söz döndürüyor — kuyruk anahtar başına
   birleştiği için tanık, depolamaya VERİLEN özet üzerinde çalışıyor. */
function metaDirtyC(witness){const p=queueRec('meta',()=>META,witness);rememberIdbSlots();return p;}
function metaDirty(){metaDirtyC();}

/* ================= ARKA UÇ GÖLGESİ =================
   IndexedDB bir açılışta açılamayabilir: bozuk profil, dolu disk, başka bir
   sekmenin tuttuğu eski sürüm, bazı gizli sekme kipleri. Katman o zaman
   localStorage'a düşüyor — ve kariyerlerin kaydı orada YOK. Menü üç boş yuva
   çiziyordu.

   Boş yuva "kaydın silindi" demektir ve kullanıcıyı üstüne yeni bir kariyer
   kurmaya davet eder. Oysa kayıt yerli yerinde duruyor, yalnız bu açılışta
   okunamıyor: GEÇİCİ BİR ERİŞİM HATASI, KAYDIN YOKLUĞUNUN KANITI DEĞİLDİR.

   Bu yüzden IndexedDB gerçekten kullanılabilirken hangi yuvalarda kayıt olduğu
   cihaz tercihlerine yazılıyor. Bu bir KOPYA değil, bir İPUCU: yalnız "orada
   bir kayıt vardı" der, içeriği hakkında hiçbir şey söylemez ve hiçbir zaman
   veri kaynağı olarak okunmaz. Tek işi, okuyamadığımız bir yuvayı menünün boş
   göstermemesi. Eskimiş olabilir; eskimiş olması da zararsız, çünkü gölge yuva
   yalnızca "şimdi kurma, önce depoyu düzelt" der. */
function rememberIdbSlots(){
  if(SAVEH.backend!=='idb')return;
  const a=[];
  for(let n=1;n<=SLOTS;n++)if(META['s'+n])a.push(n);
  const s=a.join(',');
  if(pref('idbs',null)!==s){PREFS.idbs=s;savePrefs();}
}
/* "Burada bir kariyer var ama şu anda okuyamıyoruz." Yalnız localStorage'a
   düşülmüşken anlamlı; IndexedDB açıkken gerçeğin kendisi elimizde. */
function slotShadow(n){
  if(SAVEH.backend!=='ls'||META['s'+n])return false;
  return (','+pref('idbs','')+',').indexOf(','+n+',')>=0;
}
function anyShadow(){for(let n=1;n<=SLOTS;n++)if(slotShadow(n))return true;return false;}
/* Özet menüde gösterilen her şeyi taşır; tam kaydı açmaya gerek kalmaz.
   totalWeeks() global S'yi okuduğu için burada fikstürden yeniden hesaplanıyor —
   bu fonksiyon her zaman kendisine verilen duruma bakmalı.

   cid burada TÜRETİLMİŞ bir dizin: hangi yuvada hangi kariyerin durduğunu tam
   kaydı açmadan bilmek için. Kimliğin asıl kaynağı kariyer kaydıdır; özet
   eskimiş ya da eksik olabilir ve bu asla kariyere yeni kimlik ürettirmez
   (bkz. ensureCid — yalnız kaydın kendisine bakar). Henüz hiç açılmamış eski
   bir kayıtta kimlik olmayabilir; o zaman burası boş dize taşır. */
function metaOf(st){
  const tw=(st.fx&&st.fx.length)?Math.max.apply(null,st.fx.map(f=>f.length)):st.week;
  return {agent:st.agent?(st.agent.fn+' '+st.agent.ln):'',
          agency:st.agent?st.agent.agency:'',
          season:st.season,week:Math.min(st.week,tw),
          cash:st.cash,rep:Math.round(st.rep),
          clients:(st.clients||[]).length,
          cid:st.cid||'',
          ts:Date.now()};
}

/* ================= YUVA İŞLEMLERİ ================= */
function validSave(d){return !!(d&&d.S&&d.S.players&&d.S.fx&&d.S.fx.length===LEAGUES.length);}

/* Senkron döner: "kuyruğa alındı" demek, "diske yazıldı" demek değil. Gerçek
   sonuç SAVEH üzerinden görünür oluyor (ui.js kalıcı bir şerit çiziyor) —
   eskiden burada dönen false hiçbir yere gitmiyordu, asıl hata oydu. */
function saveToSlot(n,witness){
  if(!n||typeof S==='undefined'||!S)return false;
  META['s'+n]=metaOf(S);
  /* Kayıt nesnesi yazma anında kuruluyor ki birleşen istekler en güncel durumu
     yazsın. snap ile hangi kariyeri yazdığımızı sabitliyoruz: bu arada yuva
     değiştirilmişse S başka bir kariyeri gösteriyor olabilir. PID ise sayaç —
     eskimişini yazmak yeniden yüklemede id çakışması demek olurdu, bu yüzden
     hâlâ aynı kariyerdeysek güncel değeri alınıyor. */
  const snap=S,pidAtQueue=PID;
  const p=queueRec('s'+n,()=>({v:SAVE_SCHEMA,S:snap,PID:(S===snap?PID:pidAtQueue)}),witness);
  metaDirty();
  return p;
}
/* Aynı kaydı yapar, ama "istediğim içerik gerçekten depolandı mı" sorusunu
   cevaplar (true/false). Tanık, kaydın depolamaya verildiği anda o içerik
   üzerinde çalıştırılıyor (js/store.js — seal), yani canlı bir referansı
   sonradan okumuyor: put'tan sonra aynı nesneye eklenen bir şey kanıta
   giremiyor.

   false üç şeyi birden kapsar: yazma düştü, arkadan gelen bir silme kaydı yok
   etti, ya da uçuşa giden içerik beklenen kariyer/içerik değildi (kuyruk anahtar
   başına birleşiyor; araya giren bir yuva değişimi başka bir kariyerin
   snapshot'ını yazdırabilir). Oyunun geri kalanı save() ile senkron kalıyor. */
function saveSlotConfirmed(n,witness){
  const p=saveToSlot(n,witness);
  return p?Promise.resolve(p):Promise.resolve(false);
}

/* Asenkron: yalnız üç yerden çağrılıyor (yuva açma, göç doğrulaması, testler).
   Dönüş {ok:true} ya da {ok:false,reason}. reason ayrımı önemli — 'future'
   bozuk kayıt değil, yeni bir sürümün yazdığı kayıt; onu silmek veri kaybı olur. */
function loadSlot(n){
  return recGet('s'+n).then(rec=>{
    if(!rec)return dropSlotMeta(n,'missing');
    if(schemaOf(rec)>SAVE_SCHEMA)return {ok:false,reason:'future'};
    const d=migrateSave(rec);
    if(!validSave(d))return dropSlotMeta(n,'broken');
    S=d.S;PID=d.PID;curSlot=n;
    /* Kariyer kimliği eski kayıtlarda yok; ilk açılışta veriliyor ve hemen
       yazılıyor. saveToSlot() senkron dönüyor ama bu yalnız "kuyruğa alındı"
       demek — yazmanın gerçekten tuttuğunu SAVEH söylüyor ve başarısızlık
       ui.js'in kalıcı uyarı şeridine düşüyor. Bu yüzden buradan "kimlik
       kalıcılaştı" anlamına gelecek bir dönüş YOK: bu fonksiyon bunu bilemez,
       bilmediği bir şeyi de rapor etmemeli. Yazma tutmazsa kimlik bellekte
       kalır ve bir sonraki açılışta yeniden denenir. */
    if(ensureCid(S))saveToSlot(n);
    /* Dil cihaz tercihi; yoksa kaydın kendi dili devralınır (eski kayıtlar). */
    L=PREFS.lang||S.lang||'tr';
    /* Bekleyen bir satın alma bu kariyeri hedefliyor olabilir: hedefi artık
       bulunabilir durumda. Beklenmiyor — teslimat kullanıcının bu ekranı
       görmesine bağlanamaz, yalnız burada bir fırsat daha doğuyor. */
    if(typeof iapOnCareerOpen==='function')iapOnCareerOpen();
    return {ok:true};
  },()=>({ok:false,reason:'error'}));
}
/* özet var ama kayıt yok/bozuk: yuvayı boş göster, menü yalan söylemesin */
function dropSlotMeta(n,reason){
  if(META['s'+n]){delete META['s'+n];metaDirty();}
  return {ok:false,reason:reason};
}
function deleteSlot(n){
  /* Kimlik özetten okunuyor çünkü kayıt birazdan gidiyor. Kariyere ait sürmekte
     olan bir ödül gösterimi varsa o da gider: ödül yalnız o cid'ye aitti ve
     başka bir kariyere aktarılmıyor. Aynı yuvada kurulacak yeni kariyerin cid'i
     zaten farklı olacağı için ona da geçemez. */
  const meta=META['s'+n];
  if(meta&&meta.cid)rwDropCid(meta.cid);
  /* Ücretli işlem kaydı SİLİNMİYOR — ödülün tersine. Ödül bedava bir haktı ve
     kariyeriyle birlikte gitmesi doğru; para ödenmiş bir satın almanın kaydını
     silmek, kullanıcının elindeki tek izi yok etmek olurdu. Kayıt "hedefi yok"
     diye işaretleniyor ve hak başka bir kariyere OTOMATİK TAŞINMIYOR. */
  if(meta&&meta.cid&&typeof iapOrphanCid==='function')iapOrphanCid(meta.cid);
  delete META['s'+n];
  queueDel('s'+n);
  metaDirty();
  if(curSlot===n){curSlot=0;S=null;}
  /* Yer açıldı: yer olmadığı için localStorage'da bekleyen bir kurtarma varsa
     şimdi tamamlanabilir. Beklenmiyor — menü kurtarma bitince kendini çiziyor. */
  if(RESCUE.length)RESCUEP=retryRescue();
}

/* ================= AÇILIŞ VE GÖÇ =================
   Sıra önemli:
   1) arka uç seçilir (IndexedDB var mı),
   2) özet okunur,
   3) özet GERÇEKLE uzlaştırılır — göç "hedef yuvada kayıt var mı" sorusunu
      özet üzerinden ucuza cevaplıyor ve eksik bir özet o soruyu YANLIŞ
      cevaplardı ("yok" deyip mevcut kariyerin üstüne yazdırırdı),
   4) localStorage yuvaları taşınır,
   5) tek kayıtlı sürümün anahtarı taşınır,
   6) özet bir kez daha uzlaştırılır (göç yeni kayıtlar yazmış olabilir).
   Her adım kendi başına yeniden çalıştırılabilir; yarıda kesilen göç bir sonraki
   açılışta kaldığı yerden devam eder. */
function storeInit(){
  return storeBackendInit()
    .then(()=>recGet('meta'))
    .then(m=>{META=m||{};},()=>{META={};})
    .then(reconcileMeta)
    .then(migrateLsSlots)
    .then(migrateLegacy)
    .then(reconcileMeta)
    .then(()=>{storeReady=true;rememberIdbSlots();},e=>{storeReady=true;noteSaveFail('init',e);});
}

/* ================= localStorage DÖNEMİNİN DEVRİ =================
   Kayıpsız olmasının tek yolu sırayı bozmamak: yaz → geri oku → aynı mı diye
   bak → ANCAK O ZAMAN sil. Karşılaştırma tam serileştirme üzerinden; pahalı ama
   kayıt başına ömürde bir kez çalışıyor ve "taşıdım sandım" ihtimalini
   bırakmıyor.

   Eksik olan şey HEDEFE BAKMAKTI. Eski sürüm kaynağı doğrudan 's<n>' üzerine
   yazıyordu; hedefte ne olduğunu hiç sormuyordu. İki ayrı yoldan kariyer
   kaybettiriyordu:

   1) Arka uç zaten localStorage iken kaynak ile hedef AYNI anahtardır. Kayıt
      kendi üstüne yazılıyor, doğrulama tabii ki geçiyor, ardından kaynak
      siliniyordu — IndexedDB açılamayan bir cihazda kariyer ikinci açılışta
      yok oluyordu.
   2) IndexedDB bir açılışta açılamayıp kullanıcı localStorage yolunda aynı
      yuvada yeni bir kariyer kurduğunda, sonraki başarılı açılış o yeni kaydı
      IndexedDB'deki eski kariyerin üstüne yazıyordu.

   Bugünkü kural tek cümle: KAYNAK ANCAK HEDEFİN ONU ZATEN TAŞIDIĞI
   KANITLANIRSA SİLİNİR. Kanıtlanamayan her durumda iki kayıt da kalır. */

/* Kariyer kimliği — yoksa boş dize. Kimliksiz eski kayıtlar hiçbir kimlikle
   eşleşmez, bu yüzden hiçbir zaman çatal sayılmazlar. */
function recCid(rec){
  const c=rec&&rec.S&&rec.S.cid;
  return (typeof c==='string'&&c)?c:'';
}
/* Kaynağın hedefe ne yapacağı. Dönüş:
   'done'     kaynağın BİREBİR aynısı zaten bir yuvada duruyor — kaynak silinebilir
   'fork'     aynı kariyer kimliği, farklı içerik — karantinaya (bkz. parkFork)
   'move'     hedef boş, ya da oyunun hiç açamayacağı bir kalıntı — normal göç
   'conflict' başka bir kariyer aynı yuvayı istiyor — boş yuvaya kurtarma

   BURADA SIRALAMA YOK, ve olmaması bilinçli. Önceki sürüm "aynı cid + hedef eşit
   ya da ileri (season, week)" durumunu kaynağın hedefte KAPSANDIĞI kanıtı sayıp
   kaynağı siliyordu. Değildi:

   - Aynı hafta içinde ayrışmış iki kopyanın (season, week)'i eşittir ve
     içerikleri farklıdır; sıralama onları ayıramaz.
   - İleri haftadaki bir kopya, geride kalan kopyaya teslim edilmiş bir satın
     alma tokenını (S.iap.t) taşımıyor olabilir. İlerleme kapsama demek değil.

   Kayıt biçimi bir sürüm/soy zinciri taşımıyor, yani "şu kopya şunun torunudur"
   diye bir kanıt yok. Elimizdeki tek gerçek kanıt TAM EŞDEĞERLİK: korunması
   gereken bütün yük (v, S, PID) bit bit aynı. Kaynak yalnız o zaman siliniyor. */
function moveVerdict(dst){
  if(dst===undefined||dst===null)return 'move';
  /* İleri sürümlü kayıt bozuk değil, daha yeni bir sürümün yazdığı kayıttır;
     loadSlot() ile aynı kural, asla üstüne yazılmaz. */
  if(schemaOf(dst)>SAVE_SCHEMA)return 'conflict';
  /* Oyunun açamadığı bir kalıntı gerçek bir kariyerin önünü kesmiyor. */
  if(!validSave(migrateSave(dst)))return 'move';
  return 'conflict';
}
/* Bu kimliği taşıyan CANLI yuva. Karantinadakiler canlı değil, burada yoklar. */
function cidSlot(cid){
  if(!cid)return 0;
  for(let n=1;n<=SLOTS;n++){const m=META['s'+n];if(m&&m.cid===cid)return n;}
  return 0;
}
/* Özet karşılaştırması — ts hariç, çünkü kurtarılan kopyanın özeti kurtarma
   anında üretiliyor ve saati farklı olur. Ucuz ön eleme; kararı tam
   karşılaştırma veriyor. */
function metaLike(a,b){
  return !!(a&&b&&a.cid===b.cid&&a.agent===b.agent&&a.agency===b.agency&&
            a.season===b.season&&a.week===b.week&&a.cash===b.cash&&
            a.rep===b.rep&&a.clients===b.clients);
}
/* Bu kaydın BİREBİR aynısı zaten bir yuvada duruyor mu? Kurtarma ya da park
   yazıldıktan SONRA, kaynak silinmeden kesilen bir açılış aksi halde her
   seferinde bir kopya daha üretirdi. Önce özetten eleniyor: çakışma yolunda
   normalde hiçbir tam okuma yapılmıyor. */
function findSameRec(want,mo){
  let p=Promise.resolve(0);
  for(let m=1;m<=SLOTS;m++)p=p.then(((k)=>hit=>{
    if(hit||!metaLike(META['s'+k],mo))return hit;
    return recGet('s'+k).then(r=>(r&&JSON.stringify(r)===want)?k:0,()=>0);
  })(m));
  return p;
}
/* Kurtarma için boş yuva. "Boş" üç kaynağa birden bakıyor: özet, arka ucun
   gerçek anahtarları ve localStorage'da bekleyen başka bir göç kaynağı. */
function freeSlotFor(busy){
  busy=busy||{};
  for(let m=1;m<=SLOTS;m++){
    if(META['s'+m]||busy['s'+m])continue;
    if(lsGet(SLOTKEY(m))!==null)continue;
    return m;
  }
  return 0;
}
/* Yer bulunamadığı için localStorage'da bekleyen kayıtlar. Menü bunu gösteriyor
   (js/ui.js, cmRescueHtml): sessizce beklemesi, kullanıcı açısından kaybolmakla
   aynı şey olurdu. why: 'noRoom' boş yuva yok, 'forkBusy' karantina dolu. */
let RESCUE=[];
let RESCUED=0;
/* Yuva boşalınca başlatılan kurtarmanın sözü. Oyun beklemiyor (menü kurtarma
   bitince kendini çiziyor); testlerin belirlenimci olması için duruyor. */
let RESCUEP=null;
function rescuePending(){return RESCUE;}
function rescuedCount(){return RESCUED;}
function rescueTask(){return RESCUEP||Promise.resolve();}

/* ================= KARANTİNA (AYNI KİMLİKLİ ÇATAL) =================
   Aynı cid'yi taşıyan ikinci bir kopya boş bir yuvaya KONMUYOR. Konsaydı
   kimlik iki canlı kariyeri birden gösterirdi ve cid'ye bağlı her şey bozulurdu:

   - iapSlotOfCid() META'yı tarayıp İLK eşleşen yuvayı döner; ödeme yanlış
     kopyaya teslim edilebilirdi.
   - deleteSlot() cid'ye bakıp rwDropCid()/iapOrphanCid() çağırıyor; bir kopyayı
     silmek diğerinin bekleyen ücretli işlemini hedefsiz bırakırdı.
   - İki kopya da aynı S.iap.t tokenını taşırsa bir satın alma iki kariyerde
     birden kapasite verirdi.

   Kopyayı kurtarmak için cid'yi kendiliğinden değiştirmek de çözüm değil: cid
   ödemenin hedefi, ve onu sessizce değiştirmek bekleyen bir işlemin hedefini
   koparır. Bu yüzden ikinci kopya karantinada duruyor — kalıcı, menüde görünür,
   ama canlı bir kariyer değil. Ne yapılacağına KULLANICI karar veriyor. */
const FORKKEY=n=>'f'+n;
function forkList(){
  const fk=(META&&META.fk)||{};
  return Object.keys(fk).filter(k=>fk[k]&&fk[k].meta)
    .map(k=>({key:k,slot:fk[k].slot,meta:fk[k].meta}));
}
function forkOf(key){const fk=(META&&META.fk)||{};return fk[key]||null;}
/* Özet ve kayıt ayrı yazılıyor, bu yüzden dizin KALICI olmadan kaynak silinmiyor:
   yazılmış ama dizine girmemiş bir kopya kullanıcı için görünmez olurdu. Tanık
   (js/store.js — seal) depolamaya verilen özetin gerçekten girdiyi taşıdığını
   söylüyor, canlı META'yı sonradan okumuyor. */
function noteFork(k,n,mo){
  if(!META.fk||typeof META.fk!=='object')META.fk={};
  META.fk[k]={slot:n,meta:mo};
  return metaDirtyC(m=>!!(m&&m.fk&&m.fk[k]));
}
function dropFork(k){
  if(META.fk)delete META.fk[k];
  return metaDirtyC(m=>!(m&&m.fk&&m.fk[k]));
}
function parkFork(n,rec,want,mo){
  const k=FORKKEY(n);
  return recGet(k).then(cur=>{
    if(cur&&JSON.stringify(cur)===want){
      /* Zaten park edilmiş; dizin ya da kaynak silme adımı yarıda kalmış. */
      return noteFork(k,n,mo).then(okw=>{
        if(okw)lsDel(SLOTKEY(n));
        return okw?'parked':'verifyFailed';
      });
    }
    /* Dolu ve BAŞKA bir kayıt. Dizinde karşılığı varsa kullanıcının kararını
       bekleyen gerçek bir çatal demektir: dokunmuyoruz, kaynak da yerinde kalıyor.
       Dizinde karşılığı YOKSA o baytlara hiçbir yoldan ulaşılamıyor ve oraya
       ancak iki yoldan düşülür — park dizini yazamadı (kaynak hâlâ ls'te) ya da
       kurtarma kaydı yuvaya yazıp silmeye gelemedi (kayıt yuvada). İki durumda
       da veri başka bir yerde duruyor, yani üstüne yazmak kayıp değil. */
    if(cur&&forkOf(k)){RESCUE.push({from:n,meta:mo,why:'forkBusy'});return 'forkBusy';}
    return recPut(k,rec)
      .then(()=>recGet(k))
      .then(back=>{
        if(!back||JSON.stringify(back)!==want)return 'verifyFailed';
        return noteFork(k,n,mo).then(okw=>{
          if(okw)lsDel(SLOTKEY(n));
          return okw?'parked':'verifyFailed';
        });
      });
  }).catch(e=>{noteSaveFail(k,e);return 'writeFailed';});
}
/* Kullanıcının kararı 1: saklanan kopyayı kur.
   Kurtarma BİREBİR: kayıt olduğu gibi yazılıyor — kimlik de, ödeme defteri de,
   rezervasyonlar da değişmiyor. Bir önceki sürüm burada yeni bir cid atayıp
   S.iap'ı düşürüyordu; ikisi de yanlıştı:

   - Ödenmiş bir token YALNIZ saklanan kopyada duruyor olabilir (oynanan kopya o
     satın almayı hiç görmemiş olabilir). Onu düşürmek, "kurtarma" adı altında
     para ödenmiş bir kaydı silmekti — üstelik karantina kaydı da hemen ardından
     siliniyordu, yani geri getirilemiyordu.
   - cid bekleyen bir satın almanın hedefi (iapSlotOfCid). Sessizce değiştirmek
     o bağı koparır.

   Bunun bedeli, kurtarmanın bir ÖN KOŞULU olması: bu kimlik hiçbir yuvada canlı
   olmamalı, çünkü aynı cid iki canlı yuvada duramaz. Canlı ikiz yerindeyken
   kurtarma yapılmıyor ve ekran nedenini yazıyor — kayıplı bir kopya üretmek
   yerine iki özgün kayıt da olduğu gibi korunuyor. İki defteri birleştirmek de
   çözüm değil: tavan, rezervasyon ve token tekilliği ayrı ayrı bozulurdu.

   Kuyruk önce boşaltılıyor: yuva silme kuyruktan geçiyor, recPut ise geçmiyor —
   uçuştaki bir silme, az önce yazdığımız kaydı silebilirdi. */
function forkRestore(key){
  if(!forkOf(key))return Promise.resolve('gone');
  return saveDrain().then(()=>recGet(key)).then(rec=>{
    if(!forkOf(key))return 'gone';
    const d=migrateSave(rec);
    if(!validSave(d))return 'broken';
    /* Kanıt kaydın KENDİSİNDEN okunuyor, dizinden değil: dizin eskimiş olabilir. */
    if(cidSlot(recCid(rec)))return 'live';
    const m=freeSlotFor();
    if(!m)return 'noRoom';
    const want=JSON.stringify(rec);
    return recPut('s'+m,rec)
      .then(()=>recGet('s'+m))
      .then(back=>{
        if(!back||JSON.stringify(back)!==want)return 'verifyFailed';
        META['s'+m]=metaOf(d.S);
        if(META.fk)delete META.fk[key];
        return metaDirtyC(mm=>!!(mm&&mm['s'+m])&&!(mm.fk&&mm.fk[key])).then(okw=>{
          if(!okw)return 'verifyFailed';
          /* Geçiş BİREBİR tamamlandı ve doğrulandı; ancak o zaman karantina
             kopyası silinebilir. Silinemese bile veri kaybı yok — dizinsiz kalan
             baytların üstüne bir sonraki park yazabilir (bkz. parkFork). */
          return recDel(key).then(()=>{forkFreed();return 'restored';},()=>'restored');
        });
      });
  }).catch(err=>{noteSaveFail(key,err);return 'writeFailed';});
}
/* Kullanıcının kararı 2: kopyayı sil. Sessiz bir kayıp değil — ekran soruyor. */
function forkDiscard(key){
  if(!forkOf(key))return Promise.resolve(false);
  return recDel(key).then(()=>dropFork(key).then(()=>{forkFreed();return true;}),
                          e=>{noteSaveFail(key,e);return false;});
}
/* Karantina yeri boşaldı: yalnız orası dolu olduğu için localStorage'da bekleyen
   bir kaynak varsa şimdi park edilebilir. Beklenmiyor — menü kendini çiziyor. */
function forkFreed(){
  if(RESCUE.some(r=>r.why==='forkBusy'))RESCUEP=retryRescue();
}

/* Çakışma: BAŞKA bir kariyer aynı yuvayı istiyor. İkisi de kalıyor —
   localStorage'dan gelen BOŞ BİR YUVAYA kurtarılıyor ve menüde normal bir
   kariyer olarak görünüyor. Boş yuva yoksa hiçbir şey silinmiyor: kaynak yerinde
   bekliyor, menü kullanıcıya bir yuva boşaltmasını söylüyor ve yuva boşalınca
   kurtarma kendiliğinden tamamlanıyor. */
function rescueOneSlot(n,rec,want,mo,busy){
  /* Oyunun açamayacağı bir kalıntı için yuva harcamıyoruz. Silmiyoruz da. */
  if(!mo)return Promise.resolve('invalid');
  const m=freeSlotFor(busy);
  if(!m){RESCUE.push({from:n,meta:mo,why:'noRoom'});return Promise.resolve('noRoom');}
  return recPut('s'+m,rec)
    .then(()=>recGet('s'+m))
    .then(back=>{
      if(!back||JSON.stringify(back)!==want)return 'verifyFailed';
      busy['s'+m]=true;
      META['s'+m]=mo;metaDirty();
      lsDel(SLOTKEY(n));
      RESCUED++;
      return 'rescued';
    })
    .catch(e=>{noteSaveFail('s'+n,e);return 'writeFailed';});
}

function moveOneSlot(n,busy){
  busy=busy||{};
  const raw=lsGet(SLOTKEY(n));
  if(raw===null)return Promise.resolve('none');
  const d=jparse(raw);
  /* Hiç ayrıştırılamıyorsa taşınacak anlamlı bir şey yok. Silmiyoruz da —
     elde tutulan bozuk bayt, silinmiş bayttan iyidir. */
  if(!d||typeof d!=='object')return Promise.resolve('unparsable');
  const rec={v:SAVE_SCHEMA,S:d.S,PID:d.PID};
  const want=JSON.stringify(rec);
  const mo=validSave(rec)?metaOf(rec.S):null;
  /* Önce hedef okunuyor. Okuma hatasının AYRI bir cevap olması bu düzeltmenin
     özü: "okuyamadım" ile "orada bir şey yok" aynı sayılırsa geçici bir hata
     mevcut kariyerin üstüne yazdırır. Hata durumunda hiçbir şey yazılmıyor,
     kaynak yerinde duruyor, göç bir sonraki açılışa kalıyor. */
  return recGet('s'+n).then(dst=>{
    if(dst&&JSON.stringify(dst)===want){lsDel(SLOTKEY(n));return 'done';}
    /* Aynı kayıt başka bir yuvaya daha önce taşınmış olabilir. */
    return findSameRec(want,mo).then(hit=>{
      if(hit){lsDel(SLOTKEY(n));return 'done';}
      /* Kimlik CANLI bir yuvada zaten varsa bu kayıt o kariyerin ikinci
         kopyasıdır — hedef yuva boş olsa bile karantinaya gidiyor, çünkü
         yazılsaydı aynı cid iki canlı yuvada görünürdü. */
      const cs=recCid(rec);
      if(cs&&cidSlot(cs))return parkFork(n,rec,want,mo);
      const v=moveVerdict(dst);
      if(v==='conflict')return rescueOneSlot(n,rec,want,mo,busy);
      return recPut('s'+n,rec)
        .then(()=>recGet('s'+n))
        .then(back=>{
          if(!back||JSON.stringify(back)!==want)return 'verifyFailed';
          busy['s'+n]=true;
          lsDel(SLOTKEY(n));
          if(!META['s'+n]&&mo){META['s'+n]=mo;metaDirty();}
          return 'moved';
        })
        .catch(e=>{noteSaveFail('s'+n,e);return 'writeFailed';});
    });
  },e=>{noteSaveFail('s'+n,e);return 'readFailed';});
}
function migrateLsSlots(){
  RESCUE=[];
  /* Arka uç zaten localStorage ise taşınacak bir YER yok: kaynak anahtarı ile
     hedef anahtarı aynı. Eski sürüm bunu fark etmiyordu (yukarıdaki 1. yol). */
  if(SAVEH.backend==='ls')return Promise.resolve();
  return recSlotKeys().then(keys=>{
    const busy={};keys.forEach(k=>{busy[k]=true;});
    let p=Promise.resolve();
    for(let n=1;n<=SLOTS;n++)p=p.then(((k)=>()=>moveOneSlot(k,busy))(n));
    return p;
  },e=>{
    /* Hedefin durumunu okuyamadık. Okuyamamak "kayıt yok" demek değil: hiçbir
       şey yazılmıyor, kaynaklar yerinde kalıyor, göç bir sonraki açılışa. */
    noteSaveFail('init',e);
  });
}
/* Yuva boşalınca bekleyen kurtarmayı tamamlar. Kuyruk boşalmadan bakmak yuvayı
   hâlâ dolu görürdü — silme de aynı kuyruktan geçiyor. */
function retryRescue(){
  return saveDrain().then(migrateLsSlots).then(()=>{
    if(!curSlot&&typeof render==='function')render();
  });
}

/* ================= ESKİ KAYDIN DEVRİ =================
   Tek kayıtlı sürümden güncelleyen oyuncu ana menüde kariyerini 1. yuvada bulur.
   Yazma başarısız olursa eski anahtar silinmez — ilerleme kaybolmaktansa iki kez
   denenmesi yeğdir.

   1. yuvanın dolu olup olmadığına artık META'dan bakılıyor, localStorage'dan
   değil: kayıtlar oradan çıktığı için eski kontrol her açılışta "yuva boş" der
   ve gerçek kaydın üstüne yazardı. */
function migrateLegacy(){
  const raw=lsGet(LEGACYKEY);
  if(!raw)return Promise.resolve(false);
  if(META.s1){lsDel(LEGACYKEY);return Promise.resolve(false);}   // yuva zaten dolu
  const d=jparse(raw);
  if(!validSave(d)){lsDel(LEGACYKEY);return Promise.resolve(false);}
  const rec={v:SAVE_SCHEMA,S:d.S,PID:d.PID};
  const want=JSON.stringify(rec);
  return recPut('s1',rec)
    .then(()=>recGet('s1'))
    .then(back=>{
      if(!back||JSON.stringify(back)!==want)return false;
      META.s1=metaOf(d.S);metaDirty();
      /* Cihaz tercihleri o güne dek kaydın içindeydi; ilk kez dışarı taşınıyor. */
      if(PREFS.theme===undefined&&d.S.theme)PREFS.theme=d.S.theme;
      if(PREFS.lang===undefined&&d.S.lang)PREFS.lang=d.S.lang;
      if(PREFS.sfxOn===undefined&&d.S.sfxOn!==undefined)PREFS.sfxOn=d.S.sfxOn;
      savePrefs();
      if(PREFS.lang)L=PREFS.lang;
      lsDel(LEGACYKEY);
      return true;
    })
    .catch(e=>{noteSaveFail('s1',e);return false;});
}

/* Özet ile gerçeğin tuttuğundan emin ol. İki yön de mümkün: özet yazılmadan
   uygulama kapanmışsa kayıt var ama özet yok; kayıt silinememişse tersi.
   Yalnız anahtarlara bakılıyor — üç kaydı okumak 20 MB ayrıştırmak olurdu. */
function reconcileMeta(){
  return recSlotKeys().then(keys=>{
    const has={};keys.forEach(k=>{has[k]=true;});
    let changed=false,rebuild=[];
    for(let n=1;n<=SLOTS;n++){
      const k='s'+n;
      if(META[k]&&!has[k]){delete META[k];changed=true;}
      else if(!META[k]&&has[k])rebuild.push(n);
    }
    if(changed)metaDirty();
    /* Özeti olmayan kaydın özeti yeniden kuruluyor — nadir yol, tam okuma gerekir. */
    let p=Promise.resolve();
    rebuild.forEach(n=>{
      p=p.then(()=>recGet('s'+n)).then(rec=>{
        const d=migrateSave(rec);
        if(validSave(d)){META['s'+n]=metaOf(d.S);metaDirty();}
      },()=>{});
    });
    return p;
  },()=>{});
}
