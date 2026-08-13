'use strict';
/* js/skills.js — yetenek ağacı (merkezden dört yöne açılan düğüm ağı).

   Ağaç bir ızgara üzerinde duruyor: merkezde ajansın kendisi (hub), ondan dört
   yöne birer dal. Her dal ilk düğümden sonra ikiye ayrılıyor, iki kol üçüncü
   halkada ilerliyor ve dördüncü halkada tek bir taçta birleşiyor. Bir düğüm,
   ona bağlı düğümlerden en az biri açılmadan alınamaz — yani ağaçta yürümek
   zorundasın, istediğin yeri seçemezsin.

   Neden koordinat yerine (dal, halka, yan) tutuluyor:
   dalın yönü SK_BRANCH'te yazıyor; düğüm yalnızca "kaçıncı halka" ve "hangi kol"
   olduğunu biliyor. Yeni bir dal eklemek için SK_BRANCH'e bir yön yazmak yeterli,
   hiçbir koordinatı elle hesaplamak gerekmiyor (bkz. skPos).

   Yeni düğüm eklerken:
     id   : benzersiz kısa ad
     br   : dal ('tb' | 'fd' | 'ag' | 'nw')
     d    : halka — merkezden uzaklık (1..4)
     s    : yan — dalın ekseninden sapma (-1 sol kol, 0 orta, +1 sağ kol)
     cost : kaç puan
     req  : önkoşul id'leri — biri açıksa düğüm açılabilir
     eff  : {anahtar: değer} — skillBonus(anahtar) bunları toplar

   Etki anahtarları SK_KEY'de tanımlı; her anahtarın oyunda tam olarak bir okuma
   yeri var (bkz. CLAUDE.md). Yeni anahtar eklemek = SK_KEY'e satır + tek okuma yeri. */

/* ===== seviye eğrisi =====
   Puan artık doğrudan itibardan değil seviyeden geliyor. İlk seviyeler hızlı
   gelsin ki ağaç daha ilk sezonda hareket etsin; sonrakiler açılsın ki uzun bir
   kariyer bile dört dalı birden bitiremesin. Bir seviye = 1 puan, her dördüncü
   seviye bir puan daha. Dört dalın tamamı 32 puan tutuyor: kimse hepsini alamaz,
   herkes seçmek zorunda. */
const LV={a:3.2, b:0.62, max:30, bonus:4};
function repForLevel(l){const k=Math.max(0,l-1);return Math.round(LV.a*k+LV.b*k*k);}
/* Seviye ulaşılan en yüksek itibardan sayılır: bir kez hak ettiğin seviye,
   sonradan itibar kaybetsen de elinden alınmaz. */
function repTotal(){return S?Math.max(S.rep||0,S.repMax||0):0;}
function agentLevel(st){
  const r=st===undefined?repTotal():st;
  let l=1;
  while(l<LV.max&&r>=repForLevel(l+1))l++;
  return l;
}
function levelPoints(l){return (l-1)+Math.floor(l/LV.bonus);}
/* Bir sonraki seviyeye kalan yol — arayüzdeki halka bunu gösteriyor. */
function levelProgress(){
  const l=agentLevel(),r=repTotal();
  if(l>=LV.max)return {lv:l,cur:0,need:0,pct:1};
  const lo=repForLevel(l),hi=repForLevel(l+1);
  return {lv:l,cur:r-lo,need:hi-lo,pct:Math.max(0,Math.min(1,(r-lo)/(hi-lo)))};
}

/* ===== etki anahtarları ===== */
/* f: nasıl yazılacağı — pct yüzde artış, pctD yüzde düşüş, pp puan, wk hafta, flat sayı */
const SK_KEY={
  neg  :{f:'pct', n:{tr:'Kabul şansı',       en:'Acceptance'}},
  wage :{f:'pct', n:{tr:'Maaş tavanı',       en:'Wage ceiling'}},
  trust:{f:'pct', n:{tr:'Güven kazancı',     en:'Trust gained'}},
  comm :{f:'pp',  n:{tr:'Komisyon oranı',    en:'Commission rate'}},
  scout:{f:'pctD',n:{tr:'Keşif bedeli',      en:'Scouting cost'}},
  net  :{f:'wk',  n:{tr:'Ağ kurulum süresi', en:'Network setup'}},
  dev  :{f:'pct', n:{tr:'Gelişim şansı',     en:'Development'}},
  val  :{f:'pct', n:{tr:'Piyasa değeri',     en:'Market value'}},
  pitch:{f:'pct', n:{tr:'İmza şansı',        en:'Signing chance'}},
  cost :{f:'pctD',n:{tr:'Haftalık gider',    en:'Weekly overhead'}},
  cap  :{f:'flat',n:{tr:'Müşteri kapasitesi',en:'Client slots'}},
  repg :{f:'pct', n:{tr:'İtibar kazancı',    en:'Reputation gain'}},
  fee  :{f:'pct', n:{tr:'Transfer komisyonu',en:'Transfer cut'}},
  bid  :{f:'pct', n:{tr:'Teklif kabulü',     en:'Bid acceptance'}},
  mor  :{f:'pctD',n:{tr:'Moral kaybı',       en:'Morale losses'}},
  loy  :{f:'pctD',n:{tr:'Ayartma riski',     en:'Poaching risk'}}
};
function skEffLabel(k,v){
  const m=SK_KEY[k];
  if(!m)return '';
  const n=m.n[L];
  if(m.f==='flat')return n+' +'+v;
  if(m.f==='wk')return n+' −'+v+' '+t('wk');
  if(m.f==='pp')return n+' +'+Math.round(v*100)+' '+t('skPp');
  const pct=Math.round(v*100);
  const sign=m.f==='pctD'?'−':'+';
  return n+' '+sign+(L==='tr'?'%'+pct:pct+'%');
}

/* ===== dallar =====
   dir: ızgaradaki yön vektörü. Yan kollar bu vektörün dikine açılır, yani yeni
   bir dalı çapraz bir yöne koymak da mümkün — hiçbir yerde yön varsayılmıyor. */
const SK_HUB='hub';
const SK_BRANCH=[
 {id:'tb',dir:[0,-1],
  n:{tr:'Masa',  en:'The Table'},
  d:{tr:'Sözleşme, pazarlık ve oyuncuyla aranızdaki güven.',
     en:'Contracts, negotiation and the trust between you and your client.'}},
 {id:'fd',dir:[1,0],
  n:{tr:'Saha',  en:'The Field'},
  d:{tr:'Keşif ağı, yetenek bulma ve oyuncunun gelişimi.',
     en:'Scouting networks, spotting talent and developing it.'}},
 {id:'ag',dir:[0,1],
  n:{tr:'Ajans', en:'The Agency'},
  d:{tr:'Para, gider, kapasite ve adının duyulması.',
     en:'Money, overheads, capacity and getting your name out.'}},
 {id:'nw',dir:[-1,0],
  n:{tr:'Ağ',    en:'The Network'},
  d:{tr:'Kulüp ilişkileri, transfer masası ve müşterini elde tutmak.',
     en:'Club relations, the transfer table and keeping your clients.'}}
];
/* ===== düğümler ===== */
const SKILLS=[
/* --- merkez --- */
{id:SK_HUB,br:null,d:0,s:0,cost:0,req:[],eff:{},
 n:{tr:'Ajans',en:'The Agency'},
 dsc:{tr:'Her şey burada başlıyor. Dört yöne giden yollardan birini seç — hepsini birden yürüyemezsin.',
      en:'Everything starts here. Pick one of the four roads out — you cannot walk them all.'}},

/* --- MASA (yukarı) --- */
{id:'tb1',br:'tb',d:1,s:0,cost:1,req:[SK_HUB],eff:{neg:0.05},
 n:{tr:'Hazırlıklı Git',en:'Come Prepared'},
 dsc:{tr:'Masaya rakamlarla oturuyorsun; kulüp itiraz edecek yer bulamıyor.',
      en:'You sit down with the numbers in hand. The club has nowhere to push back.'}},
{id:'tb2',br:'tb',d:2,s:-1,cost:1,req:['tb1'],eff:{wage:0.05},
 n:{tr:'Rakamları Bil',en:'Know the Numbers'},
 dsc:{tr:'Kulübün bütçesinde gerçekte ne kadar yer olduğunu biliyorsun — tavan yükseliyor.',
      en:'You know what is really left in the club\'s budget. The ceiling moves up.'}},
{id:'tb3',br:'tb',d:2,s:1,cost:1,req:['tb1'],eff:{trust:0.25},
 n:{tr:'Sözünü Tutan Adam',en:'A Man of His Word'},
 dsc:{tr:'Verdiğin sözü tutuyorsun; oyuncular sana daha çabuk ısınıyor.',
      en:'You keep your promises, and players warm to you faster.'}},
{id:'tb4',br:'tb',d:3,s:-1,cost:1,req:['tb2'],eff:{neg:0.05,wage:0.04},
 n:{tr:'Uzun Anlaşma',en:'The Long Deal'},
 dsc:{tr:'Kulübe bugünü değil beş yılı anlatıyorsun. Kalem daha kolay hareket ediyor.',
      en:'You sell them five years, not one. The pen moves more easily.'}},
{id:'tb5',br:'tb',d:3,s:1,cost:2,req:['tb3'],eff:{trust:0.30,mor:0.15},
 n:{tr:'Telefonu Aç',en:'Always Pick Up'},
 dsc:{tr:'Kötü haftalarda da telefondasın. Müşterin sarsıldığında daha az düşüyor.',
      en:'You answer in the bad weeks too. When a client is shaken, he falls less far.'}},
{id:'tb6',br:'tb',d:4,s:0,cost:2,req:['tb4','tb5'],eff:{neg:0.07,comm:0.015},
 n:{tr:'Odadaki En İyi',en:'Best in the Room'},
 dsc:{tr:'Masada kimse seni geçemiyor — ve kimse oranını da tartışmıyor.',
      en:'Nobody out-negotiates you. Nobody argues about your rate, either.'}},

/* --- SAHA (sağ) --- */
{id:'fd1',br:'fd',d:1,s:0,cost:1,req:[SK_HUB],eff:{scout:0.15},
 n:{tr:'Tanıdık Ağı',en:'People Who Owe You'},
 dsc:{tr:'Her ligde sana borcu olan biri var. Keşif ağı kurmak ucuzluyor.',
      en:'In every league somebody owes you a favour. Networks cost less to build.'}},
{id:'fd2',br:'fd',d:2,s:-1,cost:1,req:['fd1'],eff:{net:2},
 n:{tr:'Sahada Adamın Var',en:'Boots on the Ground'},
 dsc:{tr:'Gözcülerin çoktan orada. Yeni bir ağ haftalar önce çalışmaya başlıyor.',
      en:'Your people are already there. A new network comes online weeks earlier.'}},
{id:'fd3',br:'fd',d:2,s:1,cost:1,req:['fd1'],eff:{pitch:0.05},
 n:{tr:'Doğru Kapıyı Çal',en:'Knock on the Right Door'},
 dsc:{tr:'Oyuncuya babası üzerinden mi, arkadaşı üzerinden mi gidileceğini biliyorsun.',
      en:'You know whether to go through the father or the best friend.'}},
{id:'fd4',br:'fd',d:3,s:-1,cost:1,req:['fd2'],eff:{scout:0.20},
 n:{tr:'Ucuz Gözler',en:'Cheap Eyes'},
 dsc:{tr:'Maçları senin yerine izleyen gençler var; hiçbiri pahalı değil.',
      en:'Young scouts watch the games for you, and none of them are expensive.'}},
{id:'fd5',br:'fd',d:3,s:1,cost:2,req:['fd3'],eff:{dev:0.35},
 n:{tr:'Antrenman Planı',en:'The Training Plan'},
 dsc:{tr:'Müşterine kendi çalışma programını yaptırıyorsun. Sezon sonunda fark görülüyor.',
      en:'Your clients train to your plan. By the end of a season it shows.'}},
{id:'fd6',br:'fd',d:4,s:0,cost:2,req:['fd4','fd5'],eff:{val:0.06,dev:0.20},
 n:{tr:'Vitrine Çıkar',en:'Put Him in the Window'},
 dsc:{tr:'Müşterini doğru maçlarda, doğru gözlerin önünde oynatıyorsun.',
      en:'You get your client seen in the right games, by the right people.'}},

/* --- AJANS (aşağı) --- */
{id:'ag1',br:'ag',d:1,s:0,cost:1,req:[SK_HUB],eff:{cost:0.15},
 n:{tr:'Sıkı Bütçe',en:'Lean Office'},
 dsc:{tr:'Küçük ofis, az masraf. Haftalık giderin geriliyor.',
      en:'Small office, small bills. Your weekly overhead drops.'}},
{id:'ag2',br:'ag',d:2,s:-1,cost:1,req:['ag1'],eff:{cap:1},
 n:{tr:'Ortak Al',en:'Take On a Partner'},
 dsc:{tr:'Yükü paylaşacak birini buldun. Bir müşteri daha taşıyabilirsin.',
      en:'You found someone to share the load. One more client fits.'}},
{id:'ag3',br:'ag',d:2,s:1,cost:1,req:['ag1'],eff:{cost:0.15},
 n:{tr:'İyi Bir Muhasebeci',en:'A Good Accountant'},
 dsc:{tr:'Parayı nereye kaçırdığını gösteren biri. Giderin bir kez daha geriliyor.',
      en:'Someone who shows you where the money leaks. Overhead drops again.'}},
{id:'ag4',br:'ag',d:3,s:-1,cost:1,req:['ag2'],eff:{cap:1},
 n:{tr:'İkinci Ofis',en:'Second Office'},
 dsc:{tr:'Başka bir şehirde bir oda, bir masa, bir telefon. Portföy büyüyor.',
      en:'A room, a desk and a phone in another city. The roster grows.'}},
{id:'ag5',br:'ag',d:3,s:1,cost:2,req:['ag3'],eff:{repg:0.15},
 n:{tr:'Basınla Ara',en:'Court the Press'},
 dsc:{tr:'Doğru gazetecilerle yemek yiyorsun. Yaptığın her iş daha çok duyuluyor.',
      en:'You have lunch with the right journalists. Everything you do lands louder.'}},
{id:'ag6',br:'ag',d:4,s:0,cost:2,req:['ag4','ag5'],eff:{comm:0.02,cost:0.15},
 n:{tr:'Adın Yeter',en:'Your Name Is Enough'},
 dsc:{tr:'Artık kapıları adın açıyor; pazarlık ettiğin tek şey kendi oranın.',
      en:'Your name opens the doors now. The only thing you negotiate is your own rate.'}},

/* --- AĞ (sol) --- */
{id:'nw1',br:'nw',d:1,s:0,cost:1,req:[SK_HUB],eff:{bid:0.05},
 n:{tr:'Telefon Defteri',en:'The Little Black Book'},
 dsc:{tr:'Her kulüpte doğrudan arayabileceğin bir numara var. Teklifler dikkate alınıyor.',
      en:'At every club there is a number you can call directly. Your bids get read.'}},
{id:'nw2',br:'nw',d:2,s:-1,cost:1,req:['nw1'],eff:{fee:0.06},
 n:{tr:'Aracının Aracısı',en:'Friends of Friends'},
 dsc:{tr:'Anlaşmanın içinde senin payını büyütecek bir kalem hep bulunuyor.',
      en:'There is always a line in the deal that makes your share bigger.'}},
{id:'nw3',br:'nw',d:2,s:1,cost:1,req:['nw1'],eff:{mor:0.20},
 n:{tr:'Kapıyı Aralık Tut',en:'Keep the Door Open'},
 dsc:{tr:'Kızgın müşteri seni değil, kapıyı buluyor. Moral kayıpları hafifliyor.',
      en:'An angry client finds the door, not you. Morale hits land softer.'}},
{id:'nw4',br:'nw',d:3,s:-1,cost:1,req:['nw2'],eff:{bid:0.06},
 n:{tr:'Sıcak Hat',en:'The Hotline'},
 dsc:{tr:'Sportif direktörler telefonunu ilk turda açıyor.',
      en:'Sporting directors pick up on the first ring.'}},
{id:'nw5',br:'nw',d:3,s:1,cost:2,req:['nw3'],eff:{pitch:0.06,mor:0.15,loy:0.20},
 n:{tr:'Yıldız Muamelesi',en:'Star Treatment'},
 dsc:{tr:'Müşterin kendini portföyün en önemli adamı gibi hissediyor — çünkü öyle davranıyorsun. Rakip ajansın telefonu boşuna çalıyor.',
      en:'Your client feels like the most important man on your books, because you treat him that way. Rival agencies call for nothing.'}},
{id:'nw6',br:'nw',d:4,s:0,cost:2,req:['nw4','nw5'],eff:{fee:0.10,bid:0.04},
 n:{tr:'Büyük Anlaşma',en:'The Big One'},
 dsc:{tr:'Artık transferi sen kuruyorsun, kulüpler yalnızca imzalıyor.',
      en:'You build the transfer now. The clubs only sign it.'}}
];

/* ===== yerleşim =====
   Izgara birimi SK_GEO.unit; merkez (0,0). Dalın yönü (ax,ay) ise yan kollar
   bu vektörün dikine (-ay,ax) açılıyor. Böylece dört yön de tek formülle çiziliyor. */
const SK_GEO={unit:100, r:34, rBig:39, rHub:46, hit:47, pad:66};
function skBranch(id){return SK_BRANCH.find(b=>b.id===id)||null;}
function skPos(sk){
  const b=skBranch(sk.br);
  if(!b)return {x:0,y:0};
  const [ax,ay]=b.dir;
  return {x:(ax*sk.d-ay*sk.s)*SK_GEO.unit, y:(ay*sk.d+ax*sk.s)*SK_GEO.unit};
}
function skById(id){return SKILLS.find(x=>x.id===id)||null;}
function skRadius(sk){return sk.id===SK_HUB?SK_GEO.rHub:sk.d>=4?SK_GEO.rBig:SK_GEO.r;}
/* Ağacın kapladığı alan düğümlerden hesaplanıyor — yeni bir dal eklendiğinde
   görünüm kutusu kendiliğinden büyüsün. */
function skViewBox(){
  let m=0;
  SKILLS.forEach(sk=>{const p=skPos(sk);m=Math.max(m,Math.abs(p.x),Math.abs(p.y));});
  const h=m+SK_GEO.pad;
  return [-h,-h,h*2,h*2].join(' ');
}
/* Çizilecek yollar: her düğüm önkoşullarına bir çizgiyle bağlanır. */
function skEdges(){
  const out=[];
  SKILLS.forEach(sk=>{
    (sk.req||[]).forEach(rid=>{
      const from=skById(rid);
      if(from)out.push({a:from,b:sk});
    });
  });
  return out;
}

/* ===== puan muhasebesi ===== */
/* Eski kayıtlarda dal/kademe düzeninde dokuz yetenek vardı; karşılıkları yeni
   ağaçta duruyor. Kimse ilerlemesini kaybetmesin diye okurken çevriliyor. */
const SK_LEGACY={neg1:'tb1',neg2:'tb3',neg3:'tb6',sco1:'fd1',sco2:'fd3',sco3:'fd6',
                 biz1:'ag1',biz2:'ag2',biz3:'ag6'};
function skillsTaken(){
  const raw=(S&&S.skills)||[];
  const out=[];
  raw.forEach(id=>{
    const n=SK_LEGACY[id]||id;
    if(skById(n)&&out.indexOf(n)<0)out.push(n);
  });
  return out;
}
function hasSkill(id){return id===SK_HUB||skillsTaken().indexOf(id)>=0;}
function skillSpent(){return skillsTaken().reduce((s,id)=>{const k=skById(id);return s+(k?k.cost:0);},0);}
/* Alt sınır harcanan puandır — eğri değişse bile kimse puan borcuna düşmesin. */
function skillEarned(){return S?Math.max(levelPoints(agentLevel()),skillSpent()):0;}
function skillPoints(){return skillEarned()-skillSpent();}
/* Bir düğüm, bağlı olduğu düğümlerden biri açılmadan alınamaz. */
function skillLocked(sk){return (sk.req||[]).some(id=>hasSkill(id))?null:'req';}
/* Düğümün durumu — arayüz de, satın alma da aynı yerden okuyor. */
function skillState(sk){
  if(hasSkill(sk.id))return 'owned';
  if(skillLocked(sk))return 'lock';
  return skillPoints()>=sk.cost?'open':'poor';
}
/* Son açılan düğüm: arayüz bunu bir kez animasyonla çizip unutur. */
let skJustTaken=null;
function skillBuy(id){
  const sk=skById(id);
  if(!sk||hasSkill(id))return;
  if(skillLocked(sk)){toast(t('skLockedT'));return;}
  if(skillPoints()<sk.cost){toast(t('skNoPoints'));return;}
  S.skills=skillsTaken().concat([id]);
  skJustTaken=id;
  toast(t('skUnlocked').replace('{n}',sk.n[L]));
  closeModal();save();render();
}
/* Etkilerin tek okuma noktası — oyunun geri kalanı buradan geçer. */
function skillBonus(key){
  return skillsTaken().reduce((s,id)=>{
    const k=skById(id);
    return s+((k&&k.eff&&k.eff[key])||0);
  },0);
}
/* Dal ilerlemesi: arayüzdeki "3/6" rozeti. */
function branchTaken(br){return SKILLS.filter(sk=>sk.br===br&&hasSkill(sk.id)).length;}
function branchTotal(br){return SKILLS.filter(sk=>sk.br===br).length;}
