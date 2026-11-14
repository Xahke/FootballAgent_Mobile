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
   Kasım'ından (14) ve Mart'ından (18, 22, 24) turnuva sezonunun Kasım'ına (18) kadar
   on gün — gerçekte de elemeler iki takvim yılına yayılıyor. Play-off'lar turnuva
   sezonunun Mart'ında: 22 (Avrupa play-off'u, kıtalar arası yarı final), 24
   (kıtalar arası final).
   On, çünkü beş takımlı grubun çift devresi on tur (her takım iki tur bay geçiyor):
   dokuz güne sıkıştırılınca ilk iki tur aynı haftaya düşüyor ve üç ülke o hafta iki
   eleme maçı oynuyordu (Codex incelemesi, 2026/11). Çekilmiş bir eleme takvimini
   kendi kaydında taşıyor (Q.qmd); taşımayan, dokuz günle çekilmiş eski bir eleme
   NC_QMD9 ile bitiyor. */
const NC_QMD=[[-1,14],[-1,18],[-1,22],[-1,24],[0,3],[0,5],[0,7],[0,11],[0,14],[0,18]];
const NC_QMD9=[[-1,18],[-1,22],[-1,24],[0,3],[0,5],[0,7],[0,11],[0,14],[0,18]];
function ncqMd(Q){return Q.qmd||NC_QMD9;}
const NC_POW=22,NC_ICF=24;

/* ===== KITA TURNUVALARI =====
   Gerçek takvim: Milletler Kupası'ndan bir yıl sonra Asya ve Kuzey-Orta Amerika
   (2027 gibi), iki yıl sonra Avrupa, Güney Amerika ve Afrika (2028 gibi). Biçimler:
   Avrupa gerçek 24 takım (6 grup, ilk iki + en iyi 4 üçüncü), elemeli; Güney
   Amerika 2024'teki gibi 16 (10 + Kuzey Amerika'nın en güçlü 6 davetlisi); Afrika
   oyundaki 16 ülke; Asya 12, Kuzey Amerika 8 — bu üçünde oyundaki ülke sayısı gerçek
   kontenjanın altında, eleme yok, en güçlüler katılıyor.
   g: grup sayısı (dörder), top: gruptan doğrudan çıkan, th: en iyi üçüncülerden
   çıkan, t3: üçüncülük maçı. Milletler Kupası da aynı motoru kullanıyor (wc). */
const CT_FMT={
  wc:{g:12,top:2,th:8,t3:true},
  eu:{g:6,top:2,th:4,t3:false},
  sam:{g:4,top:2,th:0,t3:true},
  af:{g:4,top:2,th:0,t3:true},
  as:{g:3,top:2,th:2,t3:false},
  nam:{g:2,top:2,th:0,t3:false}};
/* S.season % NC_EVERY → o yazın turnuvaları. 3: yaz yok (Uluslar Ligi sonra). */
const CT_SCHED={0:['wc'],1:['as','nam'],2:['eu','sam','af']};
const CT_IDS=['eu','sam','af','as','nam'];
/* Avrupa ev sahipleri: 2028 Birleşik Krallık ve İrlanda (oyunda İngiltere,
   İskoçya, İrlanda), 2032 İtalya ve Türkiye; sonra döngü. Doğrudan katılıyorlar. */
const EU_HOSTS=[['en','sct','ie'],['it','tr']];
const EU_N=24,EU_UPO=3;

function ncSeason(){return !!S&&S.season%NC_EVERY===0;}
/* Elemesi ya da kendisi bu sezon oynanan Milletler Kupası'nın sezonu; yoksa 0. */
function ncEd(){
  if(!S)return 0;
  const r=S.season%NC_EVERY;
  return r===0?S.season:r===NC_EVERY-1?S.season+1:0;
}
/* Avrupa turnuvasının: Milletler Kupası'ndan iki sezon sonra, elemeler bir önceki sezon. */
function ecEd(){
  if(!S)return 0;
  const r=S.season%NC_EVERY;
  return r===2?S.season:r===1?S.season+1:0;
}
function ncHosts(ed){return NC_HOSTS[(Math.max(1,ed/NC_EVERY)-1)%NC_HOSTS.length].slice();}
function ecHosts(ed){return EU_HOSTS[Math.max(0,Math.floor((ed-2)/NC_EVERY))%EU_HOSTS.length].slice();}
/* Konfederasyon: seçim ekranının kıtası; tek fark Avustralya (Asya federasyonunda). */
function ncFed(n){return n==='au'?'as':NATCON[n];}
function ctKeys(n){return n>=32?['r32','r16','qf','sf','f']:n>=16?['r16','qf','sf','f']:n>=8?['qf','sf','f']:['sf','f'];}
function ctSize(id){const f=CT_FMT[id];return f.g*f.top+f.th;}
function ctWeeks(id){return 3+ctKeys(ctSize(id)).length;}
/* Turnuvanın adı: kıta + kalıp — gerçek turnuva markalarına yaklaşmıyor. */
function ctName(id){
  if(id==='wc')return t('wcLbl');
  const x=NCONTS.find(k=>k[0]===id);
  return fmtStr(t('ctFmt'),{c:x?tx(x[1]):id});
}
function summerWeeks(){
  if(!S)return 0;
  /* Önceki sürümün 16 takımlı yaz turnuvasının sezonu: dört hafta — final oynandıktan
     sonra da. "Bitmediyse" diye sorulunca final haftası 8'e çıkıyor ve sezon boş dört
     hafta uzuyordu (Codex incelemesi, 2026/11). */
  if(ncSeason()&&S.wc&&S.wc.v===2&&S.wc.se===S.season)return 4;
  return Math.max(0,...(CT_SCHED[S.season%NC_EVERY]||[]).map(ctWeeks));
}
function seasonLen(){return totalWeeks()+summerWeeks();}
/* Ekranda gösterilen hafta: yaz haftalarında da gerçek hafta numarası. */
function shownWeek(){return Math.min(S.week,seasonLen());}
function ncStrMap(ix){const m={};Object.keys(S.nt.sq).forEach(n=>{m[n]=ntSide(n,ix).str;});return m;}
/* Haber yalnız menajerin kendi ülkesi ve müşterilerinin ülkeleri için, ülke başına bir kez. */
function ncNews(Q,n,ok){
  if(!Q||Q.nw[n])return;
  const pri=new Set(S.clients.map(id=>(byId(id)||{}).nat).concat(S.agent?[S.agent.nat]:[]));
  if(!pri.has(n))return;
  Q.nw[n]=1;
  if(Q.kind==='eu')pushNews(ok?'ctIn':'ctOut',{nat:n,ct:'eu'},ok?'good':'bad');
  else pushNews(ok?'ncIn':'ncOut',{nat:n,se:Q.ed},ok?'good':'bad');
}
/* Bir milli maç ve kaydı: S.nt.m son milli maç gününü ekranda gösteriyor. */
function ntLog(m,cp){(S.nt.m=S.nt.m||[]).push({w:S.week,h:m.h,a:m.a,hg:m.hg,ag:m.ag,cp});}

/* ===== ELEMELER =====
   İki eleme var: Milletler Kupası'nınki (S.ncq, bütün konfederasyonlar, kıtalar arası
   play-off'lu) ve Avrupa turnuvasınınki (S.ecq, yalnız Avrupa). Biçimleri aynı;
   konfederasyon kaydı kendi play-off sayısını (up) ve kıtalar arası yerini (icn)
   taşıyor. */
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
/* Bir konfederasyonun eleme kaydı: t adaylar (güç sırasıyla), D doğrudan + play-off yeri. */
function ncqConf(t,D,up,icn,single){
  const C={D,up:Math.min(up,D),icn,g:[],d:[],po:[],ic:[]};
  if(t.length<=D)C.d=t.slice();
  else C.g=ncqGroups(t,single);
  return C;
}
function ncqDraw(ed,ix){
  const hosts=ncHosts(ed),str=ncStrMap(ix);
  const Q={kind:'wc',ed,hosts,c:{},ic:null,q:hosts.filter(n=>S.nt.sq[n]),nw:{},qmd:NC_QMD.slice()};
  S.ncq=Q;
  Object.keys(NC_QUOTA).forEach(c=>{
    const t=Object.keys(S.nt.sq).filter(n=>ncFed(n)===c&&!NT_BAN.includes(n)&&!hosts.includes(n))
      .sort((a,b)=>str[b]-str[a]||(a<b?-1:1));
    const D=Math.max(0,NC_QUOTA[c]-hosts.filter(h=>ncFed(h)===c).length);
    const C=ncqConf(t,D,NC_UPO[c]||0,NC_IC[c]||0,c==='sam');
    Q.q.push(...C.d);
    Q.c[c]=C;
  });
  Q.q.forEach(n=>ncNews(Q,n,true));
}
/* Avrupa turnuvası elemesi: ev sahipleri doğrudan, kalan yerlerin üçü play-off'tan
   (gerçekte Uluslar Ligi yolları). */
function ecqDraw(ed,ix){
  const hosts=ecHosts(ed),str=ncStrMap(ix);
  const Q={kind:'eu',ed,hosts,c:{},ic:null,q:hosts.filter(n=>S.nt.sq[n]),nw:{},qmd:NC_QMD.slice()};
  S.ecq=Q;
  const t=Object.keys(S.nt.sq).filter(n=>ncFed(n)==='eu'&&!NT_BAN.includes(n)&&!hosts.includes(n))
    .sort((a,b)=>str[b]-str[a]||(a<b?-1:1));
  const C=ncqConf(t,Math.max(0,EU_N-Q.q.length),EU_UPO,0,false);
  Q.q.push(...C.d);
  Q.c.eu=C;
  Q.q.forEach(n=>ncNews(Q,n,true));
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
/* Grup aşaması bitti: doğrudan katılanlar, konfederasyon play-off'u, kıtalar arası
   adaylar. up/icn eski kayıtlarda (bu alanlar gelmeden çekilmiş elemeler) yok:
   o zaman Milletler Kupası değerleri. */
function ncqRank(Q){
  Object.keys(Q.c).forEach(c=>{
    const C=Q.c[c];if(!C.g.length)return;
    const L=ncLevels(C.g.map(G=>ncTable(G.t,G.fx)));
    const up=C.up!==undefined?C.up:Math.min(NC_UPO[c]||0,C.D);
    const icn=C.icn!==undefined?C.icn:(NC_IC[c]||0);
    C.d=L.slice(0,C.D-up);
    const rest=L.slice(C.D-up);
    if(up){
      const P=rest.slice(0,2*up);
      for(let i=0;i<up&&P[2*up-1-i];i++)C.po.push(cupTie(P[i],P[2*up-1-i],true));
    } else C.ic=rest.slice(0,icn);
    Q.q.push(...C.d);
    C.d.forEach(n=>ncNews(Q,n,true));
    const alive=new Set(C.d.concat(C.ic,C.po.flatMap(t=>[t.s,t.u])));
    /* Kıtalar arası play-off'a yeri olan konfederasyonda "elendi" haberi bekliyor:
       Okyanusya'nın boş yeri gibi boşluklar elenenlerden dolduruluyor (ncIcStart),
       erken haber hem yanlış oluyor hem de Q.nw yüzünden sonraki "katıldı"yı
       susturuyordu (Codex incelemesi, 2026/11). */
    if(icn)C.wait=1;
    else L.forEach(n=>{if(!alive.has(n))ncNews(Q,n,false);});
  });
}
/* Tek maçlık eleme maçı: s önde; neutral değilse s ev sahibi. */
function ncTie(ti,cp,ix,neutral){
  const {gm,ns}=ntPlay(ti.m[0],cp,ix,neutral);
  ntLog(ti.m[0],cp);
  ncTieEnd(ti,ns[ti.s].str,ns[ti.u].str);
  return gm;
}
/* Kıtalar arası play-off: konfederasyonların adayları; Okyanusya'nın yeri gibi boş
   kalan yerler katılan konfederasyonların en güçlü elenenlerine. En güçlü iki takım
   doğrudan finalde (gerçek kural), diğer dördü yarı finalde; tarafsız saha. */
function ncIcStart(Q,ix){
  const str=ncStrMap(ix);
  const t=[].concat(...Object.values(Q.c).map(C=>C.ic));
  const out=new Set(Q.q.concat(t,[].concat(...Object.values(Q.c).map(C=>C.po.flatMap(x=>[x.s,x.u])))));
  Object.keys(S.nt.sq).filter(n=>NC_IC[ncFed(n)]&&!NT_BAN.includes(n)&&!out.has(n)&&ncFed(n)!=='oc')
    .sort((a,b)=>str[b]-str[a]||(a<b?-1:1)).forEach(n=>{if(t.length<6)t.push(n);});
  t.sort((a,b)=>str[b]-str[a]||(a<b?-1:1));
  Q.ic={t,sf:[],f:[]};
  if(t.length>=6)Q.ic.sf=[cupTie(t[2],t[5],true),cupTie(t[3],t[4],true)];
}
/* Bir milli maç gününde bir elemenin işi. cp 'n:q' (Milletler Kupası) ya da 'n:eq'. */
function ncqWeek(Q,busy,ix){
  const ed=Q.ed,cp=Q.kind==='eu'?'n:eq':'n:q';
  const QMD=ncqMd(Q);
  const md=QMD.findIndex(([d,wk])=>S.season===ed+d&&S.week===wk);
  if(md>=0){
    Object.values(Q.c).forEach(C=>C.g.forEach(G=>G.fx.forEach(m=>{
      if(m.md!==md||m.hg!==null)return;
      ntPlay(m,cp,ix,false);ntLog(m,cp);busy.add(m.h);busy.add(m.a);
    })));
    if(md===QMD.length-1)ncqRank(Q);
  }
  if(S.season!==ed)return;
  if(S.week===NC_POW){
    Object.values(Q.c).forEach(C=>C.po.forEach(ti=>{
      if(ti.w)return;
      ncTie(ti,cp,ix,false);busy.add(ti.s);busy.add(ti.u);
      Q.q.push(ti.w);ncNews(Q,ti.w,true);ncNews(Q,cupLoser(ti),false);
    }));
    if(Q.kind!=='eu'){
      ncIcStart(Q,ix);
      const inIc=new Set(Q.ic.t);
      Object.values(Q.c).forEach(C=>{
        if(!C.wait)return;
        C.g.forEach(G=>G.t.forEach(n=>{if(!Q.q.includes(n)&&!inIc.has(n))ncNews(Q,n,false);}));
        delete C.wait;
      });
      Q.ic.sf.forEach(ti=>{ncTie(ti,cp,ix,true);busy.add(ti.s);busy.add(ti.u);ncNews(Q,cupLoser(ti),false);});
    }
  }
  if(S.week===NC_ICF&&Q.ic&&Q.ic.sf.length===2&&!Q.ic.f.length){
    const t=Q.ic.t;
    Q.ic.f=[cupTie(t[0],Q.ic.sf[1].w,true),cupTie(t[1],Q.ic.sf[0].w,true)];
    Q.ic.f.forEach(ti=>{
      ncTie(ti,cp,ix,true);busy.add(ti.s);busy.add(ti.u);
      Q.q.push(ti.w);ncNews(Q,ti.w,true);ncNews(Q,cupLoser(ti),false);
    });
  }
}
/* Elemenin işi bu hafta: çekiliş ilk eleme gününde; kaçırılmışsa (eski kayıt ya da
   çekiliş haftasından sonra açılmış) turnuva yazın kontenjan ve güçle doluyor. */
function ncqTick(key,ed,draw,busy,ix){
  if(!ed)return;
  const [d0,w0]=NC_QMD[0];
  if(S.season===ed+d0&&S.week===w0&&(!S[key]||S[key].ed!==ed))draw(ed,ix);
  const Q=S[key];
  if(Q&&Q.ed===ed)ncqWeek(Q,busy,ix);
}

/* ===== TURNUVA MOTORU: GRUPLAR VE ELEME AĞACI =====
   Milletler Kupası ve kıta turnuvaları aynı motordan: dörder takımlı gruplar, üç maç
   günü, sonra gruptan çıkanlarla seri başlı eleme ağacı. Milletler Kupası'nda kura
   konfederasyon kuralıyla (bir grupta bir konfederasyondan en fazla bir, Avrupa'dan
   iki); kıta turnuvalarında herkes aynı konfederasyondan, kural yok. */
function ncGroupDraw(pots,g,rule){
  const can=(G,n)=>{if(!rule)return true;const c=ncFed(n);return G.filter(x=>ncFed(x)===c).length<(c==='eu'?2:1);};
  for(let tr=0;tr<300;tr++){
    const G=Array.from({length:g},()=>[]);
    let ok=true;
    for(const pot of pots){
      const P=cupShuffle(pot.slice());
      const lvl=Math.min(...G.map(x=>x.length));
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
  const G=Array.from({length:g},()=>[]);
  pots.forEach(pot=>pot.forEach((n,i)=>G[i%g].push(n)));
  return G;
}
/* Ev sahibi kendi sahasında oynuyor (hafif avantaj, goalPair 'h'); diğer maçlar
   tarafsız. İki ev sahibi karşılaşırsa tarafsız. */
function ncHostSide(m,hosts){
  if(hosts.includes(m.a)&&!hosts.includes(m.h)){const x=m.h;m.h=m.a;m.a=x;}
  return hosts.includes(m.h)&&!hosts.includes(m.a)?'h':true;
}
/* Turnuva kaydı: katılanlar ev sahipleri önde, sonra güç; dört torba; grup fikstürü. */
function ctMake(id,q,hosts,str){
  const f=CT_FMT[id];
  const ord=hosts.filter(n=>q.includes(n)).concat(q.filter(n=>!hosts.includes(n)).sort((a,b)=>str[b]-str[a]||(a<b?-1:1)));
  const pots=[0,1,2,3].map(k=>ord.slice(k*f.g,k*f.g+f.g));
  const G=ncGroupDraw(pots,f.g,id==='wc').map(t=>{
    const fx=[[0,1],[2,3],[0,2],[1,3],[0,3],[1,2]].filter(([x,y])=>t[x]&&t[y])
      .map(([x,y],i)=>({md:Math.floor(i/2),h:t[x],a:t[y],hg:null,ag:null}));
    return {t,fx};
  });
  return {v:3,id,se:S.season,hosts,g:G,ko:{},w:null,sc:{}};
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
  S.wc=ctMake('wc',q.slice(0,NC_N),hosts,str);
}
/* Kıta turnuvasının katılımcıları. Avrupa elemeden (kaçırılmışsa ev sahipleri ve
   güç sırası); diğerleri o kıtanın en güçlüleri, Güney Amerika'ya Kuzey Amerika'nın
   en güçlü altısı davetli. */
function ctStart(id,str){
  const n=CT_FMT[id].g*4;
  const pool=c=>Object.keys(S.nt.sq).filter(x=>ncFed(x)===c&&!NT_BAN.includes(x)).sort((a,b)=>str[b]-str[a]||(a<b?-1:1));
  let q=[],hosts=[];
  if(id==='eu'){
    const Q=S.ecq&&S.ecq.ed===S.season?S.ecq:null;
    hosts=Q?Q.hosts:ecHosts(S.season);
    q=(Q?Q.q:[]).concat(hosts).filter((x,i,a)=>S.nt.sq[x]&&a.indexOf(x)===i);
    pool('eu').forEach(x=>{if(q.length<n&&q.indexOf(x)<0)q.push(x);});
  } else if(id==='sam'){
    q=pool('sam').concat(pool('nam').slice(0,6));
  } else q=pool(id);
  q=q.slice(0,n);
  (S.ct=S.ct||{})[id]=ctMake(id,q,hosts.filter(x=>q.includes(x)),str);
}
/* Grup sonrası: her gruptan top, sonra en iyi th üçüncü; aynı sıradakiler puan,
   averaj, golle. Eleme ağacı seri başı sırasıyla (1–n, …) — Milletler Kupası'nda
   gerçek turnuvanın üçüncüler tablosu yerine — ve aynı gruptan iki takım ilk turda
   karşılaşmasın diye komşu eşleşmeyle takas. */
function ncSeedOrder(n){let o=[1];while(o.length<n){const m=o.length*2;o=o.flatMap(x=>[x,m+1-x]);}return o;}
function ctFmtOf(W){return CT_FMT[W.id||'wc'];}
function ctBracket(W){
  const f=ctFmtOf(W),tabs=W.g.map(G=>ncTable(G.t,G.fx));
  const grp={};W.g.forEach((G,i)=>G.t.forEach(n=>{grp[n]=i;}));
  const lvl=pos=>tabs.map(x=>x[pos]).filter(Boolean).sort((a,b)=>b.pts-a.pts||(b.gf-b.ga)-(a.gf-a.ga)||b.gf-a.gf||(a.n<b.n?-1:1)).map(r=>r.n);
  let seeds=[];for(let p=0;p<f.top;p++)seeds=seeds.concat(lvl(p));
  seeds=seeds.concat(lvl(f.top).slice(0,f.th));
  const N=seeds.length,o=ncSeedOrder(N).map(k=>seeds[k-1]);
  for(let pass=0;pass<4;pass++)for(let i=0;i<N;i+=2){
    if(grp[o[i]]!==grp[o[i+1]])continue;
    for(let j=(i+2)%N;j!==i;j=(j+2)%N){
      if(grp[o[j+1]]!==grp[o[i]]&&grp[o[i+1]]!==grp[o[j]]){const x=o[i+1];o[i+1]=o[j+1];o[j+1]=x;break;}
    }
  }
  const k0=ctKeys(N)[0];
  W.ko[k0]=[];for(let i=0;i+1<N;i+=2)W.ko[k0].push(cupTie(o[i],o[i+1],true));
  if((W.id||'wc')==='wc'){
    const Q=S.ncq&&S.ncq.ed===W.se?S.ncq:null;
    const inKo=new Set(seeds);
    W.g.forEach(G=>G.t.forEach(n=>{if(!inKo.has(n))ncNews(Q,n,false);}));
  }
}
function ctCp(W){return (W.id||'wc')==='wc'?'n:wc':'n:c:'+W.id;}
function ctKo(W,key,ix){
  const ties=W.ko[key];if(!ties)return;
  ties.forEach(ti=>{
    if(ti.w)return;
    const neutral=ncHostSide(ti.m[0],W.hosts||[]);
    const gm=ncTie(ti,ctCp(W),ix,neutral);
    for(const id in gm)W.sc[id]=(W.sc[id]||0)+gm[id];
  });
}
/* Yazın ri. haftası (0'dan): 0–2 grup maç günleri, sonra eleme turları. */
function ctRound(W,ri,ix){
  const f=ctFmtOf(W);
  if(ri<3){
    W.g.forEach(G=>G.fx.forEach(m=>{
      if(m.md!==ri||m.hg!==null)return;
      const neutral=ncHostSide(m,W.hosts||[]);
      const {gm}=ntPlay(m,ctCp(W),ix,neutral);ntLog(m,ctCp(W));
      for(const id in gm)W.sc[id]=(W.sc[id]||0)+gm[id];
    }));
    if(ri===2)ctBracket(W);
    return;
  }
  const ks=ctKeys(ctSize(W.id||'wc')),key=ks[ri-3];
  if(!key||!W.ko[key])return;
  ctKo(W,key,ix);
  if(key==='f'){
    if(W.ko.t3)ctKo(W,'t3',ix);
    ctChampion(W,W.ko.f[0].w);
    return;
  }
  const ties=W.ko[key],nx=[];
  for(let i=0;i+1<ties.length;i+=2)nx.push(cupTie(ties[i].w,ties[i+1].w,true));
  W.ko[ks[ri-2]]=nx;
  if(key==='sf'&&f.t3)W.ko.t3=[cupTie(cupLoser(ties[0]),cupLoser(ties[1]),true)];
}
function ctChampion(W,c){
  W.w=c;
  const id=W.id||'wc';
  if(id==='wc'){
    (S.wcHist=S.wcHist||[]).push({se:S.season,nat:c});
    if(S.wcHist.length>20)S.wcHist.shift();
    pushNews('wcWin',{n:NATS[c].c},'good');
  } else {
    S.ctHist=S.ctHist||{};
    const h=S.ctHist[id]=S.ctHist[id]||[];
    h.push({se:S.season,nat:c});if(h.length>20)h.shift();
    pushNews('ctWin',{ct:id,nat:c},'good');
  }
  /* Kupayı kaldıran kadroda müşterin varsa: büyük bir turnuva, büyük bir itibar —
     Milletler Kupası kıta turnuvasından büyük. */
  const sq=new Set((S.nt.sq[c]||[]));
  if(S.clients.some(x=>sq.has(x)))repEvent(id==='wc'?1.5:1.0);
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

/* simWeek()'ten, ligler ve kupalardan sonra. Milli maç gününde: kadro, iki elemenin
   işi (Milletler Kupası ve Avrupa turnuvası), maçı olmayanlara hazırlık maçı. Yaz
   haftalarında: o sezonun turnuvaları (CT_SCHED), her biri kendi tur sayısınca. */
function simNat(){
  const w=S.week,T=totalWeeks();
  if(w<=T){
    if(NT_CALL.includes(w))ntCallUp();
    if(!NT_WK.includes(w))return;
    if(!S.nt||S.nt.se!==S.season)ntCallUp();
    const busy=new Set(),ix=ntIndex();
    ncqTick('ncq',ncEd(),ncqDraw,busy,ix);
    ncqTick('ecq',ecEd(),ecqDraw,busy,ix);
    ntFriendlies(busy,ix);
    return;
  }
  if(w>seasonLen())return;
  if(ncSeason()&&S.wc&&S.wc.v===2&&S.wc.se===S.season&&!S.wc.w){ncV2Round();return;}
  const ri=w-T-1,ids=CT_SCHED[S.season%NC_EVERY]||[];
  if(ri===0){
    if(ids.includes('wc'))ncStart();
    const others=ids.filter(x=>x!=='wc');
    if(others.length){
      if(!ids.includes('wc'))ntCallUp();
      const str=ncStrMap(ntIndex());
      others.forEach(id=>ctStart(id,str));
    }
  }
  const ix=ntIndex();
  ids.forEach(id=>{
    const W=id==='wc'?S.wc:(S.ct||{})[id];
    if(W&&W.v===3&&W.se===S.season&&!W.w&&ri<ctWeeks(id))ctRound(W,ri,ix);
  });
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
