'use strict';
/* js/sim.js — haftalık maç simülasyonu, sezon sonu, gelişim, küme düşme/yükselme, Dünya Kupası */
/* ================= SIM ================= */
function teamStr(tid){
  const ps=S.players.filter(p=>p.team===tid).sort((a,b)=>b.r-a.r).slice(0,11);
  return ps.reduce((s,p)=>s+p.r+(p.form-50)*0.08,0)/ps.length;
}
function poisson(lam){let l=Math.exp(-lam),k=0,p=1;do{k++;p*=RF();}while(p>l);return k-1;}
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
  const outf=sorted.filter(p=>p.pos!=='KL').slice(0,10);
  const starters=gk?[gk].concat(outf):sorted.slice(0,11);
  const bench=sorted.filter(p=>starters.indexOf(p)<0).slice(0,3);
  const nSub=Math.min(3,bench.length);
  const subbedOut=[...starters].sort(()=>RF()-0.5).slice(0,nSub);
  starters.forEach(p=>{p.app=(p.app||0)+1;p.min=(p.min||0)+(subbedOut.indexOf(p)>=0?R(55,80):90);});
  const subsIn=bench.slice(0,nSub);
  subsIn.forEach(p=>{p.app=(p.app||0)+1;p.min=(p.min||0)+R(10,35);});
  const all=starters.concat(subsIn);
  return {all,out:all.filter(p=>p.pos!=='KL')};
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
          sc.form=clamp(sc.form+6,0,100);sc.morale=clamp(sc.morale+3,0,100);
          if(RF()<0.75&&squad.length>1){
            const as=pickWeighted(squad.filter(p=>p.id!==sc.id),p=>(p.pos==='OS'?6:p.pos==='FV'?3:1.5)*p.r/70);
            as.a++;aMap[as.id]=(aMap[as.id]||0)+1;
            as.form=clamp(as.form+4,0,100);
          }
        }
      });
      /* --- maç puanları, son 5 maç ve Maçın Adamı --- */
      let motm=null,best=0;
      [[m.h,m.hg,m.ag],[m.a,m.ag,m.hg]].forEach(([tid,gf,ga])=>{
        const res=gf>ga?'W':gf<ga?'L':'D';
        playedMap[tid].all.forEach(p=>{
          let rt=6.4+(res==='W'?0.4:res==='D'?0.1:-0.3)
                +(gMap[p.id]||0)*0.9+(aMap[p.id]||0)*0.5+(RF()*1.4-0.7);
          if(p.pos==='KL'&&ga===0)rt+=0.6;
          rt=Math.round(clamp(rt,4.5,10)*10)/10;
          p.rtSum=(p.rtSum||0)+rt;p.rtN=(p.rtN||0)+1;
          (p.l5=p.l5||[]).push({o:tid===m.h?m.a:m.h,res,g:gMap[p.id]||0,a:aMap[p.id]||0,rt,mm:false,sc:gf+'-'+ga});
          if(p.l5.length>5)p.l5.shift();
          if(rt>best){best=rt;motm=p;}
        });
      });
      if(motm){
        motm.l5[motm.l5.length-1].mm=true;
        motm.form=clamp(motm.form+3,0,100);
      }
      /* müşteri performans bildirimi: gol, asist veya Maçın Adamı */
      playedMap[m.h].all.concat(playedMap[m.a].all).forEach(p=>{
        if(p.agent!=='you')return;
        const g=gMap[p.id]||0,a=aMap[p.id]||0,mm=motm===p;
        if(g||a||mm){
          const last=p.l5[p.l5.length-1];
          pushNews('perf',{n:p.n,pid:p.id,g,a,rt:last.rt,mm:mm?1:0,opp:S.teams[last.o].n,oid:last.o},'good');
        }
      });
    });
  });
  S.players.forEach(p=>{
    p.form=clamp(p.form+R(-4,3),5,100);
    const fair=marketWage(p.r);
    let dm=0;
    if(p.wage<fair*0.7)dm-=3;else if(p.wage>fair)dm+=1;
    if(p.form>70)dm+=1;if(p.form<30)dm-=1;
    p.morale=clamp(p.morale+dm+R(-2,2),0,100);
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
    pushNews('finalN',{l:lg.n,li:i,h:a.n,hid:a.id,a:b.n,aid:b.id,hg:ga,ag:gb,c:ga>gb?a.n:b.n,cid:ga>gb?a.id:b.id},'good');
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
    pushNews('scoutDone',{l:LEAGUES[x.lg].n,li:x.lg},'good');
  });
  /* --- anlaşılan sözleşmeler birkaç hafta sonra imzalanır --- */
  (S.pendC=S.pendC||[]).slice().forEach(x=>{
    if(x.at>S.tw)return;
    S.pendC=S.pendC.filter(y=>y!==x);
    const p=byId(x.pid);
    if(!p||p.agent!=='you')return;
    p.wage=x.wage;p.yrs=x.years;
    p.morale=clamp(Math.max(p.morale+25,65),0,100);p.ignored=0;p.hm=(S.tw||0)+8;
    const fee=Math.round(x.wage*52*x.years*0.10);
    S.cash+=fee;S.rep=clamp(S.rep+2,0,100);
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
    const v=marketValue(p.r);
    let acc=clamp(1.6-(o.fee/v)/(0.85+b.bud*0.3),0.05,0.95);
    /* pazarlık şartları kabulü etkiler: taksit +, gol bonusu +, sonraki satış payı - */
    acc+=(o.pay===2?0.06:o.pay===4?0.10:0)+(o.gb?0.04:0)-(o.so?0.08:0);
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
      if(p.ignored>9){
        p.agent=null;S.clients=S.clients.filter(c=>c!==id);
        S.rep=clamp(S.rep-5,0,100);
        pushNews('firedYou',{n:p.n,pid:p.id},'bad');
      }
    } else p.ignored=0;
    if(p.yrs===1&&S.week%6===0)pushNews('expire',{n:p.n,pid:p.id,y:1},'warn');
  });
  simWeek();
  S.cash+=weeklyIncome();
  if(S.rep>=35&&RF()<0.10+S.rep/400){
    const cands=S.players.filter(p=>p.agent==='rival'&&p.r>=70&&profileOf(p)<=repCap()&&knownLg(teamOf(p).lg));
    if(cands.length&&S.clients.length<maxClients()){
      const p=cands[R(0,cands.length-1)];
      p.agent=null;
      pushNews('firedRival',{n:p.n,pid:p.id,r:p.r},'act',{type:'sign',pid:p.id});
    }
  }
  if(S.clients.length&&RF()<0.15){
    const p=byId(S.clients[R(0,S.clients.length-1)]);
    if(p&&p.r>=68&&!movedThisSeason(p)&&!pendingFor(p.id)){
      const buyers=S.teams.filter(tm=>tm.id!==p.team&&tm.bud>=0.55&&Math.abs(tm.str-p.r)<8);
      if(buyers.length){
        const b=buyers[R(0,buyers.length-1)];
        const fee=+(marketValue(p.r)*(0.9+RF()*0.5)).toFixed(1);
        pushNews('clubOffer',{c:b.n,tid:b.id,n:p.n,pid:p.id,f:fmtM(fee)},'act',{type:'bid',pid:p.id,tid:b.id,fee});
      }
    }
  }
  S.week++;
  if(S.week>totalWeeks())endSeason();
  const newN=S.inbox.filter(m=>!m.read).length-unreadBefore;
  if(newN>0&&cur().v!=='inbox'&&cur().v!=='dash')toast(newN+' '+t('newNotifsT'));
  save();render();
}
function endSeason(){
  const myLgs=new Set(S.clients.map(id=>teamOf(byId(id)).lg));
  S.lgHist=S.lgHist||LEAGUES.map(()=>[]);
  const trow=tm=>[tm.id,tm.pts,tm.w,tm.d,tm.l,tm.gf,tm.ga];
  const champs=LEAGUES.map((lg,i)=>{
    const ts=S.players.filter(p=>teamOf(p).lg===i).sort((a,b)=>b.g-a.g)[0];
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
    if(myLgs.has(i)||i===S.curLg)pushNews('champ',{l:lg.n,li:i,c:champTm.n,tid:champTm.id,s:ts.n,sid:ts.id,g:ts.g},'good');
    (S.lgHist[i]=S.lgHist[i]||[]).push({se:S.season,tid:champTm.id,ts:ts.n,g:ts.g});
    if(S.lgHist[i].length>30)S.lgHist[i].shift();
    S.arch=S.arch||LEAGUES.map(()=>[]);
    (S.arch[i]=S.arch[i]||[]).push(archEntry);
    if(S.arch[i].length>12)S.arch[i].shift();
    return {lg:lg.n,tm:champTm,ts};
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
    down.forEach(tm=>{tm.lg=si;if(myTids.has(tm.id))pushNews('relegated',{c:tm.n,tid:tm.id,l:LEAGUES[si].n,li:si},'bad');});
    up.forEach(tm=>{tm.lg=ti;if(myTids.has(tm.id))pushNews('promoted',{c:tm.n,tid:tm.id,l:LEAGUES[ti].n,li:ti},'good');});
  });
  /* --- World Cup every 4th season --- */
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
    if(dp&&dp.team===d.tid&&dp.g>=10){
      const cut=Math.max(1,Math.round(d.amt*0.10));
      S.cash+=cut;
      pushNews('gbPaid',{n:dp.n,pid:dp.id,g:dp.g,f:fmtK(cut)},'good');
    }
  });
  S.deals=[];
  S.players.forEach(p=>{
    p.seasons=p.seasons||[];
    if(p.app>0||p.g>0||p.agent==='you')p.seasons.push({se:S.season,tm:teamOf(p).n,g:p.g,a:p.a,app:p.app||0,min:p.min||0,rt:p.rtN?Math.round(p.rtSum/p.rtN*10)/10:0});
    if(p.seasons.length>6)p.seasons.shift();
    p.age++;p.yrs=Math.max(0,p.yrs-1);
    /* --- development: age + level fit --- */
    const lvl=tstr[p.team];
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
    }
    const oldR=p.r;
    p.r=dev>0?clamp(p.r+dev,35,Math.min(p.pot,96)):clamp(p.r+dev,35,96);
    const gained=p.r-oldR;
    if(p.agent==='you'){
      if(gained>=4){S.rep=clamp(S.rep+2,0,100);pushNews('devUp',{n:p.n,pid:p.id,d:gained,r:p.r},'good');}
      else if(gained>=2)S.rep=clamp(S.rep+1,0,100);
      if(p.r>lvl+6&&p.age<=29){pushNews('outgrow',{n:p.n,pid:p.id,c:teamOf(p).n,tid:p.team},'warn');p.morale=clamp(p.morale-12,0,100);}
    }
    p.g=0;p.a=0;p.app=0;p.min=0;p.rtSum=0;p.rtN=0;p.form=R(40,65);
    if(p.yrs===0){p.yrs=1;p.morale=clamp(p.morale-10,0,100);}
    if(RF()<careerEndProb(p,lvl)){
      if(p.agent==='you'){S.clients=S.clients.filter(c=>c!==p.id);pushNews('retire',{n:p.n,pid:p.id},'info');}
      regenPlayer(p);
    }
  });
  S.teams.forEach(tm=>{tm.pts=0;tm.w=0;tm.d=0;tm.l=0;tm.gf=0;tm.ga=0;});
  buildAllFixtures();
  S.finals={};
  S.season++;S.week=1;
}
