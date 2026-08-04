'use strict';
/* js/main.js — kayıt/yükleme ve başlatma */
/* ================= SAVE ================= */
function save(){try{localStorage.setItem('menajerSaveV9',JSON.stringify({S,PID}));}catch(e){}}
function load(){
  try{
    const d=JSON.parse(localStorage.getItem('menajerSaveV9'));
    if(d&&d.S&&d.S.players&&d.S.fx&&d.S.fx.length===LEAGUES.length){S=d.S;PID=d.PID;L=S.lang||'tr';return true;}
  }catch(e){}
  return false;
}
if(!load())newGame();
render();
/* Karar verilmemiş bir olay varsa geri getir — kapatıp açarak atlanamamalı. */
if(S.evCur&&S.agent)showEvent(S.evCur);
/* Çevrimdışı çalışma. file:// ile açıldığında service worker kaydı yapılamaz —
   tek dosya sürümü (dist/menajer.html) zaten kendi kendine yeterli olduğu için sorun değil.
   Capacitor içinde de kaydetmiyoruz: varlıklar zaten uygulamaya gömülü, service worker
   yalnızca güncelleme sonrası eski sürümü servis etme riski getirir. */
if('serviceWorker' in navigator&&location.protocol.startsWith('http')&&!window.Capacitor){
  window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
}
