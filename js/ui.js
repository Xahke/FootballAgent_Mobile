'use strict';
/* js/ui.js — tüm görünümler, render, navigasyon, modallar */
/* ================= NAVIGATION ================= */
function cur(){return stack[stack.length-1];}
function navTo(v){stack=[{v}];render();}
function pushV(v,id){stack.push({v,id});render();}
function back(){if(stack.length>1){stack.pop();render();}}
/* ================= ANA MENÜ =================
   Kabuk (menü / yeni kariyer / menüden açılan ayarlar) ile oyun arasındaki tek
   ayrım S: açık kariyer yoksa S null'dır. render() bunu görüp üst çubuğu ve alt
   gezinmeyi kapatır, böylece "hangi ekrandayız" durumunu ayrıca tutmak gerekmez. */
let pendSlot=0;                     // yeni kariyerin yazılacağı yuva
function toMenu(){
  if(curSlot&&S)saveToSlot(curSlot);
  S=null;curSlot=0;pendSlot=0;
  modalQueue=[];closeModal();
  stack=[{v:'menu'}];lastSig=null;
  render();
}
function askToMenu(){if(confirm(t('toMenuQ')))toMenu();}
/* Kayıt okuması asenkron (IndexedDB). Tıklama işleyicisi sözü beklemiyor;
   okuma bitene kadar menü olduğu gibi duruyor — tam kayıt telefonda birkaç yüz
   milisaniye sürebiliyor, o sırada ikinci kez tıklanırsa iki kez açılmasın. */
let slotOpening=0;
function openSlot(n){
  if(slotOpening)return;
  slotOpening=n;
  loadSlot(n).then(r=>{
    slotOpening=0;
    if(!r.ok){
      /* 'future': daha yeni bir sürümün yazdığı kayıt. Bozuk değil, bu yüzden
         silinmiyor — kullanıcıya neden açılmadığı ayrı söyleniyor. */
      toast(t(r.reason==='future'?'slotNewer':'slotBroken'));
      render();return;
    }
    /* Rakip ajanslar kayıtta olmayabilir (eski kayıt). İlk çizimden önce kuruluyor,
       yoksa panelin sıralama hücresi boş bir dünyaya bakardı. */
    ensureRivals();
    stack=[{v:'dash'}];lastSig=null;
    render();
    /* Karar verilmemiş olay kaydın içinde duruyor — yuva değiştirerek de atlanamaz. */
    if(S.evCur&&S.agent)showEvent(S.evCur);
  },()=>{slotOpening=0;toast(t('slotBroken'));render();});
}
function newCareerSlot(n){pendSlot=n;setupCon='eu';pushV('setup');}
function askDeleteSlot(n){
  if(!confirm(t('slotDeleteQ').replace('{n}',n)))return;
  deleteSlot(n);toast(t('slotDeleted'));render();
}
/* Oyun içinden silme: deleteSlot zaten S'yi ve curSlot'u boşaltıyor, bu yüzden
   toMenu() çağrılmıyor — o kaydetmeye çalışıp silineni geri yazardı. */
function askDeleteCareer(){
  if(!curSlot)return;
  if(!confirm(t('slotDeleteQ').replace('{n}',curSlot)))return;
  deleteSlot(curSlot);
  modalQueue=[];closeModal();
  stack=[{v:'menu'}];lastSig=null;pendSlot=0;
  toast(t('slotDeleted'));render();
}
/* ================= TEMALAR =================
   Her tema css/themes/*.css içinde ayrı bir stylesheet; tools/build-themes.js
   hepsini html[data-theme="ad"] altına kapsamlayıp css/style.css'i üretir. */
const THEMES=[
 {id:'dosya',   bg:'#f7f8f9', sw:['#f7f8f9','#ffffff','#1c6b52'], n:{tr:'Dosya',   en:'Dossier'},
  d:{tr:'Açık nötr zemin, geniş boşluk. Uzun oturumlarda en dinlendirici.',
     en:'Light neutral ground, generous spacing. Easiest over long sessions.'}},
 {id:'gazete',  bg:'#faf8f4', sw:['#faf8f4','#ece8df','#1f6b4a'], n:{tr:'Gazete',  en:'Newsprint'},
  d:{tr:'Sıcak kağıt zemin, serif başlıklar, mürekkep yeşili.',
     en:'Warm paper stock, serif headings, ink green.'}},
 {id:'terminal',bg:'#0d0e10', sw:['#0d0e10','#1a1c20','#4f9c6b'], n:{tr:'Terminal',en:'Terminal'},
  d:{tr:'Koyu nötr, monospace rakamlar, hizalı kolonlar. En yoğun.',
     en:'Dark neutral, monospace figures, aligned columns. Densest.'}},
 {id:'saha',    bg:'#0b111e', sw:['#0b111e','#131b2e','#1ec97e'], n:{tr:'Saha',    en:'Pitch'},
  d:{tr:'İlk tasarım: koyu lacivert, emerald vurgu, yumuşak gölgeler.',
     en:'The original: deep navy, emerald accent, soft shadows.'}}
];
const DEFTHEME='dosya';
/* Tema artık cihaz tercihi (PREFS): ana menüde açık bir kariyer yokken de
   uygulanabilmeli. S.theme yalnızca bu değişiklikten önce yapılmış kayıtlar için
   geri düşüş — okuma sırası prefs → kayıt → varsayılan. */
function themeOf(){return pref('theme',null)||(S&&S.theme)||DEFTHEME;}
function applyTheme(){
  const id=themeOf();
  const th=THEMES.find(x=>x.id===id)||THEMES[0];
  document.documentElement.setAttribute('data-theme',th.id);
  /* tarayıcı çubuğu tema ile aynı renkte olsun */
  const m=document.querySelector('meta[name="theme-color"]');
  if(m)m.setAttribute('content',th.bg);
}
function setTheme(id){
  if(!THEMES.some(x=>x.id===id))return;
  setPref('theme',id);applyTheme();render();
}
/* ================= UI HELPERS ================= */
/* Ana ekranın büyük "Haftayı ilerlet" kartı. Kart iri olduğu için çift dokunma
   kolay; iki hafta birden ilerletmek de olay/kayıt sırasını bozmasa bile
   oyuncunun istemediği bir şey. nextWeek()'in içine dokunmuyoruz — sıra aynen
   kalsın diye koruma yalnız bu çağrı yerinde. Header'daki "Devam" düğmesi
   küçük ve alışılmış davranışını koruyor. */
let hmLastAdv=0;
function hmAdvance(){
  const now=Date.now();
  if(now-hmLastAdv<450)return;
  hmLastAdv=now;
  nextWeek();
}
function toast(msg){
  const el=document.getElementById('toast');
  el.textContent=msg;el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'),2200);
}
/* ================= KAYIT UYARISI =================
   Yazma başarısızlığı eskiden hiçbir yere gitmiyordu: lsSet() false dönüyor,
   save() onu atıyordu. Oyuncu ilerlemesinin yazılmadığını ancak uygulamayı
   kapatıp açınca anlıyordu — mağazada en ağır bedeli ödeten hata türü.

   Toast yetmez, kaybolur. Bu yüzden kalıcı bir şerit: sorun sürdüğü sürece
   ekranda kalıyor, dokununca ne olduğunu ve ne yapılabileceğini anlatıyor.
   store.js sağlık değişince fireSaveHealth() ile burayı çağırıyor. */
function onSaveHealth(){
  updateSaveBanner();
  if(saveHealthy()&&SAVEH.everFailed)toast(t('saveOkAgain'));
}
function updateSaveBanner(){
  const el=document.getElementById('saveWarn');
  if(!el)return;
  const bad=!saveHealthy();
  if(bad)el.innerHTML=`<span class="swt">${t('saveFailTtl')}</span> <span class="swd">${t('saveFailTap')}</span>`;
  if(el.classList)el.classList.toggle('show',bad);
}
function showSaveHelp(){
  if(saveHealthy())return;
  openModal(`<h2>${t('saveFailTtl')}</h2>
    <div class="dctx" style="margin-top:12px">${ICONS.alert}<span>${t('saveFailWhat')}</span></div>
    <div class="kv" style="margin-top:12px"><span class="k">${t('saveFailWhere')}</span>
      <span class="v">${saveBackend()==='idb'?'IndexedDB':'localStorage'}</span></div>
    <div class="kv"><span class="k">${t('saveFailCode')}</span><span class="v">${esc(SAVEH.lastErr)}</span></div>
    <div class="sub" style="margin-top:12px">${t('saveFailFix')}</div>
    <button class="btn" style="margin-top:14px" onclick="closeModal()">${t('gotIt')}</button>`);
}
/* lock=true iken arka plana dokunmak kapatmaz — karar verilmesi gereken ekranlar
   (olaylar) böyle açılır, yoksa seçim yapmadan atlanabiliyor. */
let modalLock=false;
function openModal(html,lock){
  modalLock=!!lock;
  const sh=document.getElementById('sheet');
  sh.innerHTML=(lock?'':'<div class="handle"></div>')+html;
  if(sh.classList){sh.classList.remove('sin');void (sh.offsetWidth||0);sh.classList.add('sin');}
  document.getElementById('modal').classList.add('open');
}
/* arka plana dokunma yalnızca kilitli değilse kapatır */
function dismissModal(){if(!modalLock)closeModal();}
/* Bir hafta içinde hem rapor hem olay çıkabiliyor; üst üste binmesinler diye sıra.
   Modal kapanınca sıradaki kendiliğinden açılır. */
let modalQueue=[];
function modalOpen(){return document.getElementById('modal').classList.contains('open');}
function pushModal(fn){
  modalQueue.push(fn);
  if(!modalOpen())runNextModal();
}
function runNextModal(){
  const fn=modalQueue.shift();
  if(fn)fn();
}
function closeModal(){
  modalLock=false;
  document.getElementById('modal').classList.remove('open');
  if(modalQueue.length)setTimeout(runNextModal,220);
}
/* kullanıcının yazdığı metinler innerHTML'e giriyor — kaçırmadan basma */
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function moodColor(m){return m>65?'var(--acc)':m>40?'var(--warn)':'var(--bad)';}
function rtClass(r){return r>=78?'g':r>=68?'y':'o';}
function bar(label,val){
  const v=Math.round(val||0);   // form/moral içeride kesirli tutuluyor, ekranda tam sayı
  return `<div class="attr"><div class="arow"><span class="sub">${label}</span><b style="color:${moodColor(v)}">${v}</b></div>
  <div class="abar"><div style="width:${v}%;background:${moodColor(v)}"></div></div></div>`;
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
  /* Rakip aynı oyuncuyla görüşüyorsa listede görünsün: acele etmenin sebebi bu. */
  const ch=p.agent===null?chaseFor(p.id):null;
  const chTag=ch?` · <span style="color:var(--warn);font-weight:700">${t('chaseTag')} ${chaseLeft(ch)} ${t('wk')}</span>`:'';
  const potTag=(p.age<=23&&p.pot-p.r>=8)?` · <span style="color:var(--blue);font-weight:700">${t('pot')} ${p.pot}</span>`:'';
  const lgTag=opts.lg?`${isFree(p)?t('faShort'):LEAGUES[tm.lg].c} · `:'';
  const wonder=(p.age<=21&&p.pot-p.r>=14)?ICONS.gem.replace('<svg ','<svg class="gem" '):'';
  return `<div class="pitem${p.agent==='you'?' mine':''}" onclick="pushV('player',${p.id})">
    ${opts.noBadge?'':tmBadge(tm,34)}
    <div class="pinfo"><div class="pname"><span style="overflow:hidden;text-overflow:ellipsis">${p.n}</span>${p.agent==='you'?'<span class="star">★</span>':''}${wonder}
      <span class="natc">${NATS[p.nat].c}</span></div>
    <div class="psub">${lgTag}${POSL[L][p.pos]} · ${p.age} · ${fmtK(p.wage)}/${t('wk')} · ${p.yrs} ${t('yrs')}${potTag}${extra}${chTag}</div></div>
    <div class="mood"><i style="height:${Math.round(p.morale)}%;background:${moodColor(p.morale)}"></i></div>
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
  LEAGUES.forEach((lg,i)=>{html+=`<button class="${sel===i?'on':''}" onclick="${cb}(${i})">${lgName(i)}</button>`;});
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
    if(!cp){body=`<div class="card">${emptyState('league',t('noCupYet'),'')}</div>`;}
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
    /* milli takımlar turnuvası */
    if(!S.wc){
      const next=Math.ceil(S.season/4)*4;
      body=`<div class="card">${emptyState('league',t('noCupYet'),t('nextWc')+': '+t('season')+' '+next)}</div>`;
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
/* Menü tam kayıtları açmaz — yuva başına yazılan küçük özeti okur (js/saves.js).
   Üç kaydı ayrıştırmak ~7000 oyuncu demek olurdu ve menü telefonda beklerdi. */
menu(){
  const m=allMeta(),rows=[];
  /* Kayıtlar henüz okunmadı (ya da eski sürümden göç ediyor). Boş yuva çizmek
     ilerlemenin silindiğini düşündürürdü — bekleyen bir satır dürüst olan. */
  if(!storeReady){
    for(let n=1;n<=SLOTS;n++)rows.push(`<div class="pitem">
      <div class="pinfo"><div class="pname" style="color:var(--txt3)">${t('slotN').replace('{n}',n)}</div>
      <div class="psub">${t('slotLoading')}</div></div></div>`);
    return `
    <div class="hero" style="margin-top:10px">
      <div class="stripe" style="background:linear-gradient(180deg,var(--acc) 50%,#0a6b4f 50%)"></div>
      <div class="hname">Menajer</div>
      <div class="hsub">${t('menuSub')}</div>
    </div>
    <div class="sect">${t('slotsLbl')}</div>
    ${listWrap(rows.join(''))}`;
  }
  for(let n=1;n<=SLOTS;n++){
    const s=m['s'+n];
    if(s){
      const when=s.ts?' · '+new Date(s.ts).toLocaleDateString(L):'';
      rows.push(`<div class="pitem" onclick="openSlot(${n})">
        <div class="pinfo">
          <div class="pname">${esc(s.agent)||t('slotN').replace('{n}',n)}</div>
          <div class="psub">${esc(s.agency)}${when}</div>
          <div class="psub">${t('season')} ${s.season} · ${t('week')} ${s.week} · ${fmtK(s.cash)} · ${t('rep')} ${s.rep} · ${t('clients')} ${s.clients}</div>
        </div>
        <button class="btn s" style="width:auto;min-height:34px;padding:0 12px;font-size:12.5px"
          onclick="event.stopPropagation();askDeleteSlot(${n})">${t('slotDelete')}</button>
      </div>`);
    }else{
      rows.push(`<div class="pitem" onclick="newCareerSlot(${n})">
        <div class="pinfo">
          <div class="pname" style="color:var(--txt3)">${t('slotN').replace('{n}',n)}</div>
          <div class="psub">${t('slotEmptyHint')}</div>
        </div>
        <span class="trk">+</span>
      </div>`);
    }
  }
  return `
  <div class="hero" style="margin-top:10px">
    <div class="stripe" style="background:linear-gradient(180deg,var(--acc) 50%,#0a6b4f 50%)"></div>
    <div class="hname">Menajer</div>
    <div class="hsub">${t('menuSub')}</div>
  </div>
  <div class="sect">${t('slotsLbl')}</div>
  ${listWrap(rows.join(''))}
  ${listWrap(`<div class="pitem" onclick="pushV('settings')">
    <div class="pinfo"><div class="pname">${t('settings')}</div>
    <div class="psub">${t('appearance')} · ${t('langLbl')}</div></div>
    <span class="trk">›</span></div>`)}
  <button class="langbtn" style="width:100%;margin-top:12px;text-align:center" onclick="toggleLang()">${L==='tr'?'English':'Türkçe'}</button>`;
},
setup(){return setupHtml();},
dash(){
  /* my clients' matches this week */
  const cms=[];
  S.clients.map(byId).forEach(p=>{
    if(isFree(p))return;          // kulüpsüz oyuncunun maçı olmaz
    const tm=teamOf(p);
    const len=lgWeeks(tm.lg);
    const wkL=Math.min(S.week-1,len-1);
    const nx=S.week-1<len?(S.fx[tm.lg][wkL]||[]).find(x=>x.h===tm.id||x.a===tm.id):null;
    let last=null;
    const li=Math.min(S.week-1,len)-1;
    if(li>=0)last=(S.fx[tm.lg][li]||[]).find(x=>(x.h===tm.id||x.a===tm.id)&&x.hg!==null);
    cms.push({p,tm,nx,last});
  });
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
  /* ===== Bugünün gündemi =====
     Kaynaklar gerçek durumdan; sıra aciliyete göre ve yalnız ilk ikisi ekrana
     çıkıyor. Ana ekranın işi her şeyi listelemek değil, bu hafta gerçekten
     dokunulması gerekeni söylemek — gerisi hızlı erişim kartlarının arkasında.
     rail: sol kenar rengi. Dekorasyon değil, aciliyeti kodluyor. */
  const ag=[];
  if(S.evCur)ag.push({rail:'red',ic:'alert',txt:t('hmEvPending'),go:`showEvent(${JSON.stringify(S.evCur).replace(/"/g,'&quot;')})`});
  if(S.poach){const p=byId(S.poach.pid);if(p)ag.push({rail:'red',ic:'alert',txt:t('hmPoach').replace('{n}',p.n),go:`pushV('player',${p.id})`});}
  S.clients.map(byId).forEach(p=>{
    if(isFree(p))ag.push({rail:'red',ic:'alert',txt:t('needsClub')+' · '+p.n,go:`pushV('player',${p.id})`});
    /* Mutsuzluk karar bekleyen bir olaydan daha az acil — ray turuncu. */
    else if(p.morale<40)ag.push({rail:'warn',ic:'alert',txt:t('unhappy')+' · '+p.n,go:`pushV('player',${p.id})`});
  });
  (S.pendC||[]).forEach(x=>{const p=byId(x.pid);if(p)ag.push({rail:'gold',ic:'contract',txt:t('signPending')+' · '+p.n,go:`pushV('player',${p.id})`});});
  (S.offers||[]).forEach(x=>{const p=byId(x.pid);if(p)ag.push({rail:'gold',ic:'transfer',txt:t('considering')+' · '+p.n,go:`pushV('player',${p.id})`});});
  (S.chase||[]).forEach(x=>{const p=byId(x.pid);if(p)ag.push({rail:'teal',ic:'gem',txt:t('hmChase').replace('{n}',p.n),go:`pushV('player',${p.id})`});});
  (S.scout||[]).forEach(x=>ag.push({rail:'teal',ic:'scout',txt:t('hmScoutSoon').replace('{n}',lgName(x.lg)),go:`pushV('atlas')`}));
  S.inbox.filter(m=>m.action).slice(0,2).forEach(()=>ag.push({rail:'blue',ic:'inbox',txt:t('notifs'),go:`navTo('inbox')`}));
  const agTop=ag.slice(0,2);

  /* ===== Haftanın yükseleni =====
     Uydurma veri yok: p.vm form kaynaklı değer çarpanı (core.js, VAL). 1'in
     üstündeyse oyuncunun piyasa değeri temel değerinin üzerine çıkmış demektir.
     Hiçbir müşteride hareket yoksa kart hiç çizilmiyor. */
  const risers=S.clients.map(byId).filter(p=>p&&valueMult(p)>1.02)
    .map(p=>({p,gain:valueOf(p)-valueOf({r:p.r,agent:p.agent})}))
    .filter(x=>x.gain>=0.1).sort((a,b)=>b.gain-a.gain);
  const riser=risers[0]||null;

  const lp=levelProgress();
  const wkNow=Math.min(S.week,totalWeeks());
  const unread=S.inbox.filter(m=>!m.read).length;
  const deals=(S.offers||[]).length+(S.pending||[]).length;
  /* Yüzde işareti Türkçede önde, İngilizcede arkada durur. */
  const knownPct=Math.round((S.known||[]).length/LEAGUES.length*100);
  const pctStr=L==='tr'?'%'+knownPct:knownPct+'%';
  const ini=S.agent?((S.agent.fn||' ')[0]+(S.agent.ln||' ')[0]).toUpperCase():'—';

  /* Etiket ve sayı tek sarmalayıcıda: 360px'te ikon + metin + oku aynı satıra
     dizmek metni kırpıyordu, ok köşeye alınınca metne yer kaldı. */
  const qCard=(cls,icon,label,value,go)=>`<button class="hmQ ${cls}" onclick="${go}">
    <span class="hmQi">${ICONS[icon]}</span>
    <span class="hmQb"><span class="hmQt">${label}</span><span class="hmQv">${value}</span></span>
    <span class="hmQc">›</span></button>`;

  return `
  <div class="hmTop">
    <div class="hmId">
      <div class="hmWord">${S.agent?esc(S.agent.agency):t('agency')}</div>
      <div class="hmChip"><span>${t('season')} ${S.season}</span><i></i><span class="on">${wkNow}. ${t('week')}</span></div>
    </div>
    <button class="hmBell${unread?' has':''}" onclick="navTo('inbox')" aria-label="${t('notifs')}">
      ${ICONS.inbox}${unread?`<i class="hmDot"></i>`:''}
    </button>
  </div>

  <div class="hmCard">
    <div class="hmAv" aria-hidden="true">${esc(ini)}<img class="hmAvImg" src="assets/ui/agent-silhouette.webp" alt="" onerror="this.remove()"></div>
    <div class="hmCi">
      <div class="hmLv">${t('hmLevel')} <b>${lp.lv}</b></div>
      <div class="hmRep">
        <span class="hmShield">${ICONS.rep}</span>
        <div class="hmRepBody">
          <div class="hmRepL">${t('rep')}</div>
          <div class="hmBar"><div style="width:${Math.round(lp.pct*100)}%"></div></div>
          <div class="hmRepN"><b>${Math.round(repTotal())}</b> / ${lp.need?repForLevel(lp.lv+1):Math.round(repTotal())}</div>
        </div>
      </div>
    </div>
    <div class="hmBal">
      <span class="hmCoin">${ICONS.cash}</span>
      <span class="hmBalV${S.cash<0?' neg':''}">${fmtK(S.cash)}</span>
      <span class="hmBalL">${t('hmBalance')}</span>
    </div>
  </div>

  <button class="hmAdv" onclick="hmAdvance()">
    <span class="hmAdvIc">${ICONS.calendar}</span>
    <span class="hmAdvT">
      <span class="hmAdvTitle">${t('hmAdvance')}</span>
      <span class="hmAdvSub">${wkNow}. ${t('week')} · ${t('season')} ${S.season}</span>
    </span>
    <span class="hmAdvGo">→</span>
  </button>

  <div class="hmSect">${t('hmToday')}</div>
  ${agTop.length?agTop.map(x=>`<button class="hmAg ${x.rail}" onclick="${x.go}">
      <span class="hmAgIc">${ICONS[x.ic]}</span>
      <span class="hmAgT">${esc(x.txt)}</span>
      <span class="hmAgC">›</span></button>`).join('')
   :`<div class="hmEmpty">${S.clients.length?t('hmNoAgenda'):t('noClientsSub')}</div>`}

  <div class="hmQuick">
    ${qCard('green','clients',t('hmMyPlayers'),`${S.clients.length}<small>/${maxClients()}</small>`,"navTo('clients')")}
    ${qCard('green','transfer',t('hmTransfers'),deals,"navTo('market')")}
    ${qCard('blue','inbox',t('inbox'),unread,"navTo('inbox')")}
    ${qCard('viol','scout',t('scoutNet'),pctStr,"pushV('atlas')")}
  </div>

  ${riser?`<button class="hmRise" onclick="pushV('player',${riser.p.id})">
    <span class="hmRiseIc">${ICONS.trend}</span>
    <span class="hmRiseT">
      <span class="hmRiseL">${t('hmRiser')}</span>
      <span class="hmRiseV">+${riser.gain>=1?fmtK(riser.gain):(+riser.gain.toFixed(1))+'K €'} <i>▲</i></span>
      <span class="hmRiseN">${esc(riser.p.n)}</span>
    </span>
    <span class="hmAgC">›</span></button>`:''}

  ${S.clients.length?'':`<div class="card">${emptyState('clients',t('noClients'),t('noClientsSub'))}
     <button class="btn p" onclick="navTo('market')">${t('goMarket')}</button></div>`}
  ${cms.length?`<div class="hmSect">${t('myMatches')}</div>${cmHtml}`:''}`;
},
clients(){
  const ps=S.clients.map(byId).sort((a,b)=>b.r-a.r);
  return `<h2 class="sec">${t('clients')} <span class="sub" style="font-weight:400">${ps.length}/${maxClients()}</span></h2>
   ${ps.length?listWrap(ps.map(p=>playerRow(p,{lg:1})).join('')):`<div class="card">${emptyState('clients',t('noClients'),t('noClientsSub'))}
     <button class="btn p" onclick="navTo('market')">${t('goMarket')}</button></div>`}`;
},
market(){
  S.f=S.f||{lg:'all',pos:'all',age:'all',sort:'r',elig:true};
  const f=S.f;
  let free=S.players.filter(p=>p.agent===null&&knownLg(teamOf(p).lg));
  if(f.elig)free=free.filter(p=>profileOf(p)<=repCap());
  if(f.lg==='fa')free=free.filter(p=>isFree(p));
  else if(f.lg!=='all')free=free.filter(p=>teamOf(p).lg===+f.lg);
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
    <option value="fa" ${f.lg==='fa'?'selected':''}>${t('freeAgentsF')} (${freeAgents().filter(p=>p.agent===null).length})</option>
    ${Object.keys(CTRYS).map(cc=>{
      const opts=LEAGUES.map((lg,i)=>lg.ctry===cc&&knownLg(i)?
        `<option value="${i}" ${String(f.lg)===String(i)?'selected':''}>${lgName(i)}</option>`:'').join('');
      return opts?`<optgroup label="${CTRYS[cc][L]}">${opts}</optgroup>`:'';
    }).join('')}
    </select></label>`;
  return `<h2 class="sec">${t('freeAgents')}</h2>
   <div class="sub" style="margin-bottom:12px">${t('marketHint')}</div>
   <button class="btn b" style="margin-bottom:12px" onclick="pushV('atlas')">${t('scoutNet')} · ${S.known.length}/${LEAGUES.length} ${t('knownLbl')}</button>
   <div class="fgrid">
     ${lgSel}
     ${sel('pos',[['all',t('all')],['KL',POSFULL[L].KL],['DF',POSFULL[L].DF],['OS',POSFULL[L].OS],['FV',POSFULL[L].FV]])}
     ${sel('age',[['all',t('all')],['u18','≤ 18'],['u21','≤ 21'],['u24','≤ 24'],['o25','25+']])}
     ${sel('sort',[['r',t('sortR')],['pot',t('sortPot')],['age',t('sortAge')],['ch',t('sortCh')]])}
   </div>
   <button class="ftoggle ${f.elig?'on':''}" onclick="setF('elig',${!f.elig})">
     <span class="sw"></span>${t('onlyElig')}<span class="spacer"></span><span class="faint">${total} ${t('found')}</span>
   </button>
   ${free.length?listWrap(free.map(p=>playerRow(p,{lg:1})).join('')):`<div class="card">${emptyState('market',t('noResults'),t('noResultsSub'))}</div>`}`;
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
      <td><div class="row" style="gap:8px;min-width:0">${tmBadge(tm,22)}
        <b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${tm.n}</b></div></td>
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
      :`<div class="card">${emptyState('league',t('notArch'),'')}</div>`;
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
  } else if(tab==='tr'){
    const rows=(S.tlog||[]).filter(x=>(x.a>=0&&S.teams[x.a].lg===lg)||S.teams[x.b].lg===lg);
    if(!rows.length)body=`<div class="card">${emptyState('market',t('noTransfers'),'')}</div>`;
    else body=`<div class="sub" style="margin:0 2px 10px">${t('transfersSub')}</div>
    ${listWrap(rows.map(x=>{
      const from=x.a>=0?S.teams[x.a].n:t('faShort'),to=S.teams[x.b];
      return `<div class="pitem" onclick="pushV('team',${to.id})">
        ${tmBadge(to,34)}
        <div class="pinfo"><div class="pname"><span style="overflow:hidden;text-overflow:ellipsis">${x.n}</span>
          <span class="natc">${POSL[L][x.pos]}</span></div>
        <div class="psub">${from} → <b style="color:var(--txt2)">${to.n}</b> · ${x.age} · S${x.se}/${t('wk')}${x.w}</div></div>
        <div style="text-align:right;flex-shrink:0">
          <div class="num" style="font-size:12px;font-weight:800;color:var(--gold)">${x.f?fmtM(x.f):t('freeFee')}</div>
          <div class="l" style="font-size:9px;color:var(--txt3)">${t('feeL')}</div></div>
        <div class="rt ${rtClass(x.r)}">${x.r}</div></div>`;
    }).join(''))}`;
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
    if(!rows)body=`<div class="card">${emptyState('league',t('notArch'),'')}</div>`;
    else body=`<div class="card tight"><table>
    <tr><th></th><th>${t('player')}</th><th>${t('team')}</th><th class="c">${key==='g'?t('goals'):t('assists')}</th></tr>
    ${rows.map((r,i)=>`<tr class="${r[3]?'click':''} ${r[4]?'hl':''} ${i<3?'top3':''}" ${r[3]?`onclick="pushV('player',${r[3]})"`:''}>
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
    `<button class="${lg===i?'on':''}" onclick="setCurLg(${i})">${lgName(i)}</button>`:'').join('')}</div>`;
  return `${conChips}${ctryChips}${lgRow}
  <div class="tabs">
    <button class="${tab==='table'?'on':''}" onclick="S.ltab='table';render()">${t('standings')}</button>
    <button class="${tab==='fix'?'on':''}" onclick="S.ltab='fix';render()">${t('fixtures')}</button>
    <button class="${tab==='scorers'?'on':''}" onclick="S.ltab='scorers';render()">${t('scorers')}</button>
    <button class="${tab==='assists'?'on':''}" onclick="S.ltab='assists';render()">${t('assistsT')}</button>
    <button class="${tab==='tr'?'on':''}" onclick="S.ltab='tr';render()">${t('transfersT')}</button>
    <button class="${tab==='hist'?'on':''}" onclick="S.ltab='hist';render()">${t('history')}</button>
  </div>${selRow}${body}`;
},
inbox(){
  S.inbox.forEach(m=>{if(!m.action)m.read=true;});
  if(!S.inbox.length)return `<div class="card">${emptyState('inbox',t('noNews'),t('noNewsSub'))}</div>`;
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
      <div class="hsub">${lgName(tm.lg)}${LEAGUES[tm.lg].gl?' · '+LEAGUES[tm.lg].gl[tm.grp||0][L==='tr'?0:1]:''} · #${pos} · ${tm.pts} ${t('PTS')} · ${tm.w}${t('W')} ${tm.d}${t('D')} ${tm.l}${t('L')} · ${tm.gf}:${tm.ga}</div></div>
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
skills(){
  const pts=skillPoints(), spent=skillSpent(), earned=skillEarned();
  /* Künyedeki ok dalın yön vektöründen türetiliyor — yeni bir dal eklendiğinde
     burada elle yazılacak bir şey kalmasın. */
  const arrow=d=>({'0,-1':'↑','1,0':'→','0,1':'↓','-1,0':'←',
                   '1,-1':'↗','1,1':'↘','-1,1':'↙','-1,-1':'↖'})[d.join(',')]||'•';
  const legend=SK_BRANCH.map(b=>{
    const got=branchTaken(b.id), tot=branchTotal(b.id);
    return `<div class="skchip${got?' on':''}" style="--skc:var(--sk-${b.id})">
      <span class="skdot">${arrow(b.dir)}</span>
      <div class="skchipT"><b>${b.n[L]}</b>
      <span>${t('skBranchProg').replace('{a}',got).replace('{b}',tot)}</span></div></div>`;
  }).join('');
  return `<h2 class="sec">${t('skills')}</h2>
  ${skLevelCard()}
  <div class="skleg">${legend}</div>
  <div class="skwrap">${skTreeSvg()}</div>
  <div class="card tight" style="padding:14px">
    <div class="sub" style="line-height:1.5">${t('skTreeHint')}</div>
    <div class="divider" style="margin:12px -14px"></div>
    <div class="grid3">
      <div class="stat"><div class="v" style="color:${pts>0?'var(--acc)':''}">${pts}</div><div class="l">${t('skAvail')}</div></div>
      <div class="stat"><div class="v">${spent}</div><div class="l">${t('skSpent')}</div></div>
      <div class="stat"><div class="v">${earned}</div><div class="l">${t('skTotal')}</div></div>
    </div>
  </div>
  <div class="sub" style="margin:0 2px 8px">${t('skHint').replace('{n}',LV.bonus)}</div>`;
},
/* Keşif ağı ekranı. Çizimi js/atlas.js taşıyor — burada yalnız görünüm kaydı. */
atlas(){return atlasView();},
/* ===== rakip ajanslar =====
   Sıralamada sen de varsın: rekabetin anlamı ancak kendini o listede görünce
   ortaya çıkıyor. Portföy sayıları saklanmıyor, oyuncu listesinden türetiliyor
   (bkz. rivalCounts) — hafta içinde bir kez sayılıp önbelleğe alınıyor. */
rivals(){
  ensureRivals();
  const rows=rivalRank();
  const me=myRank();
  return `<h2 class="sec">${t('rivals')}</h2>
   <div class="sub" style="margin-bottom:12px">${t('rivalsSub')}</div>
   <div class="sect">${t('rivalRankT')}</div>
   ${listWrap(rows.map((x,i)=>{
     if(!x.r)return `<div class="pitem mine">
       <div class="pinfo"><div class="pname"><span style="color:var(--acc)">${S.agent?esc(S.agent.agency):t('you')}</span><span class="star">★</span></div>
       <div class="psub">${t('you')} · ${t('portfolio')} ${S.clients.length}/${maxClients()}</div></div>
       <div class="rt g">${Math.round(x.rep)}</div></div>`;
     const a=rivalArch(x.r);
     const rel=x.r.rel<=-25?`<span style="color:var(--bad)"> · ${t('relHot')}</span>`
              :x.r.rel<=-8?`<span style="color:var(--warn)"> · ${t('relTense')}</span>`:'';
     return `<div class="pitem" onclick="pushV('rival',${x.r.id})">
       <div class="pinfo"><div class="pname">${esc(rivalName(x.r))}</div>
       <div class="psub">${a.n[L]} · ${archFocus(a)[L]} · ${t('portfolio')} ${rivalCount(x.r.id)}${rel}</div></div>
       <div class="rt ${rtClass(Math.round(x.rep))}">${Math.round(x.rep)}</div></div>`;
   }).join(''))}
   <div class="sub" style="margin-top:10px">${t('rankLbl')}: <b>#${me}</b>/${rows.length}</div>`;
},
rival(id){
  ensureRivals();
  const r=rivalById(id);
  if(!r)return `<div class="card">${emptyState('clients',t('rivals'),t('noNotable'))}</div>`;
  const a=rivalArch(r);
  /* Yalnızca keşif ağının ulaştığı liglerdeki müşteriler görünür: göremediğin bir
     ligin oyuncusunu bu ekrandan öğrenmek keşif ağını anlamsızlaştırırdı. */
  const seen=rivalClients(r.id).filter(p=>knownLg(teamOf(p).lg)).sort((x,y)=>y.r-x.r).slice(0,20);
  const relTxt=r.rel<=-25?t('relHot'):r.rel<=-8?t('relTense'):t('relCalm');
  const relCol=r.rel<=-25?'var(--bad)':r.rel<=-8?'var(--warn)':'var(--txt3)';
  return `
  <div class="card">
    <div class="row">
      <div style="flex:1;min-width:0">
        <div class="pname" style="font-size:17px">${esc(rivalName(r))}</div>
        <div class="psub">${a.n[L]} · ${CTRYS[r.ctry][L]}</div>
      </div>
      <div class="rt ${rtClass(Math.round(r.rep))}">${Math.round(r.rep)}</div>
    </div>
    <div class="dctx" style="margin-top:12px">${ICONS.alert}<span>${a.dsc[L]}</span></div>
    <div class="kv" style="margin-top:8px"><span class="k">${t('charLbl')}</span><span class="v">${archFocus(a)[L]}</span></div>
    <div class="divider"></div>
    <div class="grid3">
      <div class="stat"><div class="v">${Math.round(r.rep)}</div><div class="l">${t('rep')}</div></div>
      <div class="stat"><div class="v">${rivalCount(r.id)}</div><div class="l">${t('portfolio')}</div></div>
      <div class="stat"><div class="v">%${Math.round(a.comm*100)}</div><div class="l">${t('commission')}</div></div>
    </div>
  </div>
  <div class="card">
    <div class="sect">${t('relLbl')}</div>
    <div class="kv"><span class="k">${t('relLbl')}</span><span class="v" style="color:${relCol}">${relTxt}</span></div>
    <div class="kv"><span class="k">${t('wonFrom')}</span><span class="v">${r.won||0}</span></div>
    <div class="kv"><span class="k">${t('lostTo')}</span><span class="v">${r.lost||0}</span></div>
  </div>
  <div class="sect">${t('notableCl')}</div>
  ${seen.length?listWrap(seen.map(p=>playerRow(p,{lg:1})).join(''))
   :`<div class="card"><div class="empty">${t('noNotable')}</div></div>`}`;
},
/* Tek görünüm iki bağlamda çalışır: ana menüden açıldığında yalnızca cihaza ait
   ayarlar (tema, dil, ses), oyun içinde ayrıca kariyere ait olanlar. Tema seçicisi
   iki yere kopyalanmasın diye ayrı bir "menü ayarları" görünümü yok. */
settings(){
  const cur=themeOf();
  const ing=!!(S&&S.agent);
  /* önizleme karesi: temanın zemin / yüzey / vurgu renkleri.
     Renkler satır içi veriliyor — aktif temanın değişkenlerinden bağımsız olmalı. */
  const swatch=th=>`<div style="width:38px;height:38px;border-radius:8px;overflow:hidden;flex-shrink:0;
    display:flex;flex-direction:column;background:${th.sw[0]};box-shadow:inset 0 0 0 1px rgba(128,128,128,.35)">
    <i style="flex:1.6;background:${th.sw[0]}"></i>
    <i style="flex:1;background:${th.sw[1]}"></i>
    <i style="height:8px;background:${th.sw[2]}"></i></div>`;
  return `<h2 class="sec">${t('settings')}</h2>
  <div class="sect">${t('appearance')}</div>
  <div class="sub" style="margin:-4px 2px 10px">${t('themeHint')}</div>
  ${listWrap(THEMES.map(th=>`<div class="pitem${th.id===cur?' mine':''}" onclick="setTheme('${th.id}')">
    ${swatch(th)}
    <div class="pinfo"><div class="pname">${th.n[L]}${th.id===cur?'<span class="star">★</span>':''}</div>
    <div class="psub" style="white-space:normal;line-height:1.45">${th.d[L]}</div></div>
    <span class="trk${th.id===cur?' on':''}">${th.id===cur?'✓':''}</span></div>`).join(''))}
  <div class="sect">${t('langLbl')}</div>
  ${listWrap(['tr','en'].map(lc=>`<div class="pitem${L===lc?' mine':''}" onclick="setLang('${lc}')">
    <div class="pinfo"><div class="pname">${lc==='tr'?'Türkçe':'English'}</div></div>
    <span class="trk${L===lc?' on':''}">${L===lc?'✓':''}</span></div>`).join(''))}
  <button class="ftoggle ${pref('sfxOn',true)!==false?'on':''}" onclick="setPref('sfxOn',${pref('sfxOn',true)===false});render()">
    <span class="sw"></span>${t('sfxSetting')}</button>
  <div class="sub" style="margin:-4px 2px 12px">${t('sfxHint')}</div>
  ${!ing?'':`
  <div class="sect">${t('gameplayLbl')}</div>
  <button class="ftoggle ${S.wkRepOn!==false?'on':''}" onclick="S.wkRepOn=${S.wkRepOn===false};save();render()">
    <span class="sw"></span>${t('wkRepSetting')}</button>
  <div class="sub" style="margin:-4px 2px 12px">${t('wkRepHint')}</div>
  <button class="ftoggle ${S.evOn!==false?'on':''}" onclick="S.evOn=${S.evOn===false};save();render()">
    <span class="sw"></span>${t('evSetting')}</button>
  <div class="sub" style="margin:-4px 2px 12px">${t('evHint')}</div>
  <div class="sect">${t('dataLbl')}</div>
  <div class="card">
    <div class="kv"><span class="k">${t('slotN').replace('{n}',curSlot)}</span><span class="v">${esc(S.agent.agency)}</span></div>
    <div class="kv"><span class="k">${t('season')}</span><span class="v">${S.season} · ${t('week')} ${Math.min(S.week,totalWeeks())}</span></div>
    <div class="kv"><span class="k">${t('clients')}</span><span class="v">${S.clients.length}/${maxClients()}</span></div>
    <div class="kv"><span class="k">${t('scoutNet')}</span><span class="v">${(S.known||[]).length}/${LEAGUES.length}</span></div>
  </div>
  <button class="btn s" onclick="askToMenu()">${t('toMenu')}</button>
  <button class="btn d" style="margin-top:8px" onclick="askDeleteCareer()">${t('deleteCareer')}</button>`}`;
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
      ${tmBadge(tm,44)}
      <div style="flex:1;min-width:0"><div class="hname">${p.n}</div>
      <div class="hsub">${p.age} ${L==='tr'?'yaş':'years'} · ${POSFULL[L][p.pos]} · ${NATS[p.nat].c}</div></div>
      <div class="bigrt ${rtClass(p.r)}"><span class="n">${p.r}</span><span class="l">${t('rating')}</span></div>
    </div>
    <div style="margin-top:14px">${tags.join('')}</div>
  </div>
  <div class="list">
    <div class="pitem" onclick="pushV('team',${tm.id})">
      ${tmBadge(tm,34)}
      <div class="pinfo"><div class="pname">${tm.n}</div>
      <div class="psub">${isFree(p)?t('faSub'):`${lgName(tm.lg)} · #${teamPos(tm.id)} · ${tm.pts} ${t('PTS')}`}</div></div>
      ${isFree(p)?'':'<span class="faint">›</span>'}
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
      <div class="stat"><div class="v">${fmtM(valueOf(p))}${(()=>{const m=valueMult(p);
        return m>=1.08?'<span style="color:var(--acc);font-size:11px"> ▲</span>':m<=0.93?'<span style="color:var(--bad);font-size:11px"> ▼</span>':'';})()}</div><div class="l">${t('value')}</div></div>
      <div class="stat"><div class="v">${p.pot}</div><div class="l">Pot</div></div>
    </div>
    <div class="divider"></div>
    ${bar(t('form'),p.form)}
    ${bar(t('morale'),p.morale)}
    ${mine?bar(t('trustL'),trustOf(p)):''}
    ${mine?`<div class="sub" style="margin-top:-4px">${t(trustLabel(trustOf(p)))}</div>`:''}
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
          <div class="psub">${[m5.min?m5.min+"'":'',m5.g?m5.g+' G':'',m5.a?m5.a+' A':'',
            m5.mm?`<span style="color:var(--gold);font-weight:700">${t('motm')}</span>`:'']
            .filter(Boolean).join(' · ')||'—'}</div>
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
      <span class="v">${mine?'<span style="color:var(--acc)">'+t('you')+'</span>'
        :p.agent==='rival'?(()=>{const rv=rivalOf(p);
          /* Adlı bir ajansa bağlıysa adı tıklanabilir; eski kayıtlarda p.ra yok,
             o zaman eski isimsiz metin doğru cevaptır. */
          return rv?lkR(rv.id,esc(rivalName(rv))):t('rival');})()
        :'—'}</span></div>
  </div>
  ${(seasons.length||hist.length)?`<div class="card">
    <div class="sect">${t('career')}</div>
    ${hist.map(h=>`<div class="kv"><span class="k">S${h.se} · ${t('transferH')}</span><span class="v">${h.a} → ${h.b} (${fmtM(h.f)})</span></div>`).join('')}
    ${seasons.map(s=>`<div class="kv"><span class="k">S${s.se} · ${s.tm}</span><span class="v">${s.app!==undefined?s.app+' M · '+(s.min||0)+"' · ":''}${s.g} G · ${s.a} A${s.rt?' · <b>'+s.rt.toFixed(1)+'</b>':''}</span></div>`).join('')}
  </div>`:''}
  ${mine?`
    <div class="grid2">
      ${(()=>{
        const blk=renewBlock(p);
        if(pc)return `<button class="btn p" disabled>${t('signPending')}…</button>`;
        if(blk==='cooldown')return `<button class="btn p" disabled>${t('renewWait')} · ${renewCd(p)} ${t('wk')}</button>`;
        if(blk==='noreason')return `<button class="btn p" disabled>${t('renewLocked')}</button>`;
        return `<button class="btn p" ${pen?'disabled':''} onclick="openNeg(${p.id})">${t('negotiate')}</button>`;
      })()}
      ${pen?`<button class="btn b" disabled>${t('pendingTag')} · ${nextWindowLabel()}</button>`
       :off?`<button class="btn b" disabled>${t('considering')} (${offs.length})…</button>`
       :`<button class="btn b" onclick="openTransfer(${p.id})">${t('offerClubs')}</button>`}
    </div>
    <button class="btn d" style="margin-top:10px" onclick="releaseClient(${p.id})">${t('release')}</button>`
  :p.agent===null?((()=>{
    /* Yarış varsa düğmenin üstünde yazsın: yüzdedeki düşüşün sebebi görünür olmalı,
       yoksa oyuncu şansının neden azaldığını anlamaz. */
    const c=chaseFor(p.id),rv=c?rivalById(c.ri):null;
    return rv?`<div class="dctx" style="margin-bottom:10px">${ICONS.alert}<span>${
      t('chaseWith').replace('{a}',esc(rivalName(rv)))} · ${chaseLeft(c)} ${t('wk')}</span></div>`:'';
  })())+(!knownLg(tm.lg)?`
    <button class="btn s" disabled>${t('scoutLock')}</button>`
   :profileOf(p)>repCap()?`
    <button class="btn s" disabled>${t('repLock')} · ${t('rep')} ${repNeedFor(profileOf(p))}+</button>`
   :pitchCd(p)>0?`
    <button class="btn s" disabled>${t('rejectedCd')} · ${pitchCd(p)} ${t('wk')}</button>`:`
    <button class="btn p" onclick="pitchPlayer(${p.id})">${t('pitch')} · ${fmtK(pitchCost(p))} · %${Math.round(pitchChance(p)*100)}</button>`)
  :`<div class="empty" style="padding:18px">${t('hasAgent')}</div>`}`;
}
};
/* ================= YETENEK AĞACI =================
   Ağaç tek bir SVG: kenarlar altta, düğümler üstte. Yerleşim skills.js'ten
   geliyor (skPos/skEdges/skViewBox), burada yalnızca çizim var — yeni bir dal
   eklendiğinde bu dosyada hiçbir şey değişmiyor.

   Düğüm rozetleri dalın simgesini taşıyor; 24 ayrı ikon yerine dört dal simgesi
   yönle birlikte okunuyor. Simgeler uygulamanın geri kalanıyla aynı ailede. */
const SKICONS={
 hub:'<path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8z"/>',
 tb :'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h4"/>',
 fd :'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><path d="M12 3.5V7"/><path d="M20.5 12H17"/>',
 ag :'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9"/><path d="M14.8 9.2c-.6-.8-1.7-1.2-2.8-1.2-1.6 0-2.8.8-2.8 2s1 1.7 2.8 2c1.8.3 2.8 1 2.8 2s-1.2 2-2.8 2c-1.1 0-2.2-.4-2.8-1.2"/>',
 nw :'<circle cx="12" cy="5" r="2.4"/><circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M12 7.4v3.2a3 3 0 0 1-1.4 2.5L8 14.8"/><path d="M12 7.4v3.2a3 3 0 0 0 1.4 2.5L16 14.8"/>'
};
/* Seviye halkası: dolan yay bir sonraki seviyeye kalan yolu gösteriyor. */
function skLevelRing(size){
  const lp=levelProgress(), r=size/2-5, c=2*Math.PI*r;
  return `<svg class="skring0" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle class="skTrk" cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke-width="4"/>
    <circle class="skBar" cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke-width="4"
      stroke-linecap="round" stroke-dasharray="${(lp.pct*c).toFixed(1)} ${c.toFixed(1)}"
      transform="rotate(-90 ${size/2} ${size/2})"/>
    <text class="lv" x="${size/2}" y="${size/2+2}">${lp.lv}</text>
    <text class="lb" x="${size/2}" y="${size/2+17}">${t('skLvShort')}</text></svg>`;
}
function skLevelCard(){
  const lp=levelProgress(), pts=skillPoints();
  const nxt=lp.need
    ? `${t('skNext')} · <b class="num">${Math.floor(lp.cur)}/${lp.need}</b> ${t('rep').toLowerCase()}`
    : t('skMaxLv');
  return `<div class="card sklvc">
    ${skLevelRing(74)}
    <div class="sklvT">
      <div class="sklvP"><b class="num${pts?' hot':''}">${pts}</b> <span>${t('skPts')}</span></div>
      <div class="sub" style="margin-top:2px">${nxt}</div>
    </div>
  </div>`;
}
/* Ağacın kendisi. skJustTaken burada bir kez okunup siliniyor: açılış
   animasyonu yalnızca açıldığı anda oynasın, her yeniden çizimde değil. */
function skTreeSvg(){
  const just=skJustTaken; skJustTaken=null;
  const edges=skEdges().map(e=>{
    const a=skPos(e.a), b=skPos(e.b);
    const on=hasSkill(e.a.id)&&hasSkill(e.b.id);
    const near=!on&&(hasSkill(e.a.id)||hasSkill(e.b.id));
    const br=e.b.br||e.a.br;
    return `<line class="skedge ${on?'on':near?'near':'off'}" style="--skc:var(--sk-${br})"
      x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
  }).join('');
  const nodes=SKILLS.map(sk=>{
    const p=skPos(sk), r=skRadius(sk), st=skillState(sk);
    const ico=SKICONS[sk.br||'hub']||SKICONS.hub;
    const is=Math.round(r*1.05);
    const badge=st==='owned'
      ? `<g class="skbadge ok" transform="translate(${(r*0.72).toFixed(0)},${(r*0.72).toFixed(0)})">
           <circle r="14"/><path d="M-5 0l3.5 3.5L5.5 -3.5"/></g>`
      : st==='lock'?''
      : `<g class="skbadge" transform="translate(${(r*0.72).toFixed(0)},${(r*0.72).toFixed(0)})">
           <circle r="14"/><text y="6">${sk.cost}</text></g>`;
    return `<g class="sknode ${st}${just===sk.id?' just':''}" style="--skc:var(--sk-${sk.br||'hub'})"
       transform="translate(${p.x},${p.y})" onclick="skOpen('${sk.id}')" role="button"
       aria-label="${esc(sk.n[L])}">
      <circle class="skhit" r="${SK_GEO.hit}"/>
      <circle class="skburst" r="${r}"/>
      <circle class="skdisc" r="${r}"/>
      <circle class="skedgeR" r="${r}"/>
      <svg class="skico" viewBox="0 0 24 24" x="${-is/2}" y="${-is/2}" width="${is}" height="${is}"
        fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
        stroke-linejoin="round">${ico}</svg>
      ${badge}</g>`;
  }).join('');
  return `<svg class="sktree" viewBox="${skViewBox()}" preserveAspectRatio="xMidYMid meet"
    role="img" aria-label="${esc(t('skills'))}">
    <g class="skedges">${edges}</g><g class="sknodes">${nodes}</g></svg>`;
}
/* Düğüm kartı: ne yaptığı, neye bağlı olduğu ve açılabiliyorsa düğmesi. */
function skOpen(id){
  const sk=skById(id);
  if(!sk)return;
  const st=skillState(sk), br=skBranch(sk.br);
  const effs=Object.keys(sk.eff||{}).map(k=>
    `<span class="tag ${st==='owned'?'g':'n'}">${skEffLabel(k,sk.eff[k])}</span>`).join('');
  const reqs=(sk.req||[]).map(r=>skById(r)).filter(Boolean).map(x=>x.n[L]).join(' · ');
  const foot=
    st==='owned' ? `<div class="skfoot"><span class="tag g">${t('skOwned')}</span></div>`
   :st==='open'  ? `<button class="btn p" onclick="skillBuy('${sk.id}')">${t('skUnlockBtn')} · ${sk.cost} ${sk.cost>1?t('skPts'):t('skPt')}</button>`
   :st==='poor'  ? `<button class="btn" disabled>${t('skNeedPts').replace('{n}',sk.cost)}</button>`
   : `<button class="btn" disabled>${t('skReqLock')}</button>`;
  openModal(`
   <div class="row" style="align-items:flex-start">
     <div class="skmark ${st}" style="--skc:var(--sk-${sk.br||'hub'})">
       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
         stroke-linecap="round" stroke-linejoin="round">${SKICONS[sk.br||'hub']||SKICONS.hub}</svg></div>
     <div style="flex:1;min-width:0">
       <h2>${sk.n[L]}</h2>
       <div class="sub">${br?br.n[L]:t('agency')}${sk.cost?' · '+sk.cost+' '+(sk.cost>1?t('skPts'):t('skPt')):''}</div>
     </div>
   </div>
   <div class="dctx" style="margin-top:12px">${ICONS.alert}<span>${sk.dsc[L]}</span></div>
   ${effs?`<div class="sect" style="margin-top:14px">${t('skEffects')}</div><div>${effs}</div>`:''}
   ${reqs&&st!=='owned'?`<div class="sub" style="margin-top:10px">${t('skReq')}: ${reqs}</div>`:''}
   <div style="margin-top:16px">${foot}</div>`);
}
/* Seviye atlama: haftanın sonunda sıraya giren küçük kutlama. */
function showLevelUp(){
  /* Gösterecek bir şey yoksa sırayı kilitlemeden bir sonrakine geç: modal
     kuyruğu yalnızca closeModal ile ilerlediği için sessizce dönmek olmaz. */
  if(!S||!S.lvUp){runNextModal();return;}
  S.lvUp=0;save();
  const pts=skillPoints();
  openModal(`<div style="text-align:center;padding:6px 0 2px">
    <div class="sklvBig">${skLevelRing(96)}</div>
    <h2 style="margin-top:10px">${t('skLvUp')}</h2>
    <div class="sub" style="margin:6px auto 0;max-width:300px;line-height:1.5">
      ${t('skLvUpB').replace('{n}',pts)}</div>
    <button class="btn p" style="margin-top:18px" onclick="closeModal();navTo('skills')">${t('skOpenTree')}</button>
    <button class="btn s" style="margin-top:8px" onclick="closeModal()">${t('gotIt')}</button>
  </div>`);
}
/* ================= RENDER ================= */
const ICONS={
dash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
clients:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/></svg>',
market:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
league:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M6 3h12v6a6 6 0 0 1-12 0z"/><path d="M6 5H3v2a4 4 0 0 0 4 4"/><path d="M18 5h3v2a4 4 0 0 1-4 4"/></svg>',
inbox:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
cash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9"/><path d="M14.8 9.2c-.6-.8-1.7-1.2-2.8-1.2-1.6 0-2.8.8-2.8 2s1 1.7 2.8 2c1.8.3 2.8 1 2.8 2s-1.2 2-2.8 2c-1.1 0-2.2-.4-2.8-1.2"/></svg>',
rep:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8z"/></svg>',
transfer:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h13"/><path d="m14 4 4 4-4 4"/><path d="M20 16H7"/><path d="m10 12-4 4 4 4"/></svg>',
contract:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h4"/></svg>',
scout:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/><path d="M12 3.5V7"/><path d="M20.5 12H17"/></svg>',
alert:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 4.2 2.9 17a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4"/><path d="M12 17h.01"/></svg>',
gem:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5 16.5 7 12 21.5 7.5 7z" opacity=".9"/><path d="M7.5 7h9L12 2.5z" opacity=".55"/></svg>',
skills:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2.4"/><circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M12 7.4v3.2a3 3 0 0 1-1.4 2.5L8 14.8"/><path d="M12 7.4v3.2a3 3 0 0 0 1.4 2.5L16 14.8"/></svg>',
calendar:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.2" y="5" width="17.6" height="16" rx="2.6"/><path d="M3.2 10h17.6M8 3v4M16 3v4"/><circle cx="8.4" cy="14" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="14" r="1.1" fill="currentColor" stroke="none"/><circle cx="15.6" cy="14" r="1.1" fill="currentColor" stroke="none"/><circle cx="8.4" cy="17.6" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="17.6" r="1.1" fill="currentColor" stroke="none"/></svg>',
trend:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 16.5 9 11l3.5 3.5L20 7"/><path d="M15 7h5v5"/></svg>',
settings:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></svg>'
};
/* boş ekranlar: ikon + başlık + alt metin */
function emptyState(icon,title,sub){
  return `<div class="estate">${ICONS[icon]||ICONS.market}<b>${title}</b>${sub?`<span>${sub}</span>`:''}</div>`;
}
const NAVS=['dash','clients','market','skills','league','inbox'];
/* Kurulumda önce kıta, sonra ülke seçiliyor. Kıta değişince yalnızca ülke listesi
   yeniden yazılıyor — tam render yapsaydık kullanıcının yazdığı ad silinirdi. */
let setupCon='eu';
function fillNatSel(con){
  if(con)setupCon=con;
  const sel=document.getElementById('sel_nat');
  if(!sel)return;
  const list=NATKEYS.filter(n=>NATCON[n]===setupCon)
    .sort((a,b)=>NATNAME[a][L].localeCompare(NATNAME[b][L],L));
  sel.innerHTML=list.map(n=>`<option value="${n}">${NATNAME[n][L]}</option>`).join('');
}
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
    <div class="fitem" style="margin-bottom:10px"><span style="font-size:9.5px;color:var(--txt3);text-transform:uppercase;letter-spacing:.06em;font-weight:700">${t('contL')}</span>
      <select class="fsel" id="sel_con" onchange="fillNatSel(this.value)">
      ${NCONTS.map(([c,nm])=>`<option value="${c}" ${c===setupCon?'selected':''}>${nm[L]}</option>`).join('')}
      </select></div>
    <div class="fitem" style="margin-bottom:10px"><span style="font-size:9.5px;color:var(--txt3);text-transform:uppercase;letter-spacing:.06em;font-weight:700">${t('natL')}</span>
      <select class="fsel" id="sel_nat"></select></div>
    <div class="fitem"><span style="font-size:9.5px;color:var(--txt3);text-transform:uppercase;letter-spacing:.06em;font-weight:700">${t('agencyN')}</span>
      <input class="finp" id="inp_ag" maxlength="24" placeholder="—"></div>
  </div>
  <div class="card"><div class="sub">${t('setupHint')}</div></div>
  <button class="btn p" onclick="startCareer()">${t('startBtn')}</button>
  <button class="langbtn" style="width:100%;margin-top:12px;text-align:center" onclick="toggleLang()">${L==='tr'?'English':'Türkçe'}</button>`;
}
let lastSig=null;
/* Üst çubukta yalnızca oyun içinde anlamlı olan parçalar. Kabukta gizleniyorlar;
   dört temada ayrı kural tanımlamak yerine tek yerden kapatmak yeterli. */
function showChrome(on){
  const bn=document.getElementById('btnNext');
  if(bn)bn.style.display=on?'':'none';
  const st=document.querySelectorAll?document.querySelectorAll('.hstat'):[];
  Array.prototype.forEach.call(st,e=>{e.style.display=on?'':'none';});
}
function render(){
  applyTheme();
  document.documentElement.lang=L;   // ekran okuyucu ve tarayıcı doğru dili görsün
  /* Şerit #view'ın dışında, innerHTML onu silmiyor — ama dil değişmiş olabilir,
     bu yüzden metni her çizimde tazeleniyor. */
  updateSaveBanner();
  const c=cur();
  /* Hangi ekrandayız — CSS'in bilmesi gereken tek durum. Tema dosyaları
     ekrana özgü kural yazabilsin diye (ana ekranda üst çubuğun kasa/itibar
     rozetlerini gizlemek gibi); gezinme mantığına dokunmuyor. */
  if(document.body&&document.body.dataset)document.body.dataset.view=c.v;
  /* Açık kariyer yoksa kabuktayız: ana menü, yeni kariyer ya da menüden açılan
     ayarlar. Ayrı bir ekran durumu tutmuyoruz — S'nin kendisi bu ayrımı taşıyor. */
  if(!S||!S.agent){
    document.getElementById('hBack').classList.toggle('show',stack.length>1);
    const b0=document.getElementById('btnSet');
    if(b0)b0.classList.remove('show');   // ayarlara menüden giriliyor
    showChrome(false);
    document.getElementById('hT1').textContent=c.v==='settings'?t('settings'):'Menajer';
    document.getElementById('hT2').textContent=
      c.v==='setup'?t('setupTitle'):c.v==='menu'?t('mainMenu'):'';
    document.getElementById('nav').innerHTML='';
    const vw0=document.getElementById('view');
    vw0.innerHTML=(VIEWS[c.v]||VIEWS.menu)(c.id);
    if(c.v==='setup')fillNatSel();   // ülke listesi seçili kıtaya göre doldurulur
    if(vw0.classList){vw0.classList.remove('vin');void (vw0.offsetWidth||0);vw0.classList.add('vin');}
    const sig0='shell:'+c.v;
    if(sig0!==lastSig){lastSig=sig0;if(window.scrollTo)window.scrollTo(0,0);}
    return;
  }
  showChrome(true);
  document.getElementById('hBack').classList.toggle('show',stack.length>1);
  let t1='Menajer',t2=t('season')+' '+S.season+' · '+t('week')+' '+Math.min(S.week,totalWeeks());
  if(c.v==='team')t1=S.teams[c.id].n;
  else if(c.v==='player')t1=byId(c.id).n;
  else if(c.v==='settings')t1=t('settings');
  else if(c.v==='skills')t1=t('skills');
  else if(c.v==='atlas')t1=t('scoutNet');
  else if(c.v==='rival')t1=rivalName(rivalById(c.id))||t('rivals');
  else if(c.v!=='dash')t1=t(c.v);
  document.getElementById('hT1').textContent=t1;
  document.getElementById('hT2').textContent=t2;
  document.getElementById('hCash').textContent=fmtK(S.cash);
  document.getElementById('hRep').textContent=Math.round(S.rep);
  document.getElementById('hCashL').textContent=t('cash');
  document.getElementById('hRepL').textContent=t('rep');
  const bs=document.getElementById('btnSet');
  if(bs){
    bs.classList.add('show');
    if(!bs.firstChild){bs.innerHTML=ICONS.settings;const sv=bs.querySelector('svg');if(sv){sv.style.width='17px';sv.style.height='17px';}}
  }
  document.getElementById('btnNext').textContent=t('next');
  const unread=S.inbox.filter(m=>!m.read).length;
  const base=stack[0].v;
  /* Harcanmamış yetenek puanı da rozet taşır — ağaç açık bir puanla beklemesin. */
  const badge=v=>v==='inbox'?unread:v==='skills'?skillPoints():0;
  document.getElementById('nav').innerHTML=`<div class="navin">${NAVS.map(v=>
    `<button class="${base===v&&stack.length===1?'on':''}" onclick="navTo('${v}')">
     <span class="icw">${ICONS[v]}</span>${t(v)}${badge(v)?`<span class="nbadge${v==='skills'?' acc':''}">${badge(v)>9?'9+':badge(v)}</span>`:''}</button>`).join('')}</div>`;
  const vw=document.getElementById('view');
  vw.innerHTML=VIEWS[c.v](c.id);
  if(vw.classList){vw.classList.remove('vin');void (vw.offsetWidth||0);vw.classList.add('vin');}
  /* Yalnızca gerçekten başka bir ekrana geçildiğinde başa dön. Aksi halde piyasada
     filtre değiştirmek ya da bir tema seçmek listeyi en üste fırlatıyor. */
  const sig=c.v+':'+(c.id===undefined?'':c.id);
  const fresh=sig!==lastSig;
  if(fresh){lastSig=sig;if(window.scrollTo)window.scrollTo(0,0);}
  /* Harita her çizimden sonra dinleyicilerini yeniden bağlıyor — innerHTML
     eskilerini siliyor. Ekrana ilk girişte oyuncunun kendi bölgesine
     çerçeveleniyor; sonraki çizimlerde kamera olduğu yerde kalıyor. */
  if(c.v==='atlas'){mapMount();if(fresh)mapHome();}
}
/* ===== olaylar ===== */
function showEvent(ref){
  const ev=evById(ref.id);
  if(!ev)return;
  const c=evCtx(ref.pid);
  S.evCur=ref;save();   // sayfa yenilense de karar bekliyor olarak kalsın
  const head=c.p
    ? `<div class="row">${tmBadge(c.tm,42)}
        <div style="flex:1;min-width:0"><h2>${ev.ttl(c)[L]}</h2>
        <div class="sub">${c.p.n} · ${c.tm.n}</div></div>
        <div class="rt ${rtClass(c.p.r)}">${c.p.r}</div></div>`
    : `<h2>${ev.ttl(c)[L]}</h2>`;
  openModal(`${head}
    <div class="dctx" style="margin-top:12px">${ICONS.alert}<span>${ev.txt(c)[L]}</span></div>
    <div class="sect" style="margin-top:14px">${t('evPick')}</div>
    ${ev.opts.map((o,i)=>`<button class="dchoice" onclick="evChoose(${i})">${o.t[L]}</button>`).join('')}`,true);
}
function evChoose(i){
  const ref=S.evCur;
  if(!ref)return;
  const ev=evById(ref.id),c=evCtx(ref.pid);
  const opt=ev.opts[i];
  if(!opt)return;
  const r=opt.eff(c)||{};
  const changes=applyEff(r,c);
  S.evCur=null;
  const lbl={cash:t('cash'),rep:t('rep'),morale:t('morale'),trust:t('trustL'),form:t('form'),
             ag_comm:t('commission'),ag_cap:t('capacity'),ag_cost:t('weeklyCost')};
  const chips=changes.map(x=>{
    /* Kalıcı ajans değişiklikleri oran olarak yazılır; giderde artış kötü, azalış iyi. */
    const isPct=x.k==='ag_comm'||x.k==='ag_cost';
    const good=x.k==='ag_cost'?x.v<0:x.v>0;
    const val=x.k==='cash'?fmtK(Math.abs(x.v)):isPct?'%'+Math.round(Math.abs(x.v)*100):Math.abs(x.v);
    const perm=x.k.indexOf('ag_')===0?' · '+t('permanent'):'';
    return `<span class="tag ${good?'g':'b'}">${lbl[x.k]} ${x.v>0?'+':'−'}${val}${perm}</span>`;
  }).join('');
  openModal(`<h2>${ev.ttl(c)[L]}</h2>
    <div class="dquote ${changes.some(x=>x.v<0)?(changes.some(x=>x.v>0)?'mid':'bad'):'good'}" style="margin-top:12px">${r.msg?r.msg[L]:''}</div>
    ${chips?`<div style="margin-top:14px">${chips}</div>`:''}
    <button class="btn p" style="margin-top:16px" onclick="closeModal()">${t('gotIt')}</button>`);
  save();render();
}
/* ===== ayartma masası =====
   Rakip ajans müşterinin kapısını çaldı. Olaylarla aynı kurallar: modal kilitli
   açılır (dışarı tıklayarak kaçılamaz) ve sonuç applyEff'ten geçer.

   Hedef bu arada geçersizleştiyse — transfer oldu, kendisi seni kovdu, futbolu
   bıraktı — sessizce dönmek yetmez: kuyruk yalnızca closeModal ile ilerlediği için
   sessiz bir return arkadaki bütün modalları kilitlerdi (bkz. showLevelUp). */
function showPoach(){
  const pc=S.poach;
  const p=pc?byId(pc.pid):null;
  const r=pc?rivalById(pc.ri):null;
  if(!pc||!p||!r||p.agent!=='you'){S.poach=null;runNextModal();return;}
  const risk=Math.round(poachChance(p,r)*100);
  const col=risk>60?'var(--bad)':risk>35?'var(--warn)':'var(--acc)';
  openModal(`
   <div class="row">${tmBadge(teamOf(p),42)}
     <div style="flex:1;min-width:0"><h2>${t('poachT')}</h2>
     <div class="sub">${p.n} · ${esc(rivalName(r))}</div></div>
     <div class="rt ${rtClass(p.r)}">${p.r}</div></div>
   <div class="dctx" style="margin-top:12px">${ICONS.alert}<span>${rivalArch(r).dsc[L]}</span></div>
   <div class="negbox" style="margin-top:10px">
     <div class="row" style="justify-content:space-between;font-size:11px">
       <span class="sub" style="font-weight:800;text-transform:uppercase;letter-spacing:.06em">${t('poachT')}</span>
       <b class="num" style="color:${col};font-size:15px">%${risk}</b></div>
     <div class="moodbar"><div style="width:${risk}%;background:${col}"></div></div>
     <div style="margin-top:10px;display:flex;justify-content:space-between;font-size:12px">
       <span class="sub">${t('trustL')}</span><b class="num">${Math.round(trustOf(p))}</b></div>
     <div style="display:flex;justify-content:space-between;font-size:12px">
       <span class="sub">${t('morale')}</span><b class="num">${Math.round(p.morale)}</b></div>
   </div>
   <div class="sect" style="margin-top:14px">${t('evPick')}</div>
   ${POACH_OPT.map((o,i)=>`<button class="dchoice" onclick="poachChoose(${i})">${o.t[L]}</button>`).join('')}`,true);
}
function poachChoose(i){
  const pc=S.poach;
  if(!pc)return;
  const p=byId(pc.pid),r=rivalById(pc.ri),opt=POACH_OPT[i];
  if(!p||!r||!opt)return;
  const out=opt.run({p,r})||{};
  /* Nakit/güven/moral etkileri olaylarla aynı uygulayıcıdan geçiyor: mutasyon
     kanalları tek yerde kalsın. */
  applyEff(out.eff||{},{p});
  const risk=clamp(poachChance(p,r)+(out.d||0),0.02,0.95);
  const lost=RF()<risk;
  S.poach=null;
  if(lost)losePlayerTo(p,r);
  else{
    r.lost=(r.lost||0)+1;
    trustEvent(p,4);
    pushNews('poachHeld',{n:p.n,pid:p.id,a:rivalName(r),ri:r.id},'good');
  }
  openModal(`<h2>${t('poachT')}</h2>
    <div class="dquote ${lost?'bad':'good'}" style="margin-top:12px">${out.msg?out.msg[L]:''}</div>
    <div class="dquote ${lost?'bad':'good'}" style="margin-top:8px">${
      lost?(NEWS[L].poached({n:p.n,a:esc(rivalName(r))})):(NEWS[L].poachHeld({n:p.n,a:esc(rivalName(r))}))}</div>
    <button class="btn p" style="margin-top:16px" onclick="closeModal()">${t('gotIt')}</button>`);
  save();render();
}
/* ===== haftalık müşteri raporu =====
   Hafta geçtikten sonra doğrudan önüne gelir: kim kaç dakika oynadı, ne üretti,
   kim kadroya giremedi. Gelen kutusuna dağılmış tek tek bildirimler yerine
   tek ekranda toplu görünüm. */
function showWeekReport(wk){
  const rows=(S.wkRep||[]).slice().sort((a,b)=>(b.rt||0)-(a.rt||0));
  if(!rows.length)return;
  const resCh=res=>L==='en'?res:(res==='W'?'G':res==='L'?'M':'B');
  const resCol=res=>res==='W'?'var(--acc)':res==='L'?'var(--bad)':'var(--warn)';
  /* Sayılar oyuncunun hizasında sabit kolonlarda dursun — satırlar arası göz
     taraması ancak böyle çalışıyor. Kolon genişlikleri başlıkla birebir aynı. */
  const W={min:36,g:22,a:22,rt:38};
  const cell=(v,w,style)=>`<div style="width:${w}px;flex-shrink:0;text-align:center;font-variant-numeric:tabular-nums;${style||''}">${v}</div>`;
  const head=`<div style="display:flex;align-items:center;gap:11px;padding:0 13px 6px;font-size:8.5px;
    color:var(--txt3);font-weight:800;text-transform:uppercase;letter-spacing:.06em">
    <div style="width:30px;flex-shrink:0"></div><div style="flex:1;min-width:0"></div>
    ${cell(t('minShort'),W.min)}${cell('G',W.g)}${cell('A',W.a)}${cell(t('ratingShort'),W.rt)}</div>`;
  const body=rows.map(r=>{
    const tm=S.teams[r.tid],opp=S.teams[r.opp];
    const rc=r.rt>=7.5?'var(--acc)':r.rt>=6.5?'var(--warn)':'var(--bad)';
    const dim='color:var(--txt3)';
    return `<div class="pitem" style="gap:11px" onclick="closeModal();pushV('player',${r.pid})">
      ${tmBadge(tm,30)}
      <div class="pinfo">
        <div class="pname"><span style="overflow:hidden;text-overflow:ellipsis">${r.n}</span>${r.mm?'<span class="star">★</span>':''}</div>
        <div class="psub">${opp?opp.n:'—'} <b style="color:${resCol(r.res)}">${r.sc} ${resCh(r.res)}</b>${r.dnp?` · <span style="color:var(--txt3)">${t('dnp')}</span>`:''}</div>
      </div>
      ${r.dnp
        ? cell('–',W.min,dim)+cell('–',W.g,dim)+cell('–',W.a,dim)+cell('–',W.rt,dim)
        : cell(r.min+"'",W.min,'font-size:12px;font-weight:600')
         +cell(r.g||'–',W.g,r.g?'font-weight:800;color:var(--acc)':dim)
         +cell(r.a||'–',W.a,r.a?'font-weight:800':dim)
         +cell(r.rt.toFixed(1),W.rt,`font-weight:800;font-size:13.5px;color:${rc}`)}
    </div>`;
  }).join('');
  openModal(`
    <div class="sect" style="text-align:center;margin-bottom:2px">${t('weekReport')}</div>
    <div class="sub" style="text-align:center;margin-bottom:12px">${t('season')} ${S.season} · ${t('week')} ${wk}</div>
    ${head}
    <div class="list">${body}</div>
    <button class="btn p" onclick="closeModal()">${t('gotIt')}</button>
    <button class="btn s" style="margin-top:8px" onclick="S.wkRepOn=false;save();closeModal();toast(t('wkRepOff'))">${t('dontShow')}</button>`);
}
function showSeasonModal(champs){
  modalQueue=[];   // sezon özeti her şeyin önüne geçer; bekleyen varsa düşer
  setTimeout(()=>openModal(`
   <div style="padding:8px 0 4px">
     <div class="sect" style="text-align:center">${t('seasonEnd')} · ${t('champion')}</div>
     <div class="list" style="margin:14px 0">
     ${champs.map(c=>`<div class="pitem" style="cursor:default">
       ${tmBadge(c.tm,32)}
       <div class="pinfo"><div class="pname">${c.tm.n}</div>
       <div class="psub">${lgName(c.lgi)} · ${t('topScorer')}: ${c.ts.n} (${c.ts.g})</div></div>
     </div>`).join('')}
     </div>
     <button class="btn p" onclick="closeModal()">${t('newSeason')}</button>
   </div>`),300);
}
/* Dil de cihaz tercihi; kayda da yazılıyor ki kayıt başka bir cihaza taşınırsa
   kendi dilini yanında getirsin. Okumada prefs önce gelir. */
function toggleLang(){setLangTo(L==='tr'?'en':'tr');}
function setLang(lc){if(lc!==L)setLangTo(lc);else render();}
function setLangTo(lc){
  L=lc;setPref('lang',lc);
  if(S){S.lang=lc;save();}
  render();
}
