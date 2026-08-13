'use strict';
/* js/rivals.js — rakip menajer ajansları.

   Oyunun geri kalanında "rakip menajer" yalnızca bir bayraktı: p.agent==='rival'
   olan oyuncu piyasadan gizleniyordu, arkasında kimse yoktu. Burada o bayrağın
   arkasına adlı ajanslar konuyor — her birinin bir karakteri, bir itibarı ve
   seninle bir ilişkisi var. Kaç tane olduğu RIV_ARCH'ın uzunluğu: her arketipten
   bir tane, bugün on dört.

   Üç davranış:
     1) arka plan piyasası — rakipler kendi başlarına oyuncu imzalar ve kaybeder
     2) imza yarışı       — piyasadaki bir oyuncu için seninle yarışırlar
     3) ayartma           — mevcut müşterine göz koyarlar

   Neden portföy saklanmıyor: kayıt biçimi yalnızca oyuncudaki p.ra (ajans id'si).
   Kimin kaç müşterisi olduğu her zaman oyuncu listesinden türetiliyor — atlas.js'in
   S.known'dan bölge durumu türetmesiyle aynı gerekçe: iki yerde tutulan şey er geç
   birbirini tutmaz.

   Eski kayıtlar: S.rivals yoksa ensureRivals() kuruyor, p.ra yoksa rivalOf() null
   dönüyor ve arayüz eski "Rakip menajer" metnine düşüyor. Hiçbir alan zorunlu değil. */

/* ================= DENGE =================
   Rakipler kulüpten oyuncu almıyor, yalnızca temsil bayrağını çeviriyor; kadro
   dengesi ve yaş piramidi etkilenmiyor. Etkiledikleri tek havuz piyasa ekranının
   beslendiği temsilcisiz oyuncu havuzu: signRate onu daraltır, loseRate genişletir.
   İkisi birbirine yakın kalmalı, yoksa piyasa birkaç sezonda boşalır. */
const RIV={
  /* Ajans sayısı burada tutulmuyor: RIV_ARCH.length kadar ajans var, her arketipten
     bir tane. tuneN ise aşağıdaki haftalık oranların ölçüldüğü ajans sayısı — kadro
     büyüdüğünde oranlar rivScale() ile bölünüyor ki dünyaya düşen toplam yük sabit
     kalsın. Ajans eklemek dünyayı hızlandırmamalı, yalnızca çeşitlendirmeli. */
  tuneN:6,
  /* Adlı ajansın sahiplendiği profil eşiği. 72 iken rakip menajerli ~2.550 oyuncunun
     yalnızca %17'sinin arkasında bir ad vardı; oyuncu ekranların çoğunda yine isimsiz
     "Rakip menajer" görüyordu. 64 bunu ~%43'e çıkarıyor — ajans sayısı ikiye
     katlandığı için ajans başına portföy yine eskisi kadar (~75). */
  notable:64,
  /* Aşağıdaki üç oran tuneN ajans içindir; ajans başına düşen pay rivScale() ile
     bulunur, dünyaya düşen toplam sabit kalır. */
  signRate:0.10,        // haftalık imza olasılığı (arketiple ölçeklenir)
  loseRate:0.10,        // haftalık müşteri kaybı olasılığı
  worth:64,             // rakiplerin ayartmaya değer bulduğu müşteri profili
  reach:8,              // yarış hedefi itibarının kaç puan üstüne kadar çıkabilir
  /* Sıklık ölçülerek ayarlandı: 0.22'de sezonda ~29 yarış bildirimi çıkıyordu, iki
     haftada bir. Haber değerini kaybediyordu; 0.10 sezonda ~13 veriyor. */
  chaseW:0.10,          // haftalık yeni yarış açma olasılığı
  chaseMax:3,           // aynı anda açık yarış sayısı tavanı
  chaseLen:[3,6],       // yarışın kaç hafta sürdüğü
  chasePen:0.13,        // yarış varken imza şansından düşen pay (arketiple ölçeklenir)
  poachGap:9,           // iki ayartma girişimi arasında en az bu kadar hafta
  poachWarn:[2,3],      // tehdidi duyduktan kaç hafta sonra karar masaya gelir
  /* Yeni imzalanan müşteriye kimse hemen yaklaşmaz. Bu koruma olmadan kayıp
     kendini besliyordu: müşteriyi kaybeden menajer yerine taze güvenli (dolayısıyla
     kolay ayartılır) birini alıyor, o da gidiyordu. Ölçüldü: 12 sezonda itibar
     70'ten 4'e iniyordu — bu bir karar değil, çıkışsız bir sarmaldı. */
  poachGrace:10,        // imzadan sonra ayartmaya kapalı hafta sayısı
  poachRep:1.5,         // müşteriyi kaptırmanın itibar bedeli
  poachBase:0.34, poachArch:0.10,
  repGap:200, trustDiv:200, morDiv:320,
  repMove:0.25          // sezon sonu itibarın hedefe yaklaşma payı
};
/* Haftalık oranların ajans sayısına göre bölümü. Ajans başına oran sabit kalsaydı
   altıdan on dörde çıkmak dünyanın hızını 2,3 katına çıkarırdı — yeni menajerin ilk
   sezonu buna dayanmaz. İtibarı 5'e sabitlenmiş menajerle altı tohumda ölçüldü, iki
   sezonda ekrana düşen yarış bildirimi: 6 ajans 20,7 · 14 ajans 18,0 · bölme olmadan
   14 ajans 31,5. (Kat farkının 2,3 değil ~1,5 çıkması chaseMax tavanının devreye
   girmesinden; tavan olmasa fark tam katına çıkardı.) */
function rivScale(){const n=(S&&S.rivals&&S.rivals.length)||RIV.tuneN;return RIV.tuneN/n;}

/* ================= ARKETİPLER =================
   Davranış kodu tek; karakter veridir. Katsayılar birbirine göre okunur, mutlak
   değerleri RIV'deki oranlarla çarpılır.
     poach : müşterine göz koyma sıklığı
     chase : piyasada oyuncu kovalama sıklığı ve yarışta ne kadar zorlayacağı
     youth : hedef seçiminde gençlik/potansiyel ağırlığı
     elite : hedef seçiminde güç/değer ağırlığı
     vet   : hedef seçiminde tecrübeli (29+) oyuncu ağırlığı — varsayılan 0
     comm  : oyuncudan aldığı komisyon (yüksekse oyuncu memnuniyetsizdir)
     loyal : kendi müşterisini elde tutma gücü
     size  : portföy büyüklüğü eğilimi — butik ajansın az müşterisi olması bu
             katsayıdan geliyor, yoksa paylaşım ajans sayısına bölünür ve hepsi aynı olurdu
     home  : kendi bölgesindeki oyuncuya verdiği ağırlık (varsayılan 1.6)
     away  : bölgesi dışındaki oyuncuya verdiği ağırlık (varsayılan 1)

   home/away önceden claimWeight içinde 'family' id'sine bakan bir if'ti; veriye
   taşındı, yoksa yeni bir bölgesel arketip eklemek kod değiştirmeyi gerektirirdi. */
const RIV_ARCH=[
 {id:'shark',   poach:1.5, chase:0.9, youth:0.2, elite:1.3, comm:0.22, loyal:0.6, size:0.9, rep:[45,70],
  n:{tr:'Vurguncu',en:'The Shark'},
  dsc:{tr:'Yüksek komisyonla çalışır, yıldızın peşinden gider ve kimseye sormadan telefon açar. Müşterisi de aynı hızla kapıyı bulur.',
       en:'Works on a fat percentage, chases the stars and calls anyone without asking. His clients leave just as fast.'}},
 {id:'youth',   poach:0.5, chase:1.4, youth:1.6, elite:0.3, comm:0.10, loyal:1.1, size:1.1, rep:[20,45],
  n:{tr:'Fidanlık',en:'The Nursery'},
  dsc:{tr:'On altı yaşındakileri toplar, on yıl bekler. Yıldızlarla işi yok — yıldızı kendi yetiştirir.',
       en:'Signs sixteen-year-olds and waits a decade. No interest in stars — he grows his own.'}},
 {id:'boutique',poach:1.0, chase:0.4, youth:0.3, elite:1.6, comm:0.15, loyal:1.4, size:0.3, rep:[50,80],
  n:{tr:'Butik Ajans',en:'The Boutique'},
  dsc:{tr:'Az sayıda, çok pahalı isim. Kapısı herkese açık değil; bir oyuncuyu istiyorsa sebebi vardır.',
       en:'A handful of very expensive names. The door isn\'t open to everyone — if he wants a player, there\'s a reason.'}},
 {id:'corp',    poach:1.1, chase:1.2, youth:0.8, elite:1.0, comm:0.13, loyal:0.9, size:2.2, rep:[55,85],
  n:{tr:'Kurumsal Grup',en:'The Corporation'},
  dsc:{tr:'Dört kıtada ofisi, basında adamı var. Kalabalık bir portföy taşır; kimse tek tek ilgilenmez ama kapılar açıktır.',
       en:'Offices on four continents and friends in the press. A crowded roster — nobody gets personal attention, but every door opens.'}},
 {id:'family',  poach:0.3, chase:0.8, youth:0.9, elite:0.5, comm:0.07, loyal:1.5, size:0.45, rep:[15,40],
  home:3.5, away:0.15,
  n:{tr:'Aile Ajansı',en:'The Family Firm'},
  dsc:{tr:'Kendi şehrinden çıkmaz, düşük komisyonla çalışır, kimsenin müşterisine göz dikmez. Bıraktığı oyuncu da olmaz.',
       en:'Never leaves his own city, works for a small cut and covets nobody\'s client. He rarely loses one either.'}},
 {id:'fixer',   poach:1.2, chase:1.1, youth:0.6, elite:0.7, comm:0.18, loyal:0.8, size:1.3, rep:[30,60],
  n:{tr:'Aracı',en:'The Fixer'},
  dsc:{tr:'Her kulüpte bir tanıdığı, her masada bir payı var. Orta seviye oyuncuyu çok taşır; ikna etmek için parayı masaya koyar.',
       en:'A contact at every club and a slice of every table. Moves a lot of mid-level players and puts money on the table to persuade.'}},
 /* Aşağıdakiler piyasayı kalabalıklaştırmak için eklendi. Tek ölçüt şuydu: her biri
    hedef seçiminde ya da davranışında yukarıdakilerden en az bir eksende ayrılsın —
    yoksa yeni ajans yalnızca yeni bir ad olurdu. Saldırganlık ortalaması bilerek
    aşağı çekildi (poach ortalaması 0.93 → 0.88), erken oyun ezilmesin. */
 {id:'expro',   poach:0.6, chase:1.0, youth:1.0, elite:0.7, comm:0.09, loyal:1.3, size:0.8, rep:[30,60],
  n:{tr:'Eski Futbolcu',en:'The Ex-Pro'},
  dsc:{tr:'Sahayı içeriden bilir, soyunma odasının dilini konuşur. Az komisyon ister; oyuncular ona kolay güvenir, kolay bırakmaz.',
       en:'He knows the game from the inside and speaks the dressing room\'s language. Asks for little, and players trust him easily.'}},
 {id:'lawyer',  poach:0.9, chase:0.7, youth:0.2, elite:1.1, vet:1.1, comm:0.16, loyal:1.35, size:0.7, rep:[40,70],
  n:{tr:'Sözleşme Avukatı',en:'The Lawyer'},
  dsc:{tr:'Oyuncuyla değil sözleşmeyle ilgilenir. Kariyerinin son büyük imzasını arayan tecrübelilere maddelerin arasından yol açar.',
       en:'He cares about the contract, not the player. Finds the veterans chasing one last big deal a way through the small print.'}},
 {id:'media',   poach:1.4, chase:1.0, youth:0.4, elite:1.5, comm:0.20, loyal:0.7, size:0.5, rep:[45,75],
  n:{tr:'Medya Menajeri',en:'The Publicist'},
  dsc:{tr:'Oyuncuyu değil imajını satar. Kamera önündeki isimlerin peşinde; kameranın söndüğü gün ilgisi de söner.',
       en:'He sells the image, not the player. Chases the names the cameras follow — and loses interest the day they look away.'}},
 {id:'pipeline',poach:0.6, chase:1.3, youth:1.3, elite:0.5, comm:0.12, loyal:0.9, size:1.4, rep:[25,55],
  home:2.0, away:0.7,
  n:{tr:'Transfer Hattı',en:'The Pipeline'},
  dsc:{tr:'Kendi bölgesinden Avrupa\'ya oyuncu taşır. Tek tek isimlerle değil, akan bir hatla ilgilenir.',
       en:'He moves players from his own region to Europe. Not interested in names one by one — only in keeping the line flowing.'}},
 {id:'free',    poach:0.4, chase:1.5, youth:0.2, elite:0.4, vet:1.6, comm:0.08, loyal:0.6, size:1.5, rep:[15,45],
  n:{tr:'Bonservis Simsarı',en:'The Free-Agent Broker'},
  dsc:{tr:'Sözleşmesi bitenlerin listesini herkesten önce alır. Kapıda bekleyen kalabalık bir portföyü var; kaybettiğine de üzülmez.',
       en:'He gets the list of expiring contracts before anyone else. A crowded roster of men waiting by the phone — and no tears when one leaves.'}},
 {id:'fund',    poach:1.3, chase:1.2, youth:1.1, elite:1.2, comm:0.19, loyal:0.8, size:1.6, rep:[50,85],
  n:{tr:'Yatırım Fonu',en:'The Fund'},
  dsc:{tr:'Oyuncuya kariyer değil portföy kalemi diye bakar. Yükselecek ismi erken alır, zirvede satar; komisyonu da ona göredir.',
       en:'He sees a position, not a career. Buys the name on the way up and sells it at the peak — and prices himself accordingly.'}},
 {id:'journey', poach:0.7, chase:1.4, youth:0.5, elite:0.4, vet:0.7, comm:0.11, loyal:0.7, size:1.8, rep:[20,50],
  n:{tr:'Gezgin Menajer',en:'The Journeyman\'s Agent'},
  dsc:{tr:'Kimsenin uğraşmadığı orta direk oyuncuyu taşır; yüzlercesini tanır, hiçbirini uzun tutamaz. İşi hacimden çıkar.',
       en:'He carries the squad players nobody else bothers with — knows hundreds, keeps none for long. The money is in the volume.'}},
 {id:'oldhand', poach:0.8, chase:0.5, youth:0.3, elite:1.4, vet:0.8, comm:0.14, loyal:1.5, size:0.4, rep:[60,90],
  n:{tr:'Eski Tüfek',en:'The Old Hand'},
  dsc:{tr:'Otuz yıldır bu işte. Yeni müşteri aramaz, müşteri onu arar; elindekini de kimseye kaptırmaz.',
       en:'Thirty years in the game. He doesn\'t look for clients, they look for him — and nobody takes one off him.'}}
];
function archById(id){return RIV_ARCH.find(a=>a.id===id)||RIV_ARCH[0];}
/* Listede ajansın ne aradığını tek kelimeyle söyleyen etiket. Saklanmıyor, katsayılardan
   türetiliyor — arketipin sayıları değişirse etiket kendiliğinden doğru kalır. Metin
   burada, RIV_ARCH'ın adları gibi iki dilli; STR'ye girmiyor ki arketip verisi tek
   dosyada kalsın. */
function archFocus(a){
  if((a.vet||0)>=1)          return {tr:'Tecrübeli oyuncu',en:'Veterans'};
  if(a.size<=0.4)            return {tr:'Seçilmiş birkaç isim',en:'A select few'};
  if((a.home||1.6)>=2.2)     return {tr:'Kendi bölgesi',en:'Its own region'};
  if(a.youth>=1.2)           return {tr:'Genç yetenek',en:'Young talent'};
  if(a.elite>=1.3)           return {tr:'Yıldız oyuncu',en:'Star players'};
  if(a.size>=1.4)            return {tr:'Geniş portföy',en:'Volume'};
  return {tr:'Orta seviye',en:'Mid-tier'};
}

/* Ajans adı saklanmıyor, üretiliyor: iki dilde de doğru olsun diye ek ayrı tutuluyor
   (bkz. lgName — aynı gerekçe). Adlar soyadı havuzundan geliyor, gerçek bir ajans
   markasına yaklaşmıyor. */
const RIV_SFX={
  mg:{tr:'Menajerlik',   en:'Management'},
  gr:{tr:'Spor Grup',    en:'Sports Group'},
  pt:{tr:'ve Ortakları', en:'& Partners'},
  aj:{tr:'Ajans',        en:'Agency'}
};
const RIV_SFXK=Object.keys(RIV_SFX);
function rivalName(r){
  if(!r)return '';
  const sfx=RIV_SFX[r.sfx]||RIV_SFX.mg;
  return r.base+' '+sfx[L];
}

/* ================= KURULUŞ ================= */
/* Ajansın yuva bölgesi hangi uyruğun soyadını kullanacağını belirliyor: Batı Afrika'da
   kurulu bir ajansın adı da oradan gelsin. pickNat core.js'te ve yalnızca çağrı
   anında okunuyor — dosya sırası bir bağ getirmiyor. */
function rivNatOf(ctry){
  const lg=LEAGUES.find(l=>l.ctry===ctry);
  const d=lg?lg.nat:'en';
  /* pickNat kullanılmıyor: o %38 ihtimalle yabancı uyruk döndürüyor ve Suudi
     Arabistan merkezli ajansın adı Fransızca çıkabiliyordu. Ajans yerlidir; yalnızca
     bölgesel havuzlar (af/afN) tek bir ülkeye indirilir. */
  if(d==='af')return AFR[R(0,AFR.length-1)];
  if(d==='afN')return NAF[R(0,NAF.length-1)];
  return d;
}
/* Tek bir ajans kaydı. id dışarıdan veriliyor: kadroya sonradan eklenen ajansın
   id'si dizideki yeri olmalı, yoksa eski kayıtlardaki p.ra başka birini gösterir. */
function makeRival(a,id,ctry,used){
  const nat=rivNatOf(ctry);
  let base=NATS[nat].l[0];
  /* aynı soyadı iki ajansa düşmesin — oyuncu adları zaten aynı havuzdan geliyor.
     Deneme sayısı sınırlı: küçük bir soyadı havuzu döngüyü kilitlemesin. */
  for(let k=0;k<40;k++){
    const b=NATS[nat].l[R(0,NATS[nat].l.length-1)];
    if(!used[b]){base=b;break;}
  }
  used[base]=1;
  return {id,base,sfx:RIV_SFXK[R(0,RIV_SFXK.length-1)],arch:a.id,ctry,
          rep:R(a.rep[0],a.rep[1]),rel:0,won:0,lost:0};
}
/* Ajansların yuva bölgeleri: her ajans ayrı bir bölgede kurulsun ki harita üzerinde
   de dağılmış görünsünler. RIV_ARCH bölge sayısını (16) geçerse baştan sarılır. */
function rivCtrys(){return Object.keys(CTRYS).sort(()=>RF()-0.5);}
function newRivals(){
  /* Her arketipten bir tane: on dört ajans on dört ayrı karakter demek. Aynı
     arketipten iki tane olsaydı oyuncu ikisini birbirinden ayıramazdı. */
  const ctrys=rivCtrys(),used={};
  return RIV_ARCH.map((a,i)=>makeRival(a,i,ctrys[i%ctrys.length],used));
}
/* Kadro eksikse tamamla. Yeni ajans dizinin sonuna ekleniyor: mevcut id'ler yerinde
   kalır, dolayısıyla eski kayıttaki her p.ra hâlâ aynı ajansı gösterir. Yeni gelenler
   portföysüz başlamaz — RIV.notable eşiği de düştüğü için claimNotable() bu turda
   sahipsiz kalmış oyuncuları dağıtırken onlar da payını alır. */
function growRivals(){
  const have={};S.rivals.forEach(r=>have[r.arch]=1);
  const used={};S.rivals.forEach(r=>used[r.base]=1);
  const free=rivCtrys().filter(c=>!S.rivals.some(r=>r.ctry===c));
  let k=0;
  RIV_ARCH.forEach(a=>{
    if(have[a.id])return;
    const ctry=free.length?free[k++%free.length]:rivCtrys()[0];
    S.rivals.push(makeRival(a,S.rivals.length,ctry,used));
  });
  RIVCNT=null;
}
/* Her giriş kapısında çağrılır: yeni oyun, eski kayıt, bozuk kayıt. Kurulum bir kez
   olur; kadro tamsa hiçbir şey yapmaz. */
function ensureRivals(){
  if(!S)return;
  if(!S.rivals||!S.rivals.length){
    S.rivals=newRivals();
    claimNotable();
  } else if(S.rivals.length<RIV_ARCH.length){
    growRivals();
    claimNotable();
  }
  S.chase=S.chase||[];
}
function rivalById(i){return (S&&S.rivals&&S.rivals[i])||null;}
/* Oyuncunun ajansı — yoksa null. p.ra taşımayan eski kayıtlar için de doğru cevap. */
function rivalOf(p){
  if(!p||p.agent!=='rival'||p.ra===undefined)return null;
  return rivalById(p.ra);
}
function rivalArch(r){return archById(r&&r.arch);}
/* Portföy türetiliyor, saklanmıyor. Hafta içinde değişmediği için sonuç haftaya
   göre bir kez sayılıyor: sıralama ekranı 7000 oyuncuyu her çizimde taramasın. */
let RIVCNT=null;
function rivalCounts(){
  const key=(S.tw||0)+':'+(S.season||0)+':'+(S.week||0);
  if(RIVCNT&&RIVCNT.key===key)return RIVCNT.v;
  const v=(S.rivals||[]).map(()=>0);
  S.players.forEach(p=>{if(p.ra!==undefined&&v[p.ra]!==undefined&&p.agent==='rival')v[p.ra]++;});
  RIVCNT={key,v};
  return v;
}
function rivalCount(i){return rivalCounts()[i]||0;}
function rivalClients(i){return S.players.filter(p=>p.agent==='rival'&&p.ra===i);}
/* Sıralama: sen de listedesin. Ekranda da, panelde gösterilen sıra da buradan okunur. */
function rivalRank(){
  const rows=(S.rivals||[]).map(r=>({r,rep:r.rep}));
  rows.push({r:null,rep:S.rep});
  rows.sort((a,b)=>b.rep-a.rep);
  return rows;
}
function myRank(){return rivalRank().findIndex(x=>!x.r)+1;}

/* ================= SAHİPLENME =================
   Adlı bir ajans yalnızca dikkat çekici oyuncuyu alır: dünyada ~3000 rakip menajerli
   oyuncu var, hepsini altı ajansa bölmek "butik ajans"ı anlamsız kılardı. Geri kalanı
   isimsiz yerel menajerinde kalıyor — bugünkü davranışın aynısı. */
function notable(p){
  /* Genç kanadı dar tutuluyor: yalnızca "pot-r büyük" demek 16 yaşındaki her
     oyuncuyu içeri alıyor ve butik ajansın portföyü yüzleri buluyordu. Gerçekten
     adı duyulacak gençler aranıyor. */
  return p.agent==='rival'&&
    (profileOf(p)>=RIV.notable||(p.age<=21&&p.pot-p.r>=14&&p.pot>=RIV.notable+6));
}
/* Hangi ajans alır: arketip ağırlıkları + portföy eğilimi + yuva bölgesi yakınlığı. */
function claimWeight(r,p){
  const a=rivalArch(r);
  const young=(p.age<=21&&p.pot-p.r>=10)?1:0;
  const elite=Math.max(0,(p.r-72)/12);
  /* Tecrübe ekseni: yıldızı ve genci kovalayan ajansların yanında kariyerinin
     sonundaki oyuncuyla ilgilenen biri de olsun. vet taşımayan arketipte terim
     sıfır, yani eski altı arketibin ağırlıkları değişmedi. */
  const vet=p.age>=29?Math.min(1,(p.age-28)/3):0;
  let w=(0.5+young*a.youth+elite*a.elite+vet*(a.vet||0))*a.size;
  if(teamOf(p).lg>=0&&LEAGUES[teamOf(p).lg].ctry===r.ctry)w*=(a.home||1.6);
  else w*=(a.away||1);   // aile ajansı kendi şehrinden çıkmaz, hat kendi bölgesinden besler
  return Math.max(0.02,w);
}
function claimFor(p){
  const rs=S.rivals||[];
  if(!rs.length)return;
  let tot=0;rs.forEach(r=>tot+=claimWeight(r,p));
  let x=RF()*tot;
  for(const r of rs){x-=claimWeight(r,p);if(x<=0){p.ra=r.id;return;}}
  p.ra=rs[rs.length-1].id;
}
/* Bütün dünyayı tarayan tek geçiş: yeni oyunda ve her sezon sonunda çalışır.
   Eşiğin altına düşen oyuncunun ajansı da düşer — yıldızlığı biten oyuncuyla
   butik ajansın işi kalmaz. */
function claimNotable(){
  if(!S||!S.rivals)return;
  S.players.forEach(p=>{
    if(p.agent!=='rival'){if(p.ra!==undefined)delete p.ra;return;}
    if(notable(p)){if(p.ra===undefined)claimFor(p);}
    else if(p.ra!==undefined)delete p.ra;
  });
  RIVCNT=null;
}

/* ================= İMZA YARIŞI ================= */
function chaseFor(pid){return (S.chase||[]).find(x=>x.pid===pid);}
function chaseLeft(c){return Math.max(1,c.until-(S.tw||0));}
/* pitchChance'in tek okuma yeri buradan besleniyor: rakip aynı oyuncuyla
   görüşüyorsa oyuncunun kafası karışık, senin şansın düşük. */
function chasePenalty(p){
  const c=chaseFor(p.id);
  if(!c)return 0;
  const r=rivalById(c.ri);
  return RIV.chasePen*(r?rivalArch(r).chase:1);
}
/* Rakiplerin ilgilendiği taban: bu eşiğin altındaki oyuncu ne yarışa ne de arka plan
   imzasına konu olur. Yeni menajerin tutunduğu alt uç böylece kalabalık kalıyor. */
function rivInterest(p){return p.agent===null&&profileOf(p)>=52;}
/* Dünyayı baştan sona taramak yerine örnekle — market.js'in alıcı arama kalıbı.
   7000 oyuncuyu her hafta birkaç kez filtrelemek telefonda görünür bir maliyet. */
function rivSample(test,tries,want){
  const out=[];
  for(let i=0;i<tries&&out.length<want;i++){
    const p=S.players[R(0,S.players.length-1)];
    if(test(p)&&out.indexOf(p)<0)out.push(p);
  }
  return out;
}
/* Yarış yalnızca senin gördüğün liglerde ve senin uzanabileceğin seviyede açılır.
   Göremediğin ya da imzalayamayacağın bir oyuncu için yarışmak yarış değil, dipnot:
   ölçüldü, altı sezonda 88 yarışın yalnızca 5'i oyuncunun ekranına düşüyordu. */
function chaseTarget(r){
  const ceil=repCap()+RIV.reach;
  const cands=rivSample(p=>rivInterest(p)&&!chaseFor(p.id)&&knownLg(teamOf(p).lg)
                            &&profileOf(p)<=ceil,90,12);
  if(!cands.length)return null;
  return pickWeighted(cands,p=>claimWeight(r,p));
}
function openChase(r){
  const p=chaseTarget(r);
  if(!p)return;
  S.chase.push({pid:p.id,ri:r.id,until:(S.tw||0)+R(RIV.chaseLen[0],RIV.chaseLen[1])});
  /* Haber yalnızca itibarının yettiği oyuncu için. Kapasite koşulu bilerek yok:
     kadron doluyken de kimin gittiğini bilmek istersin, üstelik bir müşteriyi
     bırakıp o oyuncuya gitmek geçerli bir karar. */
  if(profileOf(p)<=repCap())
    pushNews('chaseOn',{n:p.n,pid:p.id,a:rivalName(r),ri:r.id},'warn');
}
/* Süresi dolan yarışı rakip kazanır. Sen imzaladıysan kayıt zaten düşmüştür. */
function resolveChases(){
  (S.chase||[]).slice().forEach(c=>{
    const p=byId(c.pid);
    if(!p||p.agent!==null){S.chase=S.chase.filter(x=>x!==c);return;}
    if(c.until>(S.tw||0))return;
    S.chase=S.chase.filter(x=>x!==c);
    const r=rivalById(c.ri);
    if(!r)return;
    p.agent='rival';
    if(notable(p))p.ra=r.id;
    RIVCNT=null;
    if(knownLg(teamOf(p).lg)&&profileOf(p)<=repCap())
      pushNews('chaseLost',{n:p.n,pid:p.id,a:rivalName(r),ri:r.id},'bad');
  });
}

/* ================= AYARTMA =================
   Rakip önce duyulur, sonra masaya gelir: tehdit birkaç hafta birikir ki oyuncu
   müşterisinin güvenine bakacak vakti olsun. */
function poachChance(p,r){
  const a=rivalArch(r);
  /* İtibar farkı sınırlanıyor: rakipler 60-90 itibarla başlıyor, yeni menajer 5 ile.
     Sınırsız bırakıldığında ilk sezonlarda her ayartma neredeyse kesin kayıpla
     bitiyordu — ölçüldü: %60 kayıp, itibar altı sezon boyunca yerinde saydı. Fark
     bir etken olmalı, tek etken değil. */
  const gap=clamp((r.rep-S.rep)/RIV.repGap,-0.15,0.18);
  /* skillBonus('loy') — ayartma riskine dokunan tek yer (bkz. SK_KEY.loy). */
  return clamp(RIV.poachBase+a.poach*RIV.poachArch+gap
    -(trustOf(p)-55)/RIV.trustDiv
    -(p.morale-55)/RIV.morDiv
    -clamp(skillBonus('loy'),0,0.6),0.05,0.90);
}
/* Hedef seçimi: güveni düşük, morali kırık ya da fazla değerli müşteri. Yeni imza
   atmış oyuncuya kimse yaklaşmaz (honeymoon).

   RIV.worth eşiği asıl koruma: büyük ajanslar alt ligdeki bir oyuncu için telefon
   açmaz. Bu olmadan iki müşterilik yeni menajer sürekli ayartılıyor ve hiç
   büyüyemiyordu. Ayartma, adın duyulduktan sonra başlayan bir sorun. */
/* p.sa — müşterinin imzalandığı hafta. Yalnızca burada okunuyor; eski kayıtlarda
   yok, o zaman koruma da yok (ilk ayartmadan sonra kendiliğinden oluşur). */
function poachGraced(p){return (p.sa||0)+RIV.poachGrace>(S.tw||0);}
function poachTarget(){
  const cands=S.clients.map(byId).filter(p=>p&&!honeymoon(p)&&!poachGraced(p)&&
    (profileOf(p)>=RIV.worth||(p.age<=21&&p.pot-p.r>=12))&&
    (trustOf(p)<70||p.morale<50||p.r>=74));
  if(!cands.length)return null;
  return pickWeighted(cands,p=>1+Math.max(0,(70-trustOf(p))/20)+Math.max(0,(50-p.morale)/20)
                                +Math.max(0,(p.r-72)/8));
}
function openPoach(){
  const p=poachTarget();
  if(!p)return;
  const rs=(S.rivals||[]).filter(r=>rivalArch(r).poach>=0.5);
  if(!rs.length)return;
  const r=pickWeighted(rs,x=>rivalArch(x).poach*claimWeight(x,p));
  S.poach={pid:p.id,ri:r.id,at:(S.tw||0)+R(RIV.poachWarn[0],RIV.poachWarn[1])};
  S.poachAt=(S.tw||0)+RIV.poachGap;
  pushNews('poachWarn',{n:p.n,pid:p.id,a:rivalName(r),ri:r.id},'warn');
}
/* Masadaki üç seçenek. EVENTS ile aynı dil: her seçenek bir sonuç nesnesi döner,
   uygulaması applyEff'ten geçer (bkz. poachChoose — js/ui.js).
     d   : kaybetme olasılığına eklenen pay
     eff : applyEff'in anladığı sonuç (cash/rep/trust/morale)
   Karar burada duruyor çünkü denge verisi; çizimi arayüzün işi. */
const POACH_OPT=[
 {t:{tr:'Komisyonundan feda et',en:'Give up part of your cut'},
  run:c=>({d:-0.35,
    eff:{cash:-Math.max(30,Math.round(c.p.wage*10)),trust:10,morale:3},
    msg:{tr:'Rakamı gösterdin. "Bu adam benim için ne kadar önemli, gör." Cebinden çıktı ama masada kaldı.',
         en:'You showed him the number. "See how much you matter to me." It cost you, but he stayed at your table.'}})},
 {t:{tr:'Yüz yüze konuş, ilişkiye güven',en:'Sit down with him and trust the relationship'},
  run:c=>RF()<0.35+trustOf(c.p)/160
    ?{d:-0.30,eff:{trust:8},
      msg:{tr:'Uzun bir akşam yemeği. Anlattıklarını dinledi, sen de onunkileri. Aranızdaki bağ para istemedi.',
           en:'A long dinner. He listened, and so did you. The bond held without money changing hands.'}}
    :{d:-0.05,eff:{trust:-4},
      msg:{tr:'Konuştunuz ama karşındaki zaten kararını vermiş gibiydi. Sözlerin havada kaldı.',
           en:'You talked, but he seemed to have made his mind up already. Your words hung in the air.'}}},
 {t:{tr:'Aldırma, işini yapmaya devam et',en:'Ignore it and get on with your work'},
  run:()=>({d:0.12,eff:{},
    msg:{tr:'Telefonu açmadın, konuyu hiç açmadın. Bazen doğru olan budur — bazen değil.',
         en:'You didn\'t call and never raised it. Sometimes that\'s right — sometimes it isn\'t.'}})}
];
/* Müşteriyi kaybetmenin tek yolu: burada toplanıyor ki itibar kaybı ve haber
   tek yerden geçsin. */
function losePlayerTo(p,r){
  p.agent='rival';
  S.clients=S.clients.filter(c=>c!==p.id);
  if(notable(p))p.ra=r.id;
  r.won=(r.won||0)+1;
  r.rel=clamp((r.rel||0)-12,-100,100);
  RIVCNT=null;
  /* Kayıp zaten müşteriyi, geliri ve kadro yerini götürüyor; itibar bedeli üçüncü
     ceza olduğu için ölçülü tutuluyor (bkz. RIV.poachRep). */
  repEvent(-RIV.poachRep);
  pushNews('poached',{n:p.n,pid:p.id,a:rivalName(r),ri:r.id},'bad');
}

/* ================= HAFTALIK MOTOR =================
   nextWeek() içinden, transfer piyasasından önce çağrılır. */
function simRivals(){
  ensureRivals();
  const rs=S.rivals||[];
  if(!rs.length)return;
  resolveChases();
  /* Oranlar ajans başına değil dünya başına sabit: bkz. rivScale(). */
  const sc=rivScale();
  rs.forEach(r=>{
    const a=rivalArch(r);
    /* --- arka plan imzaları: piyasadaki temsilcisiz oyuncudan biri --- */
    if(RF()<RIV.signRate*sc*a.chase){
      const pool=rivSample(p=>rivInterest(p)&&!chaseFor(p.id),60,10);
      if(pool.length){
        const p=pickWeighted(pool,x=>claimWeight(r,x));
        p.agent='rival';
        if(notable(p))p.ra=r.id;
        RIVCNT=null;
      }
    }
    /* --- müşteri kaybı: sadık ajans daha az kaybeder --- */
    if(RF()<RIV.loseRate*sc/Math.max(0.3,a.loyal)){
      const mine=rivalClients(r.id);
      if(mine.length){
        const p=mine[R(0,mine.length-1)];
        p.agent=null;delete p.ra;
        RIVCNT=null;
      }
    }
    /* --- yeni yarış --- */
    if((S.chase||[]).length<RIV.chaseMax&&RF()<RIV.chaseW*sc*a.chase)openChase(r);
  });
  /* --- ayartma: aynı anda tek tehdit, aralarında bekleme var --- */
  if(!S.poach&&S.clients.length&&(S.poachAt||0)<=(S.tw||0)&&RF()<0.30)openPoach();
}
/* Sezon sonu tek geçiş: itibar portföyün kalitesine doğru kayar, böylece sıralama
   tablosu kariyer boyunca gerçekten hareket eder. Haftalık hesaplamak pahalı olurdu. */
function rivalSeason(){
  ensureRivals();
  (S.rivals||[]).forEach(r=>{
    const mine=rivalClients(r.id);
    const top=mine.slice().sort((a,b)=>b.r-a.r).slice(0,10);
    const q=top.length?top.reduce((s,p)=>s+p.r,0)/top.length:55;
    /* hedef: portföy kalitesi + genişliği. Kimseyi taşımayan ajans sönüyor. */
    const target=clamp((q-58)*2.6+Math.min(20,mine.length*0.6),5,120);
    r.rep=Math.round(clamp(r.rep+(target-r.rep)*RIV.repMove,3,140)*10)/10;
    /* husumet zamanla soğur — kimse on sezon boyunca aynı öfkeyi taşımaz */
    if(r.rel)r.rel=Math.round(r.rel*0.75);
  });
  claimNotable();
}
