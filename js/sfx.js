'use strict';
/* js/sfx.js — arayüz sesi.
   Ses dosyası yok: Web Audio ile anlık sentezleniyor, böylece tek dosya çıktısı ve
   çevrimdışı çalışma bozulmuyor.

   Tasarım: tek ve kısa bir TIK. Ton yok — sürekli bir frekans "bip" gibi duyuluyor,
   alçak frekanslı bir vuruş ise "tok" oluyor. Tık dediğimiz şey aslında çok kısa,
   kuru bir darbe: filtrelenmiş gürültünün 12 milisaniyede sönmesi.

   Ayar düğmeleri (tek satırla değiştirilebilir):
     DUR  ↓ daha kısa/keskin, ↑ daha yumuşak
     LO   ↑ daha ince ve net, ↓ daha kalın
     HI   ↓ tizliği keser, sertliği alır
     VOL  ses seviyesi */
const CLICK={DUR:0.013,LO:700,HI:4800,VOL:0.30};
let AC=null,BUF=null;
function audio(){
  if(AC===false)return null;
  if(AC)return AC;
  const Ctx=(typeof AudioContext!=='undefined'&&AudioContext)||
            (typeof webkitAudioContext!=='undefined'&&webkitAudioContext);
  if(!Ctx){AC=false;return null;}          // destek yoksa sessizce devre dışı
  try{AC=new Ctx();}catch(e){AC=false;return null;}
  return AC;
}
/* Ses cihaz tercihi: ana menüde açık bir kariyer yokken de çalışmalı. Tercih hiç
   yazılmamışsa bu değişiklikten önceki kayıtların ayarına düşülür. */
function sfxOn(){
  if(typeof PREFS!=='undefined'&&PREFS&&PREFS.sfxOn!==undefined)return PREFS.sfxOn!==false;
  return typeof S!=='undefined'&&!!S&&S.sfxOn!==false;
}
/* Darbe bir kez üretilip saklanıyor; her dokunuşta yeniden hesaplanmasına gerek yok. */
function clickBuffer(ac){
  if(BUF)return BUF;
  const n=Math.max(1,Math.floor(ac.sampleRate*CLICK.DUR));
  BUF=ac.createBuffer(1,n,ac.sampleRate);
  const d=BUF.getChannelData(0);
  for(let i=0;i<n;i++){
    const k=i/n;
    /* sert atak, üstel sönüm — tıkın kuru durmasını sağlayan zarf */
    d[i]=(Math.random()*2-1)*Math.exp(-k*22)*(k<0.02?k/0.02:1);
  }
  return BUF;
}
function click(){
  const ac=audio();
  if(!ac)return;
  if(ac.state==='suspended')ac.resume();
  const t=ac.currentTime;
  const src=ac.createBufferSource();src.buffer=clickBuffer(ac);
  const hp=ac.createBiquadFilter();hp.type='highpass';hp.frequency.value=CLICK.LO; // gürlemeyi al
  const lp=ac.createBiquadFilter();lp.type='lowpass'; lp.frequency.value=CLICK.HI; // sertliği al
  const g=ac.createGain();g.gain.value=CLICK.VOL;
  src.connect(hp).connect(lp).connect(g).connect(ac.destination);
  src.start(t);
}
const SFX={tap(){if(sfxOn())click();}};
/* Tek yakalayıcı: her tıklanabilir öğe otomatik ses çıkarır. Tek tek onclick'lere
   ses eklenmediği için bir dokunuşta birden fazla ses çalma ihtimali de yok. */
const SFX_SEL='button,.pitem,.dchoice,.lnk,.ftoggle,.trk,.stCard,.matchrow .tn,tr.click,.chips button,.tabs button';
if(typeof document!=='undefined'&&document.addEventListener){
  document.addEventListener('click',e=>{
    if(!sfxOn())return;
    const el=e.target&&e.target.closest?e.target.closest(SFX_SEL):null;
    if(!el||el.disabled)return;
    SFX.tap();
  },true);
}
