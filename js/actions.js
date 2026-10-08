'use strict';
/* js/actions.js — oyuncu aksiyonları: sözleşme pazarlığı, transfer teklifleri, temsilcilik görüşmesi, keşif satın alma */
/* ================= NEGOTIATION ================= */
/* Son 5 maçın ortalama reytingi kulübün cömertliğini doğrudan belirler:
   iyi oynayan zam alır, kötü oynayan almaz. 5 maçı dolmamışsa nötr. */
function negPerf(p){
  const l5=last5Avg(p);
  if(!l5)return 1;
  return clamp(1+(l5-6.80)*0.16,0.88,1.40);
}
function clubMaxWage(p){
  const tm=teamOf(p);
  /* Kulübün cömertliği görüşmenin gerekçesine bağlı: sözleşmesi biten oyuncuyu
     kaybetmemek için para verir, formda olanı ödüllendirir, düşük maaşlıyı hizaya
     çeker. Gerekçesiz masaya oturmaz zaten (bkz. renewBlock). */
  const reason=renewReason(p);
  const lever=reason==='expiring'?1.12:reason==='form'?1.10:reason==='underpaid'?1.02:0.90;
  /* skillBonus('wage') — kulübün ödeyebileceği tavanı yükselten tek yer. */
  const base=marketWage(p.r)*(0.90+(S.rep/500))*(0.8+tm.bud*0.35)*lever*negPerf(p)*(1+skillBonus('wage'));
  /* Yenileme masasında kulüp mevcut maaşın altını teklif etmez — kimse zam
     görüşmesine indirim beklentisiyle oturmaz. İstisnası yaşlanan oyuncu:
     30'unu geçmişse kulübün eli rahatlar, 32'yi geçmişse kesinti isteyebilir. */
  const floor=p.age<=30?1.06:p.age<=32?1.00:0.92;
  return Math.max(base,p.wage*floor);
}
/* ===== sözleşme süresi =====
   Kulübün gönül rahatlığıyla bağlanacağı en uzun süre oyuncunun yaşına bağlı:
   genç oyuncuyu beş yıl kilitlemek ister, otuzunu geçmiş oyuncuya uzun sözleşme
   vermek risktir. Bu sürenin üstündeki her yıl kabul şansından NEG_YRS.over
   kadar götürür; altı serbesttir.

   Neden var: süre eskiden kabul şansına hiç girmiyordu, imza payı ise süreyle
   çarpılıyordu — kaydırıcının tek doğru cevabı vardı (5 yıl). Seçenek sunan ama
   seçim gerektirmeyen bir kontrol karar değildir. */
const NEG_YRS={over:0.08};
function clubYears(p){return p.age<=23?5:p.age<=26?4:p.age<=29?3:p.age<=31?2:1;}
function negYearsPen(p,years){return Math.max(0,years-clubYears(p))*NEG_YRS.over;}
/* İmza payı — tek hesap yeri. Ekrandaki satır, anlaşma anında kayda yazılan tutar
   ve eski kayıtların imza günündeki hesabı buradan geçiyor.

   Yalnız yeni kazanılan kısım ödenir: sözleşmeye EKLENEN yıllar yeni maaş
   üzerinden, zaten duran yıllar ise yalnız ZAM FARKI üzerinden. Eski hesap her
   yenilemede sözleşmenin tamamını (maaş × 52 × yıl) baştan ödüyordu; yenileme
   45 haftada bir yeniden açılabildiği için aynı yılların komisyonu her sezon
   yeniden tahsil ediliyordu ve haftalık komisyon bunun üstüne ayrıca geliyordu.
   Ölçüldü: 12. sezonda imza payı haftalık komisyonun beş katıydı.

   Bu hâliyle bir kariyerde ödenen toplam yıl, geçen süreyle sınırlı: sözleşme
   bugünden en çok beş yıl öteye uzanabildiği için yenilemenin zamanlaması
   toplamı büyütemez. Sözleşmesi biten oyuncuyu uzun süreye bağlamak eskisine
   yakın öder; dört yılı duran oyuncuyu yeniden beş yıla çekmek bir yıl öder. */
function signFeeFor(p,wage,years,rate){
  const left=Math.max(0,p.yrs||0);
  const added=Math.max(0,years-left), kept=Math.min(years,left);
  return Math.round((wage*added+Math.max(0,wage-p.wage)*kept)*52*rate);
}
/* Bir imzanın itibarı: anlaşmanın kattığı "yıl karşılığı" ile orantılı.
   Yıl karşılığı = imza payı / (bir yıllık komisyon) — yani eklenen yıllar artı
   zam farkının duran yıllara düşen payı. NEG_REP.yrs yıl karşılığında tam tutar
   (NEG_REP.full) verilir, altı orantılı, sıfır katkı sıfır itibar.

   Eşik yerine oran: "pay sıfırdan büyükse ver" kuralı 1K'lık zamla aşılırdı.
   Sözleşmesi biten oyuncuyu üç yıla bağlamak tam tutarı verir; dört yılı duran
   oyuncuya bir yıl ve küçük bir zam eklemek yarısından azını. */
const NEG_REP={full:0.7, yrs:2};
function signRepFor(fee,wage,rate){
  const year=wage*52*rate;
  if(!(year>0)||!(fee>0))return 0;
  return Math.round(NEG_REP.full*clamp(fee/year/NEG_REP.yrs,0,1)*100)/100;
}
/* Kabul olasılığı — bar da bu değeri gösterir, yani çubuk gerçeği söyler.
   Süre verilmezse masadaki süre okunur. */
function negChance(p,wage,patience,years){
  const ratio=wage/negCtx.max;
  const trustBonus=(trustOf(p)-55)/600;
  return clamp(clamp(1.5-ratio,0.05,0.92)*(0.65+0.35*patience/100)
               +S.rep/500+trustBonus+skillBonus('neg')
               -negYearsPen(p,years===undefined?negCtx.years:years),0,1);
}
function openNeg(pid){
  const p=byId(pid);
  const blk=renewBlock(p);
  if(blk==='pending'){toast(t('contractPendingT'));return;}
  if(blk==='cooldown'){toast(t('renewCdMsg').replace('{w}',renewCd(p)));return;}
  if(blk==='noreason'){toast(t('renewNoReason'));return;}
  const max=clubMaxWage(p);
  /* Açılış talebi kulübün ödeyebileceğinin biraz altında: masaya gerçekçi bir
     rakamla oturursun, pazarlık payı yukarı doğru kalır. Formda bir oyuncuda bu
     rakam ciddi bir zamdır; 33'ünü geçmiş oyuncuda kesinti olabilir — kulüpler
     de öyle davranır. */
  negCtx={pid,round:1,max,patience:100,wage:Math.max(1,Math.round(max*0.95)),
    years:3,counter:null,reason:renewReason(p)};
  renderNeg();
}
function renderNeg(){
  const p=byId(negCtx.pid),tm=teamOf(p);
  const mood=Math.round(negChance(p,negCtx.wage,negCtx.patience)*100);
  const mc=mood>60?'var(--acc)':mood>30?'var(--warn)':'var(--bad)';
  /* Kaydırıcı sınırları: aşağıda mevcut maaş, yukarıda kabul şansının sıfırlandığı yer */
  const sMin=Math.max(1,Math.floor(Math.min(p.wage,negCtx.max)*0.9));
  const sMax=Math.max(sMin+2,Math.ceil(negCtx.max*1.6));
  openModal(`
   <div class="row">${tmBadge(tm,42)}
     <div style="flex:1;min-width:0"><h2>${t('negotiate')}</h2>
     <div class="sub">${p.n} · ${tm.n}</div></div>
     <span class="roundPill">${t('round')} ${negCtx.round}/3</span></div>
   <div class="dctx" style="margin-top:10px">${ICONS?ICONS.alert:''}<span>${t('why_'+negCtx.reason)}</span></div>
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
     <input type="range" min="${sMin}" max="${sMax}" value="${clamp(negCtx.wage,sMin,sMax)}"
        oninput="negCtx.wage=+this.value;renderNeg()">
     <div style="margin-top:12px"><b style="font-size:12.5px">${t('contractLen')}: <span class="num">${negCtx.years} ${t('yrs')}</span></b>
       <input type="range" min="1" max="5" value="${negCtx.years}" oninput="negCtx.years=+this.value;renderNeg()">
       ${negCtx.years>clubYears(p)?`<div class="faint" style="font-size:11.5px;margin-top:4px;color:var(--warn)">${t('negYrsOver').replace('{n}',clubYears(p))}</div>`:''}</div>
     ${negCtx.counter?`<div class="counterCard">
       <b style="color:var(--warn)">${t('counter')}: ${fmtK(negCtx.counter)}/${t('wk')} · ${negCtx.cYears} ${t('yrs')}</b><br>
       <span class="faint" style="font-size:11.5px">${L==='tr'?'Bu rakamı ve süreyi (ya da altını) seçersen anlaşma kesin.':'Match the wage and length (or go lower) to seal the deal.'}</span></div>`:''}
     <div style="margin-top:14px;display:flex;justify-content:space-between;font-size:11px">
       <span class="sub" style="font-weight:700">${t('clubMood')}</span>
       <b class="num" style="color:${mc}">%${Math.round(mood)}</b></div>
     <div class="moodbar"><div style="width:${mood}%;background:${mc}"></div></div>
     <div class="divider" style="margin:12px 0"></div>
     <div style="display:flex;justify-content:space-between;font-size:12px">
       <span class="sub">${t('signBonus')} · %${commissionPct()}</span>
       <b class="num" style="color:var(--gold)">${fmtK(signFeeFor(p,negCtx.wage,negCtx.years,commissionRate()))}</b></div>
     <div class="faint" style="font-size:11px;margin-top:4px">${t('feeBasis')}</div>
   </div>
   <button class="btn p" onclick="negSubmit()">${t('send')}</button>
   <button class="btn s" style="margin-top:8px" onclick="closeModal()">${t('walkAway')}</button>`);
}
function negSubmit(){
  const p=byId(negCtx.pid);
  const ratio=negCtx.wage/negCtx.max;
  /* accepting the club's own counter (or less) always seals the deal */
  /* Karşı teklif maaşla birlikte süreyi de taşıyor: yalnız maaşı tutturup süreyi
     beş yılda bırakmak kesin anlaşma sayılsaydı, süre cezası ilk red sonrasında
     bedelsiz aşılırdı. */
  const meetsCounter=negCtx.counter&&negCtx.wage<=Math.ceil(negCtx.counter*1.02)
    &&negCtx.years<=negCtx.cYears;
  /* Ekrandaki çubukla birebir aynı hesap — gördüğün oran gerçek oran. */
  const acc=meetsCounter?1:negChance(p,negCtx.wage,negCtx.patience);
  if(RF()<acc){
    /* anlaşma sağlandı — imzalar birkaç hafta içinde atılır, komisyon imzada yatar.
       Pay ANLAŞMA anında hesaplanıp kayda yazılıyor: ekranda görülen tutar odur ve
       imzaya kadar geçen haftalarda oyuncunun kalan yılı değişirse kaymamalı. */
    const rate=commissionRate();
    S.pendC=S.pendC||[];
    S.pendC.push({pid:p.id,wage:negCtx.wage,years:negCtx.years,rate,
      fee:signFeeFor(p,negCtx.wage,negCtx.years,rate),at:(S.tw||0)+R(1,2)});
    p.morale=clamp(p.morale+10,0,100);p.ignored=0;p.hm=(S.tw||0)+4;
    /* Yeni imzadan sonra kulüp uzun süre masaya oturmaz. */
    p.rnw=(S.tw||0)+45;
    pushNews('contractAgreed',{n:p.n,pid:p.id,c:teamOf(p).n,tid:p.team,y:negCtx.years,w:fmtK(negCtx.wage)},'good');
    toast(t('negAgreed'));closeModal();save();render();
  } else {
    negCtx.round++;negCtx.patience-=30;
    if(negCtx.round>3||ratio>1.7){
      /* Koptuktan sonra kulüp bir süre masaya dönmez. Bekleme olmasaydı oyuncu
         her hafta yeniden deneyip eninde sonunda kabul ettirirdi. */
      repEvent(-1.5);p.morale=clamp(p.morale-8,0,100);p.rnw=(S.tw||0)+14;
      toast(t('negFail'));closeModal();save();render();
    } else {
      const counter=Math.round(negCtx.max*(0.82+RF()*0.12));
      negCtx.counter=counter;
      /* Kulüp kendi rahat ettiği süreyi geçmez; daha kısasını istediysen o kalır. */
      negCtx.cYears=Math.min(negCtx.years,clubYears(p));
      negCtx.years=negCtx.cYears;
      negCtx.wage=Math.min(negCtx.wage,Math.round(counter*1.15));
      toast(`${t('counter')}: ${fmtK(counter)}/${t('wk')}`);
      renderNeg();
    }
  }
}
/* ================= TRANSFER ================= */
let trSel=new Set();
/* Açık teklif ekranının oyuncusu. trSel gibi yalnız görünüm durumu — kayda hiç
   girmiyor, modal kapanınca anlamı kalmıyor. trFin() finansal satırları
   yamalarken oyuncuyu buradan buluyor. */
let trPid=null;
/* Ek madde kademeleri. Kabul etkisi seçilen büyüklükle orantılı hesaplanır
   (bkz. clauseAcc), böylece "az iste, kolay kabul edilsin" dengesi kurulur. */
const PAYPLANS=[2,3,4,6,8,12];
const GBTIERS=[10,15,20,25];
const SOTIERS=[5,10,15,20,25,30,40,50];
/* Taksit ve gol bonusu kulübün riskini azaltır → kabulü kolaylaştırır.
   Satış payı gelecekteki kazancından alır → zorlaştırır, oran büyüdükçe daha çok. */
function clauseAcc(pay,gb,so){
  const inst=pay>1?Math.min(0.14,0.035*Math.log2(pay)+0.03):0;
  const bonus=gb?0.02+(gb-10)*0.004:0;
  const sell=so?0.02+so*0.0075:0;
  return inst+bonus-sell;
}
/* Aracı ücreti: kulüp başına, anlaşmanın büyüklüğüne göre. Kasadaki para büyüdükçe
   harcayacak yer de büyüsün diye bonservise (yoksa maaşa) endeksli. */
function fixCostFor(p,fee){
  const base=fee>0?fee*1000*0.05:p.wage*22*0.05;
  return Math.max(4,Math.round(base));
}
/* Bonservisten alacağın pay — tek hesap yeri. doTransfer() tahsil ederken,
   teklif ekranı bonservisli transferi gönderimden önce yazarken buradan okuyor;
   ikisi ileride ayrılamasın diye formül burada duruyor.
   wasFree çağıran taraftan geliyor: doTransfer() oyuncunun kulübünü
   değiştirdikten sonra isFree(p) artık doğruyu söylemez.
   Bonservissiz kolda tutar oyuncunun HENÜZ imzalamadığı sözleşmeden gelir —
   maaşı da süresi de kabul anında, alıcı kulübe ve R(2,4)'e göre belirlenir.
   Bu yüzden teklif ekranı orada tek bir sayı yazmıyor (bkz. trFin): tahmin
   edilemeyen bir şeyi tahmin etmiş gibi göstermek, düzeltilen yanlış vaadin
   kendisiydi. */
function transferCutFor(p,fee,wasFree){
  if(p.tpo)return 0;
  const rate=transferRate();
  return wasFree?Math.max(1,Math.round(p.wage*52*p.yrs*rate))
                :Math.max(1,Math.round(fee*1000*rate));
}
/* Operasyonun peşin bedeli: kulüp başına ücret × kademe × seçili kulüp sayısı.
   submitOffers() kasadan bunu düşüyor, ekran da bunu yazıyor. */
function transferFixCost(p,fee,fix,clubCount){
  return fix?Math.round(fixCostFor(p,fee)*fix*clubCount):0;
}
function openTransfer(pid){
  const p=byId(pid);
  if(offerFor(pid)||pendingFor(pid)){toast(t('offerPending'));return;}
  if(movedThisSeason(p)){toast(t('movedAlready'));return;}
  const potBonus=(p.age<=21&&p.pot-p.r>=12)?7:(p.age<=23&&p.pot-p.r>=8)?4:0;
  const free=isFree(p);
  const buyers=S.teams.filter(tm=>{
    if(tm.id===p.team)return false;
    /* bonservissiz oyuncuya kapı daha geniş: kulübün ödeyeceği bir bedel yok */
    if(free)return p.r>=teamStr(tm.id)-9-potBonus&&RF()<0.62+(p.form-50)/120;
    return p.r>=teamStr(tm.id)-4-potBonus&&tm.bud*12>=valueOf(p)*0.5&&RF()<0.5+(p.form-50)/120;
  }).sort(()=>RF()-0.5).slice(0,6);
  if(!buyers.length){openModal(`<h2>${t('offerClubs')}</h2><div class="empty">${t('noInterest')}</div>`);return;}
  const v=valueOf(p);
  trSel=new Set();trPid=pid;
  /* Saha kendi teklif ekranını çiziyor (bkz. js/ui.js: trSahaOpen). Orası da
     aynı beş alanı aynı id'lerle üretiyor (#feeR, #trPay, #trGb, #trSo, #trFix),
     bu yüzden aşağıdaki trFin() ve submitOffers() iki yolda da aynı düğümleri
     okuyor — diğer üç tema bu satırın altındaki işaretlemeyi aynen kullanıyor. */
  if(useSahaTransfer()){trSahaOpen(p,buyers,v,free);trFin();return;}
  openModal(`
   <h2>${t('offerClubs')}</h2><div class="sub">${p.n} · ${free?t('faSub'):t('value')+': '+fmtM(v)}</div>
   <div class="sub" style="margin-top:6px">${t('pickClubs')}</div>
   ${free?`<div class="negbox"><b>${t('freeFee')}</b>
     <div class="sub" style="margin-top:6px">${t('faDealHint')}</div>
     <div class="sub" style="margin-top:10px" id="trComm"></div>${p.tpo?`<div class="sub" style="margin-top:6px">${t('tpoWhy')}</div>`:''}</div>`
   :`<div class="negbox"><b>${t('askFee')}: <span style="color:var(--acc)" id="feeV">${fmtM(v)}</span></b>
     <input type="range" min="${Math.round(v*7)}" max="${Math.round(v*18)}" value="${Math.round(v*10)}" id="feeR"
       oninput="document.getElementById('feeV').textContent=fmtM(this.value/10);trFin()">
     <div class="sub" style="margin-top:10px" id="trComm"></div>${p.tpo?`<div class="sub" style="margin-top:6px">${t('tpoWhy')}</div>`:''}
   </div>
   <div class="sect">${t('clauses')}</div>`}
   <div class="fgrid" style="margin-bottom:4px;${free?'display:none':''}">
     <label class="fitem"><span>${t('payPlan')}</span>
       <select class="fsel" id="trPay">
         <option value="1">${t('payCash')}</option>
         ${PAYPLANS.map(n=>`<option value="${n}">${n} ${t('instal')}</option>`).join('')}
       </select></label>
     <label class="fitem"><span>${t('goalBonusL')}</span>
       <select class="fsel" id="trGb">
         <option value="0">${t('none')}</option>
         ${GBTIERS.map(n=>`<option value="${n}">${n} ${t('gbGoals')}</option>`).join('')}
       </select></label>
     <label class="fitem" style="grid-column:1/-1"><span>${t('nextSaleL')}</span>
       <select class="fsel" id="trSo">
         <option value="0">${t('none')}</option>
         ${SOTIERS.map(n=>`<option value="${n}">%${n}${n>=30?' · '+t('soHard'):''}</option>`).join('')}
       </select></label>
   </div>
   ${free?'':`<div class="sub" style="margin-bottom:10px">${t('clauseHint')}</div>`}
   <div class="sect">${t('fixerL')}</div>
   <label class="fitem" style="margin-bottom:6px">
     <select class="fsel" id="trFix" onchange="trFin()">
       <option value="0">${t('none')}</option>
       <option value="1">${t('fixLow')}</option>
       <option value="2">${t('fixHigh')}</option>
     </select></label>
   <div class="sub" id="trFixC" style="margin-bottom:2px"></div>
   <div class="sub" style="margin-bottom:10px">${t('fixerHint')}</div>
   <div class="sect">${t('interested')}</div>
   <div class="list">
   ${buyers.map(b=>`<div class="pitem" onclick="trToggle(${b.id})">
     ${tmBadge(b,36)}
     <div class="pinfo"><div class="pname">${b.n}</div><div class="psub">${lgName(b.lg)} · #${teamPos(b.id)} · ${t('wage')} ~${fmtK(Math.round(marketWage(p.r)*(0.9+b.bud*0.3)))}/${t('wk')}</div></div>
     <span class="trk" id="trk${b.id}"></span></div>`).join('')}
   </div>
   <button class="btn p" id="trBtn" disabled onclick="submitOffers(${pid})">${t('sendOffers')}</button>`);
  trFin();   // rakamlar ilk açılışta da doğru olsun
}
/* Teklif ekranının canlı finans satırları. Buradan render() ya da openTransfer()
   ÇAĞRILMAZ: openTransfer() alıcı listesini RF() ile yeniden çekiyor ve trSel'i
   sıfırlıyor, yani yeniden çizim ekranı oyuncunun altından değiştirirdi. Onun
   yerine yalnız ilgili düğümler yamalanıyor — trToggle'ın onay işaretini
   yamalamasıyla aynı desen; kaydırma, odak ve seçim olduğu yerde kalıyor.
   Rakamlar submitOffers() ile aynı iki yardımcıdan geliyor. */
function trFin(){
  const p=trPid===null?null:byId(trPid);
  if(!p)return;
  const free=isFree(p);
  const feeEl=document.getElementById('feeR');
  const fee=free||!feeEl?0:+feeEl.value/10;
  const fix=+((document.getElementById('trFix')||{}).value||0);
  const fixCost=transferFixCost(p,fee,fix,trSel.size);
  const comm=document.getElementById('trComm');
  if(comm){
    /* Üç durum: komisyon satılmışsa sıfır; bonservisli transferde bonservisten
       hesaplanan gerçek tutar; bonservissiz transferde ise rakam yok — o para
       kabul anında çekilen maaş ve süreden doğuyor, şimdi bilinmiyor. */
    comm.textContent=p.tpo
      ?t('commission')+': %0 · '+t('tpoSold')
      :free
        ?t('commission')+': %'+transferPct()+' · '+t('commAfterContract')
        :t('commission')+': %'+transferPct()+' · '+t('commEst')+' ~'+fmtK(transferCutFor(p,fee,false));
  }
  const fc=document.getElementById('trFixC');
  if(fc)fc.textContent=t('fixCostL')+': '+fmtK(fixCost)
    +(fixCost?' · '+fmtK(fixCostFor(p,fee))+' '+t('fixPerClub')+' × '+trSel.size:'');
  /* Devre dışı düğmenin nedeni kendi yazısında — pfActsHtml ile aynı kural.
     Kasa maliyete EŞİTKEN gönderim açık kalıyor, maliyet sıfırken de kasaya hiç
     bakılmıyor — submitOffers() ile aynı iki kural. */
  const short=fixCost>0&&fixCost>S.cash;
  const btn=document.getElementById('trBtn');
  if(btn){
    btn.disabled=trSel.size===0||short;
    btn.textContent=short?t('noCashBtn')+' · '+fmtK(fixCost)
                         :t('sendOffers')+(trSel.size?' ('+trSel.size+')':'');
  }
  /* Saha temasının özet şeridi aynı fee/fixCost/short değerlerini yazıyor;
     orada ikinci bir hesap yok (bkz. js/ui.js: trSahaFin). */
  if(useSahaTransfer())trSahaFin(p,free,fee,fix,fixCost,short);
}
function trToggle(tid){
  if(trSel.has(tid))trSel.delete(tid);else trSel.add(tid);
  const el=document.getElementById('trk'+tid);
  if(el){el.className='trk'+(trSel.has(tid)?' on':'');el.textContent=trSel.has(tid)?'✓':'';}
  if(useSahaTransfer())trSahaToggle(tid);
  trFin();
}
function submitOffers(pid){
  if(!trSel.size)return;
  if(offerFor(pid)||pendingFor(pid)){toast(t('offerPending'));return;}
  const p=byId(pid),free=isFree(p);
  const feeEl=document.getElementById('feeR');
  const fee=free||!feeEl?0:+feeEl.value/10;
  const pay=free?1:+((document.getElementById('trPay')||{}).value||1);
  const gb=free?0:+((document.getElementById('trGb')||{}).value||0);
  const so=free?0:+((document.getElementById('trSo')||{}).value||0);
  const fix=+((document.getElementById('trFix')||{}).value||0);
  /* aracı ücreti kulüp başına peşin ödenir — ekrandaki satırla aynı yardımcı */
  const fixCost=transferFixCost(p,fee,fix,trSel.size);
  /* fixCost sıfırken kasaya hiç bakılmaz: bedava bir işlemi borçlu olduğun için
     reddetmek yanlıştı (0 > negatif kasa doğru çıkıyordu). */
  if(fixCost&&fixCost>S.cash){toast(t('noCash'));return;}
  S.cash-=fixCost;
  S.offers=S.offers||[];
  trSel.forEach(tid=>S.offers.push({pid,tid,fee,pay,gb,so,fix,at:(S.tw||0)+R(1,3)}));
  trSel=new Set();trPid=null;
  toast(t('offerSent'));
  closeModal();save();render();
}
function doTransfer(p,b,fee,quiet,terms){
  terms=terms||{};
  const oldTm=teamOf(p),old=oldTm.n,wasFree=isFree(p);
  if(wasFree)fee=0;   // bonservissiz oyuncuda kulüpler arası ödeme yok
  /* önceki anlaşmadan "sonraki satıştan pay" varsa şimdi öde */
  if(p.so&&p.so.pct){
    /* klozda yazan oran neyse o ödenir — arayüzdeki %15 ile hesap aynı olmalı */
    const s=Math.max(1,Math.round(fee*1000*p.so.pct/100));
    S.cash+=s;
    pushNews('soPaid',{n:p.n,pid:p.id,f:fmtK(s)},'good');
    p.so=null;
  }
  p.hist=p.hist||[];
  p.hist.push({se:S.season,a:old,b:b.n,f:fee});
  if(p.hist.length>6)p.hist.shift();
  p.team=b.id;p.wage=Math.max(1,Math.round(Math.max(p.wage*1.15,marketWage(p.r)*(0.85+b.bud*0.25))));
  p.yrs=R(2,4);p.morale=clamp(Math.max(p.morale+30,70),0,100);p.ignored=0;p.hm=(S.tw||0)+8;p.form=clamp(p.form+5,0,100);
  delete p.freeFor;
  /* Bonservis yoksa komisyon bonservisten değil, kopardığın sözleşmeden gelir;
     geleceğini bir fona sattıysan (bkz. tpoOffer) bu satıştan sana pay yok.
     Hesap transferCutFor()'da: teklif ekranı da aynı yerden okuyor. */
  const cut=transferCutFor(p,fee,wasFree);
  if(p.tpo)delete p.tpo;
  const repGain=0.8+Math.max(0,(b.str-oldTm.str)/8);
  /* ödeme planı: komisyon taksitle gelir */
  const plan=terms.pay||1;
  if(!cut){/* fon aldı, sana bir şey kalmadı */}
  else if(plan===1)S.cash+=cut;
  else{
    const part=Math.max(1,Math.round(cut/plan));
    S.cash+=part;
    S.pendPay=S.pendPay||[];
    for(let k=1;k<plan;k++)S.pendPay.push({amt:part,at:(S.tw||0)+k*10,n:p.n});
  }
  /* gol bonusu: eşik ne kadar yüksekse pay o kadar büyük */
  if(terms.gb)(S.deals=S.deals||[]).push({pid:p.id,tid:b.id,goals:terms.gb,
    amt:Math.round(valueOf(p)*1000*(0.10+(terms.gb-10)*0.012)),se:S.season});
  /* sonraki satıştan pay klozu */
  if(terms.so)p.so={pct:terms.so};
  repEvent(repGain);
  pushNews('transfer',{n:p.n,pid:p.id,a:old,aid:oldTm.id,b:b.n,bid:b.id,f:fmtM(fee),k:fmtK(cut)},'good');
  if(!quiet){toast(t('transferDone'));closeModal();save();render();}
}
/* ================= PITCH / CLIENTS ================= */
/* ===== representation meeting: talk your way in ===== */
const REACT={
 good:{tr:['"Bak bu hoşuma gitti."','"İşte bunu bekliyordum."','"Ciddisin, belli."','"Devam et, dinliyorum..."'],
       en:['"Now that I like."','"That\'s what I was waiting for."','"You mean it. I can tell."','"Go on, I\'m listening..."']},
 mid: {tr:['"Hmm... olabilir."','"Dinliyorum."','"Bakalım."'],
       en:['"Hmm... maybe."','"I\'m listening."','"We\'ll see."']},
 bad: {tr:['"Bana masal anlatma."','"Bunu her menajer söylüyor."','"Pek inandırıcı değil."'],
       en:['"Don\'t tell me fairy tales."','"Every agent says that."','"Not very convincing."']}
};
const LINES=[
 {tr:'“Seni oynayacağın, gelişeceğin kulüplere taşıyacağım. Kulübede çürümek yok.”',
  en:'“I\'ll move you to clubs where you actually play and grow. No rotting on the bench.”',
  eff:c=>c.young?10:c.veteran?-6:3},
 {tr:'“Burada işler yürümüyorsa beklemenin anlamı yok. İlk pencerede sana yeni bir kulüp bulurum.”',
  en:'“If it isn\'t working here, there\'s no point waiting it out. I\'ll find you a new club by the next window.”',
  eff:c=>c.unhappy?12:c.ambitious?7:c.content?-8:-2},
 {tr:'“Hak ettiğin parayı almıyorsun. Aradaki farkı kulüpten ben alırım.”',
  en:'“You\'re not being paid what you\'re worth. I\'ll get the difference out of the club.”',
  eff:c=>c.lowWage?10:c.veteran?4:-1},
 {tr:'“Sen aradığında telefonu ben açarım, asistanım değil.”',
  en:'“When you call, I pick up. Not an assistant.”',
  eff:c=>(S.rep<30?8:4)+(c.content?2:0)},
 {tr:'“Acele etmeyiz. Yanlış kulüpte geçen bir sezonu kimse sana geri vermez.”',
  en:'“We don\'t rush. Nobody gives you back a season spent at the wrong club.”',
  eff:c=>c.unhappy?-7:c.veteran?9:c.content?6:1},
 {tr:'“Büyük kulüplerle bağlantılarım var. Doğru kapıları açarım.”',
  en:'“I have connections at the big clubs. I open the right doors.”',
  eff:c=>S.rep>=45?(c.ambitious?11:5):-9},
 {tr:'“Ben senin kazandığından pay alırım. Sen kazanmadan ben kazanmam.”',
  en:'“I take a cut of what you earn. If you don\'t earn, neither do I.”',
  eff:c=>c.lowWage?6:c.veteran?5:2},
 {tr:'“Seni tesadüfen bulmadım. Haftalardır maçlarını izliyorum.”',
  en:'“I didn\'t find you by accident. I\'ve been watching your games for weeks.”',
  eff:c=>(c.form>65?7:2)+(c.ambitious?2:0)},
 {tr:'“Acele etme. Ailenle konuş, kararını içine sinerek ver.”',
  en:'“Take your time. Talk to your family, decide when it feels right.”',
  eff:c=>c.unhappy?-6:c.content?8:c.veteran?5:1},
 {tr:'“İlk iki sene para konuşmayız, dakika konuşuruz.”',
  en:'“First two years we don\'t talk money. We talk minutes.”',
  eff:c=>c.veteran?-7:c.young?(c.lowWage?3:10):c.lowWage?-6:1},
 {tr:'“Bu kulüp sana küçük geliyor, ikimiz de biliyoruz.”',
  en:'“This club is too small for you. We both know it.”',
  eff:c=>c.ambitious?11:c.content?-8:c.unhappy?5:-2},
 {tr:'“Son sözleşmen en iyi sözleşmen olmalı.”',
  en:'“Your last contract should be your best one.”',
  eff:c=>c.veteran?10:c.young?-6:0},
 {tr:'“Futbol bitince telefonun susmasın. Onu da şimdiden düşünürüz.”',
  en:'“The phone shouldn\'t go quiet when you retire. We plan for that now.”',
  eff:c=>c.veteran?8:c.young?-5:-1},
 {tr:'“Söz vermem. Olanı da olmayanı da yüzüne söylerim.”',
  en:'“I don\'t make promises. Good news or bad, you hear it from me.”',
  eff:c=>c.unhappy?-5:c.veteran?6:c.content?5:2},
 {tr:'“Kötü bir dönemdesin. Ben oyuncuyu iyi gününde değil, böyle günde imzalarım.”',
  en:'“You\'re in a rough patch. That\'s when I sign a player, not on his good days.”',
  eff:c=>c.form<45?(c.unhappy?12:9):c.form>65?-8:c.unhappy?5:0},
 {tr:'“Seni izleyen tek kişi ben değilim. Teklif gelecek, hazırlıklı olalım.”',
  en:'“I\'m not the only one watching you. Offers are coming. Let\'s be ready.”',
  eff:c=>c.form>65?(c.ambitious?11:8):c.form<45?-7:c.ambitious?3:1},
 {tr:'“Yerinden memnunsan kimse seni zorla götüremez. Ben sadece kapıyı açık tutarım.”',
  en:'“If you\'re happy here, nobody moves you. I just keep the door open.”',
  eff:c=>c.unhappy?-8:c.content?9:2}
];
/* Havuz dokuzdan büyük: her görüşme 9 cümle çeker, yani ekrana gelen küme
   görüşmeden görüşmeye değişir. Tek kural her turda en az bir işe yarar cümle
   bulunması — üç seçeneğin üçü de eksiyse tur beceri değil şans olur.
   Eşik 4: pickLine()'daki ±2 oynama onu eksiye çeviremez. */
const MEET_GOOD=4;
function meetOrder(ctx){
  const sh=a=>a.sort(()=>RF()-0.5);
  const all=LINES.map((l,i)=>({i,e:l.eff(ctx)}));
  let good=all.filter(x=>x.e>=MEET_GOOD);
  /* Eşiği geçen üç cümle yoksa en iyi üçü çapa olur: garanti zayıflar ama tur boş kalmaz. */
  if(good.length<3)good=all.slice().sort((a,b)=>b.e-a.e).slice(0,3);
  const anchors=sh(good.slice()).slice(0,3).map(x=>x.i);
  const rest=sh(all.map(x=>x.i).filter(i=>!anchors.includes(i))).slice(0,6);
  const order=[];
  for(let r=0;r<3;r++)order.push(...sh([anchors[r],rest[r*2],rest[r*2+1]]));
  return order;
}
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
  const ctx=meetCtxOf(p);
  MT={pid,ctx,chance:Math.round(pitchChance(p)*100),round:0,order:meetOrder(ctx),react:null};
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
/* chasePenalty() — imza yarışının tek okuma yeri. Rakip aynı oyuncuyla görüşüyorsa
   şans burada düşer; ekrandaki yüzde de aynı fonksiyondan geldiği için çubuk yine
   gerçeği söyler. */
function pitchChance(p){return clamp(0.55+S.rep/100-(profileOf(p)-62)*0.022+skillBonus('pitch')-chasePenalty(p),0.08,0.95);}
function pitchCd(p){return Math.max(0,(p.cd||0)-(S.tw||0));}
function pitchPlayer(pid){openMeeting(pid);} // pitching now happens through a real conversation
function signClient(p){
  p.agent='you';p.ignored=0;delete p.ra;
  /* Portföy sayıları türetilip haftaya göre önbelleğe alınıyor (rivals.js —
     rivalCounts). Rakipten aldığın oyuncu p.ra'sını burada kaybediyor, yani
     önbellek bayatlıyor: Rakipler listesi eski sayıyı, rakip detay ekranı
     (rivalClients, önbelleksiz) gerçek sayıyı gösteriyordu. losePlayerTo ve
     simRivals ile aynı satır. */
  RIVCNT=null;
  /* Yeni ilişkinin ilk haftalarında rakipler yaklaşmaz (bkz. RIV.poachGrace) */
  p.sa=(S.tw||0);
  if(p.trust===undefined)p.trust=R(48,62);   // yeni ilişki, temkinli bir başlangıç
  if(!S.clients.includes(p.id))S.clients.push(p.id);
  /* Yarıştığın bir ajans varsa oyuncuyu onun elinden aldın: yarış kapanır, husumet
     birikir. Rakipler bunu unutmuyor (bkz. rivals.js — rel). */
  const c=chaseFor(p.id);
  if(c){
    S.chase=S.chase.filter(x=>x!==c);
    const r=rivalById(c.ri);
    if(r){r.rel=clamp((r.rel||0)-10,-100,100);r.lost=(r.lost||0)+1;}
  }
  repEvent(0.4);
  pushNews('sign',{n:p.n,pid:p.id},'good');
  toast(t('pitchOk'));save();render();
}
function releaseClient(pid){
  const p=byId(pid);
  p.agent=null;S.clients=S.clients.filter(c=>c!==pid);
  /* Kendi bıraktığın oyuncu için rakip tehdidinin bir anlamı kalmadı */
  if(S.poach&&S.poach.pid===pid)S.poach=null;
  repEvent(-0.8);
  save();render();
}
/* Oyunun geri döndürülemez tek aksiyonu ve tek dokunuşluk: onaydan geçiyor.
   Desen askDeleteSlot/askToMenu ile aynı — yeni bir modal sistemi kurulmuyor ve
   releaseClient()'ın davranışına dokunulmuyor, arayüz yalnız buradan çağırıyor.
   İptalde hiçbir şey çalışmaz: ne state, ne kayıt, ne itibar.
   Ad değiştirme fonksiyonuyla basılıyor: bir adın içindeki $& gibi diziler
   replace kalıbı sayılmasın (confirm düz metin gösterdiği için HTML kaçışı
   gerekmiyor). */
function askReleaseClient(pid){
  const p=byId(pid);
  if(!p)return;
  if(!confirm(t('releaseQ').replace('{n}',()=>String(p.n))))return;
  releaseClient(pid);
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
