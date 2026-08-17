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

/* ================= YUVA ÖZETLERİ =================
   Bellekte tutuluyor; diske arkadan yazılıyor. Okuyanların hepsi senkron kalır. */
let META={};
function allMeta(){return META;}
function slotMeta(n){return META['s'+n]||null;}
function slotUsed(n){return !!slotMeta(n);}
function anySlot(){for(let n=1;n<=SLOTS;n++)if(META['s'+n])return true;return false;}
function metaDirty(){queueRec('meta',()=>META);}
/* Özet menüde gösterilen her şeyi taşır; tam kaydı açmaya gerek kalmaz.
   totalWeeks() global S'yi okuduğu için burada fikstürden yeniden hesaplanıyor —
   bu fonksiyon her zaman kendisine verilen duruma bakmalı. */
function metaOf(st){
  const tw=(st.fx&&st.fx.length)?Math.max.apply(null,st.fx.map(f=>f.length)):st.week;
  return {agent:st.agent?(st.agent.fn+' '+st.agent.ln):'',
          agency:st.agent?st.agent.agency:'',
          season:st.season,week:Math.min(st.week,tw),
          cash:st.cash,rep:Math.round(st.rep),
          clients:(st.clients||[]).length,
          ts:Date.now()};
}

/* ================= YUVA İŞLEMLERİ ================= */
function validSave(d){return !!(d&&d.S&&d.S.players&&d.S.fx&&d.S.fx.length===LEAGUES.length);}

/* Senkron döner: "kuyruğa alındı" demek, "diske yazıldı" demek değil. Gerçek
   sonuç SAVEH üzerinden görünür oluyor (ui.js kalıcı bir şerit çiziyor) —
   eskiden burada dönen false hiçbir yere gitmiyordu, asıl hata oydu. */
function saveToSlot(n){
  if(!n||typeof S==='undefined'||!S)return false;
  META['s'+n]=metaOf(S);
  /* Kayıt nesnesi yazma anında kuruluyor ki birleşen istekler en güncel durumu
     yazsın. snap ile hangi kariyeri yazdığımızı sabitliyoruz: bu arada yuva
     değiştirilmişse S başka bir kariyeri gösteriyor olabilir. PID ise sayaç —
     eskimişini yazmak yeniden yüklemede id çakışması demek olurdu, bu yüzden
     hâlâ aynı kariyerdeysek güncel değeri alınıyor. */
  const snap=S,pidAtQueue=PID;
  queueRec('s'+n,()=>({v:SAVE_SCHEMA,S:snap,PID:(S===snap?PID:pidAtQueue)}));
  metaDirty();
  return true;
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
    /* Dil cihaz tercihi; yoksa kaydın kendi dili devralınır (eski kayıtlar). */
    L=PREFS.lang||S.lang||'tr';
    return {ok:true};
  },()=>({ok:false,reason:'error'}));
}
/* özet var ama kayıt yok/bozuk: yuvayı boş göster, menü yalan söylemesin */
function dropSlotMeta(n,reason){
  if(META['s'+n]){delete META['s'+n];metaDirty();}
  return {ok:false,reason:reason};
}
function deleteSlot(n){
  delete META['s'+n];
  queueDel('s'+n);
  metaDirty();
  if(curSlot===n){curSlot=0;S=null;}
}

/* ================= AÇILIŞ VE GÖÇ =================
   Sıra önemli:
   1) arka uç seçilir (IndexedDB var mı),
   2) özet okunur — hangi yuvaların dolu sayıldığını bilmeden göç yapılamaz,
   3) localStorage yuvaları taşınır,
   4) tek kayıtlı sürümün anahtarı taşınır,
   5) özet gerçekle karşılaştırılır.
   Her adım kendi başına yeniden çalıştırılabilir; yarıda kesilen göç bir sonraki
   açılışta kaldığı yerden devam eder. */
function storeInit(){
  return storeBackendInit()
    .then(()=>recGet('meta'))
    .then(m=>{META=m||{};},()=>{META={};})
    .then(migrateLsSlots)
    .then(migrateLegacy)
    .then(reconcileMeta)
    .then(()=>{storeReady=true;},e=>{storeReady=true;noteSaveFail('init',e);});
}

/* localStorage'daki bir kaydı arka uca taşır. Kayıpsız olmasının tek yolu
   sırayı bozmamak: yaz → geri oku → aynı mı diye bak → ancak o zaman sil.
   Karşılaştırma tam serileştirme üzerinden; pahalı ama kayıt başına ömürde bir
   kez çalışıyor ve "taşıdım sandım" ihtimalini bırakmıyor. */
function moveOneSlot(n){
  const raw=lsGet(SLOTKEY(n));
  if(raw===null)return Promise.resolve('none');
  const d=jparse(raw);
  /* Hiç ayrıştırılamıyorsa taşınacak anlamlı bir şey yok. Silmiyoruz da —
     elde tutulan bozuk bayt, silinmiş bayttan iyidir. */
  if(!d||typeof d!=='object')return Promise.resolve('unparsable');
  const rec={v:SAVE_SCHEMA,S:d.S,PID:d.PID};
  const want=JSON.stringify(rec);
  return recPut('s'+n,rec)
    .then(()=>recGet('s'+n))
    .then(back=>{
      if(!back||JSON.stringify(back)!==want)return 'verifyFailed';
      lsDel(SLOTKEY(n));
      if(!META['s'+n]&&validSave(rec)){META['s'+n]=metaOf(rec.S);metaDirty();}
      return 'moved';
    })
    .catch(e=>{noteSaveFail('s'+n,e);return 'writeFailed';});
}
function migrateLsSlots(){
  let p=Promise.resolve();
  for(let n=1;n<=SLOTS;n++)p=p.then(((k)=>()=>moveOneSlot(k))(n));
  return p;
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
