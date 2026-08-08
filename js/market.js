'use strict';
/* js/market.js — yapay zekâ transfer piyasası: kulüpler arası alım-satım, kulüp bütçeleri, sezon sonu kadro dengesi */
/* ================= KADRO SINIRLARI =================
   playMatchSide en az 1 kaleci + 10 oyuncu bulabilmeli; bu yüzden mevki tabanları sert kuraldır. */
const SQTARGET=16, SQMAX=19;
const FAMAX=60;    // piyasada duran kulüpsüz oyuncu tavanı
const POSMIN={KL:2,DF:4,OS:4,FV:3};
const POSMAX={KL:3,DF:7,OS:7,FV:6};
const STARTERS={KL:1,DF:4,OS:4,FV:2};
/* ================= KULÜP EKONOMİSİ ================= */
/* sezonluk transfer bütçesi (M€) — prestij ve gelir seviyesine bağlı */
function seasonBudget(tm){return +(marketValue(tm.str)*(0.60+tm.bud*1.00)).toFixed(2);}
function clubFin(tm){if(tm.fin===undefined)tm.fin=seasonBudget(tm);return tm.fin;}
/* ================= KADRO İNDEKSİ =================
   Her transfer haftasında bir kez kurulur; tüm oyuncu listesini tekrar tekrar taramamak için. */
function squadIndex(){
  const idx={};
  S.teams.forEach(tm=>{idx[tm.id]={KL:[],DF:[],OS:[],FV:[]};});
  S.players.forEach(p=>{const s=idx[p.team];if(s&&s[p.pos])s[p.pos].push(p);});
  S.teams.forEach(tm=>POS.forEach(k=>idx[tm.id][k].sort((a,b)=>b.r-a.r)));
  return idx;
}
function idxCount(idx,tid){return POS.reduce((s,k)=>s+idx[tid][k].length,0);}
/* kulübün bir mevkideki ilk 11 kalitesi */
function posQuality(lst,k){
  const top=lst.slice(0,STARTERS[k]);
  return top.length?top.reduce((s,p)=>s+p.r,0)/top.length:30;
}
/* müşterilerin ve süreci devam eden oyuncuların dokunulmazlığı var — onları oyuncu yönetir */
function sellable(p){
  return p.agent!=='you'&&!offerFor(p.id)&&!pendingFor(p.id)&&!pendCFor(p.id)&&!movedThisSeason(p);
}
/* ================= ÜCRET ================= */
function aiFee(p){
  if(isFree(p))return 0;                             // bonservissiz
  let f=valueOf(p)*(0.85+RF()*0.65);
  if(p.age<=23&&p.pot-p.r>=8)f*=1.25+(p.pot-p.r)/60; // potansiyel primi
  if(p.age>=31)f*=0.55;                              // yaş indirimi
  if(p.yrs<=1)f*=0.60;                               // sözleşmesi bitiyor
  return Math.max(0.05,+f.toFixed(1));
}
/* ================= TRANSFERİN GERÇEKLEŞMESİ ================= */
function aiTransfer(p,buyer,fee,idx){
  const from=teamOf(p),wasFree=isFree(p);
  if(idx){
    if(!wasFree){                       // kulüpsüz oyuncu hiçbir kadro indeksinde değil
      const l=idx[from.id][p.pos],i=l.indexOf(p);
      if(i>=0)l.splice(i,1);
    }
    const nl=idx[buyer.id][p.pos];
    nl.push(p);nl.sort((a,b)=>b.r-a.r);
  }
  /* müşterin bu kulüpte aynı mevkide oynuyorsa yeri tehlikeye giriyor */
  S.clients.forEach(cid=>{
    const c=byId(cid);
    if(c&&c.team===buyer.id&&c.pos===p.pos&&p.r>c.r+1){
      pushNews('rivalSigned',{c:buyer.n,tid:buyer.id,n:p.n,pid:p.id,r:p.r,cn:c.n,cid:c.id,pos:p.pos},'warn');
      c.morale=clamp(c.morale-8,0,100);
    }
  });
  (p.hist=p.hist||[]).push({se:S.season,a:from.n,b:buyer.n,f:fee});
  if(p.hist.length>6)p.hist.shift();
  p.team=buyer.id;
  p.wage=Math.max(1,Math.round(Math.max(p.wage*1.10,marketWage(p.r)*(0.85+buyer.bud*0.25))));
  p.yrs=R(2,4);
  p.morale=clamp(Math.max(p.morale+20,65),0,100);
  p.form=clamp(p.form+4,0,100);
  p.ignored=0;p.hm=(S.tw||0)+8;delete p.freeFor;
  buyer.fin=+(clubFin(buyer)-fee).toFixed(2);
  if(!wasFree)from.fin=+(clubFin(from)+fee*0.7).toFixed(2); // satış geliri yeniden yatırıma döner
  (S.tlog=S.tlog||[]).unshift({se:S.season,w:S.week,pid:p.id,n:p.n,r:p.r,pos:p.pos,age:p.age,a:from.id,b:buyer.id,f:fee});
  if(S.tlog.length>60)S.tlog.pop();
}
/* ================= HAFTALIK PİYASA =================
   Sadece transfer dönemi açıkken çalışır. Her kulüp en zayıf mevkisini güçlendirmeye bakar. */
function simTransfers(){
  if(!windowOpen())return;
  const idx=squadIndex();
  S.teams.forEach(buyer=>{
    if(clubFin(buyer)<0.08)return;
    if(RF()>=0.55+buyer.bud*0.40)return;      // her kulüp her hafta piyasada değil
    if(idxCount(idx,buyer.id)>=SQMAX)return;
    /* prestijine göre en geride kalan mevkiyi seç */
    let bk=null,worst=-99;
    POS.forEach(k=>{
      if(idx[buyer.id][k].length>=POSMAX[k])return;
      const d=buyer.str-posQuality(idx[buyer.id][k],k);
      if(d>worst){worst=d;bk=k;}
    });
    if(!bk)return;
    const mine=idx[buyer.id][bk];
    const sf=(mine[STARTERS[bk]-1]||{r:0}).r;   // en zayıf ilk 11 oyuncusu
    const qf=(mine[mine.length-1]||{r:0}).r;    // mevkideki en zayıf oyuncu
    /* ilk 11'i güçlendirmek asıl hedef; kadroda yer varsa rotasyon oyuncusu da alınır */
    const floor=mine.length<POSMAX[bk]-1?Math.min(sf,qf+2):sf;
    /* dünyayı baştan sona taramak yerine kulüp örnekle */
    const cands=[];
    for(let s=0;s<24;s++){
      const sel=S.teams[R(0,S.teams.length-1)];
      if(sel.id===buyer.id)continue;
      const lst=idx[sel.id][bk];
      if(lst.length<=POSMIN[bk])continue;      // kadrosu zaten dar, satmaz
      /* yedekler her zaman satılık; belirgin şekilde zayıf kulüpler ilk 11'ini de verir */
      const pool=sel.str<buyer.str-5?lst:lst.slice(STARTERS[bk]);
      pool.forEach(p=>{
        if(!sellable(p))return;
        if(p.r<=floor+1)return;                // kadroyu güçlendirmiyor
        if(p.r>buyer.str+5)return;             // bu seviyedeki kulübe gelmez
        const fee=aiFee(p);
        if(fee>clubFin(buyer))return;
        cands.push({p,sel,fee});
      });
    }
    /* bonservissiz oyuncular: kulüp seviyesine uyan her serbest oyuncu adaydır */
    freeAgents().forEach(p=>{
      if(p.pos!==bk||!sellable(p))return;
      if(p.r<=floor-4||p.r>buyer.str+5)return;
      cands.push({p,sel:null,fee:0,free:true});
    });
    if(!cands.length)return;
    /* fiyat/fayda oranına göre sırala, ilk beşten rastgele seç — piyasa deterministik olmasın */
    cands.sort((a,b)=>(b.p.r-floor)/Math.max(0.1,b.fee||0.05)-(a.p.r-floor)/Math.max(0.1,a.fee||0.05));
    const pick=cands[R(0,Math.min(4,cands.length-1))];
    if(pick.free){
      /* satacak kulüp yok; oyuncu ikna olacak mı — seviyesine yakın teklif kazanır */
      if(RF()<clamp(0.55-(buyer.str<pick.p.r-8?0.35:0),0.1,0.9))aiTransfer(pick.p,buyer,0,idx);
      return;
    }
    const v=valueOf(pick.p);
    let acc=clamp(0.55+(pick.fee/Math.max(0.05,v)-1)*0.9,0.05,0.90);
    if(buyer.str>pick.sel.str+6)acc+=0.20;     // büyük kulübe hayır demek zor
    if(pick.p.age>=31)acc+=0.15;
    if(RF()<clamp(acc,0.05,0.95))aiTransfer(pick.p,buyer,pick.fee,idx);
  });
}
/* ================= SEZON SONU KADRO DENGESİ =================
   Fazla kadrolu kulüpler fazlalığı bırakır, dar kadrolu kulüpler onları toplar.
   Açıkta kalan boşluklar altyapıdan gelen gençlerle dolar. Toplam oyuncu sayısı sabit kalır. */
function rebalanceSquads(){
  const idx=squadIndex();
  const freed=[];
  /* 1) fazlalıkları serbest bırak — en zayıftan başlayarak, mevki tabanına dokunmadan */
  S.teams.forEach(tm=>{
    let tot=idxCount(idx,tm.id),guard=0;
    while(tot>SQTARGET&&guard++<12){
      let bk=null,bp=null;
      POS.forEach(k=>{
        const l=idx[tm.id][k];
        if(l.length<=POSMIN[k])return;
        const c=l[l.length-1];
        if(!c||c.agent==='you')return;        // müşterini kimse kadro dışı bırakamaz
        if(!bp||c.r<bp.r){bp=c;bk=k;}
      });
      if(!bp)break;
      idx[tm.id][bk].pop();
      freed.push(bp);tot--;
    }
  });
  /* 2) açık kadrolar önce piyasadaki oyunculardan doldurulur: bu sezon bırakılanlar
        ve zaten kulüpsüz olanlar aynı havuzda yarışır. Kimse yoksa altyapı devreye girer. */
  const pool=freed.concat(freeAgents());
  /* Nitelikli oyuncu ilk gelen teklifi imzalamaz. Kararı sezonda bir kez veriyoruz —
     her kulüp denemesinde ayrı ayrı zar atarsak yüzlerce denemede kesin imzalar. */
  pool.forEach(p=>{
    delete p.hold;
    /* yalnızca bu sezon serbest kalanlar bekler; bir sezondur piyasada olan artık imzalar */
    if(p.r>=60&&!(p.freeFor>=1)&&RF()<0.75)p.hold=1;
  });
  const take=(tm,k)=>{
    let bi=-1,bd=1e9;
    pool.forEach((p,i)=>{
      if(p.pos!==k)return;
      if(p.hold)return;   // doğru teklifi bekliyor, sezon başında piyasada kalacak
      /* Seviyesinin üstündeki oyuncu kulüp için fırsattır — kadroda yer varsa reddedilmez.
         Altındaki oyuncu ise tam ceza alır. Aksi halde iyi oyuncular piyasada birikir. */
      const gap=p.r-tm.str;
      const d=(gap>=0?gap*0.15:-gap)+(p.age>=32?3:0);
      if(d<bd){bd=d;bi=i;}
    });
    if(bi<0)return null;
    const p=pool.splice(bi,1)[0];
    p.team=tm.id;p.yrs=R(1,3);p.morale=clamp(p.morale-5,0,100);delete p.freeFor;
    idx[tm.id][k].push(p);
    return p;
  };
  const needy=S.teams.slice().sort(()=>RF()-0.5);
  needy.forEach(tm=>{
    /* Mevki tabanı pazarlık konusu değil: piyasada o mevkiden kimse yoksa altyapıdan
       çıkarılır. Aksi halde kadro 16'ya ulaşmış bir kulüp tek kaleciyle kalabiliyor —
       toplam sayı tuttuğu için ikinci döngü hiç çalışmıyor ve açık kapanmıyordu. */
    POS.forEach(k=>{
      while(idx[tm.id][k].length<POSMIN[k]){
        if(take(tm,k))continue;
        const np=genPlayer(tm,k,R(16,19));
        S.players.push(np);idx[tm.id][k].push(np);
      }
    });
    let tot=idxCount(idx,tm.id),guard=0;
    while(tot<SQTARGET&&guard++<12){
      const k=POS.filter(x=>idx[tm.id][x].length<POSMAX[x])
                 .sort((a,b)=>idx[tm.id][a].length-POSMIN[a]-(idx[tm.id][b].length-POSMIN[b]))[0];
      if(!k)break;
      /* Kadronun bir kısmı altyapıdan gelsin, yoksa genç akışı durur. Ama piyasa
         doluyken kulüpler önce oradan beslenir — yoksa serbest oyuncular birikir. */
      const youthShare=pool.length>70?0.10:0.35;
      if(RF()<youthShare||!take(tm,k)){
        const np=genPlayer(tm,k,R(16,19));
        S.players.push(np);idx[tm.id][k].push(np);
      }
      tot++;
    }
  });
  /* 3) kulüp bulamayanlar piyasada kalır; havuz şişerse en zayıflar futbolu bırakır.
        Bekleme kararı burada biter — sezon boyunca kulüpler onlara teklif götürebilir. */
  pool.forEach(p=>{delete p.hold;if(p.team>=0)return;p.team=-1;p.yrs=0;p.freeFor=p.freeFor||0;});
  freed.forEach(p=>{if(p.team>=0)return;releaseToFree(p);});
  const fa=freeAgents().filter(p=>p.agent!=='you');
  if(fa.length>FAMAX){
    fa.sort((a,b)=>(a.r-a.age*0.6)-(b.r-b.age*0.6));   // en zayıf ve en yaşlı önce
    const drop=new Set(fa.slice(0,fa.length-FAMAX).map(p=>p.id));
    S.players=S.players.filter(p=>!drop.has(p.id));
  }
  /* 4) prestij gerçek kadro gücüne doğru kayar ama kulüp kimliğinden fazla uzaklaşmaz */
  S.teams.forEach(tm=>{
    if(tm.str0===undefined)tm.str0=tm.str;
    const real=teamStr(tm.id);
    tm.str=Math.round(clamp(tm.str*0.7+real*0.3,tm.str0-8,tm.str0+8));
    tm.fin=seasonBudget(tm);
  });
}
