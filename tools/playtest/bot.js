'use strict';
/* tools/playtest/bot.js — oyunu oynayan bot. node tools/playtest.js tarafından,
   oyunun 21 dosyasından SONRA aynı vm bağlamına yüklenir.

   Neden bağlamın içinde: S, negCtx, MT, trSel gibi oyun durumları `let` ile
   tanımlı ve bağlam nesnesinin özelliği değiller — dışarıdan görünmüyorlar.
   İçeride çalışan bir betik ise hepsini oyunun gördüğü gibi görüyor.

   Bot oyunun KENDİ fonksiyonlarını çağırır (openNeg/negSubmit, openTransfer/
   submitOffers, evChoose, openMeeting/pickLine...). Hiçbir formül burada
   yeniden yazılmıyor: ölçülen şey oyunun yaptığı, botun sandığı değil.

   Kayıt tutmak için birkaç fonksiyon sarmalanıyor (doTransfer, applyEff,
   pushNews...). Sarmalayıcılar yalnız OKUR; asıl fonksiyon aynı argümanlarla
   çağrılır ve dönüşü aynen iletilir. */

const BOT={
  cfg:null, rnd:null, q:[], modal:null, lastEff:null, lastCut:null, lastToast:'',
  offerMap:{}, bidPids:{}, errSeen:{},
  log:{ev:[],tr:[],ct:[],offers:[],meet:[],poach:[],ai:[],season:[],weeks:[],err:[],news:{},skills:[],scout:[],elig:{},eligWeeks:0}
};

/* ---------- yardımcılar ---------- */
function botR1(v){return Math.round(v*10)/10;}
function botSnap(p){
  const tm=teamOf(p);
  return {pid:p.id,n:p.n,age:p.age,pos:p.pos,r:p.r,pot:p.pot,
    club:tm.n,lg:tm.lg>=0?lgName(tm.lg):'—',str:tm.str,
    wage:p.wage,yrs:p.yrs,val:valueOf(p),
    morale:Math.round(p.morale),trust:Math.round(trustOf(p)),form:Math.round(p.form)};
}
function botWhen(){return {se:S.season,wk:S.week,tw:S.tw||0};}
/* Her aksiyon kendi try/catch'inde: bir hata koşuyu durdurmasın, kayda geçsin.
   Aynı hata yüzlerce kez tekrarlanabilir; ilk 3'ü yığınla, gerisi sayıyla. */
function botSafe(where,fn){
  try{return fn();}
  catch(e){
    const msg=String(e&&e.message||e);
    const key=where+'|'+msg;
    BOT.errSeen[key]=(BOT.errSeen[key]||0)+1;
    if(BOT.errSeen[key]<=3){
      BOT.log.err.push(Object.assign(botWhen(),{where,msg,
        stack:String(e&&e.stack||'').split('\n').slice(1,5).map(s=>s.trim()).join(' | ')}));
    }
    /* Yarıda kalan bir modal sonraki aksiyonu kilitlemesin. */
    try{closeModal();}catch(x){}
    return undefined;
  }
}
function botSheet(){return document.getElementById('sheet').innerHTML||'';}

/* ---------- sarmalayıcılar ---------- */
save=function(){};       // her hafta ~7000 oyuncuyu diske yazmak koşuyu boğuyor
render=function(){};     // görünüm çizimi bu aracın konusu değil; modallar çiziliyor
const botToast0=toast;
toast=function(m){BOT.lastToast=String(m);};
/* Haftanın pencereleri oyunun kendi kuyruğu yerine botun kuyruğuna giriyor.
   Oyunun kuyruğu closeModal()+setTimeout ile ilerliyor; senkron bir koşuda o
   zamanlayıcı hiç çalışmaz. Fonksiyonların KENDİSİ değişmiyor, yalnız ne zaman
   çağrıldıkları. */
pushModal=function(fn){BOT.q.push(fn);};
const botShowEvent0=showEvent;
showEvent=function(ref){BOT.modal='event';return botShowEvent0(ref);};
const botShowPoach0=showPoach;
showPoach=function(){BOT.modal='poach';return botShowPoach0();};
/* Ekrana basılan her modal taranıyor: undefined/NaN/[object Object] bir değerin
   arayüze sızdığını gösterir. on*="…" öznitelikleri önce siliniyor — onlar kod. */
const botOpenModal0=openModal;
openModal=function(html,lock){
  const txt=String(html).replace(/\son\w+="[^"]*"/g,'').replace(/<svg[\s\S]*?<\/svg>/g,'');
  const m=/undefined|NaN|\[object Object\]/.exec(txt);
  if(m){
    const key='modal|'+txt.slice(Math.max(0,m.index-30),m.index+20);
    if(!BOT.errSeen[key]){BOT.errSeen[key]=1;
      BOT.log.err.push(Object.assign(botWhen(),{where:'modal metni',msg:'"'+m[0]+'" ekrana sızdı',
        stack:txt.slice(Math.max(0,m.index-80),m.index+40).replace(/\s+/g,' ')}));}
  }
  return botOpenModal0(html,lock);
};
const botApplyEff0=applyEff;
applyEff=function(r,c){const out=botApplyEff0(r,c);BOT.lastEff={r,out};return out;};
const botCut0=transferCutFor;
transferCutFor=function(p,fee,wasFree){const v=botCut0(p,fee,wasFree);BOT.lastCut=v;return v;};

const botDoTransfer0=doTransfer;
doTransfer=function(p,b,fee,quiet,terms){
  const a=botSnap(p),wasFree=isFree(p),rep0=S.rep,cash0=S.cash;
  const soPct=p.so&&p.so.pct?p.so.pct:0,tpo=!!p.tpo,rate=transferPct();
  BOT.lastCut=null;
  const ret=botDoTransfer0.apply(this,arguments);
  const tt=terms||{};
  const of=BOT.offerMap[p.id];
  BOT.log.tr.push(Object.assign(botWhen(),{
    kind:BOT.bidPids[p.id]?'kulüp teklifi':of?'benim teklifim':'diğer',
    n:a.n,age:a.age,pos:a.pos,r:a.r,pot:a.pot,
    from:a.club,fromLg:a.lg,fromStr:a.str,to:b.n,toLg:lgName(b.lg),toStr:b.str,
    fee:wasFree?0:fee,val:a.val,ratio:wasFree||!a.val?0:Math.round(fee/a.val*100)/100,
    wageOld:a.wage,wageNew:p.wage,yrsOld:a.yrs,yrsNew:p.yrs,
    cut:BOT.lastCut||0,rate,pay:tt.pay||1,gb:tt.gb||0,so:tt.so||0,
    soPaidPct:soPct,tpo,free:wasFree,rep:botR1(S.rep-rep0),cash:botR1(S.cash-cash0)}));
  if(of){of.outcome='kabul';of.to=b.n;delete BOT.offerMap[p.id];}
  delete BOT.bidPids[p.id];
  return ret;
};
/* Dünyanın kendi transferleri (kulüpler arası, botun dışında). */
const botAi0=aiTransfer;
aiTransfer=function(p,buyer,fee,idx){
  if(BOT.cfg&&BOT.cfg.world){
    const a=botSnap(p);
    BOT.log.ai.push(Object.assign(botWhen(),{n:a.n,age:a.age,pos:a.pos,r:a.r,pot:a.pot,
      from:a.club,fromLg:a.lg,to:buyer.n,toLg:lgName(buyer.lg),fee,val:a.val,
      wageOld:a.wage,agent:p.agent||'yok'}));
  }
  return botAi0.apply(this,arguments);
};
const botNews0=pushNews;
pushNews=function(key,params,type,action){
  BOT.log.news[key]=(BOT.log.news[key]||0)+1;
  const pr=params||{};
  if(key==='contractSigned'){
    for(let i=BOT.log.ct.length-1;i>=0;i--){
      const c=BOT.log.ct[i];
      if(c.pid===pr.pid&&c.result==='anlaşıldı'&&!c.signed){c.signed=true;c.signedTw=S.tw;break;}
    }
  } else if(key==='offerRej'){
    const of=BOT.offerMap[pr.pid];
    if(of){of.rej++;if(of.rej>=of.clubs.length){of.outcome='ret';delete BOT.offerMap[pr.pid];}}
  } else if(key==='agreedWait'){
    const of=BOT.offerMap[pr.pid];
    if(of){of.outcome='anlaşıldı, pencere bekleniyor';of.to=pr.c;}
  }
  return botNews0.apply(this,arguments);
};

/* ---------- olaylar ---------- */
/* Seçenek seçimi. 'rastgele' her seçeneği eşit dener — "hangi cevap ne veriyor"
   tablosu için en iyi kapsama budur. Diğerleri seçeneğin sonucunu birkaç kez
   örnekleyip ortalamaya bakar; örnekleme botun kendi rastgele akışıyla yapılır
   ki oyunun zar sırası bozulmasın. */
function botPeek(opt,c){
  const keep=Math.random,acc={cash:0,rep:0,rel:0},N=6;
  Math.random=BOT.rnd;
  try{
    for(let k=0;k<N;k++){
      const r=evScaled(opt.eff(c)||{})||{};
      acc.cash+=r.cash||0;acc.rep+=r.rep||0;acc.rel+=(r.trust||0)+(r.morale||0);
    }
  } finally{Math.random=keep;}
  return {cash:acc.cash/N,rep:acc.rep/N,rel:acc.rel/N};
}
function botPickOpt(ev,c){
  const pol=BOT.cfg.ev,n=ev.opts.length;
  if(pol==='ilk')return 0;
  if(pol==='rastgele')return Math.floor(BOT.rnd()*n);
  const key=pol==='nakit'?'cash':pol==='itibar'?'rep':'rel';
  let best=0,bv=-Infinity;
  ev.opts.forEach((o,i)=>{const v=botPeek(o,c)[key];if(v>bv){bv=v;best=i;}});
  return best;
}
function botEffMap(out){const m={};(out||[]).forEach(x=>{m[x.k]=x.v;});return m;}
function botDoEvent(){
  const ref=S.evCur,ev=evById(ref.id),c=evCtx(ref.pid);
  const i=botPickOpt(ev,c),pl=c.p?botSnap(c.p):null;
  const rep0=S.rep,cash0=S.cash,n0=S.clients.length;
  BOT.lastEff=null;
  evChoose(i);
  const le=BOT.lastEff||{r:{},out:[]},r=le.r||{};
  BOT.log.ev.push(Object.assign(botWhen(),{
    id:ev.id,title:ev.ttl(c).tr,cat:evCat(ev),size:evSmall(ev)?'küçük':'büyük',
    opt:i+1,nOpts:ev.opts.length,optText:ev.opts[i].t.tr,
    player:pl,result:r.msg?r.msg.tr:'',
    want:{cash:r.cash||0,rep:r.rep||0,morale:r.morale||0,trust:r.trust||0,form:r.form||0},
    got:botEffMap(le.out),ag:r.ag||null,flag:r.flag||'',
    rep0:botR1(rep0),cash0:botR1(cash0),lostClient:S.clients.length<n0}));
}
function botDoPoach(){
  const pc=S.poach,p=byId(pc.pid),r=rivalById(pc.ri);
  const i=Math.floor(BOT.rnd()*POACH_OPT.length),pl=botSnap(p);
  const risk=poachChance(p,r),cash0=S.cash;
  poachChoose(i);
  BOT.log.poach.push(Object.assign(botWhen(),{player:pl,rival:rivalName(r),arch:rivalArch(r).id,
    opt:i+1,optText:POACH_OPT[i].t.tr,risk:Math.round(risk*100),
    lost:!S.clients.includes(pl.pid),cash:botR1(S.cash-cash0)}));
}
function botDrain(){
  let guard=0;
  while(BOT.q.length&&guard++<20){
    const fn=BOT.q.shift();
    BOT.modal=null;
    botSafe('hafta penceresi',fn);
    if(BOT.modal==='event'&&S.evCur)botSafe('olay',botDoEvent);
    else if(BOT.modal==='poach'&&S.poach)botSafe('ayartma',botDoPoach);
    botSafe('closeModal',closeModal);
  }
}

/* ---------- sözleşme yenileme ---------- */
function botNegotiate(p){
  negCtx=null;BOT.lastToast='';
  openNeg(p.id);
  if(!negCtx||negCtx.pid!==p.id)return;
  const a=botSnap(p),pol=BOT.cfg.neg,max=negCtx.max;
  const rec=Object.assign(botWhen(),{pid:p.id,player:a,reason:negCtx.reason,
    clubMax:Math.round(max),market:marketWage(p.r),clubYears:clubYears(p),
    last5:botR1(last5Avg(p)),rounds:[],result:'',signed:false});
  /* Açılış talebi politikaya göre. 'normal' kulübün tavanına yakın ve kulübün
     rahat ettiği süreyle oturur; 'acgozlu' tavanın üstünü ve beş yılı ister;
     'temkinli' oyunun kendi açılış rakamını (tavanın %95'i) hiç değiştirmez. */
  if(pol==='acgozlu'){negCtx.wage=Math.max(1,Math.round(max*1.25));negCtx.years=5;}
  else if(pol==='normal'){negCtx.wage=Math.max(1,Math.round(max*1.05));negCtx.years=clubYears(p);}
  else negCtx.years=Math.min(3,clubYears(p));
  for(let guard=0;guard<4;guard++){
    const n0=S.pendC.length,round=negCtx.round,wage=negCtx.wage,years=negCtx.years;
    const meets=negCtx.counter&&wage<=Math.ceil(negCtx.counter*1.02)&&years<=negCtx.cYears;
    const ch=meets?1:negChance(p,wage,negCtx.patience);
    negSubmit();
    const row={round,wage,years,chance:Math.round(ch*100)};
    if(S.pendC.length>n0){row.res='kabul';rec.rounds.push(row);rec.result='anlaşıldı';break;}
    if(negCtx.round>3||wage/negCtx.max>1.7){row.res='koptu';rec.rounds.push(row);rec.result='koptu';break;}
    row.res='karşı teklif';row.counter=negCtx.counter;row.cYears=negCtx.cYears;
    rec.rounds.push(row);
    /* Karşı teklif geldi. Açgözlü bir tur daha ortayı dener, son turda kabul
       eder; diğerleri kulübün rakamını ve süresini doğrudan kabul eder. */
    if(pol==='acgozlu'&&negCtx.round<3)negCtx.wage=Math.round((negCtx.counter+wage)/2);
    else{negCtx.wage=negCtx.counter;negCtx.years=negCtx.cYears;}
  }
  if(rec.result==='anlaşıldı'){
    const pc=S.pendC[S.pendC.length-1];
    rec.wageNew=pc.wage;rec.yrsNew=pc.years;rec.fee=pc.fee;rec.rate=Math.round(pc.rate*1000)/10;
    rec.raise=a.wage?Math.round((pc.wage/a.wage-1)*100):0;
    rec.repPay=signRepFor(pc.fee,pc.wage,pc.rate);
  }
  BOT.log.ct.push(rec);
  closeModal();
}
function botRenewals(){
  S.clients.slice().forEach(id=>{
    const p=byId(id);
    if(!p||isFree(p)||renewBlock(p))return;
    botSafe('sözleşme',()=>botNegotiate(p));
  });
}

/* ---------- transfer teklifi ---------- */
function botWantsMove(p){
  const pol=BOT.cfg.tr;
  if(pol==='hic')return false;
  if(pol==='cok')return true;
  const need=isFree(p)||p.morale<45||p.r>teamStr(p.team)+3;
  if(need)return true;
  return pol==='orta'&&BOT.rnd()<0.35;
}
function botSetField(id,v){document.getElementById(id).value=String(v);}
function botOfferTransfer(p){
  BOT.lastToast='';
  document.getElementById('sheet').innerHTML='';
  openTransfer(p.id);
  /* Alıcı listesi openTransfer()'ın yerel değişkeni; ekranda ne çizildiyse onu
     okuyoruz — oyuncunun gördüğü liste de bu. */
  const ids=[];
  botSheet().replace(/trToggle\((\d+)\)/g,(m,d)=>{if(ids.indexOf(+d)<0)ids.push(+d);return m;});
  const a=botSnap(p),free=isFree(p);
  const rec=Object.assign(botWhen(),{pid:p.id,player:a,free,val:a.val,fee:0,ratio:0,
    clubs:[],pay:1,gb:0,so:0,fix:0,fixCost:0,rej:0,outcome:'',to:''});
  if(!ids.length){
    rec.outcome=BOT.lastToast?'açılamadı: '+BOT.lastToast:'ilgilenen kulüp yok';
    BOT.log.offers.push(rec);closeModal();return;
  }
  /* İstenen bonservis değerin 0,8–1,5 katı arasında dolaşıyor: fiyat/kabul
     ilişkisi ancak farklı fiyatlar denenirse görünür. Sınırlar ekrandaki
     kaydırıcının sınırları (0,7×–1,8×). */
  const mult=[0.8,1,1.2,1.5][Math.floor(BOT.rnd()*4)];
  const v=a.val;
  const tenths=free?0:clamp(Math.round(v*10*mult),Math.round(v*7),Math.round(v*18));
  const pay=free?1:(BOT.rnd()<0.3?4:1),so=free?0:(BOT.rnd()<0.25?10:0),gb=free?0:(BOT.rnd()<0.2?15:0);
  botSetField('feeR',tenths);botSetField('trPay',pay);botSetField('trGb',gb);
  botSetField('trSo',so);botSetField('trFix',0);
  const pick=ids.map(i=>S.teams[i]).sort((x,y)=>y.str-x.str).slice(0,3);
  pick.forEach(tm=>trToggle(tm.id));
  const cash0=S.cash,n0=(S.offers||[]).length;
  submitOffers(p.id);
  const sent=(S.offers||[]).length-n0;
  rec.fee=tenths/10;rec.ratio=v?Math.round(tenths/10/v*100)/100:0;
  rec.pay=pay;rec.gb=gb;rec.so=so;rec.fixCost=botR1(cash0-S.cash);
  rec.clubs=pick.map(tm=>({n:tm.n,lg:lgName(tm.lg),str:tm.str}));
  if(sent>0){rec.outcome='bekliyor';BOT.offerMap[p.id]=rec;}
  else rec.outcome='gönderilemedi: '+BOT.lastToast;
  BOT.log.offers.push(rec);
  closeModal();
}
function botTransfers(){
  const mw=midWeek(),tot=totalWeeks();
  /* Teklifin cevabı 1–3 hafta sürüyor; pencereden hemen önce ve pencerenin
     başında denemek kararın pencereye denk gelmesini sağlıyor. */
  const tryWeek=S.week===mw-2||S.week===mw||S.week===tot-2||S.week===2;
  S.clients.slice().forEach(id=>{
    const p=byId(id);
    if(!p)return;
    if(offerFor(id)||pendingFor(id)||movedThisSeason(p)||pendCFor(id))return;
    if(!(tryWeek||isFree(p)))return;
    if(!botWantsMove(p))return;
    botSafe('transfer teklifi',()=>botOfferTransfer(p));
  });
}

/* ---------- müşteri kazanma ---------- */
function botSignClients(){
  if(S.clients.length>=maxClients()||S.cash<30)return;
  const cap=repCap();
  const cands=[];
  S.players.forEach(p=>{
    if(p.agent==='you'||p.r<50)return;
    if(!knownLg(teamOf(p).lg))return;
    if(profileOf(p)>cap||pitchCd(p)>0||S.cash<pitchCost(p))return;
    const ch=pitchChance(p);
    if(ch<0.3)return;
    cands.push({p,s:ch*(p.r+0.4*(p.pot-p.r))});
  });
  if(!cands.length)return;
  cands.sort((x,y)=>y.s-x.s);
  const p=cands[Math.floor(BOT.rnd()*Math.min(5,cands.length))].p;
  botSafe('görüşme',()=>{
    MT=null;BOT.lastToast='';
    const a=botSnap(p),wasAgent=p.agent||'yok',cash0=S.cash;
    openMeeting(p.id);
    if(!MT||MT.pid!==p.id)return;
    const c0=MT.chance;
    for(let k=0;k<3&&MT&&MT.round<3;k++){
      const opts=MT.order.slice(MT.round*3,MT.round*3+3);
      let best=opts[0],bv=-Infinity;
      opts.forEach(li=>{const e=LINES[li].eff(MT.ctx);if(e>bv){bv=e;best=li;}});
      pickLine(best);
    }
    const c1=MT.chance;
    finishMeeting();
    BOT.log.meet.push(Object.assign(botWhen(),{player:a,agentBefore:wasAgent,
      chance0:c0,chance1:c1,ok:S.clients.includes(p.id),cost:botR1(cash0-S.cash),rep:botR1(S.rep)}));
    closeModal();
  });
}

/* ---------- gelen kutusu, yetenek, keşif ---------- */
function botInbox(){
  for(let i=0;i<S.inbox.length;i++){
    const m=S.inbox[i];
    if(!m||!m.action)continue;
    const p=byId(m.action.pid);
    botSafe('gelen kutusu',()=>{
      if(!p){inboxAction(i,false);return;}
      if(m.action.type==='sign'){
        inboxAction(i,S.clients.length<maxClients()&&p.agent!=='you');
      } else if(m.action.type==='bid'){
        const pol=BOT.cfg.tr;
        const ok=p.agent==='you'&&!movedThisSeason(p)&&!offerFor(p.id)&&!pendingFor(p.id)
          &&pol!=='hic'&&(pol==='cok'||m.action.fee>=valueOf(p));
        if(ok)BOT.bidPids[p.id]=1;
        inboxAction(i,ok);
      } else inboxAction(i,false);
    });
  }
}
function botSkills(){
  let guard=0;
  while(guard++<6){
    const open=SKILLS.filter(sk=>skillState(sk)==='open');
    if(!open.length)return;
    const sk=open[Math.floor(BOT.rnd()*open.length)];
    botSafe('yetenek',()=>skillBuy(sk.id));
    if(hasSkill(sk.id))BOT.log.skills.push(Object.assign(botWhen(),{id:sk.id,n:sk.n.tr,rep:botR1(S.rep)}));
    else return;
  }
}
function botScout(){
  /* Kasanın en çok %40'ı keşfe gider: açılışta her şeyi keşfe yatırıp müşteri
     görüşmesine para bırakmayan bir bot, dengeyi değil kendi hatasını ölçer. */
  let best=-1,bc=Infinity;
  LEAGUES.forEach((l,i)=>{
    if(knownLg(i)||scoutPending(i))return;
    const c=scoutCost(i);
    if(c<bc){bc=c;best=i;}
  });
  if(best<0||bc>S.cash*0.4)return;
  botSafe('keşif',()=>{
    buyScout(best);
    if(scoutPending(best))BOT.log.scout.push(Object.assign(botWhen(),{lg:lgName(best),cost:bc}));
    closeModal();
  });
}

/* ---------- değişmezler ve özet ---------- */
function botChecks(){
  const bad=[];
  if(!isFinite(S.cash))bad.push('S.cash='+S.cash);
  if(!isFinite(S.rep))bad.push('S.rep='+S.rep);
  S.clients.forEach(id=>{
    const p=byId(id);
    if(!p){bad.push('müşteri yok: '+id);return;}
    if(p.agent!=='you')bad.push(p.n+': agent='+p.agent);
    ['wage','morale','form','r','pot','yrs','age'].forEach(k=>{if(!isFinite(p[k]))bad.push(p.n+'.'+k+'='+p[k]);});
    if(p.pot<p.r)bad.push(p.n+': pot<r ('+p.pot+'<'+p.r+')');
  });
  if(new Set(S.clients).size!==S.clients.length)bad.push('müşteri listesinde tekrar');
  bad.forEach(msg=>{
    const key='değişmez|'+msg.replace(/\d+/g,'#');
    BOT.errSeen[key]=(BOT.errSeen[key]||0)+1;
    if(BOT.errSeen[key]<=3)BOT.log.err.push(Object.assign(botWhen(),{where:'değişmez',msg,stack:''}));
  });
}
function botSeason(se){
  const ps=S.players,n=ps.length;
  let age=0,fa=0,un=0,amin=99,amax=0;
  ps.forEach(p=>{age+=p.age;if(p.team<0)fa++;if(p.agent===null)un++;if(p.age<amin)amin=p.age;if(p.age>amax)amax=p.age;});
  const cl=S.clients.map(byId).filter(Boolean);
  BOT.log.season.push({se,rep:botR1(S.rep),repMax:botR1(S.repMax||S.rep),cash:Math.round(S.cash),
    level:agentLevel(),points:skillPoints(),skills:skillsTaken().length,
    clients:cl.length,cap:maxClients(),
    income:botR1(weeklyIncome()),cost:botR1(weeklyCost()),commPct:commissionPct(),
    known:(S.known||[]).length,
    clAvgR:cl.length?botR1(cl.reduce((s,p)=>s+p.r,0)/cl.length):0,
    clAvgWage:cl.length?Math.round(cl.reduce((s,p)=>s+p.wage,0)/cl.length):0,
    pop:n,ageAvg:botR1(age/n),ageMin:amin,ageMax:amax,freeAgents:fa,unrep:un});
}

/* ---------- ana döngü ---------- */
BOT.run=function(cfg){
  BOT.cfg=cfg;
  BOT.rnd=__mb32((cfg.seed*2654435761+97)>>>0);   // botun kendi zar akışı
  L='tr';
  newGame();
  createAgent('Bot','Test',cfg.nat,'');
  let guard=0;
  const limit=cfg.seasons*60+20;
  while(S.season<=cfg.seasons&&guard++<limit){
    botSafe('gelen kutusu',botInbox);
    botSafe('yetenek',botSkills);
    botSafe('keşif',botScout);
    botSafe('müşteri',botSignClients);
    botSafe('sözleşme',botRenewals);
    botSafe('transfer',botTransfers);
    const se=S.season;
    BOT.log.weeks.push({se,wk:S.week,cash:Math.round(S.cash),rep:botR1(S.rep),cl:S.clients.length});
    botSafe('nextWeek',nextWeek);
    botDrain();
    botChecks();
    /* Olay bu hafta ÇIKABİLİR miydi? Hiç çıkmayan bir olayın koşulu mu hiç
       sağlanmadı, yoksa zar mı gelmedi — ikisini ayıran sayı bu. when() zar
       atmıyor, yani saymak oyunun zar sırasını bozmuyor. */
    botSafe('olay uygunluğu',()=>{BOT.log.eligWeeks++;evEligible(false).forEach(e=>{BOT.log.elig[e.id]=(BOT.log.elig[e.id]||0)+1;});});
    if(S.season!==se)botSeason(se);
  }
  Object.keys(BOT.offerMap).forEach(k=>{if(BOT.offerMap[k].outcome==='bekliyor')BOT.offerMap[k].outcome='koşu bitti';});
  BOT.log.errCounts=BOT.errSeen;
  BOT.log.allEvents=EVENTS.map(e=>e.id);
  BOT.log.final={season:S.season,week:S.week,rep:botR1(S.rep),cash:Math.round(S.cash),
    clients:S.clients.map(byId).filter(Boolean).map(botSnap)};
  return JSON.stringify(BOT.log);
};
