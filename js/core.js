'use strict';
/* js/core.js — oyun durumu, yardımcılar, fikstür/kupa kurulumu, keşif ağı, ekonomi formülleri */
/* ================= STATE / HELPERS ================= */
let S=null, negCtx=null;
let stack=[{v:'dash'}];
const R=(a,b)=>a+Math.floor(Math.random()*(b-a+1));
const RF=()=>Math.random();
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const fmtK=v=>v>=1000?(v/1000).toFixed(2).replace(/\.?0+$/,'')+'M €':Math.round(v)+'K €';
const fmtM=v=>v.toFixed(1).replace(/\.0$/,'')+'M €';
/* ===== piyasa eğrileri =====
   Modern futbolun ölçeğine yakın dursun: alt liglerde birkaç bin, üst düzeyde
   yüz binlerce euro haftalık; bonservisler on milyonlarla yüz milyonlar arasında.
   Referans: 60 ≈ ikinci lig oturmuş oyuncu, 70 ≈ üst lig ilk 11, 80 ≈ üst lig
   yıldızı, 88+ ≈ dünya çapında. Değer maaştan daha dik artar — futbolda da öyle. */
const marketWage=r=>Math.max(1,Math.round(8*Math.pow(1.129,r-60)));
const marketValue=r=>{
  const v=2*Math.pow(1.145,r-60);
  return v<10?+v.toFixed(1):Math.round(v);   // küçük değerlerde ondalık, büyükte tam sayı
};
/* Menajerlik komisyonu itibara bağlıdır: adı olmayan menajer düşük oranla çalışır,
   aranan menajer masaya kendi oranını koyar. */
function commissionRate(){return +(0.05+(S.rep/100)*0.10).toFixed(3);}
function commissionPct(){return Math.round(commissionRate()*100);}
function lum(hex){const n=parseInt(hex.slice(1),16);return 0.299*(n>>16)+0.587*((n>>8)&255)+0.114*(n&255);}
function tmBadge(tm,size){
  const s=size||36, f=Math.round(s*0.28);
  const txt=lum(tm.c1)>150?'#16181c':'#fff';
  return `<div class="tb" style="width:${s}px;height:${s}px;font-size:${f}px;color:${txt};background:${tm.c1}">
    ${tm.ab||tm.n.slice(0,3)}<i style="background:${tm.c2}"></i></div>`;
}
let PID=1;
function genName(nat){
  const pool=NATS[nat];
  return pool.f[R(0,pool.f.length-1)]+' '+pool.l[R(0,pool.l.length-1)];
}
function pickNat(domestic){
  if(domestic==='af')domestic=AFR[R(0,AFR.length-1)];
  else if(domestic==='afN')domestic=NAF[R(0,NAF.length-1)];
  if(RF()<0.62)return domestic;
  const others=NATKEYS.filter(n=>n!==domestic);
  const w={br:3,ar:2,fr:1.5,es:1.2,nl:1.2,de:1,it:1,en:0.8,tr:0.8,pt:1,mx:0.8,us:0.5,jp:0.3,sa:0.2,eg:0.4,ma:0.4,ng:0.5,sn:0.5,gh:0.4,cm:0.4,be:0.8,hr:0.6,rs:0.6,pl:0.6,cz:0.4,gr:0.4,no:0.4,se:0.5,dk:0.5,ch:0.5,at:0.4,ua:0.5,ro:0.3,sct:0.4,ie:0.3,ru:0.4,co:0.9,uy:0.6,cl:0.5,pe:0.4,ec:0.4,py:0.3,ve:0.3,ci:0.6,dz:0.5,tn:0.4,ml:0.4,cd:0.4,kr:0.4,ir:0.3,au:0.3,cn:0.2};
  let tot=0;others.forEach(n=>tot+=w[n]||1);
  let x=RF()*tot;
  for(const n of others){x-=(w[n]||1);if(x<=0)return n;}
  return others[0];
}
/* yaş → güç eğrisi: genç oyuncu kulübünün seviyesinin belirgin altında başlar,
   zirveye 24-30 arasında ulaşır, sonra geriler. forceAge verilirse r/pot O yaşa göre hesaplanır. */
function genPlayer(team,pos,forceAge){
  const str=team.str;
  const nat=pickNat(LEAGUES[team.lg].nat);
  const low=str<=60;
  const age=forceAge||(low?(RF()<0.5?R(16,21):R(22,32)):R(17,34));
  let r;
  if(age<=17)r=clamp(R(str-24,str-14),35,70);
  else if(age<=19)r=clamp(R(str-19,str-10),35,78);
  else if(age<=21)r=clamp(R(str-14,str-4),35,84);
  else if(age<=23)r=clamp(R(str-9,str+2),38,88);
  else if(age<=30)r=clamp(R(str-7,str+4),40,93);
  else r=clamp(R(str-9,str+2),38,90);
  let pot;
  if(age<=21){
    pot=r+(age<=17?R(8,20):age<=19?R(6,17):R(4,13));
    const w=RF();
    if(w<0.007)pot=r+R(30,45);      // gerçek wonderkid — çok nadir
    else if(w<0.045)pot=r+R(18,30); // yüksek potansiyel — nadir
  } else if(age<=23)pot=r+R(2,9);
  else if(age<=26)pot=r+R(0,4);
  else pot=r+R(0,1);
  pot=clamp(pot,r,96);
  /* 90+ potansiyel gerçekten nadir olsun: yolu ne olursa olsun küresel eleme */
  if(pot>=90&&r<88&&RF()>0.15)pot=clamp(89-R(0,4),r,96);
  return {id:PID++,n:genName(nat),nat,age,pos:pos||POS[R(0,3)],r,pot,
    team:team.id,wage:Math.max(1,Math.round(marketWage(r)*(0.75+RF()*0.35))),yrs:R(1,4),
    morale:R(55,85),form:R(40,70),g:0,a:0,app:0,min:0,rtSum:0,rtN:0,l5:[],agent:RF()<(low?0.25:0.45)?'rival':null,ignored:0,
    h:R(168,196),ft:RF()<0.74?'R':'L',hist:[],seasons:[]};
}
/* ===== kariyer sonu & kadro yenilenmesi =====
   Kulüpler her sezon kadronun bir kısmını yeniler: yaşlananlar bırakır,
   seviyeyi hiç yakalayamayanlar sessizce elenir. Yerlerine çoğunlukla genç,
   bir kısmı hazır oyuncu gelir — böylece yaş piramidi kendini korur. */
function careerEndProb(p,lvl){
  if(p.age>=38)return 1;
  if(p.age>=34)return 0.30+(p.age-34)*0.20+(p.r<lvl-5?0.18:0);
  if(p.age>=31)return 0.08+(p.r<lvl-6?0.12:0);
  if(p.age>=24&&p.pot<lvl-11)return 0.13; // seviyeyi yakalayamadı
  return 0;
}
function intakeAge(){const w=RF();return w<0.66?R(16,20):w<0.89?R(21,24):R(25,28);}
/* Sözleşmesi biten oyuncuyu kulüp tutar mı? Seviyeye katkısı, yaşı ve potansiyeli belirler. */
function renewProb(p,lvl){
  let q=0.74+(p.r-lvl)*0.045;
  if(p.age<=23&&p.pot-p.r>=6)q+=0.22;  // geleceği olan genç bırakılmaz
  if(p.age>=33)q-=0.38;
  if(p.r<lvl-6)q-=0.28;                // kadroya katkısı yok
  return clamp(q,0.04,0.96);
}
/* Kulüpten ayrıldı: artık kulüpsüz. Kadroda açılan yeri sezon sonu dengelemesi doldurur. */
function releaseToFree(p){
  p.team=-1;p.yrs=0;p.freeFor=0;
  p.morale=clamp(p.morale-10,0,100);
  delete p.grp;
}
/* ayrılan oyuncunun yerine yeni bir oyuncu doğar — id korunur, eski kayıtlar silinir */
function regenPlayer(p){
  Object.assign(p,genPlayer(teamOf(p),p.pos,intakeAge()),{id:p.id});
  delete p.so;delete p.cd;delete p.hm; // önceki oyuncudan miras kalan durumlar
}
function newGame(){
  PID=1;
  S={lang:L,week:1,season:1,cash:250,rep:5,tw:0,curLg:0,curCon:'eu',curCtry:'TR',mLg:'all',agent:null,known:[],scout:[],clients:[],inbox:[],players:[],teams:[],fx:[],offers:[],pending:[],pendC:[],pendPay:[],deals:[],lgHist:LEAGUES.map(()=>[])};
  TEAMS.forEach((lgTeams,lg)=>{
    lgTeams.forEach(([n,ab,c1,c2,str])=>{
      const tm={id:S.teams.length,n,ab,c1,c2,lg,str,bud:clamp((str-55)/30,0.4,1.05),pts:0,w:0,d:0,l:0,gf:0,ga:0};
      S.teams.push(tm);
      [['KL',2],['DF',5],['OS',5],['FV',4]].forEach(([p,cnt])=>{for(let k=0;k<cnt;k++)S.players.push(genPlayer(tm,p));});
    });
  });
  buildAllFixtures();
  seedCups();
  pushNews('tut',{},'info');
}
const SEASONW=38;   // sezon uzunluğu hedefi (en kalabalık ligin çift devresi)
function makeFixtures(idList,targetW){
  let ids=[...idList];
  if(ids.length%2)ids.push(-1); // bye for odd-sized groups
  const n=ids.length,rounds=[];
  for(let r=0;r<n-1;r++){
    const ms=[];
    for(let i=0;i<n/2;i++){
      const h=ids[i],a=ids[n-1-i];
      if(h!==-1&&a!==-1)ms.push(r%2?{h:a,a:h}:{h,a});
    }
    rounds.push(ms);ids.splice(1,0,ids.pop());
  }
  /* Ligler farklı uzunlukta olabilir — 18 takımlı lig 34, 20 takımlı 38 hafta oynar,
     bu gerçekçidir. Sorun yalnızca çift devrenin sezona sığmadığı liglerde: 24 takımlı
     bir lig tek devrede 23 haftada biter, kalan 15 hafta boş geçerdi. Orada rövanşların
     sığdığı kadarı eklenir; her takım yine eşit sayıda maç yapar. */
  const rev=rounds.map(ms=>ms.map(m=>({h:m.a,a:m.h})));
  const cap=targetW||Infinity;
  const all=(2*rounds.length<=cap)?[...rounds,...rev]
           :[...rounds,...rev.slice(0,Math.max(0,cap-rounds.length))];
  return all.map(ms=>ms.map(m=>({...m,hg:null,ag:null})));
}
/* ===== continental cups ===== */
function seedPair(ids){const r=[];for(let i=0;i<ids.length/2;i++)r.push({h:ids[i],a:ids[ids.length-1-i],hg:null,ag:null});return r;}
function consPair(ids){const r=[];for(let i=0;i<ids.length;i+=2)r.push({h:ids[i],a:ids[i+1],hg:null,ag:null});return r;}
function seedCups(){
  /* katılım: 8 Avrupa liginin bitiş sıralamasından — 1-2. sıra EC1, 3-4. EC2, 5-6. EC3 */
  const order=['EN1','ES1','DE1','IT1','FR1','TR1','NL1','PT1'];
  const perLg=order.map(c=>{
    const i=LEAGUES.findIndex(l=>l.c===c);
    return leagueTable(i).map(tm=>tm.id);
  });
  const pool=[];
  for(let pos=0;pos<6;pos++)perLg.forEach(lst=>{if(lst[pos]!==undefined)pool.push(lst[pos]);});
  S.cups=CUPS.map((cp,ci)=>({c:cp.c,rounds:[seedPair(pool.slice(ci*16,ci*16+16))]}));
}
function playKO(sh,sa){
  let g1=poisson(clamp(1.3*Math.pow(sh/sa,2.4),0.3,4)),g2=poisson(clamp(1.1*Math.pow(sa/sh,2.4),0.3,4));
  if(g1===g2){if(RF()<0.5)g1++;else g2++;}
  return [g1,g2];
}
function simCups(){
  (S.cups||[]).forEach((cp,cci)=>{
    const ri=cp.rounds.length-1;
    const round=cp.rounds[ri];
    if(!round||!round.length||round[0].hg!==null)return;
    if(S.week!==CUPWKS[ri])return;
    const winners=[];
    round.forEach(m=>{
      const [g1,g2]=playKO(teamStr(m.h),teamStr(m.a));
      m.hg=g1;m.ag=g2;winners.push(g1>g2?m.h:m.a);
    });
    if(winners.length>1)cp.rounds.push(consPair(winners));
    else{
      const champ=S.teams[winners[0]];
      const cupN=CUPS.find(x=>x.c===cp.c).n[L];
      pushNews('cupWin',{c:champ.n,tid:champ.id,cup:cupN,ci:cci},'good');
      S.cupHist=S.cupHist||{};
      (S.cupHist[cp.c]=S.cupHist[cp.c]||[]).push({se:S.season,tid:champ.id});
      if(S.cupHist[cp.c].length>20)S.cupHist[cp.c].shift();
      if(S.clients.some(id=>byId(id).team===champ.id))S.rep=clamp(S.rep+3,0,100);
    }
  });
}
function buildAllFixtures(){
  LEAGUES.forEach((lg,i)=>{
    const tms=S.teams.filter(tm=>tm.lg===i);
    if(lg.grp){
      tms.forEach((tm,k)=>{tm.grp=k%2;}); // alternate by strength order → balanced groups
      const A=tms.filter(tm=>tm.grp===0).map(tm=>tm.id);
      const B=tms.filter(tm=>tm.grp===1).map(tm=>tm.id);
      /* gruplu liglerde grup aşamasının bitişini finalin takip etmesi gerekiyor —
         doğal çift devrede bırakılır, uzatılmaz */
      const fa=makeFixtures(A),fb=makeFixtures(B);
      S.fx[i]=fa.map((r,w)=>r.concat(fb[w]||[]));
    } else S.fx[i]=makeFixtures(tms.map(tm=>tm.id),SEASONW);
  });
}
function totalWeeks(){return Math.max(...S.fx.map(f=>f.length));}
function lgWeeks(lg){return S.fx[lg].length;}
/* Lig adı ülke adı + kademeden üretilir: hem iki dilli olur hem de gerçek lig
   markalarına hiç yaklaşmaz. Ad veride tutulmadığı için dil değişince de doğrudur. */
function lgName(i){
  const l=LEAGUES[i];
  if(!l)return '';
  return CTRYS[l.ctry][L]+' '+t(l.tier===2?'tier2':'tier1');
}
function byId(id){return S.players.find(p=>p.id===id);}
/* ===== serbest oyuncular =====
   Sözleşmesi biten ve yenilenmeyen oyuncu team=-1 olur. Kulübü yoktur ama arayüzün
   her yerinde tm.n / tm.c1 / tm.lg okunuyor; bu yüzden gerçek bir takım nesnesi yerine
   geçen tek bir sözde takım kullanıyoruz. lg=-1 olduğu için hiçbir lig listesine girmez. */
const FREETM={id:-1,n:'—',ab:'—',c1:'#6b7280',c2:'#3f444c',lg:-1,str:50,bud:0,pts:0,w:0,d:0,l:0,gf:0,ga:0};
function isFree(p){return !p||p.team<0;}
function teamOf(p){return p.team<0?FREETM:S.teams[p.team];}
function freeAgents(){return S.players.filter(p=>p.team<0);}
/* Moralin tek giriş noktası. Maç performansı, transferler, sözleşmeler ve ileride
   eklenecek olaylar hep buradan geçsin — böylece morali etkileyen her şey tek yerde
   sınırlanır ve dengelenebilir. */
/* ===== güven =====
   Oyuncuyla aranızdaki ilişki. Moralden ayrı: moral kulübünden ve sahadan gelir,
   güven senden. Olaylar, tuttuğun sözler ve pazarlıklar burayı hareket ettirir. */
function trustOf(p){return p&&p.trust===undefined?55:(p?p.trust:0);}
function trustEvent(p,delta){
  if(!p)return;
  p.trust=stat(trustOf(p)+delta,0);
  return p.trust;
}
function trustLabel(v){return v>=75?'trHigh':v>=55?'trGood':v>=35?'trMid':'trLow';}
function moraleEvent(p,delta){
  if(!p)return;
  p.morale=stat(p.morale+delta,0);
  return p.morale;
}
/* Form ve moral kesirli katkılarla besleniyor; tek ondalıkta tutuluyor ki kayıt
   dosyasında 50.66495834095 gibi değerler birikmesin. Ekranda tam sayı gösterilir. */
function stat(v,lo){return Math.round(clamp(v,lo===undefined?0:lo,100)*10)/10;}
function pushNews(key,params,type,action){
  S.inbox.unshift({w:S.week,se:S.season,key,params,type:type||'info',action,read:false});
  if(S.inbox.length>60)S.inbox.pop();
}
/* Müşterinin maaşından aldığın pay da itibarınla birlikte büyür. */
function weeklyIncome(){
  const rate=commissionRate();
  return Math.round(S.clients.reduce((s,id)=>{const p=byId(id);return s+(p&&!isFree(p)?p.wage*rate:0);},0)*10)/10;
}
/* Ajansın sabit gideri: ofis + müşteri başına idari yük + her keşif ağının bakımı.
   Başlangıçta küçük tutuluyor ki ilk transferini yapmaya vaktin olsun; ağ genişledikçe
   ve isim yaptıkça büyüyor, böylece "nereye kadar büyüyeceğim" gerçek bir karar oluyor. */
function weeklyCost(){
  const office=1+S.rep*0.03;
  const admin=S.clients.length*0.6;
  const scouts=(S.known||[]).reduce((s,i)=>s+scoutCost(i)*0.0025,0);
  return Math.round((office+admin+scouts)*10)/10;
}
function weeklyNet(){return Math.round((weeklyIncome()-weeklyCost())*10)/10;}
function maxClients(){return 2+Math.floor(S.rep/18);}
function repCap(){return 58+S.rep*0.38;}
function repNeedFor(r){return Math.max(0,Math.ceil((r-58)/0.38));}
/* a player's public profile: big-club players and hyped wonderkids demand reputable agents,
   hidden gems at small clubs stay reachable — that's where a nobody agent starts */
function profileOf(p){
  const hype=(p.age<=23&&p.pot-p.r>=10)?Math.min(8,(p.pot-p.r)/3):0;
  /* kulüpsüz oyuncunun arkasında kulüp gücü yok — kapısı yeni menajerlere açık */
  if(isFree(p))return Math.max(p.r-4,0);
  const visibility=teamOf(p).str-6+hype;
  return Math.max(p.r,visibility);
}
/* --- transfer windows: season start (wk 1-5) & mid-season (4 weeks around halfway) --- */
function midWeek(){return Math.ceil(totalWeeks()/2)+1;}
function windowOpen(){const m=midWeek();return (S.week>=1&&S.week<=5)||(S.week>=m&&S.week<=m+3);}
function nextWindowLabel(){const m=midWeek();return S.week<m?(t('week')+' '+m):t('newSeasonLbl');}
/* ===== sözleşme yenileme koşulları =====
   Bir kulüp masaya her istendiğinde oturmaz. Görüşmenin bir gerekçesi olmalı:
   sözleşme bitiyordur, oyuncu üst üste iyi oynamıştır ya da maaşı piyasanın
   belirgin altında kalmıştır. Aksi halde "neden şimdi?" sorusunun cevabı yoktur. */
function last5Avg(p){
  if(!p.l5||p.l5.length<5)return 0;
  return p.l5.reduce((s,m)=>s+m.rt,0)/p.l5.length;
}
function renewReason(p){
  if(isFree(p))return null;
  if(p.yrs<=1)return 'expiring';
  if(last5Avg(p)>=7.2)return 'form';
  if(p.wage<marketWage(p.r)*0.6)return 'underpaid';
  return null;
}
/* Görüşme neden açılamıyor? null dönerse açılabilir. */
function renewBlock(p){
  if(pendCFor(p.id))return 'pending';
  if((p.rnw||0)>(S.tw||0))return 'cooldown';
  if(!renewReason(p))return 'noreason';
  return null;
}
function renewCd(p){return Math.max(0,(p.rnw||0)-(S.tw||0));}
function offerFor(pid){return (S.offers||[]).find(x=>x.pid===pid);}
function pendingFor(pid){return (S.pending||[]).find(x=>x.pid===pid);}
function pendCFor(pid){return (S.pendC||[]).find(x=>x.pid===pid);} // imzası beklenen sözleşme
function movedThisSeason(p){return (p.hist||[]).some(h=>h.se===S.season);}
function honeymoon(p){return (p.hm||0)>(S.tw||0);} // fresh deal — content for a while
/* ===== scouting network: you only see leagues you know ===== */
/* serbest oyuncular herkese açıktır; keşif ağı yalnızca kulüplü oyuncular için geçerli */
function knownLg(i){return i<0||(S.known||[]).includes(i);}
function lgAvgStr(i){const ts=S.teams.filter(tm=>tm.lg===i);return ts.reduce((s,tm)=>s+tm.str,0)/ts.length;}
function scoutCost(i){return Math.round(30+Math.max(0,lgAvgStr(i)-40)*12);} // K
function scoutPending(i){return (S.scout||[]).find(x=>x.lg===i);}
function createAgent(fn,ln,nat,ag){
  S.agent={fn,ln,nat,agency:ag||(ln+(L==='tr'?' Menajerlik':' Management'))};
  const home=NAT2CTRY[nat]||'WAF';
  S.known=LEAGUES.map((l,i)=>l.ctry===home?i:-1).filter(i=>i>=0);
  /* keep leagues of any existing clients reachable (old saves) */
  S.clients.forEach(id=>{const lg=teamOf(byId(id)).lg;if(lg>=0&&!S.known.includes(lg))S.known.push(lg);});
  S.scout=S.scout||[];
  save();render();
}
function startCareer(){
  const fn=(document.getElementById('inp_fn').value||'').trim();
  const ln=(document.getElementById('inp_ln').value||'').trim();
  const nat=document.getElementById('sel_nat').value;
  const ag=(document.getElementById('inp_ag').value||'').trim();
  if(!fn||!ln){toast(t('fillName'));return;}
  createAgent(fn,ln,nat,ag);
}
function buyScout(i){
  const cost=scoutCost(i);
  if(knownLg(i)||scoutPending(i))return;
  if(S.cash<cost){toast(t('noCash'));return;}
  S.cash-=cost;
  S.scout=S.scout||[];
  S.scout.push({lg:i,done:(S.tw||0)+R(4,8)});
  save();openScout();
}
function openScout(){
  const rows=LEAGUES.map((l,i)=>{
    if(knownLg(i))return '';
    const pend=scoutPending(i);
    return `<div class="pitem" style="cursor:default">
      <div class="pinfo"><div class="pname">${lgName(i)}</div>
      <div class="psub">${t('avgRating')} ~${Math.round(lgAvgStr(i))} · ${S.teams.filter(tm=>tm.lg===i).length} ${t('team').toLowerCase()}</div></div>
      ${pend?`<span class="tag w">${t('scoutPendingT')} · ${Math.max(1,pend.done-(S.tw||0))} ${t('wk')}</span>`
        :`<button class="btn b" style="width:auto;padding:9px 14px" onclick="buyScout(${i})">${t('scoutBuild')} · ${fmtK(scoutCost(i))}</button>`}
    </div>`;
  }).join('');
  openModal(`<h2>${t('scoutNet')}</h2>
   <div class="sub" style="margin:4px 0 12px">${S.known.length}/${LEAGUES.length} ${t('knownLbl')} · ${t('cash')}: ${fmtK(S.cash)}</div>
   <div class="list" style="margin-bottom:0">${rows||`<div class="empty">—</div>`}</div>`);
}
function sortTbl(arr){return [...arr].sort((a,b)=>b.pts-a.pts||(b.gf-b.ga)-(a.gf-a.ga)||b.gf-a.gf);}
function leagueTable(lg){return sortTbl(S.teams.filter(tm=>tm.lg===lg));}
function groupTable(lg,g){return sortTbl(S.teams.filter(tm=>tm.lg===lg&&tm.grp===g));}
function teamPos(tid){
  if(tid<0)return 0;
  const tm=S.teams[tid];
  const tbl=LEAGUES[tm.lg].grp?groupTable(tm.lg,tm.grp):leagueTable(tm.lg);
  return tbl.findIndex(x=>x.id===tid)+1;
}
