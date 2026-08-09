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

   Eski tek kayıtlı sürümden gelenler 1. yuvaya devredilir; kimsenin ilerlemesi
   silinmez. */
const SLOTS=3;
const LEGACYKEY='menajerSaveV9';        // tek kayıtlı sürümün anahtarı
const SLOTKEY=n=>'menajerSaveV9s'+n;
const METAKEY='menajerMetaV1';
const PREFKEY='menajerPrefsV1';
/* 0 = açık kariyer yok (ana menüdeyiz). save() nereye yazacağını buradan bilir. */
let curSlot=0;
/* Kullanıcı depolamayı kapatmış ya da kota dolmuş olabilir — hiçbiri oyunu
   çökertmemeli, kayıt sessizce başarısız olur. */
function lsGet(k){try{return localStorage.getItem(k);}catch(e){return null;}}
function lsSet(k,v){try{localStorage.setItem(k,v);return true;}catch(e){return false;}}
function lsDel(k){try{localStorage.removeItem(k);}catch(e){}}
function jparse(s){try{return JSON.parse(s);}catch(e){return null;}}
/* ================= CİHAZ TERCİHLERİ ================= */
let PREFS=jparse(lsGet(PREFKEY))||{};
function savePrefs(){lsSet(PREFKEY,JSON.stringify(PREFS));}
function pref(k,d){return PREFS[k]===undefined?d:PREFS[k];}
function setPref(k,v){PREFS[k]=v;savePrefs();}
/* dil tercihi kayıttan önce gelir: menü daha S yüklenmeden doğru dilde açılmalı */
if(PREFS.lang)L=PREFS.lang;
/* ================= YUVA ÖZETLERİ ================= */
function readMeta(){return jparse(lsGet(METAKEY))||{};}
function writeMeta(m){lsSet(METAKEY,JSON.stringify(m));}
function allMeta(){return readMeta();}                 // menü tek okumayla dönsün
function slotMeta(n){return readMeta()['s'+n]||null;}
function slotUsed(n){return !!slotMeta(n);}
function anySlot(){const m=readMeta();for(let n=1;n<=SLOTS;n++)if(m['s'+n])return true;return false;}
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
/* Kayıt biçimi eski sürümle aynı: {S,PID}. Yalnızca anahtar yuvaya göre değişiyor. */
function validSave(d){return !!(d&&d.S&&d.S.players&&d.S.fx&&d.S.fx.length===LEAGUES.length);}
function saveToSlot(n){
  if(!n||typeof S==='undefined'||!S)return false;
  if(!lsSet(SLOTKEY(n),JSON.stringify({S,PID})))return false;
  const m=readMeta();m['s'+n]=metaOf(S);writeMeta(m);
  return true;
}
function loadSlot(n){
  const d=jparse(lsGet(SLOTKEY(n)));
  if(!validSave(d)){
    /* özet var ama kayıt bozuk/eksik: yuvayı boş göster, menü yalan söylemesin */
    const m=readMeta();if(m['s'+n]){delete m['s'+n];writeMeta(m);}
    return false;
  }
  S=d.S;PID=d.PID;curSlot=n;
  /* Dil cihaz tercihi; yoksa kaydın kendi dili devralınır (eski kayıtlar). */
  L=PREFS.lang||S.lang||'tr';
  return true;
}
function deleteSlot(n){
  lsDel(SLOTKEY(n));
  const m=readMeta();delete m['s'+n];writeMeta(m);
  if(curSlot===n){curSlot=0;S=null;}
}
/* ================= ESKİ KAYDIN DEVRİ =================
   Tek kayıtlı sürümden güncelleyen oyuncu ana menüde kariyerini 1. yuvada bulur.
   Yazma başarısız olursa eski anahtar silinmez — ilerleme kaybolmaktansa iki kez
   denenmesi yeğdir. */
function migrateLegacy(){
  const raw=lsGet(LEGACYKEY);
  if(!raw)return false;
  if(lsGet(SLOTKEY(1))){lsDel(LEGACYKEY);return false;}   // yuva zaten dolu
  const d=jparse(raw);
  if(!validSave(d)){lsDel(LEGACYKEY);return false;}
  if(!lsSet(SLOTKEY(1),raw))return false;
  const m=readMeta();m.s1=metaOf(d.S);writeMeta(m);
  /* Cihaz tercihleri o güne dek kaydın içindeydi; ilk kez dışarı taşınıyor. */
  if(PREFS.theme===undefined&&d.S.theme)PREFS.theme=d.S.theme;
  if(PREFS.lang===undefined&&d.S.lang)PREFS.lang=d.S.lang;
  if(PREFS.sfxOn===undefined&&d.S.sfxOn!==undefined)PREFS.sfxOn=d.S.sfxOn;
  savePrefs();
  if(PREFS.lang)L=PREFS.lang;
  lsDel(LEGACYKEY);
  return true;
}
