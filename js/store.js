'use strict';
/* js/store.js — kalıcı depolama katmanı (IndexedDB, localStorage'a düşüşle).

   Neden localStorage bırakıldı:

   Bir kariyerin kaydı ilk haftada ~2 milyon karakter, sekizinci sezonda ~7,5
   milyonda oturuyor (sızıntı değil — l5, seasons, inbox, arch hepsi sınırlı;
   7000 oyuncunun taşıdığı veri bu kadar). localStorage origin başına 5 MiB ile
   sınırlı ve karakterleri UTF-16, yani 2 bayt sayıyor. Sonuç: ilk kaydın kendisi
   kotanın %80'ini yiyor, üçüncü hafta civarında yazma başarısız oluyordu ve
   üç yuvanın ikisi hiçbir zaman kullanılamıyordu.

   Daha kötüsü sessizdi. lsSet() false dönüyordu ama save() dönüş değerini
   atıyordu; oyuncu ilerlemesinin yazılmadığını ancak uygulamayı kapatıp
   açtığında anlıyordu. Bu dosyanın ikinci işi o sessizliği bitirmek.

   IndexedDB'nin kotası diskin bir yüzdesi; aynı kayıt orada rahat sığıyor.
   Bedeli asenkron olması, ve oyunun her yerinden çağrılan save() senkron kalmak
   zorunda — 25 çağrı yeri var, hiçbiri beklemek istemiyor. Bu yüzden burada bir
   arkadan yazma kuyruğu var: save() kaydı kuyruğa bırakıp döner, yazma arka
   planda olur. Anahtar başına aynı anda tek yazma uçar; o sürerken gelen
   istekler tek bir bekleyende birleşir (son yazan kazanır), böylece bir hafta
   içinde üç kez save() çağrılması üç kez 7 MB kopyalamaz.

   Okuma asenkron kaldı ama yalnızca üç yerde okunuyor: açılış, yuva açma, göç.
   Menünün okuduğu özet bellekte tutulduğu için (js/saves.js, META) render()
   senkron kalabiliyor — orası her hafta çağrılıyor, oraya söz veremezdik.

   IndexedDB kullanılamıyorsa (bazı gizli sekme kipleri, kapatılmış depolama)
   katman sessizce localStorage'a düşer: oyun çalışmaya devam eder, yalnız eski
   kota sınırı geri gelir — ama bu kez kullanıcı bunu görür. */

/* ================= DÜŞÜK SEVİYE: localStorage =================
   Depolama kapatılmış ya da kota dolmuş olabilir; hiçbiri oyunu çökertmemeli.
   Bu üçü hâlâ gerekiyor çünkü cihaz tercihleri (PREFS) burada kalıyor: küçükler
   ve daha ilk çizimden önce, senkron okunmaları gerekiyor. */
function jparse(s){try{return JSON.parse(s);}catch(e){return null;}}
function lsGet(k){try{return localStorage.getItem(k);}catch(e){return null;}}
function lsSet(k,v){try{localStorage.setItem(k,v);return true;}catch(e){return false;}}
function lsDel(k){try{localStorage.removeItem(k);}catch(e){}}

/* ================= KAYIT ŞEMASI SÜRÜMÜ =================
   Kayıtlar artık sürüm taşıyor: {v, S, PID}. localStorage döneminde yazılmış
   kayıtlarda v yok; onlar 9 sayılıyor (anahtar adı menajerSaveV9 idi).

   Kural: her adım bir öncekinin çıktısını alır ve bir sonrakine çevirir, sırayla
   uygulanır. Bir alan eklemek şema sürümü gerektirmez — CLAUDE.md'nin dediği gibi
   her yeni alan yokken de çalışmak zorunda. Sürüm ancak var olan bir alanın
   anlamı değişirse artar; o zaman burada bir adım yazılır ve eski kayıtlar
   yüklenirken çevrilir. Kayıt anahtarını bir daha asla bump etmeyeceğiz. */
const SAVE_SCHEMA=10;
const SCHEMA_STEPS={
  /* 9 → 10: localStorage'dan IndexedDB'ye taşındı. Alanların hiçbiri değişmedi,
     bu yüzden adım kimlik. Yine de burada duruyor: zinciri kurmadan ilk gerçek
     göç geldiğinde eski kayıtları çevirecek yer olmaz. */
  9:function(rec){return rec;}
};
/* Sürümü olmayan kayıt localStorage dönemindendir. */
function schemaOf(rec){return (rec&&typeof rec.v==='number')?rec.v:9;}
/* Dönüş: çevrilmiş kayıt, ya da neden çevrilemediğini söyleyen null.
   İleri sürümlü kayıt (kullanıcı eski bir sürüme döndü) bozuk sayılmaz —
   yüklenmez ama silinmez de; yeni sürüm geri geldiğinde yerinde durur. */
function migrateSave(rec){
  if(!rec)return null;
  let v=schemaOf(rec);
  if(v>SAVE_SCHEMA)return null;                 // gelecekten gelen kayıt
  while(v<SAVE_SCHEMA){
    const step=SCHEMA_STEPS[v];
    if(!step)return null;                       // zincirde boşluk: çeviremeyiz
    rec=step(rec);
    if(!rec)return null;
    v++;
  }
  rec.v=SAVE_SCHEMA;
  return rec;
}

/* ================= KAYIT SAĞLIĞI =================
   Yazma başarısızlığı artık bir yere gidiyor. ui.js bunu okuyup kalıcı bir
   uyarı şeridi çiziyor; sessizce yutulan tek yol kalmadı.

   Sağlık anahtar başına izleniyor, tek bir bayrakla değil. Sebep ölçülerek
   bulundu: kayıt 5 MiB'i aştığında yuvanın yazması patlıyor ama hemen ardından
   giden küçük özet yazması başarılı oluyordu — tek bayraklı sürümde bu, uyarıyı
   açıldığı anda kapatıyordu. Özetin yazılabilmesi kariyerin yazılabildiğini
   söylemez. Bir anahtar ancak kendisi yeniden yazılabildiğinde temizleniyor. */
const SAVEH={ok:true,fails:0,lastErr:'',lastOkAt:0,everFailed:false,backend:'ls'};
const _bad={};
function saveHealthy(){return SAVEH.ok;}
function saveBackend(){return SAVEH.backend;}
function saveBadKeys(){return Object.keys(_bad);}
/* ui.js yüklendikten sonra bu kancayı tanımlıyor; store.js ondan önce yüklendiği
   için varlığı kontrol ediliyor (açılışın ilk anlarında henüz yok). */
function fireSaveHealth(){if(typeof onSaveHealth==='function'){try{onSaveHealth();}catch(e){}}}
function syncSaveHealth(){
  const ok=Object.keys(_bad).length===0;
  if(ok===SAVEH.ok)return;
  SAVEH.ok=ok;
  fireSaveHealth();
}
function noteSaveOk(key){
  delete _bad[key||'?'];
  SAVEH.lastOkAt=Date.now();
  syncSaveHealth();
}
function noteSaveFail(key,e){
  _bad[key||'?']=true;
  SAVEH.fails++;SAVEH.everFailed=true;
  SAVEH.lastErr=(e&&(e.name||e.message))||'?';
  syncSaveHealth();
}

/* ================= INDEXEDDB =================
   Tek veritabanı, iki depo: kayıtlar ve menü özeti. Anahtarlar dışarıdan
   veriliyor ('s1'..'s3', 'meta') — bu dosya yuva kavramını bilmiyor. */
const DB_NAME='menajer';
const DB_VER=1;
const ST_SAVE='saves';
const ST_META='meta';
const DB_TIMEOUT=5000;   // açılış takılırsa localStorage'a düş, sonsuza kadar bekleme

let _dbP=null;
function idbFactory(){
  try{return (typeof indexedDB!=='undefined'&&indexedDB)?indexedDB:null;}
  catch(e){return null;}   // bazı gizli sekme kiplerinde erişim bile atar
}
/* Dönüş: IDBDatabase ya da null. null "IndexedDB yok" demek, hata değil —
   çağıran taraf localStorage'a düşer. */
function dbOpen(){
  if(_dbP)return _dbP;
  _dbP=new Promise(res=>{
    const f=idbFactory();
    if(!f){res(null);return;}
    let req,done=false;
    const fin=v=>{if(!done){done=true;res(v);}};
    /* Açılış onblocked'da askıda kalabilir (başka sekme eski sürümü tutuyor).
       Oyun bir yükleme ekranında sonsuza kadar bekleyemez. */
    setTimeout(()=>fin(null),DB_TIMEOUT);
    try{req=f.open(DB_NAME,DB_VER);}catch(e){fin(null);return;}
    req.onupgradeneeded=e=>{
      const db=e.target.result;
      if(!db.objectStoreNames.contains(ST_SAVE))db.createObjectStore(ST_SAVE);
      if(!db.objectStoreNames.contains(ST_META))db.createObjectStore(ST_META);
    };
    req.onsuccess=e=>fin(e.target.result);
    req.onerror=()=>fin(null);
    req.onblocked=()=>fin(null);
  });
  return _dbP;
}
/* Tek işlemlik sarmalayıcı. İşlem tamamlanmadan çözmüyor: put'ta oncomplete
   beklenmezse kota hatası sessizce kaçar — bu dosyanın var oluş sebebi o. */
function dbTx(store,mode,fn){
  return dbOpen().then(db=>{
    if(!db)return Promise.reject(new Error('NoIndexedDB'));
    return new Promise((res,rej)=>{
      let tx;
      try{tx=db.transaction(store,mode);}catch(e){rej(e);return;}
      let req;
      try{req=fn(tx.objectStore(store));}catch(e){rej(e);return;}
      tx.oncomplete=()=>res(req?req.result:undefined);
      tx.onerror=()=>rej(tx.error||(req&&req.error)||new Error('TxError'));
      tx.onabort=()=>rej(tx.error||(req&&req.error)||new Error('TxAbort'));
    });
  });
}

/* ================= KAYIT ERİŞİMİ (arka uçtan bağımsız) =================
   Anahtar: 's1'..'s3' kayıtlar, 'meta' menü özeti. Değer her zaman düz bir
   nesne; IndexedDB onu yapısal kopyayla saklıyor (JSON.stringify yok — 7 MB'lık
   bir dizeyi kurmak "Devam"a basmanın maliyetinin %42'siydi), localStorage'a
   düşüldüğünde ise JSON'a çevriliyor. */
const LSKEY={meta:'menajerMetaV1',s1:'menajerSaveV9s1',s2:'menajerSaveV9s2',s3:'menajerSaveV9s3'};
function storeName(key){return key==='meta'?ST_META:ST_SAVE;}

function recGet(key){
  if(SAVEH.backend==='ls')return Promise.resolve(jparse(lsGet(LSKEY[key])));
  return dbTx(storeName(key),'readonly',st=>st.get(key));
}
function recPut(key,val){
  if(SAVEH.backend==='ls'){
    let s;
    try{s=JSON.stringify(val);}catch(e){return Promise.reject(e);}
    return lsSet(LSKEY[key],s)?Promise.resolve(true)
      :Promise.reject(new Error('QuotaExceededError'));
  }
  return dbTx(storeName(key),'readwrite',st=>st.put(val,key)).then(()=>true);
}
function recDel(key){
  if(SAVEH.backend==='ls'){lsDel(LSKEY[key]);return Promise.resolve(true);}
  return dbTx(storeName(key),'readwrite',st=>st.delete(key)).then(()=>true);
}
/* Hangi yuvalarda kayıt var — yalnız anahtarlar. Açılışta özet ile gerçeğin
   tutup tutmadığı buradan bakılıyor; üç kaydı okumak 20 MB ayrıştırmak olurdu. */
function recSlotKeys(){
  if(SAVEH.backend==='ls')
    return Promise.resolve(['s1','s2','s3'].filter(k=>lsGet(LSKEY[k])!==null));
  return dbTx(ST_SAVE,'readonly',st=>st.getAllKeys()).then(ks=>Array.prototype.slice.call(ks||[]));
}

/* Hangi arka ucun kullanılacağını açılışta bir kez belirler. */
function storeBackendInit(){
  return dbOpen().then(db=>{
    SAVEH.backend=db?'idb':'ls';
    return SAVEH.backend;
  });
}

/* ================= ARKADAN YAZMA KUYRUĞU =================
   save() senkron kalabilsin diye. Anahtar başına en fazla bir yazma uçuyor;
   uçarken gelenler tek bir bekleyende birleşiyor ve son yazan kazanıyor.
   Değer çağrı anında değil, yazma anında kuruluyor (build fonksiyonu) —
   böylece birleşen istekler en güncel durumu yazar, eskimiş bir kopyayı değil. */
const _pend={};
const _busy={};
let _inflight=0;
/* Silme de aynı kuyruktan geçiyor: uçmakta olan bir yazmanın arkasına dizilsin,
   yoksa silinen yuva geri yazılabilirdi. */
const REC_DEL={del:true};

function queueRec(key,build){
  _pend[key]=build;
  if(_busy[key])return;
  flushRec(key);
}
/* Bekleyen yazma varsa iptal ediliyor — birazdan silinecek şeyi yazmanın anlamı yok. */
function queueDel(key){queueRec(key,()=>REC_DEL);}
function flushRec(key){
  const build=_pend[key];
  if(!build){_busy[key]=false;return;}
  delete _pend[key];
  _busy[key]=true;_inflight++;
  let val;
  try{val=build();}
  catch(e){
    /* Değeri kuramadık. Kuyruğu yine de ilerlet: arkada bekleyen bir istek
       varsa (örneğin silme) onun askıda kalmaması gerekiyor. */
    _busy[key]=false;_inflight--;noteSaveFail(key,e);
    if(_pend[key])flushRec(key);
    return;
  }
  const op=(val===REC_DEL)?recDel(key):recPut(key,val);
  op.then(()=>noteSaveOk(key),e=>noteSaveFail(key,e)).then(()=>{
    _inflight--;
    _busy[key]=false;
    if(_pend[key])flushRec(key);
  });
}
/* Bekleyen yazma var mı — testler ve kapanış için. */
function savePending(){return _inflight>0||Object.keys(_pend).length>0;}
/* Tüm kuyruk boşalana kadar bekler. Kapanışta beklemek için değil (tarayıcı
   söz vermez), testlerin belirlenimci olması için. */
function saveDrain(){
  return new Promise(res=>{
    (function tick(){
      if(!savePending()){res();return;}
      setTimeout(tick,0);
    })();
  });
}
