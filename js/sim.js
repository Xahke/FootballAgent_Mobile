'use strict';
/* js/sim.js — haftalık maç simülasyonu, sezon sonu, gelişim, küme düşme/yükselme, milli turnuva */
/* ================= SIM ================= */
function teamStr(tid){
  const ps=S.players.filter(p=>p.team===tid).sort((a,b)=>b.r-a.r).slice(0,11);
  return ps.reduce((s,p)=>s+p.r+(p.form-50)*0.08,0)/ps.length;
}
function poisson(lam){let l=Math.exp(-lam),k=0,p=1;do{k++;p*=RF();}while(p>l);return k-1;}
/* ================= MAÇ PERFORMANS MODELİ =================
   Tek yerden ayarlanabilir olsun diye katsayılar burada toplandı.
   Puan üç parçadan oluşur:
     1) BEKLENTİ — oyuncunun etkin seviyesi (güç + form + moral) hem mutlak olarak
        hem de rakip takımın gücüne göre değerlendirilir. İyi oyuncu her yerde iyidir,
        ama asıl farkı kendinden güçlü rakibe karşı çıkardığı işte gösterir.
     2) İSTİKRAR — morali yüksek oyuncu dar bir bantta oynar, düşük moralli savrulur.
        Rastgelelik üçgen dağılım: uçlar nadir, orta yoğun.
     3) KATKI — gol, asist, gol yememe.
   Kısa süre sahada kalan oyuncu ortalamaya çekilir; 15 dakikada maç kazanılmaz. */
const PERF={
  base:6.35,
  formW:0.25, moralW:0.12,     // form/moral etkin seviyeye kaç puan katıyor
  absRef:62, absW:0.018, absCap:0.55,   // mutlak kalite
  relW:0.030, relCap:0.65,              // rakibe göre üstünlük
  res:{W:0.30,D:0.05,L:-0.26},
  goal:0.85, assist:0.42,
  csGK:0.75, csDF:0.32,
  spreadLow:1.00, spreadHigh:0.40,      // moral 0 → geniş sapma, moral 100 → dar
  shortMin:45
};
/* üçgen dağılım (-1..1): iki üniformun toplamı — uçlar nadir */
function bell(){return RF()+RF()-1;}
/* oyuncunun o maçki etkin seviyesi — moral ve form buraya girer */
function effLevel(p){return p.r+(p.form-50)*PERF.formW+(p.morale-50)*PERF.moralW;}
function matchRating(p,ctx){
  const P=PERF, lvl=effLevel(p);
  const abs=clamp((lvl-P.absRef)*P.absW,-P.absCap,P.absCap);
  const rel=clamp((lvl-ctx.oppStr)*P.relW,-P.relCap,P.relCap);
  const spread=P.spreadLow-(P.spreadLow-P.spreadHigh)*(p.morale/100);
  let rt=P.base+abs+rel+P.res[ctx.res]+ctx.g*P.goal+ctx.a*P.assist+bell()*spread;
  if(ctx.ga===0){if(p.pos==='KL')rt+=P.csGK;else if(p.pos==='DF')rt+=P.csDF;}
  if(ctx.min<P.shortMin)rt=P.base+(rt-P.base)*(0.45+ctx.min/90); // az oynadı, az etkiledi
  return Math.round(clamp(rt,4.5,10)*10)/10;
}
function pickWeighted(ps,wf){
  let tot=ps.reduce((s,p)=>s+wf(p),0),x=RF()*tot;
  for(const p of ps){x-=wf(p);if(x<=0)return p;}
  return ps[ps.length-1];
}
/* pick XI + subs, record apps & minutes; returns outfield players who played */
function playMatchSide(tid){
  const sq=S.players.filter(p=>p.team===tid);
  const sorted=sq.map(p=>({p,s:p.r+(p.form-50)*0.1+R(-6,6)})).sort((a,b)=>b.s-a.s).map(x=>x.p);
  const gk=sorted.find(p=>p.pos==='KL');
  /* Dizilişi mevkiye göre kur: sadece en iyi 10'u alırsak 10 forvetli takım çıkabiliyor.
     Önce asgari kotalar dolar, kalan yerlere en iyiler girer. */
  const outf=[];
  const quota={DF:4,OS:4,FV:2};
  Object.keys(quota).forEach(k=>{
    sorted.filter(p=>p.pos===k).slice(0,quota[k]).forEach(p=>outf.push(p));
  });
  sorted.forEach(p=>{
    if(outf.length>=10||p.pos==='KL'||outf.indexOf(p)>=0)return;
    outf.push(p);
  });
  const starters=gk?[gk].concat(outf.slice(0,10)):sorted.slice(0,11);
  const bench=sorted.filter(p=>starters.indexOf(p)<0).slice(0,3);
  const nSub=Math.min(3,bench.length);
  const subbedOut=[...starters].sort(()=>RF()-0.5).slice(0,nSub);
  /* haftalık rapor o maçta kaç dakika oynandığını gösteriyor — sezonluk toplamdan
     ayrı olarak maç bazında da tut */
  const mins={};
  starters.forEach(p=>{
    const m=subbedOut.indexOf(p)>=0?R(55,80):90;
    p.app=(p.app||0)+1;p.min=(p.min||0)+m;mins[p.id]=m;
  });
  const subsIn=bench.slice(0,nSub);
  subsIn.forEach(p=>{const m=R(10,35);p.app=(p.app||0)+1;p.min=(p.min||0)+m;mins[p.id]=m;});
  const all=starters.concat(subsIn);
  return {all,out:all.filter(p=>p.pos!=='KL'),mins};
}
function simWeek(){
  const wk=S.week-1;
  if(wk>=totalWeeks())return;
  LEAGUES.forEach((_,lg)=>{
    if(wk>=S.fx[lg].length)return;
    S.fx[lg][wk].forEach(m=>{
      const sh=teamStr(m.h),sa=teamStr(m.a);
      m.hg=poisson(clamp(1.45*Math.pow(sh/sa,2.4),0.3,4.2));
      m.ag=poisson(clamp(1.15*Math.pow(sa/sh,2.4),0.3,4.2));
      const th=S.teams[m.h],ta=S.teams[m.a];
      th.gf+=m.hg;th.ga+=m.ag;ta.gf+=m.ag;ta.ga+=m.hg;
      if(m.hg>m.ag){th.pts+=3;th.w++;ta.l++;}
      else if(m.hg<m.ag){ta.pts+=3;ta.w++;th.l++;}
      else{th.pts++;ta.pts++;th.d++;ta.d++;}
      const playedMap={},gMap={},aMap={};
      playedMap[m.h]=playMatchSide(m.h);
      playedMap[m.a]=playMatchSide(m.a);
      [[m.h,m.hg],[m.a,m.ag]].forEach(([tid,goals])=>{
        const squad=playedMap[tid].out;
        if(!squad.length)return;
        for(let g=0;g<goals;g++){
          const sc=pickWeighted(squad,p=>(p.pos==='FV'?9:p.pos==='OS'?3.2:0.8)*p.r/70);
          sc.g++;gMap[sc.id]=(gMap[sc.id]||0)+1;
          /* gol zaten maç puanına giriyor; buradaki artış sadece ek güven payı */
          sc.form=clamp(sc.form+3,0,100);moraleEvent(sc,2);
          if(RF()<0.75&&squad.length>1){
            const as=pickWeighted(squad.filter(p=>p.id!==sc.id),p=>(p.pos==='OS'?6:p.pos==='FV'?3:1.5)*p.r/70);
            as.a++;aMap[as.id]=(aMap[as.id]||0)+1;
            as.form=clamp(as.form+2,0,100);
          }
        }
      });
      /* --- maç puanları, son 5 maç ve Maçın Adamı --- */
      let motm=null,best=0;
      const strH=teamStr(m.h),strA=teamStr(m.a);
      [[m.h,m.hg,m.ag],[m.a,m.ag,m.hg]].forEach(([tid,gf,ga])=>{
        const res=gf>ga?'W':gf<ga?'L':'D';
        const oppStr=tid===m.h?strA:strH;
        playedMap[tid].all.forEach(p=>{
          const min=playedMap[tid].mins[p.id]||0;
          const rt=matchRating(p,{res,ga,oppStr,min,g:gMap[p.id]||0,a:aMap[p.id]||0});
          /* geri besleme: iyi maç formu ve morali taşır, kötü maç aşağı çeker.
             İleride eklenecek olaylar da moraleEvent() üzerinden aynı kanala girer. */
          p.form=stat(p.form+(rt-6.7)*1.5,5);
          if(min>=PERF.shortMin)moraleEvent(p,(rt-6.7)*0.7);
          p.rtSum=(p.rtSum||0)+rt;p.rtN=(p.rtN||0)+1;
          /* belirli maç aralıklarıyla piyasa değeri sahadaki işe göre güncellenir */
          const vd=updateValue(p);
          if(vd&&p.agent==='you'&&Math.abs(vd)>=0.05)
            pushNews(vd>0?'valUp':'valDown',{n:p.n,pid:p.id,v:fmtM(valueOf(p))},vd>0?'good':'warn');
          (p.l5=p.l5||[]).push({o:tid===m.h?m.a:m.h,res,g:gMap[p.id]||0,a:aMap[p.id]||0,rt,mm:false,
            sc:gf+'-'+ga,min:playedMap[tid].mins[p.id]||0});
          if(p.l5.length>5)p.l5.shift();
          if(rt>best){best=rt;motm=p;}
        });
      });
      if(motm){
        motm.l5[motm.l5.length-1].mm=true;
        motm.form=clamp(motm.form+3,0,100);
      }
      /* --- haftalık müşteri raporu: gelen kutusuna değil, hafta sonunda açılan
             kendi ekranına gider. Oynamayanlar da rapora girer — forma bulamamak
             menajer için gol atmak kadar önemli bir bilgi. --- */
      S.wkRep=S.wkRep||[];
      playedMap[m.h].all.concat(playedMap[m.a].all).forEach(p=>{
        if(p.agent!=='you')return;
        const last=p.l5[p.l5.length-1];
        S.wkRep.push({pid:p.id,n:p.n,tid:p.team,opp:last.o,res:last.res,sc:last.sc,
          min:last.min,g:last.g,a:last.a,rt:last.rt,mm:last.mm?1:0});
      });
      S.clients.forEach(cid=>{
        const p=byId(cid);
        if(!p||(p.team!==m.h&&p.team!==m.a))return;
        if(playedMap[p.team].all.indexOf(p)>=0)return;
        S.wkRep.push({pid:p.id,n:p.n,tid:p.team,opp:p.team===m.h?m.a:m.h,
          res:(p.team===m.h?m.hg-m.ag:m.ag-m.hg)>0?'W':(m.hg===m.ag?'D':'L'),
          sc:(p.team===m.h?m.hg+'-'+m.ag:m.ag+'-'+m.hg),dnp:1});
      });
    });
  });
  /* Form ve moral artık maç performansından besleniyor. Buradaki haftalık hareket
     saf gürültü değil ortalamaya dönüş: iyi form da kötü form da kalıcı değil,
     aksi halde geri besleme kendi kendini büyütüp uçlara yapışırdı. */
  S.players.forEach(p=>{
    p.form=stat(p.form+(50-p.form)*0.12+R(-2,2),5);
    const fair=marketWage(p.r);
    let dm=0;
    if(p.wage<fair*0.7)dm-=3;else if(p.wage>fair)dm+=1;
    if(p.form>70)dm+=1;if(p.form<30)dm-=1;
    p.morale=stat(p.morale+dm+(55-p.morale)*0.12+R(-1,1),0);
  });
  /* --- grouped leagues: zone winners meet in a real, visible final --- */
  S.finals=S.finals||{};
  LEAGUES.forEach((lg,i)=>{
    if(!lg.grp)return;
    if(wk!==S.fx[i].length)return; // the week right after the group stage
    if(S.finals[i]&&S.finals[i].se===S.season)return;
    const a=groupTable(i,0)[0],b=groupTable(i,1)[0];
    const sa=teamStr(a.id),sb=teamStr(b.id);
    let ga=poisson(clamp(1.3*Math.pow(sa/sb,2.4),0.3,4)),gb=poisson(clamp(1.1*Math.pow(sb/sa,2.4),0.3,4));
    if(ga===gb){if(RF()<0.5)ga++;else gb++;}
    S.finals[i]={se:S.season,h:a.id,a:b.id,hg:ga,ag:gb};
    pushNews('finalN',{li:i,h:a.n,hid:a.id,a:b.n,aid:b.id,hg:ga,ag:gb,c:ga>gb?a.n:b.n,cid:ga>gb?a.id:b.id},'good');
  });
  simCups();
}
function nextWeek(){
  if(!S.agent){render();return;}
  S.tw=(S.tw||0)+1;
  if(!S.cups)seedCups();
  const unreadBefore=S.inbox.filter(m=>!m.read).length;
  /* scouting networks coming online */
  (S.scout=S.scout||[]).slice().forEach(x=>{
    if(x.done>S.tw)return;
    S.scout=S.scout.filter(y=>y!==x);
    if(!S.known.includes(x.lg))S.known.push(x.lg);
    pushNews('scoutDone',{li:x.lg},'good');
  });
  /* --- anlaşılan sözleşmeler birkaç hafta sonra imzalanır --- */
  (S.pendC=S.pendC||[]).slice().forEach(x=>{
    if(x.at>S.tw)return;
    S.pendC=S.pendC.filter(y=>y!==x);
    const p=byId(x.pid);
    if(!p||p.agent!=='you')return;
    p.wage=x.wage;p.yrs=x.years;
    p.morale=clamp(Math.max(p.morale+25,65),0,100);p.ignored=0;p.hm=(S.tw||0)+8;
    const fee=Math.round(x.wage*52*x.years*(x.rate||commissionRate()));
    S.cash+=fee;repEvent(0.7);
    pushNews('contractSigned',{n:p.n,pid:p.id,c:teamOf(p).n,tid:p.team,y:x.years,w:fmtK(x.wage),f:fmtK(fee)},'good');
  });
  /* --- taksitli komisyon ödemeleri --- */
  (S.pendPay=S.pendPay||[]).slice().forEach(x=>{
    if(x.at>S.tw)return;
    S.pendPay=S.pendPay.filter(y=>y!==x);
    S.cash+=x.amt;
    pushNews('instPay',{f:fmtK(x.amt),n:x.n},'good');
  });
  /* --- club decisions on submitted offers --- */
  S.offers=S.offers||[];S.pending=S.pending||[];
  S.offers.slice().forEach(o=>{
    if(o.at>S.tw)return;
    S.offers=S.offers.filter(x=>x!==o);
    const p=byId(o.pid),b=S.teams[o.tid];
    if(!p||p.agent!=='you'||p.team===o.tid)return;
    if(pendingFor(o.pid)||movedThisSeason(p))return; // deal already agreed / already moved this season
    const v=valueOf(p);
    let acc=clamp(1.6-(o.fee/v)/(0.85+b.bud*0.3),0.05,0.95);
    /* pazarlık şartları kabulü etkiler: taksit +, gol bonusu +, sonraki satış payı - */
    acc+=clauseAcc(o.pay,o.gb,o.so);
    acc+=(o.fix===1?0.08:o.fix===2?0.18:0);   // aracıya ödenen para kapıları aralar
    acc+=skillBonus('bid');                   // kulüplerle kurduğun ilişkinin tek okuma yeri
    if(isFree(p))acc=Math.max(acc,0.55);       // bonservissiz oyuncuda kulübün riski düşük
    acc=clamp(acc,0.05,0.97);
    if(RF()<acc){
      S.offers=S.offers.filter(x=>x.pid!==o.pid); // withdraw remaining offers for this player
      if(windowOpen())doTransfer(p,b,o.fee,true,o);
      else{
        S.pending.push({pid:o.pid,tid:o.tid,fee:o.fee,pay:o.pay,gb:o.gb,so:o.so});
        pushNews('agreedWait',{c:b.n,tid:b.id,n:p.n,pid:p.id,f:fmtM(o.fee),w:nextWindowLabel()},'good');
        p.morale=clamp(p.morale+10,0,100);p.ignored=0;
      }
    } else pushNews('offerRej',{c:b.n,tid:b.id,n:p.n,pid:p.id},'bad');
  });
  /* --- pending deals complete when the window is open --- */
  if(windowOpen()){
    S.pending.slice().forEach(x=>{
      S.pending=S.pending.filter(y=>y!==x);
      const p=byId(x.pid);
      if(p&&p.agent==='you'&&p.team!==x.tid)doTransfer(p,S.teams[x.tid],x.fee,true,x);
    });
  }
  S.clients.slice().forEach(id=>{
    const p=byId(id);
    if(p.morale<40&&!honeymoon(p)){
      p.ignored++;
      if(p.ignored===1)pushNews(p.wage<marketWage(p.r)*0.8?'unhappyMsg':'wantsOutMsg',{n:p.n,pid:p.id},'warn');
      /* Güvendiği menajere daha uzun süre katlanır; güvenmediği çabuk kapıyı gösterir. */
      const patience=4+Math.round(trustOf(p)/9);
      if(p.ignored>patience){
        p.agent=null;S.clients=S.clients.filter(c=>c!==id);
        repEvent(-3);
        pushNews('firedYou',{n:p.n,pid:p.id},'bad');
      }
    } else p.ignored=0;
    if(p.yrs===1&&S.week%6===0)pushNews('expire',{n:p.n,pid:p.id,y:1},'warn');
  });
  /* Rakip ajanslar transfer piyasasından önce hareket eder: bu hafta imzaladıkları
     oyuncu piyasa listesinden düşmüş olur, gördüğün liste gerçeği söyler. */
  simRivals();
  simTransfers();
  S.wkRep=[];        // bu haftanın müşteri raporu sıfırdan toplanır
  const repWeek=S.week;
  simWeek();
  const wasPositive=S.cash>=0;
  S.cash=Math.round((S.cash+weeklyIncome()-weeklyCost())*10)/10;
  if(wasPositive&&S.cash<0)pushNews('inDebt',{c:fmtK(weeklyCost())},'bad');
  if(S.rep>=35&&RF()<0.10+S.rep/400){
    const cands=S.players.filter(p=>p.agent==='rival'&&p.r>=70&&profileOf(p)<=repCap()&&knownLg(teamOf(p).lg));
    if(cands.length&&S.clients.length<maxClients()){
      /* Menajerinden kopan oyuncu rastgele seçilmiyor: yüksek komisyonla çalışan ve
         müşterisini tutamayan ajanslar daha sık kaybeder (bkz. RIV_ARCH.loyal). */
      const p=pickWeighted(cands,x=>{const r=rivalOf(x);return r?1/Math.max(0.3,rivalArch(r).loyal):1;});
      const r=rivalOf(p);
      p.agent=null;delete p.ra;
      if(r)r.lost=(r.lost||0)+1;
      pushNews('firedRival',{n:p.n,pid:p.id,r:p.r,a:r?rivalName(r):'',ri:r?r.id:undefined},'act',{type:'sign',pid:p.id});
    }
  }
  if(S.clients.length&&RF()<0.15){
    const p=byId(S.clients[R(0,S.clients.length-1)]);
    if(p&&p.r>=68&&!movedThisSeason(p)&&!pendingFor(p.id)){
      const buyers=S.teams.filter(tm=>tm.id!==p.team&&tm.bud>=0.55&&Math.abs(tm.str-p.r)<8);
      if(buyers.length){
        const b=buyers[R(0,buyers.length-1)];
        const fee=+(valueOf(p)*(0.9+RF()*0.5)).toFixed(1);
        pushNews('clubOffer',{c:b.n,tid:b.id,n:p.n,pid:p.id,f:fmtM(fee)},'act',{type:'bid',pid:p.id,tid:b.id,fee});
      }
    }
  }
  S.week++;
  const seasonOver=S.week>totalWeeks();
  if(seasonOver)endSeason();
  const newN=S.inbox.filter(m=>!m.read).length-unreadBefore;
  if(newN>0&&cur().v!=='inbox'&&cur().v!=='dash')toast(newN+' '+t('newNotifsT'));
  save();render();
  /* Sezon biterse şampiyonluk özeti öncelikli. Rapor ve olay sıraya girer. */
  if(!seasonOver){
    if(S.wkRepOn!==false&&S.wkRep.length)pushModal(()=>showWeekReport(repWeek));
    /* Seviye atladıysan sıraya girer. Sezon özeti sırayı temizlerse S.lvUp
       duruyor olacağı için haber kaybolmaz, bir hafta sonra gelir. */
    if(S.lvUp)pushModal(()=>showLevelUp());
    /* Ayartma kararı olaydan önce sıraya girer: haftanın en ağır kararı, arkasına
       rastgele bir olay eklenmeden verilsin. Sezon biterse S.poach duruyor olacağı
       için karar kaybolmaz, bir hafta sonra gelir. */
    if(S.poach&&S.poach.at<=(S.tw||0))pushModal(()=>showPoach());
    const ev=rollEvent();
    if(ev)pushModal(()=>showEvent(ev));
  }
}
function endSeason(){
  const myLgs=new Set(S.clients.map(id=>teamOf(byId(id)).lg));
  S.lgHist=S.lgHist||LEAGUES.map(()=>[]);
  const trow=tm=>[tm.id,tm.pts,tm.w,tm.d,tm.l,tm.gf,tm.ga];
  const champs=LEAGUES.map((lg,i)=>{
    /* Gol kralı yalnız gerçekten gol atmış oyuncudan seçilir. Eski hâlde filtre
       yoktu: hiç gol atılmamış bir ligde sıralama sıfırlar arasında yapılıyor ve
       rastgele bir oyuncu "0 gol ile gol kralı" diye haber oluyordu. Kimse yoksa
       null döner ve haber/tarihçe o parçayı hiç yazmaz. */
    const ts=S.players.filter(p=>p.g>0&&teamOf(p).lg===i).sort((a,b)=>b.g-a.g)[0]||null;
    const lgPs=S.players.filter(p=>teamOf(p).lg===i);
    const scAs={
      sc:lgPs.filter(p=>p.g>0).sort((a,b)=>b.g-a.g).slice(0,15).map(p=>[p.n,p.team,p.g]),
      as:lgPs.filter(p=>p.a>0).sort((a,b)=>b.a-a.a).slice(0,15).map(p=>[p.n,p.team,p.a])};
    let champTm,archEntry;
    if(lg.grp){
      /* champion comes from the final played after the group stage */
      const tA=groupTable(i,0),tB=groupTable(i,1);
      let f=(S.finals||{})[i];
      if(!f||f.se!==S.season){ // safety net: play it now if it never happened
        const a=tA[0],b=tB[0];
        const sa=teamStr(a.id),sb=teamStr(b.id);
        let ga=poisson(clamp(1.3*Math.pow(sa/sb,2.4),0.3,4)),gb=poisson(clamp(1.1*Math.pow(sb/sa,2.4),0.3,4));
        if(ga===gb){if(RF()<0.5)ga++;else gb++;}
        f={se:S.season,h:a.id,a:b.id,hg:ga,ag:gb};
      }
      champTm=f.hg>f.ag?S.teams[f.h]:S.teams[f.a];
      archEntry=Object.assign({se:S.season,tabs:[tA.map(trow),tB.map(trow)],fin:[f.h,f.a,f.hg,f.ag]},scAs);
    } else {
      const table=leagueTable(i);
      champTm=table[0];
      archEntry=Object.assign({se:S.season,tab:table.map(trow)},scAs);
    }
    /* ts yoksa s/sid/g hiç yazılmıyor: NEWS.champ bu alanların varlığına bakıp
       gol kralı cümlesini tümüyle düşürüyor, şampiyon bilgisi yerinde kalıyor. */
    if(myLgs.has(i)||i===S.curLg)pushNews('champ',ts
      ?{li:i,c:champTm.n,tid:champTm.id,s:ts.n,sid:ts.id,g:ts.g}
      :{li:i,c:champTm.n,tid:champTm.id},'good');
    (S.lgHist[i]=S.lgHist[i]||[]).push(ts
      ?{se:S.season,tid:champTm.id,ts:ts.n,g:ts.g}
      :{se:S.season,tid:champTm.id});
    if(S.lgHist[i].length>30)S.lgHist[i].shift();
    S.arch=S.arch||LEAGUES.map(()=>[]);
    (S.arch[i]=S.arch[i]||[]).push(archEntry);
    if(S.arch[i].length>12)S.arch[i].shift();
    return {lgi:i,tm:champTm,ts};
  });
  delete S.vSe;
  showSeasonModal(champs);
  /* --- next season's continental cups seeded from final standings --- */
  seedCups();
  /* --- promotion & relegation: bottom 3 ↔ top 3 in tiered countries --- */
  const myTids=new Set(S.clients.map(id=>byId(id).team));
  TIERS.forEach(([tc,sc])=>{
    const ti=LEAGUES.findIndex(l=>l.c===tc),si=LEAGUES.findIndex(l=>l.c===sc);
    const down=leagueTable(ti).slice(-3),up=leagueTable(si).slice(0,3);
    down.forEach(tm=>{tm.lg=si;if(myTids.has(tm.id))pushNews('relegated',{c:tm.n,tid:tm.id,li:si},'bad');});
    up.forEach(tm=>{tm.lg=ti;if(myTids.has(tm.id))pushNews('promoted',{c:tm.n,tid:tm.id,li:ti},'good');});
  });
  /* --- milli takımlar turnuvası: her 4 sezonda bir --- */
  if(S.season%4===0){
    const natStr=nat=>{
      const ps=S.players.filter(p=>p.nat===nat).sort((a,b)=>b.r-a.r).slice(0,11);
      return ps.length?ps.reduce((s,p)=>s+p.r,0)/ps.length:0;
    };
    const strMap={};NATKEYS.forEach(n=>strMap[n]=natStr(n));
    const seeds=NATKEYS.slice().sort((a,b)=>strMap[b]-strMap[a]).slice(0,16);
    const rounds=[];
    let cur=null;
    /* first round: seed 1 vs 16, 2 vs 15 ... */
    let rd=[];const nxt=[];
    for(let i=0;i<8;i++){
      const A=seeds[i],B=seeds[15-i];
      const [g1,g2]=playKO(strMap[A],strMap[B]);
      rd.push({h:A,a:B,hg:g1,ag:g2});nxt.push(g1>g2?A:B);
    }
    rounds.push(rd);cur=nxt;
    while(cur.length>1){
      rd=[];const n2=[];
      for(let i=0;i<cur.length;i+=2){
        const A=cur[i],B=cur[i+1];
        const [g1,g2]=playKO(strMap[A],strMap[B]);
        rd.push({h:A,a:B,hg:g1,ag:g2});n2.push(g1>g2?A:B);
      }
      rounds.push(rd);cur=n2;
    }
    S.wc={se:S.season,rounds,champ:cur[0]};
    (S.wcHist=S.wcHist||[]).push({se:S.season,nat:cur[0]});
    pushNews('wcWin',{n:NATS[cur[0]].c},'good');
  }
  const tstr={};S.teams.forEach(tm=>{tstr[tm.id]=teamStr(tm.id);});
  /* --- gol bonusu anlaşmaları: 10+ gol atan transferden pay --- */
  (S.deals=S.deals||[]).forEach(d=>{
    const dp=byId(d.pid);
    if(dp&&dp.team===d.tid&&dp.g>=(d.goals||10)){
      const cut=Math.max(1,Math.round(d.amt*commissionRate()));
      S.cash+=cut;
      pushNews('gbPaid',{n:dp.n,pid:dp.id,g:dp.g,f:fmtK(cut)},'good');
    }
  });
  S.deals=[];
  const gone=[];
  S.players.forEach(p=>{
    p.seasons=p.seasons||[];
    if(p.app>0||p.g>0||p.agent==='you')p.seasons.push({se:S.season,tm:teamOf(p).n,g:p.g,a:p.a,app:p.app||0,min:p.min||0,rt:p.rtN?Math.round(p.rtSum/p.rtN*10)/10:0});
    if(p.seasons.length>6)p.seasons.shift();
    p.age++;p.yrs=Math.max(0,p.yrs-1);
    /* --- development: age + level fit --- */
    /* kulüpsüz oyuncunun antrenman ortamı yok: kendi seviyesini referans alır ve gelişemez */
    const lvl=isFree(p)?p.r+4:tstr[p.team];
    let dev=0;
    if(p.age<=21)dev=R(3,6);
    else if(p.age<=23)dev=R(2,4);
    else if(p.age<=26)dev=R(0,2);
    else if(p.age<=29)dev=R(-1,1);
    else dev=-R(1,3);
    if(dev>0){
      if(p.pot-p.r>=12&&p.age<=23)dev+=1;      // hungry wonderkid
      if(p.r<lvl-9)dev=Math.max(0,dev-3);      // buried at a club too big for him
      if(p.r>lvl+6)dev=Math.max(0,dev-1);      // no challenge left at this level
      if(p.form>65)dev+=1;
      /* skillBonus('dev') — müşterinin gelişimine dokunan tek yer. Gelişim tam
         sayı ilerlediği için bonus olasılık olarak veriliyor: ya bir puan fazla
         gelişir ya gelişmez, arada kesir birikmez. */
      if(p.agent==='you'&&RF()<skillBonus('dev'))dev+=1;
    }
    const oldR=p.r;
    p.r=dev>0?clamp(p.r+dev,35,Math.min(p.pot,96)):clamp(p.r+dev,35,96);
    const gained=p.r-oldR;
    if(p.agent==='you'){
      if(gained>=4){repEvent(0.8);pushNews('devUp',{n:p.n,pid:p.id,d:gained,r:p.r},'good');}
      else if(gained>=2)repEvent(0.4);
      if(p.r>lvl+6&&p.age<=29){pushNews('outgrow',{n:p.n,pid:p.id,c:teamOf(p).n,tid:p.team},'warn');p.morale=clamp(p.morale-12,0,100);}
    }
    p.g=0;p.a=0;p.app=0;p.min=0;p.rtSum=0;p.rtN=0;p.form=R(40,65);
    p.vmAt=0;if(p.vm)p.vm=+(1+(p.vm-1)*VAL.revert).toFixed(3);
    /* --- kulüpsüz oyuncular: uzun süre imza bulamazsa futbolu bırakır --- */
    if(isFree(p)){
      p.freeFor=(p.freeFor||0)+1;
      /* İş bulamayan zayıf ve yaşlı oyuncular futbolu bırakır. Nitelikli bir oyuncu
         boşta kalmaz — o bir sonraki dengelemede kulüp bulur, listeden düşmez. */
      const weak=p.r<62;
      if(p.age>=35||(weak&&(p.freeFor>=2||RF()<0.35)))gone.push(p);
      return;
    }
    /* --- kariyer sonu --- */
    if(RF()<careerEndProb(p,lvl)){
      if(p.agent==='you'){S.clients=S.clients.filter(c=>c!==p.id);pushNews('retire',{n:p.n,pid:p.id},'info');}
      regenPlayer(p);
      return;
    }
    /* --- sözleşme bitti: kulüp yenileyecek mi? --- */
    if(p.yrs===0){
      /* Sözleşmesini bilerek bitirip piyasaya çıkanlar: kulüp tutmak istese de gider.
         Havuzda ara sıra gerçekten iyi bir oyuncu olsun diye — asıl fırsat bunlar. */
      const runsDown=p.r>=lvl-2&&p.age>=24&&p.age<=31&&RF()<0.05;
      if(!runsDown&&RF()<renewProb(p,lvl)){
        p.yrs=R(2,4);
        p.wage=Math.max(1,Math.round(marketWage(p.r)*(0.85+teamOf(p).bud*0.3)));
        if(p.agent==='you')pushNews('renewed',{n:p.n,pid:p.id,c:teamOf(p).n,tid:p.team,y:p.yrs},'info');
      } else {
        const old=teamOf(p);
        releaseToFree(p);
        if(p.agent==='you')pushNews('released',{n:p.n,pid:p.id,c:old.n,tid:old.id},'warn');
      }
    }
  });
  /* futbolu bırakan kulüpsüz oyuncular listeden düşer — kadrolarda yerleri zaten yok */
  if(gone.length){
    const ids=new Set(gone.map(p=>p.id));
    gone.forEach(p=>{
      if(p.agent==='you'){S.clients=S.clients.filter(c=>c!==p.id);pushNews('retire',{n:p.n,pid:p.id},'info');}
    });
    S.players=S.players.filter(p=>!ids.has(p.id));
  }
  rebalanceSquads();
  /* Kadrolar oturduktan sonra: rakip ajansların itibarı portföylerine göre kayar ve
     yükselen/sönen oyuncular yeniden paylaşılır. Kadro dengesinden önce çalışsaydı
     bu sezon doğan gençleri göremezdi. */
  rivalSeason();
  S.teams.forEach(tm=>{tm.pts=0;tm.w=0;tm.d=0;tm.l=0;tm.gf=0;tm.ga=0;});
  buildAllFixtures();
  S.finals={};
  S.season++;S.week=1;
}
