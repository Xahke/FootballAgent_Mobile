'use strict';
/* js/skills.js — yetenek ağacı.
   Yetenek puanı itibardan gelir: her SK_PER itibar bir puan. Puanlar harcandıkça
   S.skills içine yazılır; etkiler tek bir yardımcıdan (skillBonus) okunur, böylece
   yeni yetenek eklemek için sadece SKILLS dizisine kayıt yazmak yeterli.

   Yeni yetenek eklerken:
     id     : benzersiz kısa ad
     br     : dal ('neg' | 'scout' | 'biz')
     tier   : 1..3 — bir üst kademe, alt kademe alınmadan açılmaz
     cost   : kaç puan
     eff    : {anahtar: değer} — skillBonus(anahtar) bunları toplar
   Kullanılan anahtarlar: comm (komisyon oranı), neg (pazarlık kabul şansı),
   trust (güven kazancı çarpanı), pitch (imza şansı), scout (keşif indirimi),
   cost (haftalık gider indirimi), cap (müşteri kapasitesi), val (değer artışı). */

const SK_PER=10;                 // her 10 itibar → 1 yetenek puanı
const SK_BRANCH=[
  ['neg',  {tr:'Masa',   en:'The Table'},   {tr:'Pazarlık, sözleşme ve ilişki.',      en:'Negotiation, contracts and relationships.'}],
  ['scout',{tr:'Saha',   en:'The Field'},   {tr:'Keşif ağı, yetenek bulma ve gelişim.',en:'Scouting, spotting talent and development.'}],
  ['biz',  {tr:'Ajans',  en:'The Agency'},  {tr:'Para, gider ve kapasite.',            en:'Money, overheads and capacity.'}]
];
const SKILLS=[
/* --- MASA --- */
{id:'neg1',br:'neg',tier:1,cost:1,eff:{neg:0.06},
 n:{tr:'Hazırlıklı Git',en:'Come Prepared'},
 d:{tr:'Masaya rakamlarla oturursun. Sözleşme görüşmelerinde kabul şansı +%6.',
    en:'You arrive with the numbers. +6% acceptance in contract talks.'}},
{id:'neg2',br:'neg',tier:2,cost:2,eff:{trust:0.35},
 n:{tr:'Sözünü Tutan Adam',en:'A Man of His Word'},
 d:{tr:'Oyuncular sana daha çabuk ısınır. Kazanılan güvenin %35 fazlası yazılır.',
    en:'Players warm to you faster. Trust you earn counts 35% more.'}},
{id:'neg3',br:'neg',tier:3,cost:3,eff:{neg:0.08,comm:0.02},
 n:{tr:'Odadaki En İyi',en:'Best in the Room'},
 d:{tr:'Kabul şansı +%8 ve komisyon oranın +2 puan.',
    en:'+8% acceptance and +2 points on your commission rate.'}},
/* --- SAHA --- */
{id:'sco1',br:'scout',tier:1,cost:1,eff:{scout:0.20},
 n:{tr:'Tanıdık Ağı',en:'People Who Owe You'},
 d:{tr:'Keşif ağı kurmak %20 daha ucuz.',en:'Building a scouting network costs 20% less.'}},
{id:'sco2',br:'scout',tier:2,cost:2,eff:{pitch:0.07},
 n:{tr:'Doğru Kapıyı Çal',en:'Knock on the Right Door'},
 d:{tr:'Temsilcilik görüşmelerinde imza şansı +%7.',en:'+7% chance in representation meetings.'}},
{id:'sco3',br:'scout',tier:3,cost:3,eff:{val:0.08},
 n:{tr:'Vitrine Çıkar',en:'Put Him in the Window'},
 d:{tr:'Müşterilerini doğru maçlarda gösterirsin: piyasa değerleri %8 daha yüksek.',
    en:'You get your clients seen in the right games — their market value runs 8% higher.'}},
/* --- AJANS --- */
{id:'biz1',br:'biz',tier:1,cost:1,eff:{cost:0.20},
 n:{tr:'Sıkı Bütçe',en:'Lean Office'},
 d:{tr:'Haftalık giderin %20 azalır.',en:'Your weekly overhead drops 20%.'}},
{id:'biz2',br:'biz',tier:2,cost:2,eff:{cap:1},
 n:{tr:'Ortak Al',en:'Take On a Partner'},
 d:{tr:'Bir müşteri daha taşıyabilirsin.',en:'You can carry one more client.'}},
{id:'biz3',br:'biz',tier:3,cost:3,eff:{comm:0.02,cost:0.15},
 n:{tr:'Adın Yeter',en:'Your Name Is Enough'},
 d:{tr:'Komisyon oranın +2 puan, giderin %15 daha azalır.',
    en:'+2 points on your commission rate and 15% less overhead.'}}
];
/* ===== puan muhasebesi ===== */
function skillsTaken(){return (S&&S.skills)||[];}
/* Kazanılan puan ulaşılan en yüksek itibardan sayılır: bir kez hak ettiğin puan
   sonradan itibar kaybetsen de elinden alınmaz. Alt sınır harcanan puandır —
   repMax'ın olmadığı eski kayıtlarda bile kimse puan borcuna düşmesin. */
function skillEarned(){
  if(!S)return 0;
  return Math.max(Math.floor(Math.max(S.rep||0,S.repMax||0)/SK_PER),skillSpent());
}
function skillSpent(){return skillsTaken().reduce((s,id)=>{const k=SKILLS.find(x=>x.id===id);return s+(k?k.cost:0);},0);}
function skillPoints(){return skillEarned()-skillSpent();}
function hasSkill(id){return skillsTaken().indexOf(id)>=0;}
/* Bir kademe, aynı daldaki bir alt kademe alınmadan açılmaz. */
function skillLocked(sk){
  if(sk.tier===1)return null;
  const prev=SKILLS.filter(x=>x.br===sk.br&&x.tier===sk.tier-1);
  return prev.some(x=>hasSkill(x.id))?null:'tier';
}
function skillBuy(id){
  const sk=SKILLS.find(x=>x.id===id);
  if(!sk||hasSkill(id))return;
  if(skillLocked(sk)){toast(t('skLockedT'));return;}
  if(skillPoints()<sk.cost){toast(t('skNoPoints'));return;}
  S.skills=skillsTaken().concat([id]);
  toast(t('skUnlocked').replace('{n}',sk.n[L]));
  save();render();
}
/* Etkilerin tek okuma noktası — oyunun geri kalanı buradan geçer. */
function skillBonus(key){
  return skillsTaken().reduce((s,id)=>{
    const k=SKILLS.find(x=>x.id===id);
    return s+((k&&k.eff&&k.eff[key])||0);
  },0);
}
