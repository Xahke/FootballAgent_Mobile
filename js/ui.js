'use strict';
/* js/ui.js — tüm görünümler, render, navigasyon, modallar */
/* ================= NAVIGATION ================= */
function cur(){return stack[stack.length-1];}
function navTo(v){stack=[{v}];render();}
function pushV(v,id){stack.push({v,id});render();}
function back(){if(stack.length>1){stack.pop();render();}}
/* ================= UI HELPERS ================= */
function toast(msg){
  const el=document.getElementById('toast');
  el.textContent=msg;el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'),2200);
}
function openModal(html){
  document.getElementById('sheet').innerHTML='<div class="handle"></div>'+html;
  document.getElementById('modal').classList.add('open');
}
function closeModal(){document.getElementById('modal').classList.remove('open');}
function moodColor(m){return m>65?'var(--acc)':m>40?'var(--warn)':'var(--bad)';}
function rtClass(r){return r>=78?'g':r>=68?'y':'o';}
function bar(label,val){
  return `<div class="attr"><div class="arow"><span class="sub">${label}</span><b style="color:${moodColor(val)}">${val}</b></div>
  <div class="abar"><div style="width:${val}%;background:${moodColor(val)}"></div></div></div>`;
}
function playerRow(p,opts){
  opts=opts||{};
  const tm=teamOf(p);
  const extra=p.agent===null
    ?(!knownLg(teamOf(p).lg)
      ?` · <span style="color:var(--txt3)">${t('scoutLockShort')}</span>`
      :profileOf(p)>repCap()
      ?` · <span style="color:var(--txt3)">${t('rep')} ${repNeedFor(profileOf(p))}+</span>`
      :pitchCd(p)>0
      ?` · <span style="color:var(--txt3)">${pitchCd(p)} ${t('wk')}</span>`
      :` · <span style="color:var(--acc)">%${Math.round(pitchChance(p)*100)}</span>`)
    :'';
  const potTag=(p.age<=23&&p.pot-p.r>=8)?` · <span style="color:var(--blue)">${t('pot')} ${p.pot}</span>`:'';
  const lgTag=opts.lg?`${LEAGUES[tm.lg].c} · `:'';
  return `<div class="pitem" onclick="pushV('player',${p.id})">
    ${opts.noBadge?'':tmBadge(tm,34)}
    <div class="pinfo"><div class="pname">${p.n}${p.agent==='you'?' <span class="star">★</span>':''}
      <span class="natc">${NATS[p.nat].c}</span></div>
    <div class="psub">${lgTag}${POSL[L][p.pos]} · ${p.age} · ${fmtK(p.wage)}/${t('wk')} · ${p.yrs} ${t('yrs')}${potTag}${extra}</div></div>
    <div class="mood" style="background:${moodColor(p.morale)}"></div>
    <div class="rt ${rtClass(p.r)}">${p.r}</div></div>`;
}
function listWrap(html){return `<div class="list">${html}</div>`;}
function msgHtml(m){
  const i=S.inbox.indexOf(m);
  const txt=NEWS[L][m.key]?NEWS[L][m.key](m.params):t(m.key);
  return `<div class="msg ${m.type}">
    <div class="mw">${t('season')} ${m.se} · ${t('week')} ${m.w}</div>
    <div class="mt">${txt}</div>
    ${m.action?`<div class="mrow">
      <button class="btn p" onclick="inboxAction(${i},true)">${t('accept')}</button>
      <button class="btn s" onclick="inboxAction(${i},false)">${t('decline')}</button>
      ${m.action.pid?`<button class="btn s" style="flex:0 0 auto;width:auto;padding:9px 14px" onclick="pushV('player',${m.action.pid})">${t('viewProfile')}</button>`:''}
    </div>`:''}
  </div>`;
}
function weekFixHtml(lg,wk){
  const l2=LEAGUES[lg],len=S.fx[lg].length;
  if(l2.grp&&wk===len){
    /* the final page */
    const f=(S.finals||{})[lg];
    let h,a,sc;
    if(f&&f.se===S.season){h=S.teams[f.h];a=S.teams[f.a];sc=f.hg+' : '+f.ag;}
    else{h=groupTable(lg,0)[0];a=groupTable(lg,1)[0];sc='–';}
    return `<div class="sect" style="text-align:center;margin-bottom:4px">${t('finalLbl')}</div>
    <div class="matchrow">
      <span class="tn r" onclick="pushV('team',${h.id})">${h.n}</span>
      ${tmBadge(h,20)}
      <span class="sc ${sc==='–'?'f':''}">${sc}</span>
      ${tmBadge(a,20)}
      <span class="tn" onclick="pushV('team',${a.id})">${a.n}</span></div>`;
  }
  if(wk<0||wk>=S.fx[lg].length)return `<div class="sub">${t('seasonEnd')}</div>`;
  return S.fx[lg][wk].map(m=>{
    const h=S.teams[m.h],a=S.teams[m.a];
    return `<div class="matchrow">
    <span class="tn r" onclick="pushV('team',${h.id})">${h.n}</span>
    ${tmBadge(h,20)}
    <span class="sc ${m.hg===null?'f':''}">${m.hg===null?'–':m.hg+' : '+m.ag}</span>
    ${tmBadge(a,20)}
    <span class="tn" onclick="pushV('team',${a.id})">${a.n}</span></div>`;
  }).join('');
}
function lgChips(sel,cb,withAll){
  let html='<div class="chips">';
  if(withAll)html+=`<button class="${sel==='all'?'on':''}" onclick="${cb}('all')">${t('all')}</button>`;
  LEAGUES.forEach((lg,i)=>{html+=`<button class="${sel===i?'on':''}" onclick="${cb}(${i})">${lg.n}</button>`;});
  return html+'</div>';
}
function setCurLg(i){S.curLg=i;S.curCtry=LEAGUES[i].ctry;S.curCon=LEAGUES[i].con;render();}
function setCon(c){
  S.curCon=c;
  if(c!=='cup'){
    const first=LEAGUES.findIndex(lg=>lg.con===c);
    S.curLg=first;S.curCtry=LEAGUES[first].ctry;
  }
  render();
}
function setCup(i){S.curCup=i;render();}
function setCtry(c){
  S.curCtry=c;
  S.curLg=LEAGUES.findIndex(lg=>lg.ctry===c);render();
}
function setMLg(i){S.mLg=i;render();}
function setF(k,v){S.f=S.f||{lg:'all',pos:'all',age:'all',sort:'r',elig:true};S.f[k]=v;save();render();}
/* ================= VIEWS ================= */
function cupView(){
  const conChips=`<div class="chips">${CONTS.map(([cc,nm])=>
    `<button class="${(S.curCon||'eu')===cc?'on':''}" onclick="setCon('${cc}')">${nm[L]}</button>`).join('')}</div>`;
  const ci=S.curCup||0;
  const cupChips=`<div class="chips">${CUPS.map((cp,i)=>
    `<button class="${ci===i?'on':''}" onclick="setCup(${i})">${cp.n[L]}</button>`).join('')}
    <button class="${ci===3?'on':''}" onclick="setCup(3)">${t('wcLbl')}</button></div>`;
  const RL=[t('r16'),t('qf'),t('sf'),t('finalLbl')];
  let body='';
  if(ci<3){
    const cp=(S.cups||[])[ci];
    if(!cp){body=`<div class="card"><div class="empty">${t('noCupYet')}</div></div>`;}
    else{
      body=cp.rounds.map((rd,ri)=>`<div class="card">
        <div class="sect">${RL[ri]} · ${t('week')} ${CUPWKS[ri]}</div>
        ${rd.map(m=>{
          const h=S.teams[m.h],a=S.teams[m.a];
          return `<div class="matchrow">
            <span class="tn r" onclick="pushV('team',${h.id})">${h.n}</span>
            ${tmBadge(h,20)}
            <span class="sc ${m.hg===null?'f':''}">${m.hg===null?'–':m.hg+' : '+m.ag}</span>
            ${tmBadge(a,20)}
            <span class="tn" onclick="pushV('team',${a.id})">${a.n}</span></div>`;
        }).join('')}</div>`).join('');
      const hist=(S.cupHist||{})[cp.c]||[];
      if(hist.length)body+=`<div class="card"><div class="sect">${t('history')}</div>
        ${hist.slice().reverse().map(x=>`<div class="kv"><span class="k">S${x.se}</span>
        <span class="v" style="cursor:pointer" onclick="pushV('team',${x.tid})">${S.teams[x.tid].n}</span></div>`).join('')}</div>`;
    }
  } else {
    /* World Cup */
    if(!S.wc){
      const next=Math.ceil(S.season/4)*4;
      body=`<div class="card"><div class="empty">${t('noCupYet')}<br>${t('nextWc')}: ${t('season')} ${next}</div></div>`;
    } else {
      const wcRL=S.wc.rounds.length===4?RL:RL.slice(4-S.wc.rounds.length);
      body=`<div class="card"><div class="sect">${t('wcLbl')} · ${t('season')} ${S.wc.se}</div>
        <div class="row" style="margin-bottom:8px"><span class="tag g">${t('champion')}: ${NATS[S.wc.champ].c}</span></div></div>`
      +S.wc.rounds.map((rd,ri)=>`<div class="card">
        <div class="sect">${wcRL[ri]}</div>
        ${rd.map(m=>`<div class="matchrow">
          <span class="tn r"><b>${NATS[m.h].c}</b></span>
          <span class="sc">${m.hg} : ${m.ag}</span>
          <span class="tn"><b>${NATS[m.a].c}</b></span></div>`).join('')}</div>`).join('');
      const next=S.wc.se+4;
      body+=`<div class="card"><div class="sub">${t('nextWc')}: ${t('season')} ${next}</div></div>`;
      if((S.wcHist||[]).length>1)body+=`<div class="card"><div class="sect">${t('history')}</div>
        ${S.wcHist.slice().reverse().map(x=>`<div class="kv"><span class="k">S${x.se}</span><span class="v">${NATS[x.nat].c}</span></div>`).join('')}</div>`;
    }
  }
  return `${conChips}${cupChips}${body}`;
}
const VIEWS={
dash(){
  const inc=weeklyIncome();
  /* agenda: everything that needs my attention */
  const items=[];
  S.clients.map(byId).forEach(p=>{
    const pen=pendingFor(p.id),offs=(S.offers||[]).filter(x=>x.pid===p.id);
    let st=null,col='var(--warn)';
    if(pen){st=t('pendingTag')+': '+S.teams[pen.tid].n+' · '+nextWindowLabel();col='var(--acc)';}
    else if(offs.length){st=t('considering')+': '+offs.map(o=>S.teams[o.tid].n).join(', ');col='var(--blue)';}
    else if(p.morale<40){st=p.wage<marketWage(p.r)*0.8?t('wantsNew'):t('wantsOut');col='var(--bad)';}
    else if(p.yrs<=1)st=t('expiring');
    else if(p.r>teamStr(p.team)+6)st=t('outgrown');
    if(st)items.push({p,st,col});
  });
  /* my clients' matches this week */
  const cms=[];
  S.clients.map(byId).forEach(p=>{
    const tm=teamOf(p);
    const len=lgWeeks(tm.lg);
    const wkL=Math.min(S.week-1,len-1);
    const nx=S.week-1<len?(S.fx[tm.lg][wkL]||[]).find(x=>x.h===tm.id||x.a===tm.id):null;
    let last=null;
    const li=Math.min(S.week-1,len)-1;
    if(li>=0)last=(S.fx[tm.lg][li]||[]).find(x=>(x.h===tm.id||x.a===tm.id)&&x.hg!==null);
    cms.push({p,tm,nx,last});
  });
  const agendaHtml=items.length
    ?listWrap(items.map(x=>`<div class="pitem" onclick="pushV('player',${x.p.id})">
       ${tmBadge(teamOf(x.p),34)}
       <div class="pinfo"><div class="pname">${x.p.n}</div>
       <div class="psub" style="color:${x.col};font-weight:600">${x.st}</div></div>
       <span class="faint">›</span></div>`).join(''))
    :(S.clients.length?`<div class="card"><div class="sub">${t('allGood')}</div></div>`:'');
  const cmHtml=cms.length?listWrap(cms.map(x=>{
    const lastStr=x.last?(()=>{
      const mine=x.last.h===x.tm.id?x.last.hg:x.last.ag, opp=x.last.h===x.tm.id?x.last.ag:x.last.hg;
      const oppTm=S.teams[x.last.h===x.tm.id?x.last.a:x.last.h];
      const col=mine>opp?'var(--acc)':mine<opp?'var(--bad)':'var(--warn)';
      return `${t('lastM')}: <b style="color:${col}">${mine}-${opp}</b> ${oppTm.n}`;
    })():'';
    const nextStr=x.nx?`${t('nextM')}: ${S.teams[x.nx.h===x.tm.id?x.nx.a:x.nx.h].n}`:'';
    return `<div class="pitem" onclick="pushV('player',${x.p.id})">
      ${tmBadge(x.tm,34)}
      <div class="pinfo"><div class="pname">${x.p.n} <span class="faint" style="font-weight:400">· ${x.tm.n}</span></div>
      <div class="psub">${[lastStr,nextStr].filter(Boolean).join(' · ')}</div></div>
      <div class="rt ${rtClass(x.p.r)}">${x.p.r}</div></div>`;
  }).join('')):'';
  return `
  <div class="card"><div class="sect">${S.agent?S.agent.agency+' · '+S.agent.fn+' '+S.agent.ln+' ('+NATNAME[S.agent.nat][L]+')':t('agency')}</div>
    <div class="grid3">
      <div class="stat"><div class="v" style="color:var(--acc)">${fmtK(inc)}</div><div class="l">${t('weeklyIncome')}</div></div>
      <div class="stat"><div class="v">${S.clients.length}<span class="faint">/${maxClients()}</span></div><div class="l">${t('clientCount')}</div></div>
      <div class="stat"><div class="v">${S.rep}</div><div class="l">${t('rep')}</div></div>
    </div>
    <div class="divider" style="margin:12px 0 10px"></div>
    <div class="row" style="font-size:12px">
      <span style="width:8px;height:8px;border-radius:50%;background:${windowOpen()?'var(--acc)':'var(--txt3)'};flex-shrink:0"></span>
      <span class="${windowOpen()?'':'sub'}" style="font-weight:600">${windowOpen()?t('twOpen'):t('twClosed')}</span>
      ${windowOpen()?'':`<span class="faint">· ${t('twNext')}: ${nextWindowLabel()}</span>`}
    </div></div>
  ${(()=>{
    const fresh=S.inbox.filter(m=>m.action||!m.read).slice(0,4);
    if(!fresh.length)return '';
    return `<div class="sect" style="margin:0 2px 8px">${t('notifs')}
      <span style="background:var(--bad);color:#fff;border-radius:8px;padding:1px 7px;font-size:9.5px;margin-left:4px">${S.inbox.filter(m=>!m.read).length}</span></div>
      ${fresh.map(m=>msgHtml(m)).join('')}
      <button class="btn s" style="margin-bottom:14px" onclick="navTo('inbox')">${t('allNotifs')}</button>`;
  })()}
  ${S.clients.length?`<div class="sect" style="margin:0 2px 8px">${t('agenda')}</div>${agendaHtml}`:
    `<div class="card"><div class="empty">${t('noClients')}</div></div>`}
  ${cms.length?`<div class="sect" style="margin:0 2px 8px">${t('myMatches')}</div>${cmHtml}`:''}
  <button class="btn s" onclick="if(confirm(t('resetQ'))){localStorage.removeItem('menajerSaveV8');location.reload()}">${t('reset')}</button>`;
},
clients(){
  const ps=S.clients.map(byId).sort((a,b)=>b.r-a.r);
  return `<h2 class="sec">${t('clients')} <span class="sub" style="font-weight:400">${ps.length}/${maxClients()}</span></h2>
   ${ps.length?listWrap(ps.map(p=>playerRow(p,{lg:1})).join('')):`<div class="card"><div class="empty">${t('noClients')}</div></div>`}`;
},
market(){
  S.f=S.f||{lg:'all',pos:'all',age:'all',sort:'r',elig:true};
  const f=S.f;
  let free=S.players.filter(p=>p.agent===null&&knownLg(teamOf(p).lg));
  if(f.elig)free=free.filter(p=>profileOf(p)<=repCap());
  if(f.lg!=='all')free=free.filter(p=>teamOf(p).lg===+f.lg);
  if(f.pos!=='all')free=free.filter(p=>p.pos===f.pos);
  if(f.age==='u18')free=free.filter(p=>p.age<=18);
  else if(f.age==='u21')free=free.filter(p=>p.age<=21);
  else if(f.age==='u24')free=free.filter(p=>p.age<=24);
  else if(f.age==='o25')free=free.filter(p=>p.age>=25);
  const sorts={r:(a,b)=>b.r-a.r,pot:(a,b)=>b.pot-a.pot||b.r-a.r,age:(a,b)=>a.age-b.age||b.pot-a.pot,ch:(a,b)=>pitchChance(b)-pitchChance(a)||b.r-a.r};
  free.sort(sorts[f.sort]||sorts.r);
  const total=free.length;
  free=free.slice(0,50);
  const sel=(k,opts)=>`<label class="fitem"><span>${t(k==='lg'?'league':k==='pos'?'posF':k==='age'?'ageF':'sortF')}</span>
    <select class="fsel" onchange="setF('${k}',this.value)">${opts.map(([v,lbl])=>
    `<option value="${v}" ${String(f[k])===String(v)?'selected':''}>${lbl}</option>`).join('')}</select></label>`;
  const lgSel=`<label class="fitem"><span>${t('league')}</span>
    <select class="fsel" onchange="setF('lg',this.value)">
    <option value="all" ${f.lg==='all'?'selected':''}>${t('all')}</option>
    ${Object.keys(CTRYS).map(cc=>{
      const opts=LEAGUES.map((lg,i)=>lg.ctry===cc&&knownLg(i)?
        `<option value="${i}" ${String(f.lg)===String(i)?'selected':''}>${lg.n}</option>`:'').join('');
      return opts?`<optgroup label="${CTRYS[cc][L]}">${opts}</optgroup>`:'';
    }).join('')}
    </select></label>`;
  return `<h2 class="sec">${t('freeAgents')}</h2>
   <div class="sub" style="margin-bottom:12px">${t('marketHint')}</div>
   <button class="btn b" style="margin-bottom:12px" onclick="openScout()">${t('scoutNet')} · ${S.known.length}/${LEAGUES.length} ${t('knownLbl')}</button>
   <div class="fgrid">
     ${lgSel}
     ${sel('pos',[['all',t('all')],['KL',POSFULL[L].KL],['DF',POSFULL[L].DF],['OS',POSFULL[L].OS],['FV',POSFULL[L].FV]])}
     ${sel('age',[['all',t('all')],['u18','≤ 18'],['u21','≤ 21'],['u24','≤ 24'],['o25','25+']])}
     ${sel('sort',[['r',t('sortR')],['pot',t('sortPot')],['age',t('sortAge')],['ch',t('sortCh')]])}
   </div>
   <button class="ftoggle ${f.elig?'on':''}" onclick="setF('elig',${!f.elig})">
     <span class="sw"></span>${t('onlyElig')}<span class="spacer"></span><span class="faint">${total} ${t('found')}</span>
   </button>
   ${free.length?listWrap(free.map(p=>playerRow(p,{lg:1})).join('')):`<div class="card"><div class="empty">—</div></div>`}`;
},
league(){
  if((S.curCon||'eu')==='cup')return cupView();
  const lg=S.curLg;
  const tab=S.ltab||'table';
  /* season browser */
  S.arch=S.arch||LEAGUES.map(()=>[]);
  const archL=S.arch[lg]||[];
  const live=S.season;
  const minSe=archL.length?archL[0].se:live;
  let vSe=S.vSe===undefined?live:S.vSe;
  vSe=Math.max(minSe,Math.min(live,vSe));
  const isLive=vSe===live;
  const aEntry=isLive?null:archL.find(x=>x.se===vSe);
  const selRow=(tab==='table'||tab==='scorers'||tab==='assists')?
   `<div class="card tight" style="margin-bottom:12px"><div class="row" style="justify-content:space-between;padding:5px 0">
     <button class="btn s" style="width:42px;padding:7px" ${vSe<=minSe?'disabled':''} onclick="S.vSe=${vSe-1};render()">‹</button>
     <b style="font-variant-numeric:tabular-nums">${t('season')} ${vSe} <span class="faint" style="font-weight:400">· ${isLive?t('liveLbl'):t('archLbl')}</span></b>
     <button class="btn s" style="width:42px;padding:7px" ${vSe>=live?'disabled':''} onclick="S.vSe=${vSe+1};render()">›</button>
   </div></div>`:'';
  let body='';
  if(tab==='table'){
    const myTeams=new Set(S.clients.map(id=>byId(id).team));
    const l2=LEAGUES[lg];
    const glbl=g=>l2.gl?l2.gl[g][L==='tr'?0:1]:null;
    const toRows=tbl=>tbl.map(tm=>[tm.id,tm.pts,tm.w,tm.d,tm.l,tm.gf,tm.ga]);
    const rowsHtml=(rows,grouped)=>`<table>
    <tr><th></th><th>${t('team')}</th><th class="c">${t('P')}</th><th class="c">${t('W')}</th><th class="c">${t('D')}</th><th class="c">${t('L')}</th><th class="c">${t('GD')}</th><th class="c">${t('PTS')}</th></tr>
    ${rows.map((r,i)=>{
      const tm=S.teams[r[0]];
      const z=grouped?(i===0?'zone1':''):(i===0?'zone1':i<4?'zone2':i>=rows.length-3?'zoneR':'');
      return `<tr class="click ${myTeams.has(tm.id)?'hl':''}" onclick="pushV('team',${tm.id})">
      <td><span class="posn ${z}">${i+1}</span></td>
      <td><div class="row" style="gap:8px">${tmBadge(tm,22)}<b>${tm.n}</b></div></td>
      <td class="c">${r[2]+r[3]+r[4]}</td><td class="c">${r[2]}</td><td class="c">${r[3]}</td><td class="c">${r[4]}</td>
      <td class="c">${r[5]-r[6]}</td><td class="c"><b>${r[1]}</b></td></tr>`;}).join('')}</table>`;
    let parts=null;
    if(isLive){
      parts=l2.grp?[[glbl(0),toRows(groupTable(lg,0))],[glbl(1),toRows(groupTable(lg,1))]]
                  :[[null,toRows(leagueTable(lg))]];
    } else if(aEntry){
      parts=aEntry.tabs?[[glbl(0),aEntry.tabs[0]],[glbl(1),aEntry.tabs[1]]]:[[null,aEntry.tab]];
    }
    /* final result banner for grouped leagues */
    let finHtml='';
    if(l2.grp){
      let f=null;
      if(isLive){const ff=(S.finals||{})[lg];if(ff&&ff.se===S.season)f=ff;}
      else if(aEntry&&aEntry.fin)f={h:aEntry.fin[0],a:aEntry.fin[1],hg:aEntry.fin[2],ag:aEntry.fin[3]};
      if(f){
        const th=S.teams[f.h],ta=S.teams[f.a];
        finHtml=`<div class="card"><div class="sect">${t('finalLbl')}</div>
        <div class="matchrow" style="border:none;padding:2px 0">
          <span class="tn r" onclick="pushV('team',${th.id})">${th.n}</span>
          ${tmBadge(th,20)}<span class="sc">${f.hg} : ${f.ag}</span>${tmBadge(ta,20)}
          <span class="tn" onclick="pushV('team',${ta.id})">${ta.n}</span></div></div>`;
      }
    }
    body=parts?finHtml+parts.map(([lbl,rows])=>`<div class="card tight">
      ${lbl?`<div class="sect" style="margin:12px 0 0">${lbl}</div>`:''}${rowsHtml(rows,!!lbl)}</div>`).join('')
      :`<div class="card"><div class="empty">${t('notArch')}</div></div>`;
  } else if(tab==='fix'){
    const len=lgWeeks(lg);
    const lim=len-1+(LEAGUES[lg].grp?1:0); // grouped leagues get an extra "Final" page
    const wk=Math.min(S.fxWeek!==undefined?S.fxWeek:Math.min(S.week-1,lim),lim);
    const lbl=wk<len?`${t('week')} ${wk+1}<span class="faint">/${len}</span>`:t('finalLbl');
    body=`<div class="card"><div class="row" style="justify-content:space-between;margin-bottom:10px">
      <button class="btn s" style="width:42px;padding:7px" onclick="S.fxWeek=${Math.max(0,wk-1)};render()">‹</button>
      <b style="font-variant-numeric:tabular-nums">${lbl}</b>
      <button class="btn s" style="width:42px;padding:7px" onclick="S.fxWeek=${Math.min(lim,wk+1)};render()">›</button></div>
      ${weekFixHtml(lg,wk)}</div>`;
  } else if(tab==='hist'){
    const h=((S.lgHist||[])[lg]||[]).slice().reverse();
    if(!h.length)body=`<div class="card"><div class="empty">${t('noHist')}</div></div>`;
    else{
      const counts={};
      ((S.lgHist||[])[lg]||[]).forEach(x=>counts[x.tid]=(counts[x.tid]||0)+1);
      const bestId=+Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0];
      const bestTm=S.teams[bestId];
      body=`<div class="card">
        <div class="sect">${t('mostTitles')}</div>
        <div class="row" style="cursor:pointer" onclick="pushV('team',${bestId})">
          ${tmBadge(bestTm,36)}
          <div><b>${bestTm.n}</b><div class="sub">${counts[bestId]} ${t('titles')}</div></div>
        </div></div>
      <div class="list">
      ${h.map(x=>{
        const tm=S.teams[x.tid];
        return `<div class="pitem" onclick="pushV('team',${x.tid})">
          <span class="posn" style="width:30px">S${x.se}</span>
          ${tmBadge(tm,30)}
          <div class="pinfo"><div class="pname">${tm.n}</div>
          <div class="psub">${t('topScorer')}: ${x.ts} (${x.g})</div></div>
          <span class="faint">›</span></div>`;
      }).join('')}
      </div>`;
    }
  } else {
    const key=tab==='scorers'?'g':'a';
    let rows;
    if(isLive){
      rows=S.players.filter(p=>p[key]>0&&teamOf(p).lg===lg).sort((a,b)=>b[key]-a[key]).slice(0,15)
        .map(p=>[p.n,p.team,p[key],p.id,p.agent==='you']);
    } else rows=aEntry?(key==='g'?aEntry.sc:aEntry.as).map(r=>[r[0],r[1],r[2],null,false]):null;
    if(!rows)body=`<div class="card"><div class="empty">${t('notArch')}</div></div>`;
    else body=`<div class="card tight"><table>
    <tr><th></th><th>${t('player')}</th><th>${t('team')}</th><th class="c">${key==='g'?t('goals'):t('assists')}</th></tr>
    ${rows.map((r,i)=>`<tr class="${r[3]?'click':''} ${r[4]?'hl':''}" ${r[3]?`onclick="pushV('player',${r[3]})"`:''}>
    <td><span class="posn ${i===0?'zone1':''}">${i+1}</span></td>
    <td><b>${r[0]}</b>${r[4]?' <span class="star">★</span>':''}</td>
    <td><div class="row" style="gap:6px">${tmBadge(S.teams[r[1]],18)}<span class="sub">${S.teams[r[1]].n}</span></div></td>
    <td class="c"><b>${r[2]}</b></td></tr>`).join('')}
    ${!rows.length?`<tr><td colspan="4" class="empty">—</td></tr>`:''}</table></div>`;
  }
  const con=S.curCon||'eu';
  const ctryList=[...new Set(LEAGUES.filter(l2=>l2.con===con).map(l2=>l2.ctry))];
  let ctry=S.curCtry;
  if(!ctryList.includes(ctry)){ctry=ctryList[0];S.curCtry=ctry;}
  if(LEAGUES[lg].ctry!==ctry){
    const first=LEAGUES.findIndex(l2=>l2.ctry===ctry);
    S.curLg=first;return VIEWS.league();
  }
  const conChips=`<div class="chips">${CONTS.map(([cc,nm])=>
    `<button class="${con===cc?'on':''}" onclick="setCon('${cc}')">${nm[L]}</button>`).join('')}</div>`;
  const ctryChips=`<div class="chips">${ctryList.map(cc=>
    `<button class="${ctry===cc?'on':''}" onclick="setCtry('${cc}')">${CTRYS[cc][L]}</button>`).join('')}</div>`;
  const lgRow=`<div class="chips">${LEAGUES.map((l2,i)=>l2.ctry===ctry?
    `<button class="${lg===i?'on':''}" onclick="setCurLg(${i})">${l2.n}</button>`:'').join('')}</div>`;
  return `${conChips}${ctryChips}${lgRow}
  <div class="tabs">
    <button class="${tab==='table'?'on':''}" onclick="S.ltab='table';render()">${t('standings')}</button>
    <button class="${tab==='fix'?'on':''}" onclick="S.ltab='fix';render()">${t('fixtures')}</button>
    <button class="${tab==='scorers'?'on':''}" onclick="S.ltab='scorers';render()">${t('scorers')}</button>
    <button class="${tab==='assists'?'on':''}" onclick="S.ltab='assists';render()">${t('assistsT')}</button>
    <button class="${tab==='hist'?'on':''}" onclick="S.ltab='hist';render()">${t('history')}</button>
  </div>${selRow}${body}`;
},
inbox(){
  S.inbox.forEach(m=>{if(!m.action)m.read=true;});
  if(!S.inbox.length)return `<div class="empty">${t('noNews')}</div>`;
  return S.inbox.map(m=>msgHtml(m)).join('');
},
team(id){
  const tm=S.teams[id];
  const pos=teamPos(id);
  const squad=S.players.filter(p=>p.team===id);
  const avg=Math.round(teamStr(id));
  const groups=[['KL','gk'],['DF','df'],['OS','mf'],['FV','fw']];
  const played=[];
  for(let w=0;w<S.week-1&&w<totalWeeks();w++){
    S.fx[tm.lg][w].forEach(m=>{if((m.h===id||m.a===id)&&m.hg!==null)played.push(m);});
  }
  const last5=played.slice(-5);
  const formHtml=last5.map(m=>{
    const mine=m.h===id?m.hg:m.ag, opp=m.h===id?m.ag:m.hg;
    const win=mine>opp, loss=mine<opp;
    const col=win?'var(--acc)':loss?'var(--bad)':'var(--warn)';
    const bg=win?'rgba(13,159,110,.11)':loss?'rgba(220,38,38,.09)':'rgba(192,124,16,.11)';
    const ch=L==='en'?(win?'W':loss?'L':'D'):(win?'G':loss?'M':'B');
    return `<span class="formsq" style="color:${col};background:${bg}">${ch}</span>`;
  }).join('');
  return `
  <div class="hero">
    <div class="stripe" style="background:linear-gradient(180deg,${tm.c1} 50%,${tm.c2} 50%)"></div>
    <div class="row">
      ${tmBadge(tm,48)}
      <div style="flex:1"><div class="hname">${tm.n}</div>
      <div class="hsub">${LEAGUES[tm.lg].n}${LEAGUES[tm.lg].gl?' · '+LEAGUES[tm.lg].gl[tm.grp||0][L==='tr'?0:1]:''} · #${pos} · ${tm.pts} ${t('PTS')} · ${tm.w}${t('W')} ${tm.d}${t('D')} ${tm.l}${t('L')} · ${tm.gf}:${tm.ga}</div></div>
      <div class="bigrt"><span class="n">${avg}</span><span class="l">${t('avgRating')}</span></div>
    </div>
    ${last5.length?`<div style="margin-top:14px" class="row"><span class="sub">${t('form')}</span><span>${formHtml}</span></div>`:''}
  </div>
  ${groups.map(([pk,lk])=>{
    const ps=squad.filter(p=>p.pos===pk).sort((a,b)=>b.r-a.r);
    if(!ps.length)return '';
    return `<div class="sect" style="margin:16px 2px 8px">${t(lk)}</div>${listWrap(ps.map(p=>playerRow(p,{noBadge:true})).join(''))}`;
  }).join('')}`;
},
player(id){
  const p=byId(id),tm=teamOf(p),mine=p.agent==='you';
  const tags=[];
  if(mine)tags.push(`<span class="tag g">${t('myClient')}</span>`);
  tags.push(`<span class="tag pos">${POSFULL[L][p.pos]}</span>`);
  tags.push(`<span class="tag n">${NATS[p.nat].c}</span>`);
  if(p.yrs<=1)tags.push(`<span class="tag w">${t('expiring')}</span>`);
  if(mine&&p.morale<40)tags.push(`<span class="tag b">${p.wage<marketWage(p.r)*0.8?t('wantsNew'):t('wantsOut')}</span>`);
  const offs=(S.offers||[]).filter(x=>x.pid===p.id),off=offs[0],pen=pendingFor(p.id),pc=pendCFor(p.id);
  if(pen)tags.push(`<span class="tag g">${t('pendingTag')}: ${S.teams[pen.tid].n} · ${nextWindowLabel()}</span>`);
  else if(off)tags.push(`<span class="tag w">${t('considering')}: ${offs.map(o=>S.teams[o.tid].n).join(', ')}</span>`);
  if(pc)tags.push(`<span class="tag w">${t('signPending')}</span>`);
  const rtAvg=p.rtN?(p.rtSum/p.rtN):0;
  const seasons=(p.seasons||[]).slice().reverse();
  const hist=(p.hist||[]).slice().reverse();
  return `
  <div class="hero">
    <div class="stripe" style="background:linear-gradient(180deg,${tm.c1} 50%,${tm.c2} 50%)"></div>
    <div class="row">
      <div style="flex:1"><div class="hname">${p.n}</div>
      <div class="hsub">${p.age} ${L==='tr'?'yaş':'years'} · ${POSFULL[L][p.pos]} · ${NATS[p.nat].c}</div></div>
      <div class="bigrt"><span class="n">${p.r}</span><span class="l">${t('rating')}</span></div>
    </div>
    <div style="margin-top:14px">${tags.join('')}</div>
  </div>
  <div class="list">
    <div class="pitem" onclick="pushV('team',${tm.id})">
      ${tmBadge(tm,34)}
      <div class="pinfo"><div class="pname">${tm.n}</div>
      <div class="psub">${LEAGUES[tm.lg].n} · #${teamPos(tm.id)} · ${tm.pts} ${t('PTS')}</div></div>
      <span class="faint">›</span>
    </div>
  </div>
  <div class="card">
    <div class="sect">${t('season')} ${S.season}</div>
    <div class="grid4">
      <div class="stat"><div class="v">${p.app||0}</div><div class="l">${t('apps')}</div></div>
      <div class="stat"><div class="v">${p.min||0}'</div><div class="l">${t('mins')}</div></div>
      <div class="stat"><div class="v">${p.g}</div><div class="l">${t('goals')}</div></div>
      <div class="stat"><div class="v">${p.a}</div><div class="l">${t('assists')}</div></div>
    </div>
    <div class="divider"></div>
    <div class="grid3">
      <div class="stat"><div class="v" style="color:${rtAvg?(rtAvg>=7.2?'var(--acc)':rtAvg>=6.6?'var(--warn)':'var(--bad)'):'var(--txt3)'}">${rtAvg?rtAvg.toFixed(1):'—'}</div><div class="l">${t('avgRt')}</div></div>
      <div class="stat"><div class="v">${fmtM(marketValue(p.r))}</div><div class="l">${t('value')}</div></div>
      <div class="stat"><div class="v">${p.pot}</div><div class="l">Pot</div></div>
    </div>
    <div class="divider"></div>
    ${bar(t('form'),p.form)}
    ${bar(t('morale'),p.morale)}
  </div>
  ${(p.l5&&p.l5.length)?`<div class="card">
    <div class="sect">${t('last5')}</div>
    ${p.l5.slice().reverse().map(m5=>{
      const o=S.teams[m5.o];
      const rc=m5.rt>=7.5?'var(--acc)':m5.rt>=6.5?'var(--warn)':'var(--bad)';
      const resCh=L==='en'?(m5.res==='W'?'W':m5.res==='L'?'L':'D'):(m5.res==='W'?'G':m5.res==='L'?'M':'B');
      const resCol=m5.res==='W'?'var(--acc)':m5.res==='L'?'var(--bad)':'var(--warn)';
      return `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line);cursor:pointer" onclick="pushV('team',${o.id})">
        ${tmBadge(o,26)}
        <div style="flex:1;min-width:0">
          <div style="font-size:12.5px;font-weight:600">${o.n} <span class="faint" style="font-variant-numeric:tabular-nums">${m5.sc}</span>
            <b style="color:${resCol};font-size:11px">${resCh}</b></div>
          <div class="psub">${m5.g?m5.g+' G':''}${m5.g&&m5.a?' · ':''}${m5.a?m5.a+' A':''}${(m5.g||m5.a)&&m5.mm?' · ':''}${m5.mm?`<span style="color:var(--gold);font-weight:700">${t('motm')}</span>`:''}${!(m5.g||m5.a||m5.mm)?'—':''}</div>
        </div>
        <b style="color:${rc};font-variant-numeric:tabular-nums">${m5.rt.toFixed(1)}</b>
      </div>`;
    }).join('')}
  </div>`:''}
  <div class="card">
    <div class="sect">${t('personal')}</div>
    <div class="kv"><span class="k">${t('nation')}</span><span class="v">${NATS[p.nat].c}</span></div>
    <div class="kv"><span class="k">${t('age')}</span><span class="v">${p.age}</span></div>
    <div class="kv"><span class="k">${t('height')}</span><span class="v">${p.h||'—'} cm</span></div>
    <div class="kv"><span class="k">${t('foot')}</span><span class="v">${p.ft==='L'?t('left'):t('right')}</span></div>
  </div>
  <div class="card">
    <div class="sect">${t('contract')}</div>
    <div class="kv"><span class="k">${t('wage')}</span><span class="v">${fmtK(p.wage)}/${t('wk')}</span></div>
    <div class="kv"><span class="k">${t('contract')}</span><span class="v">${p.yrs} ${t('yrs')}</span></div>
    <div class="kv"><span class="k">${t('agent')}</span>
      <span class="v">${mine?'<span style="color:var(--acc)">'+t('you')+'</span>':p.agent==='rival'?t('rival'):'—'}</span></div>
  </div>
  ${(seasons.length||hist.length)?`<div class="card">
    <div class="sect">${t('career')}</div>
    ${hist.map(h=>`<div class="kv"><span class="k">S${h.se} · ${t('transferH')}</span><span class="v">${h.a} → ${h.b} (${fmtM(h.f)})</span></div>`).join('')}
    ${seasons.map(s=>`<div class="kv"><span class="k">S${s.se} · ${s.tm}</span><span class="v">${s.app!==undefined?s.app+' M · '+(s.min||0)+"' · ":''}${s.g} G · ${s.a} A${s.rt?' · <b>'+s.rt.toFixed(1)+'</b>':''}</span></div>`).join('')}
  </div>`:''}
  ${mine?`
    <div class="grid2">
      ${pc?`<button class="btn p" disabled>${t('signPending')}…</button>`
       :`<button class="btn p" ${pen?'disabled':''} onclick="openNeg(${p.id})">${t('negotiate')}</button>`}
      ${pen?`<button class="btn b" disabled>${t('pendingTag')} · ${nextWindowLabel()}</button>`
       :off?`<button class="btn b" disabled>${t('considering')} (${offs.length})…</button>`
       :`<button class="btn b" onclick="openTransfer(${p.id})">${t('offerClubs')}</button>`}
    </div>
    <button class="btn d" style="margin-top:10px" onclick="releaseClient(${p.id})">${t('release')}</button>`
  :p.agent===null?(!knownLg(tm.lg)?`
    <button class="btn s" disabled>${t('scoutLock')}</button>`
   :profileOf(p)>repCap()?`
    <button class="btn s" disabled>${t('repLock')} · ${t('rep')} ${repNeedFor(profileOf(p))}+</button>`
   :pitchCd(p)>0?`
    <button class="btn s" disabled>${t('rejectedCd')} · ${pitchCd(p)} ${t('wk')}</button>`:`
    <button class="btn p" onclick="pitchPlayer(${p.id})">${t('pitch')} · ${fmtK(pitchCost(p))} · %${Math.round(pitchChance(p)*100)}</button>`)
  :`<div class="empty" style="padding:18px">${t('hasAgent')}</div>`}`;
}
};
/* ================= RENDER ================= */
const ICONS={
dash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
clients:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/></svg>',
market:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
league:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M6 3h12v6a6 6 0 0 1-12 0z"/><path d="M6 5H3v2a4 4 0 0 0 4 4"/><path d="M18 5h3v2a4 4 0 0 1-4 4"/></svg>',
inbox:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>'
};
const NAVS=['dash','clients','market','league','inbox'];
function setupHtml(){
  return `
  <div class="hero" style="margin-top:10px">
    <div class="stripe" style="background:linear-gradient(180deg,var(--acc) 50%,#0a6b4f 50%)"></div>
    <div class="hname">Menajer</div>
    <div class="hsub">${t('setupTitle')}</div>
  </div>
  <div class="card">
    <div class="fitem" style="margin-bottom:10px"><span style="font-size:9.5px;color:var(--txt3);text-transform:uppercase;letter-spacing:.06em;font-weight:700">${t('fname')}</span>
      <input class="finp" id="inp_fn" maxlength="18" placeholder="${t('fname')}"></div>
    <div class="fitem" style="margin-bottom:10px"><span style="font-size:9.5px;color:var(--txt3);text-transform:uppercase;letter-spacing:.06em;font-weight:700">${t('lname')}</span>
      <input class="finp" id="inp_ln" maxlength="18" placeholder="${t('lname')}"></div>
    <div class="fitem" style="margin-bottom:10px"><span style="font-size:9.5px;color:var(--txt3);text-transform:uppercase;letter-spacing:.06em;font-weight:700">${t('natL')}</span>
      <select class="fsel" id="sel_nat">
      ${NATKEYS.map(n=>`<option value="${n}" ${n==='tr'?'selected':''}>${NATNAME[n][L]}</option>`).join('')}
      </select></div>
    <div class="fitem"><span style="font-size:9.5px;color:var(--txt3);text-transform:uppercase;letter-spacing:.06em;font-weight:700">${t('agencyN')}</span>
      <input class="finp" id="inp_ag" maxlength="24" placeholder="—"></div>
  </div>
  <div class="card"><div class="sub">${t('setupHint')}</div></div>
  <button class="btn p" onclick="startCareer()">${t('startBtn')}</button>
  <button class="langbtn" style="width:100%;margin-top:12px;text-align:center" onclick="toggleLang()">${L==='tr'?'English':'Türkçe'}</button>`;
}
function render(){
  if(!S.agent){
    document.getElementById('hT1').textContent='Menajer';
    document.getElementById('hT2').textContent=t('setupTitle');
    document.getElementById('hBack').classList.remove('show');
    document.getElementById('nav').innerHTML='';
    document.getElementById('view').innerHTML=setupHtml();
    return;
  }
  const c=cur();
  document.getElementById('hBack').classList.toggle('show',stack.length>1);
  let t1='Menajer',t2=t('season')+' '+S.season+' · '+t('week')+' '+Math.min(S.week,totalWeeks());
  if(c.v==='team')t1=S.teams[c.id].n;
  else if(c.v==='player')t1=byId(c.id).n;
  else if(c.v!=='dash')t1=t(c.v);
  document.getElementById('hT1').textContent=t1;
  document.getElementById('hT2').textContent=t2;
  document.getElementById('hCash').textContent=fmtK(S.cash);
  document.getElementById('hRep').textContent=S.rep;
  document.getElementById('hCashL').textContent=t('cash');
  document.getElementById('hRepL').textContent=t('rep');
  document.getElementById('btnLang').textContent=L==='tr'?'EN':'TR';
  document.getElementById('btnNext').textContent=t('next');
  const unread=S.inbox.filter(m=>!m.read).length;
  const base=stack[0].v;
  document.getElementById('nav').innerHTML=NAVS.map(v=>
    `<button class="${base===v&&stack.length===1?'on':''}" onclick="navTo('${v}')">
     ${ICONS[v]}${t(v)}${v==='inbox'&&unread?`<span class="nbadge">${unread>9?'9+':unread}</span>`:''}</button>`).join('');
  document.getElementById('view').innerHTML=VIEWS[c.v](c.id);
  window.scrollTo(0,0);
}
function showSeasonModal(champs){
  setTimeout(()=>openModal(`
   <div style="padding:8px 0 4px">
     <div class="sect" style="text-align:center">${t('seasonEnd')} · ${t('champion')}</div>
     <div class="list" style="margin:14px 0">
     ${champs.map(c=>`<div class="pitem" style="cursor:default">
       ${tmBadge(c.tm,32)}
       <div class="pinfo"><div class="pname">${c.tm.n}</div>
       <div class="psub">${c.lg} · ${t('topScorer')}: ${c.ts.n} (${c.ts.g})</div></div>
     </div>`).join('')}
     </div>
     <button class="btn p" onclick="closeModal()">${t('newSeason')}</button>
   </div>`),300);
}
function toggleLang(){L=L==='tr'?'en':'tr';S.lang=L;save();render();}
