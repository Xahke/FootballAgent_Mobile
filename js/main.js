'use strict';
/* js/main.js — kayıt yönlendirmesi ve başlatma.
   Yuva işlemlerinin kendisi js/saves.js içinde; burada yalnızca oyunun her yerden
   çağırdığı save() ve açılış var. */
/* ================= SAVE ================= */
/* Açık kariyer yoksa (ana menü) yazacak bir şey yok — çağrı sessizce düşer,
   böylece çağıran taraflar curSlot'u kontrol etmek zorunda kalmaz. */
function save(){if(curSlot&&S)saveToSlot(curSlot);}
/* ================= AÇILIŞ ================= */
migrateLegacy();          // tek kayıtlı sürümden gelen ilerleme 1. yuvaya
stack=[{v:'menu'}];
render();                 // S null: render kabuk dalına girer, ana menü açılır
/* Çevrimdışı çalışma. file:// ile açıldığında service worker kaydı yapılamaz —
   tek dosya sürümü (dist/menajer.html) zaten kendi kendine yeterli olduğu için sorun değil.
   Capacitor içinde de kaydetmiyoruz: varlıklar zaten uygulamaya gömülü, service worker
   yalnızca güncelleme sonrası eski sürümü servis etme riski getirir. */
if('serviceWorker' in navigator&&location.protocol.startsWith('http')&&!window.Capacitor){
  window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
}
