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
   (endSeason) turnuvadan sonra geliyor; turnuva o sezonun arşivine giriyor.
   Elemeler (S.ncq) bir önceki sezonun Mart'ında başlıyor; elemede maçı olmayan
   ülkeler o milli maç gününde hazırlık maçı oynuyor. */

const NT_WK=[3,5,7,11,14,18,22,24];
const NT_CALL=[3,7,14,22];
const NT_SQ={KL:3,DF:8,OS:8,FV:7};
const NT_SIZE=26;
/* Turnuvalara katılmıyor: Rusya FIFA/UEFA turnuvalarından men edilmiş durumda ve
   kulüp kupalarında da dışarıda (kullanıcı kararı). Hazırlık maçı oynayabiliyor —
   gerçekte de men turnuvalardan. */
const NT_BAN=['ru'];

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
   Milli maç gününde eleme ya da play-off maçı olmayan ülkeler eşleşiyor; tek kalan
   dinlenir. Rusya turnuvalara girmediği için yalnız bunları oynuyor. */
function ntFriendlies(busy,ix){
  const L=cupShuffle(Object.keys(S.nt.sq).filter(n=>!busy.has(n)));
  for(let i=0;i+1<L.length;i+=2){
    const m={h:L[i],a:L[i+1],hg:null,ag:null};
    ntPlay(m,'n:f',ix,false);ntLog(m,'n:f');
  }
}

/* ===== MİLLETLER KUPASI: KONTENJAN, EV SAHİPLERİ, TAKVİM =====
   FIFA'nın 48 takımlı dağılımı (2026'dan beri): Avrupa 16, Afrika 9, Asya 8,
   Güney Amerika 6, Kuzey-Orta Amerika 6, Okyanusya 1; altı takımlık kıtalar arası
   play-off'tan 2. Ev sahipleri doğrudan katılıyor ve kendi konfederasyonunun
   kontenjanından düşüyor. Avrupa'nın iki yeri kendi play-off'undan (gerçekte dört
   yolun finalleri), diğerlerinin play-off yerleri kıtalar arası play-off'a gidiyor. */
const NC_EVERY=4;
const NC_QUOTA={eu:16,sam:6,nam:6,af:9,as:8,oc:1};
const NC_IC={sam:1,nam:2,af:1,as:1,oc:1};
const NC_UPO={eu:2};
const NC_N=48;
/* Gerçek ev sahipleri sırasıyla: 2026, 2030 (altı ülke, hepsi doğrudan), 2034;
   sonra döngü. Turnuva sırası S.season/NC_EVERY. */
const NC_HOSTS=[['us','mx','ca'],['es','pt','ma','uy','ar','py'],['sa']];
/* Eleme maç günleri, turnuva sezonuna göre [sezon farkı, hafta]: bir önceki sezonun
   Mart'ından (18, 22, 24) turnuva sezonunun Kasım'ına (18) kadar dokuz gün — gerçekte
   de elemeler iki takvim yılına yayılıyor. Play-off'lar turnuva sezonunun Mart'ında:
   22 (Avrupa play-off'u, kıtalar arası yarı final), 24 (kıtalar arası final). */
const NC_QMD=[[-1,18],[-1,22],[-1,24],[0,3],[0,5],[0,7],[0,11],[0,14],[0,18]];
const NC_POW=22,NC_ICF=24;
/* Yaz haftaları: üç grup maç günü, son 32, son 16, çeyrek, yarı final, final
   (üçüncülük maçı finalle aynı hafta). */
const NC_SUMMER=8;

function ncSeason(){return !!S&&S.season%NC_EVERY===0;}
/* Elemesi ya da kendisi bu sezon oynanan turnuvanın sezonu; yoksa 0. */
function ncEd(){
  if(!S)return 0;
  const r=S.season%NC_EVERY;
  return r===0?S.season:r===NC_EVERY-1?S.season+1:0;
}
function ncHosts(ed){return NC_HOSTS[(Math.max(1,ed/NC_EVERY)-1)%NC_HOSTS.length].slice();}
/* Konfederasyon: seçim ekranının kıtası; tek fark Avustralya (Asya federasyonunda). */
function ncFed(n){return n==='au'?'as':NATCON[n];}
function summerWeeks(){
  if(!ncSeason())return 0;
  /* Önceki sürümün 16 takımlı yaz turnuvası yarıda kaldıysa onun dört haftası. */
  if(S.wc&&S.wc.v===2&&S.wc.se===S.season&&!S.wc.w)return 4;
  return NC_SUMMER;
}
function seasonLen(){return totalWeeks()+summerWeeks();}
/* Ekranda gösterilen hafta: yaz haftalarında da gerçek hafta numarası. */
function shownWeek(){return Math.min(S.week,seasonLen());}
function ncStrMap(ix){const m={};Object.keys(S.nt.sq).forEach(n=>{m[n]=ntSide(n,ix).str;});return m;}
/* Haber yalnız menajerin kendi ülkesi ve müşterilerinin ülkeleri için, ülke başına bir kez. */
function ncNews(n,ok){
  const Q=S.ncq;if(!Q||Q.nw[n])return;
  const pri=new Set(S.clients.map(id=>(byId(id)||{}).nat).concat(S.agent?[S.agent.nat]:[]));
  if(!pri.has(n))return;
  Q.nw[n]=1;
  pushNews(ok?'ncIn':'ncOut',{nat:n,se:Q.ed},ok?'good':'bad');
}
/* Bir milli maç ve kaydı: S.nt.m son milli maç gününü ekranda gösteriyor. */
function ntLog(m,cp){(S.nt.m=S.nt.m||[]).push({w:S.week,h:m.h,a:m.a,hg:m.hg,ag:m.ag,cp});}

/* ===== ELEMELER ===== */
/* Çember yöntemiyle lig fikstürü; dbl ise rövanşlar arkadan. */
function ncRR(t,dbl){
  const ids=t.slice();if(ids.length%2)ids.push(null);
  const n=ids.length,R=[];
  for(let r=0;r<n-1;r++){
    const ms=[];
    for(let i=0;i<n/2;i++){const h=ids[i],a=ids[n-1-i];if(h!==null&&a!==null)ms.push(r%2?[a,h]:[h,a]);}
    R.push(ms);ids.splice(1,0,ids.pop());
  }
  return dbl?R.concat(R.map(ms=>ms.map(([h,a])=>[a,h]))):R;
}
/* Gruplar: en fazla beş takım (çift devre sekiz maç dokuz güne sığsın), torbalar güç
   sırasıyla, torba içinde kura. Güney Amerika gerçekteki gibi tek lig, tek devre. */
function ncqGroups(t,single){
  const g=single?1:Math.max(1,Math.ceil(t.length/5));
  const G=Array.from({length:g},()=>({t:[],fx:[]}));
  for(let i=0;i<t.length;i+=g){
    const pot=cupShuffle(t.slice(i,i+g)),order=cupShuffle(G.map((_,k)=>k));
    pot.forEach((n,j)=>G[order[j]].t.push(n));
  }
  G.forEach(x=>{
    const R=ncRR(x.t,!single);
    R.forEach((ms,r)=>{
      const md=Math.floor(r*NC_QMD.length/R.length);
      ms.forEach(([h,a])=>x.fx.push({md,h,a,hg:null,ag:null}));
    });
  });
  return G;
}
function ncqDraw(ed,ix){
  const hosts=ncHosts(ed),str=ncStrMap(ix);
  const Q={ed,hosts,c:{},ic:null,q:hosts.filter(n=>S.nt.sq[n]),nw:{}};
  S.ncq=Q;
  Object.keys(NC_QUOTA).forEach(c=>{
    const t=Object.keys(S.nt.sq).filter(n=>ncFed(n)===c&&!NT_BAN.includes(n)&&!hosts.includes(n))
      .sort((a,b)=>str[b]-str[a]||(a<b?-1:1));
    const D=Math.max(0,NC_QUOTA[c]-hosts.filter(h=>ncFed(h)===c).length);
    const C={D,g:[],d:[],po:[],ic:[]};
    if(t.length<=D){C.d=t.slice();Q.q.push(...t);}
    else C.g=ncqGroups(t,c==='sam');
    Q.c[c]=C;
  });
  Q.q.forEach(n=>ncNews(n,true));
}
function ncTable(t,fx){
  const R={};t.forEach(n=>{R[n]={n,pl:0,w:0,d:0,l:0,gf:0,ga:0,pts:0};});
  fx.forEach(m=>{
    if(m.hg===null)return;
    const h=R[m.h],a=R[m.a];if(!h||!a)return;
    h.pl++;a.pl++;h.gf+=m.hg;h.ga+=m.ag;a.gf+=m.ag;a.ga+=m.hg;
    if(m.hg>m.ag){h.w++;a.l++;h.pts+=3;}else if(m.hg<m.ag){a.w++;h.l++;a.pts+=3;}else{h.d++;a.d++;h.pts++;a.pts++;}
  });
  return Object.values(R).sort((x,y)=>y.pts-x.pts||(y.gf-y.ga)-(x.gf-x.ga)||y.gf-x.gf||y.w-x.w||(x.n<y.n?-1:1));
}
/* Gruplar arası sıralama: önce grup sırası, aynı sıradakiler maç başına puan, averaj,
   gol — gruplar farklı büyüklükte olabildiği için maç başına. */
function ncLevels(tabs){
  const L=[],mx=Math.max(0,...tabs.map(x=>x.length)),pg=(r,k)=>r[k]/Math.max(1,r.pl);
  for(let pos=0;pos<mx;pos++){
    tabs.map(x=>x[pos]).filter(Boolean)
      .sort((a,b)=>pg(b,'pts')-pg(a,'pts')||(pg(b,'gf')-pg(b,'ga'))-(pg(a,'gf')-pg(a,'ga'))||pg(b,'gf')-pg(a,'gf')||(a.n<b.n?-1:1))
      .forEach(r=>L.push(r.n));
  }
  return L;
}
/* Grup aşaması bitti: doğrudan katılanlar, Avrupa play-off'u, kıtalar arası adaylar. */
function ncqRank(){
  const Q=S.ncq;
  Object.keys(Q.c).forEach(c=>{
    const C=Q.c[c];if(!C.g.length)return;
    const L=ncLevels(C.g.map(G=>ncTable(G.t,G.fx)));
    const up=Math.min(NC_UPO[c]||0,C.D);
    C.d=L.slice(0,C.D-up);
    const rest=L.slice(C.D-up);
    if(up){
      const P=rest.slice(0,2*up);
      for(let i=0;i<up&&P[2*up-1-i];i++)C.po.push(cupTie(P[i],P[2*up-1-i],true));
    } else C.ic=rest.slice(0,NC_IC[c]||0);
    Q.q.push(...C.d);
    C.d.forEach(n=>ncNews(n,true));
    const alive=new Set(C.d.concat(C.ic,C.po.flatMap(t=>[t.s,t.u])));
    L.forEach(n=>{if(!alive.has(n))ncNews(n,false);});
  });
}
/* Tek maçlık eleme maçı: s önde; ev sahibi değilse tarafsız saha. */
function ncTie(ti,cp,ix,neutral){
  const {gm,ns}=ntPlay(ti.m[0],cp,ix,neutral);
  ntLog(ti.m[0],cp);
  ncTieEnd(ti,ns[ti.s].str,ns[ti.u].str);
  return gm;
}
/* Kıtalar arası play-off: konfederasyonların adayları; Okyanusya'nın yeri gibi boş
   kalan yerler katılan konfederasyonların en güçlü elenenlerine. En güçlü iki takım
   doğrudan finalde (gerçek kural), diğer dördü yarı finalde; tarafsız saha. */
function ncIcStart(ix){
  const Q=S.ncq,str=ncStrMap(ix);
  const t=[].concat(...Object.values(Q.c).map(C=>C.ic));
  const out=new Set(Q.q.concat(t,[].concat(...Object.values(Q.c).map(C=>C.po.flatMap(x=>[x.s,x.u])))));
  Object.keys(S.nt.sq).filter(n=>NC_IC[ncFed(n)]&&!NT_BAN.includes(n)&&!out.has(n)&&ncFed(n)!=='oc')
    .sort((a,b)=>str[b]-str[a]||(a<b?-1:1)).forEach(n=>{if(t.length<6)t.push(n);});
  t.sort((a,b)=>str[b]-str[a]||(a<b?-1:1));
  Q.ic={t,sf:[],f:[]};
  if(t.length>=6)Q.ic.sf=[cupTie(t[2],t[5],true),cupTie(t[3],t[4],true)];
}
function ncqWeek(ed,busy,ix){
  const md=NC_QMD.findIndex(([d,wk])=>S.season===ed+d&&S.week===wk);
  if(md===0&&(!S.ncq||S.ncq.ed!==ed))ncqDraw(ed,ix);
  const Q=S.ncq;
  /* Elemeleri kaçırmış kayıt (eski sürüm, ya da çekiliş haftasından sonra açılmış):
     turnuva yazın kontenjan ve güçle doluyor (ncStart). */
  if(!Q||Q.ed!==ed)return;
  if(md>=0){
    Object.values(Q.c).forEach(C=>C.g.forEach(G=>G.fx.forEach(m=>{
      if(m.md!==md||m.hg!==null)return;
      ntPlay(m,'n:q',ix,false);ntLog(m,'n:q');busy.add(m.h);busy.add(m.a);
    })));
    if(md===NC_QMD.length-1)ncqRank();
  }
  if(S.season!==ed)return;
  if(S.week===NC_POW){
    Object.values(Q.c).forEach(C=>C.po.forEach(ti=>{
      if(ti.w)return;
      ncTie(ti,'n:q',ix,false);busy.add(ti.s);busy.add(ti.u);
      Q.q.push(ti.w);ncNews(ti.w,true);ncNews(cupLoser(ti),false);
    }));
    ncIcStart(ix);
    Q.ic.sf.forEach(ti=>{ncTie(ti,'n:q',ix,true);busy.add(ti.s);busy.add(ti.u);ncNews(cupLoser(ti),false);});
  }
  if(S.week===NC_ICF&&Q.ic&&Q.ic.sf.length===2&&!Q.ic.f.length){
    const t=Q.ic.t;
    Q.ic.f=[cupTie(t[0],Q.ic.sf[1].w,true),cupTie(t[1],Q.ic.sf[0].w,true)];
    Q.ic.f.forEach(ti=>{
      ncTie(ti,'n:q',ix,true);busy.add(ti.s);busy.add(ti.u);
      Q.q.push(ti.w);ncNews(ti.w,true);ncNews(cupLoser(ti),false);
    });
  }
}

/* ===== TURNUVA: 12 GRUP, SON 32 ===== */
/* Bir grupta bir konfederasyondan en fazla bir takım, Avrupa'dan en fazla iki
   (gerçek kura kuralı). Torba torba, geri izlemeyle; tutmazsa yeniden. */
function ncGroupDraw(pots){
  const can=(G,n)=>{const c=ncFed(n);return G.filter(x=>ncFed(x)===c).length<(c==='eu'?2:1);};
  for(let tr=0;tr<300;tr++){
    const G=Array.from({length:12},()=>[]);
    let ok=true;
    for(const pot of pots){
      const P=cupShuffle(pot.slice());
      const lvl=Math.min(...G.map(g=>g.length));
      const rec=j=>{
        if(j===P.length)return true;
        for(const i of cupShuffle(G.map((_,k)=>k))){
          if(G[i].length!==lvl||!can(G[i],P[j]))continue;
          G[i].push(P[j]);if(rec(j+1))return true;G[i].pop();
        }
        return false;
      };
      if(!rec(0)){ok=false;break;}
    }
    if(ok)return G;
  }
  /* Kural tutmuyorsa (hiç görülmedi) torbalar sırayla — sezon durmasın. */
  const G=Array.from({length:12},()=>[]);
  pots.forEach(pot=>pot.forEach((n,i)=>G[i%12].push(n)));
  return G;
}
/* Ev sahibi kendi sahasında oynuyor (hafif avantaj, goalPair 'h'); diğer maçlar
   tarafsız. İki ev sahibi karşılaşırsa tarafsız. */
function ncHostSide(m,hosts){
  if(hosts.includes(m.a)&&!hosts.includes(m.h)){const x=m.h;m.h=m.a;m.a=x;}
  return hosts.includes(m.h)&&!hosts.includes(m.a)?'h':true;
}
function ncStart(){
  ntCallUp();
  const ix=ntIndex(),ed=S.season,str=ncStrMap(ix);
  const Q=S.ncq&&S.ncq.ed===ed?S.ncq:null;
  const hosts=Q?Q.hosts:ncHosts(ed);
  let q=(Q?Q.q:[]).concat(hosts).filter((n,i,a)=>S.nt.sq[n]&&a.indexOf(n)===i);
  /* Eksikse (elemeleri kaçırmış kayıt): kontenjanla, güç sırasıyla. */
  if(q.length<NC_N){
    const free=n=>!NT_BAN.includes(n)&&q.indexOf(n)<0;
    Object.keys(NC_QUOTA).forEach(c=>{
      const k=NC_QUOTA[c]-q.filter(n=>ncFed(n)===c).length;
      Object.keys(S.nt.sq).filter(n=>ncFed(n)===c&&free(n)).sort((a,b)=>str[b]-str[a]).slice(0,Math.max(0,k)).forEach(n=>q.push(n));
    });
    Object.keys(S.nt.sq).filter(free).sort((a,b)=>str[b]-str[a]).forEach(n=>{if(q.length<NC_N)q.push(n);});
  }
  q=q.slice(0,NC_N);
  const ord=hosts.filter(n=>q.includes(n)).concat(q.filter(n=>!hosts.includes(n)).sort((a,b)=>str[b]-str[a]||(a<b?-1:1)));
  const pots=[0,1,2,3].map(k=>ord.slice(k*12,k*12+12));
  const G=ncGroupDraw(pots).map(t=>{
    const fx=[[0,1],[2,3],[0,2],[1,3],[0,3],[1,2]].map(([x,y],i)=>({md:Math.floor(i/2),h:t[x],a:t[y],hg:null,ag:null}));
    return {t,fx};
  });
  S.wc={v:3,se:ed,hosts,g:G,ko:{},w:null,sc:{}};
}
/* Grup sonrası: 12 birinci, 12 ikinci ve en iyi 8 üçüncü; aynı sıradakiler puan,
   averaj, golle. Son 32 eşleşmesi seri başı sırasıyla (1–32, 16–17 …) — gerçek
   turnuvanın üçüncüler tablosu yerine — ve aynı gruptan iki takım ilk turda
   karşılaşmasın diye komşu eşleşmeyle takas. */
function ncSeedOrder(n){let o=[1];while(o.length<n){const m=o.length*2;o=o.flatMap(x=>[x,m+1-x]);}return o;}
function ncR32(){
  const W=S.wc,tabs=W.g.map(G=>ncTable(G.t,G.fx));
  const grp={};W.g.forEach((G,i)=>G.t.forEach(n=>{grp[n]=i;}));
  const lvl=pos=>tabs.map(x=>x[pos]).sort((a,b)=>b.pts-a.pts||(b.gf-b.ga)-(a.gf-a.ga)||b.gf-a.gf||(a.n<b.n?-1:1)).map(r=>r.n);
  const seeds=lvl(0).concat(lvl(1),lvl(2).slice(0,8));
  const o=ncSeedOrder(32).map(k=>seeds[k-1]);
  for(let pass=0;pass<4;pass++)for(let i=0;i<32;i+=2){
    if(grp[o[i]]!==grp[o[i+1]])continue;
    for(let j=(i+2)%32;j!==i;j=(j+2)%32){
      if(grp[o[j+1]]!==grp[o[i]]&&grp[o[i+1]]!==grp[o[j]]){const x=o[i+1];o[i+1]=o[j+1];o[j+1]=x;break;}
    }
  }
  W.ko.r32=[];for(let i=0;i<32;i+=2)W.ko.r32.push(cupTie(o[i],o[i+1],true));
  W.g.forEach((G,i)=>tabs[i].forEach((r,pos)=>{if(pos===3||(pos===2&&seeds.indexOf(r.n)<0))ncNews(r.n,false);}));
}
function ncKo(key,ix){
  const W=S.wc,ties=W.ko[key];if(!ties)return;
  ties.forEach(ti=>{
    if(ti.w)return;
    const neutral=ncHostSide(ti.m[0],W.hosts);
    const gm=ncTie(ti,'n:wc',ix,neutral);
    for(const id in gm)W.sc[id]=(W.sc[id]||0)+gm[id];
  });
}
const NC_KO=['r32','r16','qf','sf','f'];
function ncSummer(ri){
  const W=S.wc,ix=ntIndex();
  if(ri<3){
    W.g.forEach(G=>G.fx.forEach(m=>{
      if(m.md!==ri||m.hg!==null)return;
      const neutral=ncHostSide(m,W.hosts);
      const {gm}=ntPlay(m,'n:wc',ix,neutral);ntLog(m,'n:wc');
      for(const id in gm)W.sc[id]=(W.sc[id]||0)+gm[id];
    }));
    if(ri===2)ncR32();
    return;
  }
  const key=NC_KO[ri-3];if(!key)return;
  ncKo(key,ix);
  if(key==='f'){
    if(W.ko.t3)ncKo('t3',ix);
    ncChampion(W.ko.f[0].w);
    return;
  }
  const ties=W.ko[key],nx=[];
  for(let i=0;i+1<ties.length;i+=2)nx.push(cupTie(ties[i].w,ties[i+1].w,true));
  W.ko[NC_KO[ri-2]]=nx;
  if(key==='sf')W.ko.t3=[cupTie(cupLoser(ties[0]),cupLoser(ties[1]),true)];
}
function ncChampion(c){
  const W=S.wc;W.w=c;
  (S.wcHist=S.wcHist||[]).push({se:S.season,nat:c});
  if(S.wcHist.length>20)S.wcHist.shift();
  pushNews('wcWin',{n:NATS[c].c},'good');
  /* Kupayı kaldıran kadroda müşterin varsa: büyük bir turnuva, büyük bir itibar. */
  const sq=new Set((S.nt.sq[c]||[]));
  if(S.clients.some(id=>sq.has(id)))repEvent(1.5);
}

/* Penaltılar: cupTieEnd'in kuralı, güç milli kadrodan. */
function ncTieEnd(ti,sh,su){
  const m=ti.m[0],gs=m.h===ti.s?m.hg:m.ag,gu=m.h===ti.s?m.ag:m.hg;
  if(gs!==gu){ti.w=gs>gu?ti.s:ti.u;return;}
  ti.pen=1;
  ti.w=RF()<clamp(0.5+(sh-su)*0.01,0.35,0.65)?ti.s:ti.u;
}
/* Önceki sürümün 16 takımlı yaz turnuvası (v:2): yarıda kalmış bir kayıt onu bu
   kuralla bitiriyor. */
function ncV2Round(){
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
    if(!NT_WK.includes(w))return;
    if(!S.nt||S.nt.se!==S.season)ntCallUp();
    const busy=new Set(),ix=ntIndex(),ed=ncEd();
    if(ed)ncqWeek(ed,busy,ix);
    ntFriendlies(busy,ix);
    return;
  }
  if(!ncSeason()||w>seasonLen())return;
  if(S.wc&&S.wc.v===2&&S.wc.se===S.season&&!S.wc.w){ncV2Round();return;}
  const ri=w-T-1;
  if(ri===0)ncStart();
  if(S.wc&&S.wc.v===3&&S.wc.se===S.season&&!S.wc.w)ncSummer(ri);
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
