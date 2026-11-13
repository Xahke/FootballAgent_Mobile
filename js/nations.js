'use strict';
/* js/nations.js — milli takımlar: kadro çağrısı, milli maç aralarındaki hazırlık
   maçları ve yaz haftalarında oynanan Milletler Kupası.

   Maçın oyuncu tarafı kulüp maçlarıyla aynı motordan geçiyor (playFixture, sim.js):
   kadro burada çağrılıyor, skor burada üretiliyor, gerisi — kim oynar, kim atar,
   maç puanı, form/moral, piyasa değeri, son 5 maç, haftalık rapor — ortak. Sayaçlar
   ayrı: sezonluk p.ns {app,min,g,a} (tallyOf), kariyer boyu p.caps ve p.ig.

   Takvim gerçek milli maç aralarının karşılığı: Eylül, Ekim, Kasım ve Mart'ta
   ikişer maç; hafta numaraları Avrupa (CUP_WK) ve ulusal kupa (DC_RW) haftalarının
   dışında. Oyuncular o hafta kulübünde de oynuyor — gerçekte ara haftasında lig
   durur, burada 20 kulüplü ligler 38 haftanın hepsini kullanıyor.

   Turnuva sezonlarında (S.season % NC_EVERY === 0) lig bittikten sonra yaz
   haftaları ekleniyor: seasonLen() = totalWeeks() + summerWeeks(). Sezon sonu
   (endSeason) turnuvadan sonra geliyor; turnuva o sezonun arşivine giriyor. */

const NT_WK=[3,5,7,11,14,18,22,24];
const NT_CALL=[3,7,14,22];
const NT_SQ={KL:3,DF:8,OS:8,FV:7};
const NT_SIZE=26;
/* Turnuvalara katılmıyor: Rusya FIFA/UEFA turnuvalarından men edilmiş durumda ve
   kulüp kupalarında da dışarıda (kullanıcı kararı). Hazırlık maçı oynayabiliyor —
   gerçekte de men turnuvalardan. */
const NT_BAN=['ru'];
const NC_EVERY=4;
const NC_N=16;
/* Gerçek eleme ağacı sırası: 1 ile 2 ancak finalde karşılaşabilsin. */
const NC_ORDER=[1,16,8,9,5,12,4,13,3,14,6,11,7,10,2,15];

function ncSeason(){return !!S&&S.season%NC_EVERY===0;}
function summerWeeks(){return ncSeason()?Math.round(Math.log2(NC_N)):0;}
function seasonLen(){return totalWeeks()+summerWeeks();}
/* Ekranda gösterilen hafta: yaz haftalarında da gerçek hafta numarası. */
function shownWeek(){return Math.min(S.week,seasonLen());}

/* ===== KADRO ===== */
/* Teknik direktörün tercihi: güç ve form; kulüpsüz oyuncu ancak eksik kalırsa. */
function ntScore(p){return p.r+(p.form-50)*0.1-(p.team<0?15:0);}
function ntPick(list){
  const sorted=list.slice().sort((a,b)=>ntScore(b)-ntScore(a)||a.id-b.id);
  const out=[];
  Object.keys(NT_SQ).forEach(k=>sorted.filter(p=>p.pos===k).slice(0,NT_SQ[k]).forEach(p=>out.push(p)));
  sorted.forEach(p=>{if(out.length<NT_SIZE&&out.indexOf(p)<0)out.push(p);});
  return out;
}
/* Pencere başında bütün ülkeler kadro çağırıyor. Önceki pencerede kadroda olmayan
   müşteri için haber; hiç milli maçı yoksa "ilk kez". */
function ntCallUp(){
  const by={};
  S.players.forEach(p=>{(by[p.nat]=by[p.nat]||[]).push(p);});
  const was=new Set(Object.values((S.nt&&S.nt.sq)||{}).flat());
  const sq={};
  NATKEYS.forEach(n=>{if((by[n]||[]).length>=11)sq[n]=ntPick(by[n]).map(p=>p.id);});
  S.nt={se:S.season,w:S.week,sq,m:[]};
  S.clients.forEach(id=>{
    const p=byId(id);if(!p)return;
    const s=sq[p.nat];
    if(!s||s.indexOf(id)<0||was.has(id))return;
    pushNews((p.caps||0)?'ntCall':'ntCall1',{n:p.n,pid:p.id,nat:p.nat},'good');
  });
}
/* Maç için iki taraf: kadro (o an hâlâ o ülkenin oyuncusu olanlar) ve güç.
   Güç teamStr() ile aynı kural: en iyi 11'in gücü + form. */
function ntSide(nat,ix){
  const sq=((S.nt&&S.nt.sq[nat])||[]).map(id=>ix.get(id)).filter(p=>p&&p.nat===nat);
  const top=sq.slice().sort((a,b)=>b.r-a.r).slice(0,11);
  const str=top.length?top.reduce((s,p)=>s+p.r+(p.form-50)*0.08,0)/top.length:40;
  return {sq,str};
}
function ntIndex(){return new Map(S.players.map(p=>[p.id,p]));}
/* Bir maç: skor ortak gol modelinden (goalPair, cups.js), oyuncu tarafı ortak motordan. */
function ntPlay(m,cp,ix,neutral){
  const ns={[m.h]:ntSide(m.h,ix),[m.a]:ntSide(m.a,ix)};
  const [g1,g2]=goalPair(ns[m.h].str,ns[m.a].str,neutral);
  m.hg=g1;m.ag=g2;
  return {gm:playFixture(m,cp,ns),ns};
}

/* ===== HAZIRLIK MAÇLARI =====
   Her milli maç gününde kadrosu olan bütün ülkeler eşleşiyor; tek kalan dinlenir.
   Eleme ve turnuvalar gelene kadar milli maç aralarını bunlar dolduruyor. */
function ntFriendlies(){
  if(!S.nt||S.nt.se!==S.season)ntCallUp();
  const ix=ntIndex();
  const L=cupShuffle(Object.keys(S.nt.sq));
  for(let i=0;i+1<L.length;i+=2){
    const m={h:L[i],a:L[i+1],hg:null,ag:null};
    ntPlay(m,'n:f',ix,false);
    S.nt.m.push({w:S.week,h:m.h,a:m.a,hg:m.hg,ag:m.ag});
  }
}

/* ===== MİLLETLER KUPASI =====
   Yaz haftalarında, tek maçlık eleme, tarafsız saha, eşitlikte penaltılar. Kadro
   yazın başında yeniden çağrılıyor; en güçlü 16 ülke katılıyor (eleme sonraki
   aşamada). Kayıt: S.wc {v:2, se, r:[[tie]], w, sc}; eski kayıtlardaki S.wc
   (rounds/champ) geçmiş bir turnuvanın sonucu olarak olduğu gibi çiziliyor. */
function ncStart(){
  ntCallUp();
  const ix=ntIndex();
  const str={};Object.keys(S.nt.sq).forEach(n=>{str[n]=ntSide(n,ix).str;});
  const seeds=Object.keys(str).filter(n=>!NT_BAN.includes(n))
    .sort((a,b)=>str[b]-str[a]||(a<b?-1:1)).slice(0,NC_N);
  const ord=NC_ORDER.map(k=>seeds[k-1]).filter(Boolean);
  const r0=[];
  for(let i=0;i+1<ord.length;i+=2)r0.push(cupTie(ord[i],ord[i+1],true));
  S.wc={v:2,se:S.season,r:[r0],w:null,sc:{}};
}
/* Penaltılar: cupTieEnd'in kuralı, güç milli kadrodan. */
function ncTieEnd(ti,sh,su){
  const m=ti.m[0],gs=m.h===ti.s?m.hg:m.ag,gu=m.h===ti.s?m.ag:m.hg;
  if(gs!==gu){ti.w=gs>gu?ti.s:ti.u;return;}
  ti.pen=1;
  ti.w=RF()<clamp(0.5+(sh-su)*0.01,0.35,0.65)?ti.s:ti.u;
}
function ncRound(){
  const W=S.wc;if(!W||W.v!==2||W.w)return;
  const ties=W.r[W.r.length-1];
  const ix=ntIndex();
  ties.forEach(ti=>{
    if(ti.w)return;
    const {gm,ns}=ntPlay(ti.m[0],'n:wc',ix,true);
    for(const id in gm)W.sc[id]=(W.sc[id]||0)+gm[id];
    ncTieEnd(ti,ns[ti.s].str,ns[ti.u].str);
  });
  if(ties.length>1){
    const nx=[];
    for(let i=0;i+1<ties.length;i+=2)nx.push(cupTie(ties[i].w,ties[i+1].w,true));
    W.r.push(nx);
    return;
  }
  const c=ties[0].w;W.w=c;
  (S.wcHist=S.wcHist||[]).push({se:S.season,nat:c});
  if(S.wcHist.length>20)S.wcHist.shift();
  pushNews('wcWin',{n:NATS[c].c},'good');
  /* Kupayı kaldıran kadroda müşterin varsa: büyük bir turnuva, büyük bir itibar. */
  const sq=new Set((S.nt.sq[c]||[]));
  if(S.clients.some(id=>sq.has(id)))repEvent(1.5);
}

/* simWeek()'ten, ligler ve kupalardan sonra. */
function simNat(){
  const w=S.week,T=totalWeeks();
  if(w<=T){
    if(NT_CALL.includes(w))ntCallUp();
    if(NT_WK.includes(w))ntFriendlies();
    return;
  }
  if(!ncSeason()||w>seasonLen())return;
  if(w===T+1)ncStart();
  ncRound();
}

/* ===== OKUYUCULAR (arayüz) ===== */
/* Milli maç satırlarında rakip bir ülke: rozet ve ad çizilebilsin diye takım
   biçiminde bir nesne. Kayda girmiyor; ad dile göre değiştiği için önbellek dile
   göre. Renk ülke kodundan türüyor — gerçek bir bayrak değil, ayırt etmek için. */
const NT_COL=['#c8102e','#0033a0','#007a3d','#f1bf00','#111111','#ff7900','#6cace4','#7a1f3d','#00843d','#5b2c86'];
let NTPS={},NTPSL='';
function ntPseudo(nat){
  if(NTPSL!==L){NTPS={};NTPSL=L;}
  if(NTPS[nat])return NTPS[nat];
  let h=0;for(const ch of String(nat))h=(h*31+ch.charCodeAt(0))>>>0;
  const nm=NATNAME[nat]?tx(NATNAME[nat]):String(nat);
  return (NTPS[nat]={id:-1,n:nm,ab:NATS[nat]?NATS[nat].c:'—',c1:NT_COL[h%NT_COL.length],c2:NT_COL[(h>>3)%NT_COL.length],lg:-1,str:50});
}
/* Bir maç kaydının rakibi: milli maçta ülke, kulüp maçında takım. */
function oppOf(o,nt){return nt?ntPseudo(o):S.teams[o];}
function ntInSquad(pid){
  const p=byId(pid);
  return !!(p&&S.nt&&S.nt.se===S.season&&(S.nt.sq[p.nat]||[]).indexOf(pid)>=0);
}
