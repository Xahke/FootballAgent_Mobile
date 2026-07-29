'use strict';
/* js/actions.js — oyuncu aksiyonları: sözleşme pazarlığı, transfer teklifleri, temsilcilik görüşmesi, keşif satın alma */
/* ================= NEGOTIATION ================= */
function clubMaxWage(p){
  const tm=teamOf(p);
  return marketWage(p.r)*(0.85+(p.form-50)/250+(S.rep/500))*(0.8+tm.bud*0.35);
}
function openNeg(pid){
  if(pendCFor(pid)){toast(t('contractPendingT'));return;}
  const p=byId(pid);
  negCtx={pid,round:1,max:clubMaxWage(p),patience:100,wage:Math.round(marketWage(p.r)),years:3,counter:null};
  renderNeg();
}
function renderNeg(){
  const p=byId(negCtx.pid),tm=teamOf(p);
  const ratio=negCtx.wage/negCtx.max;
  const mood=clamp(Math.round(140-ratio*100)*negCtx.patience/100,0,100);
  const mc=mood>60?'var(--acc)':mood>30?'var(--warn)':'var(--bad)';
  openModal(`
   <div class="row">${tmBadge(tm,42)}
     <div style="flex:1;min-width:0"><h2>${t('negotiate')}</h2>
     <div class="sub">${p.n} · ${tm.n}</div></div>
     <span class="roundPill">${t('round')} ${negCtx.round}/3</span></div>
   <div class="negbox">
     <div class="grid2" style="gap:8px">
       <div style="background:var(--sur2);border-radius:10px;padding:9px 11px">
         <div style="font-size:9px;color:var(--txt3);font-weight:800;text-transform:uppercase;letter-spacing:.07em">${t('wage')}</div>
         <div class="num" style="font-size:15px;font-weight:800;margin-top:2px">${fmtK(p.wage)}<span class="faint" style="font-size:10px">/${t('wk')}</span></div>
       </div>
       <div style="background:var(--acc-soft);border-radius:10px;padding:9px 11px;box-shadow:inset 0 0 0 1px rgba(30,201,126,.3)">
         <div style="font-size:9px;color:var(--acc);font-weight:800;text-transform:uppercase;letter-spacing:.07em">${t('demandWage')}</div>
         <div class="num" style="font-size:15px;font-weight:800;color:var(--acc);margin-top:2px">${fmtK(negCtx.wage)}<span style="font-size:10px;opacity:.7">/${t('wk')}</span></div>
       </div>
     </div>
     <input type="range" min="${Math.round(p.wage*0.9)}" max="${Math.round(negCtx.max*1.8)}" value="${negCtx.wage}"
        oninput="negCtx.wage=+this.value;renderNeg()">
     <div style="margin-top:12px"><b style="font-size:12.5px">${t('contractLen')}: <span class="num">${negCtx.years} ${t('yrs')}</span></b>
       <input type="range" min="1" max="5" value="${negCtx.years}" oninput="negCtx.years=+this.value;renderNeg()"></div>
     ${negCtx.counter?`<div class="counterCard">
       <b style="color:var(--warn)">${t('counter')}: ${fmtK(negCtx.counter)}/${t('wk')}</b><br>
       <span class="faint" style="font-size:11.5px">${L==='tr'?'Bu rakamı ya da altını seçersen anlaşma kesin.':'Match it or go lower to seal the deal.'}</span></div>`:''}
     <div style="margin-top:14px;display:flex;justify-content:space-between;font-size:11px">
       <span class="sub" style="font-weight:700">${t('clubMood')}</span>
       <b class="num" style="color:${mc}">%${Math.round(mood)}</b></div>
     <div class="moodbar"><div style="width:${mood}%;background:${mc}"></div></div>
     <div class="divider" style="margin:12px 0"></div>
     <div style="display:flex;justify-content:space-between;font-size:12px">
       <span class="sub">${t('signBonus')}</span>
       <b class="num" style="color:var(--gold)">${fmtK(Math.round(negCtx.wage*52*negCtx.years*0.10))}</b></div>
   </div>
   <button class="btn p" onclick="negSubmit()">${t('send')}</button>
   <button class="btn s" style="margin-top:8px" onclick="closeModal()">${t('walkAway')}</button>`);
}
function negSubmit(){
  const p=byId(negCtx.pid);
  const ratio=negCtx.wage/negCtx.max;
  /* accepting the club's own counter (or less) always seals the deal */
  const meetsCounter=negCtx.counter&&negCtx.wage<=Math.ceil(negCtx.counter*1.02);
  const acc=meetsCounter?1:clamp(1.5-ratio,0.05,0.92)*(0.65+0.35*negCtx.patience/100)+S.rep/500;
  if(RF()<acc){
    /* anlaşma sağlandı — imzalar birkaç hafta içinde atılır, komisyon imzada yatar */
    S.pendC=S.pendC||[];
    S.pendC.push({pid:p.id,wage:negCtx.wage,years:negCtx.years,at:(S.tw||0)+R(1,2)});
    p.morale=clamp(p.morale+10,0,100);p.ignored=0;p.hm=(S.tw||0)+4;
    pushNews('contractAgreed',{n:p.n,pid:p.id,c:teamOf(p).n,tid:p.team,y:negCtx.years,w:fmtK(negCtx.wage)},'good');
    toast(t('negAgreed'));closeModal();save();render();
  } else {
    negCtx.round++;negCtx.patience-=30;
    if(negCtx.round>3||ratio>1.7){
      S.rep=clamp(S.rep-2,0,100);p.morale=clamp(p.morale-8,0,100);
      toast(t('negFail'));closeModal();save();render();
    } else {
      const counter=Math.round(negCtx.max*(0.82+RF()*0.12));
      negCtx.counter=counter;
      negCtx.wage=Math.min(negCtx.wage,Math.round(counter*1.15));
      toast(`${t('counter')}: ${fmtK(counter)}/${t('wk')}`);
      renderNeg();
    }
  }
}
/* ================= TRANSFER ================= */
let trSel=new Set();
function openTransfer(pid){
  const p=byId(pid);
  if(offerFor(pid)||pendingFor(pid)){toast(t('offerPending'));return;}
  if(movedThisSeason(p)){toast(t('movedAlready'));return;}
  const potBonus=(p.age<=21&&p.pot-p.r>=12)?7:(p.age<=23&&p.pot-p.r>=8)?4:0;
  const buyers=S.teams.filter(tm=>{
    if(tm.id===p.team)return false;
    return p.r>=teamStr(tm.id)-4-potBonus&&tm.bud*12>=marketValue(p.r)*0.5&&RF()<0.5+(p.form-50)/120;
  }).sort(()=>RF()-0.5).slice(0,6);
  if(!buyers.length){openModal(`<h2>${t('offerClubs')}</h2><div class="empty">${t('noInterest')}</div>`);return;}
  const v=marketValue(p.r);
  trSel=new Set();
  openModal(`
   <h2>${t('offerClubs')}</h2><div class="sub">${p.n} · ${t('value')}: ${fmtM(v)}</div>
   <div class="sub" style="margin-top:6px">${t('pickClubs')}</div>
   <div class="negbox"><b>${t('askFee')}: <span style="color:var(--acc)" id="feeV">${fmtM(v)}</span></b>
     <input type="range" min="${Math.round(v*7)}" max="${Math.round(v*18)}" value="${Math.round(v*10)}" id="feeR"
       oninput="document.getElementById('feeV').textContent=fmtM(this.value/10)">
     <div class="sub" style="margin-top:10px">${t('commission')}: %10</div>
   </div>
   <div class="sect">${t('clauses')}</div>
   <div class="fgrid" style="margin-bottom:4px">
     <label class="fitem"><span>${t('payPlan')}</span>
       <select class="fsel" id="trPay">
         <option value="1">${t('payCash')}</option>
         <option value="2">${t('pay2')}</option>
         <option value="4">${t('pay4')}</option>
       </select></label>
     <label class="fitem"><span>${t('goalBonusL')}</span>
       <select class="fsel" id="trGb">
         <option value="0">${t('none')}</option>
         <option value="1">${t('gbOpt')}</option>
       </select></label>
     <label class="fitem" style="grid-column:1/-1"><span>${t('nextSaleL')}</span>
       <select class="fsel" id="trSo">
         <option value="0">${t('none')}</option>
         <option value="15">${t('soOpt')}</option>
       </select></label>
   </div>
   <div class="sub" style="margin-bottom:10px">${t('clauseHint')}</div>
   <div class="sect">${t('interested')}</div>
   <div class="list">
   ${buyers.map(b=>`<div class="pitem" onclick="trToggle(${b.id})">
     ${tmBadge(b,36)}
     <div class="pinfo"><div class="pname">${b.n}</div><div class="psub">${LEAGUES[b.lg].n} · #${teamPos(b.id)} · ${t('wage')} ~${fmtK(Math.round(marketWage(p.r)*(0.9+b.bud*0.3)))}/${t('wk')}</div></div>
     <span class="trk" id="trk${b.id}"></span></div>`).join('')}
   </div>
   <button class="btn p" id="trBtn" disabled onclick="submitOffers(${pid})">${t('sendOffers')}</button>`);
}
function trToggle(tid){
  if(trSel.has(tid))trSel.delete(tid);else trSel.add(tid);
  const el=document.getElementById('trk'+tid);
  if(el){el.className='trk'+(trSel.has(tid)?' on':'');el.textContent=trSel.has(tid)?'✓':'';}
  const btn=document.getElementById('trBtn');
  if(btn){btn.disabled=trSel.size===0;btn.textContent=t('sendOffers')+(trSel.size?' ('+trSel.size+')':'');}
}
function submitOffers(pid){
  if(!trSel.size)return;
  if(offerFor(pid)||pendingFor(pid)){toast(t('offerPending'));return;}
  const fee=+document.getElementById('feeR').value/10;
  const pay=+((document.getElementById('trPay')||{}).value||1);
  const gb=+((document.getElementById('trGb')||{}).value||0);
  const so=+((document.getElementById('trSo')||{}).value||0);
  S.offers=S.offers||[];
  trSel.forEach(tid=>S.offers.push({pid,tid,fee,pay,gb,so,at:(S.tw||0)+R(1,3)}));
  trSel=new Set();
  toast(t('offerSent'));
  closeModal();save();render();
}
function doTransfer(p,b,fee,quiet,terms){
  terms=terms||{};
  const oldTm=teamOf(p),old=oldTm.n;
  /* önceki anlaşmadan "sonraki satıştan pay" varsa şimdi öde */
  if(p.so&&p.so.pct){
    const s=Math.max(1,Math.round(fee*1000*p.so.pct/100*0.10));
    S.cash+=s;
    pushNews('soPaid',{n:p.n,pid:p.id,f:fmtK(s)},'good');
    p.so=null;
  }
  p.hist=p.hist||[];
  p.hist.push({se:S.season,a:old,b:b.n,f:fee});
  if(p.hist.length>6)p.hist.shift();
  p.team=b.id;p.wage=Math.max(1,Math.round(Math.max(p.wage*1.15,marketWage(p.r)*(0.85+b.bud*0.25))));
  p.yrs=R(2,4);p.morale=clamp(Math.max(p.morale+30,70),0,100);p.ignored=0;p.hm=(S.tw||0)+8;p.form=clamp(p.form+5,0,100);
  const cut=Math.max(1,Math.round(fee*100));
  const repGain=Math.round(2+Math.max(0,(b.str-oldTm.str)/4));
  /* ödeme planı: komisyon taksitle gelir */
  const plan=terms.pay||1;
  if(plan===1)S.cash+=cut;
  else{
    const part=Math.max(1,Math.round(cut/plan));
    S.cash+=part;
    S.pendPay=S.pendPay||[];
    for(let k=1;k<plan;k++)S.pendPay.push({amt:part,at:(S.tw||0)+k*10,n:p.n});
  }
  /* gol bonusu anlaşması: yeni kulübünde 10+ gol → pay */
  if(terms.gb)(S.deals=S.deals||[]).push({pid:p.id,tid:b.id,amt:Math.round(marketValue(p.r)*1000*0.15),se:S.season});
  /* sonraki satıştan pay klozu */
  if(terms.so)p.so={pct:terms.so};
  S.rep=clamp(S.rep+repGain,0,100);
  pushNews('transfer',{n:p.n,pid:p.id,a:old,aid:oldTm.id,b:b.n,bid:b.id,f:fmtM(fee),k:fmtK(cut)},'good');
  if(!quiet){toast(t('transferDone'));closeModal();save();render();}
}
/* ================= PITCH / CLIENTS ================= */
/* ===== representation meeting: talk your way in ===== */
const REACT={
 good:{tr:['"Bunu duymak güzel."','"İşte bunu bekliyordum."','"Ciddi olduğunu görebiliyorum."','"Devam et, dinliyorum..."'],
       en:['"Good to hear that."','"That\'s what I was waiting for."','"I can see you\'re serious."','"Go on, I\'m listening..."']},
 mid: {tr:['"Hmm... olabilir."','"Dinliyorum."','"Bakalım."'],
       en:['"Hmm... maybe."','"I\'m listening."','"We\'ll see."']},
 bad: {tr:['"Bana masal anlatma."','"Bunu her menajer söylüyor."','"Pek inandırıcı değil."'],
       en:['"Don\'t tell me fairy tales."','"Every agent says that."','"Not very convincing."']}
};
const LINES=[
 {tr:'“Seni oynayacağın, gelişeceğin kulüplere taşıyacağım — kulübede çürümek yok.”',
  en:'“I\'ll move you to clubs where you actually play and grow — no rotting on the bench.”',
  eff:c=>c.young?10:c.veteran?-6:3},
 {tr:'“Kulübünde mutsuzsun, görüyorum. Sana hemen yeni bir takım bulurum.”',
  en:'“I can see you\'re unhappy here. I\'ll find you a new club right away.”',
  eff:c=>c.unhappy?12:c.ambitious?7:c.content?-8:-2},
 {tr:'“Maaşını hak ettiğin seviyeye ben çekerim — masada kimse beni geçemez.”',
  en:'“I\'ll get your wage to the level you deserve — nobody out-negotiates me.”',
  eff:c=>c.lowWage?10:c.veteran?4:-1},
 {tr:'“Portföyüm küçük ama her müşterimle birebir ilgilenirim. Sen numara olmazsın.”',
  en:'“My roster is small, but every client gets my full attention. You won\'t be a number.”',
  eff:c=>(S.rep<30?8:4)+(c.content?2:0)},
 {tr:'“Kariyerini uzun vadeli planlarız — acele kararlarla geleceğini yakmayız.”',
  en:'“We\'ll plan your career long-term — no rushed moves that burn your future.”',
  eff:c=>c.unhappy?-7:c.veteran?9:c.content?6:1},
 {tr:'“Büyük kulüplerle bağlantılarım var — doğru kapıları açarım.”',
  en:'“I have connections at the big clubs — I open the right doors.”',
  eff:c=>S.rep>=45?(c.ambitious?11:5):-9},
 {tr:'“Komisyonum düşüktür — kazandığın senin cebinde kalır.”',
  en:'“My commission is low — what you earn stays in your pocket.”',
  eff:c=>c.lowWage?6:c.veteran?5:2},
 {tr:'“Seni haftalardır izliyorum — sahadaki gelişimin gerçekten etkileyici.”',
  en:'“I\'ve been watching you for weeks — your progress on the pitch is impressive.”',
  eff:c=>(c.form>65?7:2)+(c.ambitious?2:0)},
 {tr:'“Acele etme. Ailenle konuş, kararını içine sinerek ver.”',
  en:'“Take your time. Talk to your family, decide when it feels right.”',
  eff:c=>c.unhappy?-6:c.content?8:c.veteran?5:1}
];
function meetCtxOf(p){
  return {young:p.age<=21&&p.pot-p.r>=8, unhappy:p.morale<40,
    lowWage:p.wage<marketWage(p.r)*0.75, veteran:p.age>=30,
    ambitious:p.r>teamStr(p.team)+5, form:p.form,
    content:!(p.morale<40)&&!(p.wage<marketWage(p.r)*0.75)};
}
function meetHint(c){
  return c.unhappy?t('mcUnhappy'):c.ambitious?t('mcAmb'):c.lowWage?t('mcWage'):
         c.young?t('mcYoung'):c.veteran?t('mcVet'):t('mcCont');
}
let MT=null;
function openMeeting(pid){
  const p=byId(pid);
  if(!knownLg(teamOf(p).lg)){toast(t('scoutLock'));return;}
  if(profileOf(p)>repCap()){toast(t('repLock')+' ('+t('rep')+' '+repNeedFor(profileOf(p))+'+)');return;}
  if(S.clients.length>=maxClients()){toast(t('full'));return;}
  if(pitchCd(p)>0){toast(t('rejectedCd'));return;}
  if(S.cash<pitchCost(p)){toast(t('noCash'));return;}
  const order=LINES.map((_,i)=>i).sort(()=>RF()-0.5);
  MT={pid,ctx:meetCtxOf(p),chance:Math.round(pitchChance(p)*100),round:0,order,react:null};
  renderMeeting();
}
function pickLine(li){
  if(!MT||MT.round>=3)return;
  const d=LINES[li].eff(MT.ctx)+R(-2,2);
  MT.chance=clamp(MT.chance+d,5,92);
  const pool=d>=6?REACT.good:d<=-4?REACT.bad:REACT.mid;
  const arr=pool[L];
  MT.react={txt:arr[R(0,arr.length-1)],d};
  MT.round++;
  renderMeeting();
}
function renderMeeting(){
  const p=byId(MT.pid),tm=teamOf(p);
  const col=MT.chance>60?'var(--acc)':MT.chance>35?'var(--warn)':'var(--bad)';
  const opts=MT.round<3?MT.order.slice(MT.round*3,MT.round*3+3):[];
  openModal(`
   <div class="row">${tmBadge(tm,42)}
     <div style="flex:1;min-width:0"><h2>${t('meeting')}</h2>
     <div class="sub">${p.n} · ${tm.n}</div></div>
     <div class="rt ${rtClass(p.r)}">${p.r}</div></div>
   <div class="dctx" style="margin-top:12px">${ICONS?ICONS.alert:''}<span>${meetHint(MT.ctx)}</span></div>
   <div class="negbox" style="margin-top:10px">
     <div class="row" style="justify-content:space-between;font-size:11px">
       <span class="sub" style="font-weight:800;text-transform:uppercase;letter-spacing:.06em">${t('chance')}</span>
       <b class="num" style="color:${col};font-size:15px">%${MT.chance}</b></div>
     <div class="moodbar"><div style="width:${MT.chance}%;background:${col}"></div></div>
     ${MT.react?`<div class="dquote ${MT.react.d>=6?'good':MT.react.d<=-4?'bad':'mid'}">${MT.react.txt}
       <span class="faint" style="font-style:normal;font-weight:800"> ${MT.react.d>0?'+':''}${MT.react.d}%</span></div>`:''}
   </div>
   ${opts.length?`<div class="sect">${t('round')} ${MT.round+1}/3 · ${t('meetPick')}</div>
     ${opts.map(li=>`<button class="dchoice" onclick="pickLine(${li})">${LINES[li][L]}</button>`).join('')}`
   :`<button class="btn p" onclick="finishMeeting()">${t('finalBtn')} · %${MT.chance} · ${fmtK(pitchCost(p))}</button>`}
   <button class="btn s" style="margin-top:8px" onclick="leaveMeeting()">${t('walkAway')}</button>`);
}
function finishMeeting(){
  if(!MT)return;
  const p=byId(MT.pid);
  if(RF()<MT.chance/100){
    S.cash-=pitchCost(p);
    MT=null;
    signClient(p);
    closeModal();
  } else {
    p.cd=(S.tw||0)+4;
    MT=null;
    toast(t('pitchNo'));closeModal();save();render();
  }
}
function leaveMeeting(){
  if(MT){
    const p=byId(MT.pid);
    if(MT.round>0)p.cd=(S.tw||0)+2; // walked out mid-talk — brief awkwardness
    MT=null;
  }
  closeModal();save();render();
}
function pitchCost(p){return 10+Math.round(Math.max(0,p.r-65)*2);}
function pitchChance(p){return clamp(0.55+S.rep/100-(profileOf(p)-62)*0.022,0.08,0.95);}
function pitchCd(p){return Math.max(0,(p.cd||0)-(S.tw||0));}
function pitchPlayer(pid){openMeeting(pid);} // pitching now happens through a real conversation
function signClient(p){
  p.agent='you';p.ignored=0;
  if(!S.clients.includes(p.id))S.clients.push(p.id);
  S.rep=clamp(S.rep+1,0,100);
  pushNews('sign',{n:p.n,pid:p.id},'good');
  toast(t('pitchOk'));save();render();
}
function releaseClient(pid){
  const p=byId(pid);
  p.agent=null;S.clients=S.clients.filter(c=>c!==pid);
  S.rep=clamp(S.rep-1,0,100);
  save();render();
}
function inboxAction(i,yes){
  const m=S.inbox[i];if(!m||!m.action)return;
  const p=byId(m.action.pid);
  if(yes){
    if(m.action.type==='sign'){
      if(S.clients.length>=maxClients()){toast(t('full'));return;}
      signClient(p);
    } else if(m.action.type==='bid'){
      if(offerFor(p.id)||pendingFor(p.id)){toast(t('offerPending'));return;}
      const b=S.teams[m.action.tid];
      if(windowOpen())doTransfer(p,b,m.action.fee);
      else{
        S.pending=S.pending||[];
        S.pending.push({pid:p.id,tid:b.id,fee:m.action.fee});
        pushNews('agreedWait',{c:b.n,tid:b.id,n:p.n,pid:p.id,f:fmtM(m.action.fee),w:nextWindowLabel()},'good');
        p.morale=clamp(p.morale+10,0,100);p.ignored=0;
      }
    }
  }
  m.action=null;m.read=true;save();render();
}
