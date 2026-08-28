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
/* ================= KARİYER MENÜSÜ =================
   Ekranın işi bir yuva listesi göstermek değil, oyuncunun bıraktığı kariyere
   geri dönmesi. Bu yüzden hiyerarşi tek bir soruya göre kurulu: en son hangi
   kariyer oynandı? O kariyer büyük kartı alıyor, kalan yuvalar tek satıra
   iniyor, devam edilecek bir şey yoksa büyük kartın yerini yeni kariyer daveti
   alıyor. Yuva sayısı SLOTS'tan geliyor — burada üç varsayımı yok.

   Ekran YALNIZ yuva özetini okuyor (js/saves.js, metaOf). Tam kayıt ~7000
   oyuncu; menüde bir tanesini bile açmak telefonda görünür bir bekleme demek.
   Bunun bedeli, özette olmayan hiçbir şeyin çizilememesi:

   - Müşteri KAPASİTESİ yok. maxClients() S'yi, satın alınmış yetenekleri ve
     ajans etkilerini okuyor; özetten türetilemez. Kartta yalnız müşteri sayısı
     var — "5/7" yazmak ya kaydı açmak ya da paydayı uydurmak olurdu.
   - Kayıt başına TEMA yok. Tema bu ayrımdan beri cihaz tercihi (PREFS), kayıtta
     tutulmuyor. Kart için şemaya alan eklemedik.
   - KULÜP yok, olmamalı: oyuncu kulüp menajeri değil, futbolcu temsilcisi.
     Kartta rastgele bir kulüp arması "senin kulübün" derdi ve yalan olurdu.
     Kimlik işareti ajans adı, menajerin baş harfleri ve ana ekrandaki menajer
     silueti — üçü de gerçek kayıttan geliyor. */

/* Özeti savunmacı okur: eski ya da yarım yazılmış bir özet menüyü çökertmesin.
   Eksik alan null döner ve çizim tarafı o parçayı hiç basmaz — "undefined" ya
   da "NaN" ekrana çıkmaz. */
function cmSlot(n){
  const s=slotMeta(n);
  if(!s||typeof s!=='object')return null;
  const num=v=>(typeof v==='number'&&isFinite(v))?v:null;
  const str=v=>(typeof v==='string'&&v.trim())?v.trim():'';
  return {n:n,name:str(s.agent),agency:str(s.agency),
          season:num(s.season),week:num(s.week),cash:num(s.cash),
          rep:num(s.rep),clients:num(s.clients),ts:num(s.ts)};
}
/* Kartın büyük satırı: ajans adı. Yoksa menajerin adı, o da yoksa yuva numarası
   — hangi yuvaya dokunduğu her durumda belli olsun. */
function cmLabel(c){return c.agency||c.name||t('slotN').replace('{n}',c.n);}
function cmIni(c){
  const p=(c.name||'').split(/\s+/).filter(Boolean);
  if(!p.length)return '—';
  /* Ana ekrandaki baş harflerle aynı hesap (VIEWS.dash), aynı kariyer iki
     ekranda iki farklı işaret taşımasın.
     Büyütme dile duyarlı: Türkçede 'i' -> 'İ', İngilizcede 'i' -> 'I'. Düz
     toUpperCase() "İsmail"i "ISMAIL" yapıyordu. */
  return ((p[0][0]||'')+(p.length>1?(p[p.length-1][0]||''):'')).toLocaleUpperCase(L);
}
/* "2 dk önce" gibi bir satır ancak ts varsa çizilir. Cihaz saati geri alınmışsa
   gelecekten bir kayıt görünür; "-3 dk önce" yazmak yerine tarihe düşüyoruz. */
function cmAgo(ts){
  const d=Date.now()-ts;
  if(!isFinite(d)||d<0)return cmDate(ts);
  const m=Math.floor(d/60000);
  if(m<1)return t('cmNow');
  if(m<60)return t('cmMinAgo').replace('{n}',m);
  const h=Math.floor(m/60);
  if(h<24)return t('cmHourAgo').replace('{n}',h);
  const dd=Math.floor(h/24);
  if(dd<7)return t('cmDayAgo').replace('{n}',dd);
  return cmDate(ts);
}
function cmDate(ts){try{return new Date(ts).toLocaleDateString(L);}catch(e){return '';}}
/* Sezon çubuğu: kartın ayıracı aynı zamanda ölçü. Payda SEASONW — en kalabalık
   ligin çift devresi, yani sezonun tam uzunluğu; metaOf() haftayı zaten en uzun
   fikstüre kırpıp yazıyor, bu yüzden oran gerçek. Veri değişip en uzun lig
   kısalırsa çubuk eksik dolar, taşmaz. */
function cmPct(w){
  const tot=(typeof SEASONW==='number'&&SEASONW>0)?SEASONW:38;
  return Math.max(0,Math.min(100,Math.round(w/tot*100)));
}
/* Menajer işareti: baş harfler altta, siluet üstte. Görsel yüklenemezse
   onerror onu kaldırıyor ve harfler ortaya çıkıyor — ana ekranın .hmAv'ıyla
   birebir aynı davranış. */
function cmAvHtml(c,cls){
  return `<span class="${cls}" aria-hidden="true">${esc(cmIni(c))}<img class="cmAvImg" src="assets/ui/agent-silhouette.webp" alt="" onerror="this.remove()"></span>`;
}
function cmWkText(c){
  return (c.season!==null&&c.week!==null)?`${t('season')} ${c.season} · ${t('week')} ${c.week}`:'';
}
/* Üst kimlik bandı. Yalnız gerçekten bir hedefi olan iki kontrol var: ayarlar
   ekranı ve dil değiştirme. "Hakkında" diye bir ekran olmadığı için düğmesi de
   yok — işlevi olmayan düğme koymuyoruz. */
function cmTopHtml(){
  return `<div class="cmTop">
    <div class="cmTools">
      <button class="cmTool" onclick="pushV('settings')" aria-label="${esc(t('settings'))}">${ICONS.settings}</button>
      <button class="cmTool wide" onclick="toggleLang()" aria-label="${esc(t('langLbl'))}">${ICONS.globe}<span>${L==='tr'?'English':'Türkçe'}</span></button>
    </div>
    <h1 class="cmTitle">${t('cmTitle')}</h1>
    <div class="cmSub">${t('cmSub')}</div>
  </div>`;
}
/* Birincil kart. Kart yüzeyinin kendisi tıklanabilir değil: yükleme tek bir
   yerden, "Devam et" düğmesinden geçiyor. İki ayrı tıklama hedefi aynı işi
   yapsaydı üç nokta düğmesi de kazara kaydı açardı. */
function cmMainHtml(c){
  const bits=[];
  if(c.clients!==null)bits.push([String(c.clients),t('clientCount'),'']);
  if(c.rep!==null)bits.push([String(c.rep),t('rep'),'']);
  if(c.cash!==null)bits.push([fmtK(c.cash),t('hmBalance'),' gold']);
  const wk=cmWkText(c),when=c.ts===null?'':cmAgo(c.ts);
  return `<div class="cmMain">
    <div class="cmHead">
      ${cmAvHtml(c,'cmAv')}
      <div class="cmHi">
        <div class="cmName">${esc(cmLabel(c))}</div>
        ${(c.agency&&c.name)?`<div class="cmWho">${esc(c.name)}</div>`:''}
      </div>
      <button class="cmMore" onclick="cmOptions(${c.n})" aria-label="${esc(t('cmOpts'))}">${ICONS.more}</button>
    </div>
    ${wk?`<div class="cmWk">${esc(wk)}</div>`:''}
    <div class="cmRule">${c.week!==null?`<i style="width:${cmPct(c.week)}%"></i>`:''}</div>
    ${bits.length?`<div class="cmStats">${bits.map((b,i)=>
      `${i?'<i></i>':''}<div class="cmStat"><span class="cmStatV${b[2]}">${esc(b[0])}</span><span class="cmStatL">${esc(b[1])}</span></div>`
    ).join('')}</div>`:''}
    ${when?`<div class="cmWhen">${esc(t('slotLast'))} · ${esc(when)}</div>`:''}
    <button class="cmGo" onclick="openSlot(${c.n})">${t('slotContinue')}</button>
  </div>`;
}
/* Diğer kayıtlar: satırın tamamı yükleme düğmesi, üç nokta ayrı bir düğme.
   Sağda ok YOK — okla üç nokta yan yana durunca hangisinin kaydı açtığı belirsiz
   kalıyordu. Boş yuva satırında üç nokta olmadığı için ok orada duruyor.
   Alt kenardaki ince şerit birincil karttaki sezon çubuğunun aynısı — listeyi
   kaydırırken hangi kariyerin sezonun neresinde olduğu okumadan görünüyor. */
function cmRowHtml(c){
  const meta=[cmWkText(c),c.ts===null?'':cmAgo(c.ts)].filter(Boolean).join(' · ');
  return `<div class="cmRow">
    <button class="cmRowGo" onclick="openSlot(${c.n})">
      ${cmAvHtml(c,'cmAvS')}
      <span class="cmRowI">
        <span class="cmRowN">${esc(cmLabel(c))}</span>
        ${meta?`<span class="cmRowM">${esc(meta)}</span>`:''}
      </span>
    </button>
    <button class="cmMore sq" onclick="cmOptions(${c.n})" aria-label="${esc(t('cmOpts'))}">${ICONS.more}</button>
    ${c.week!==null?`<i class="cmRowRule" style="width:${cmPct(c.week)}%"></i>`:''}
  </div>`;
}
/* Boş yuva. Kendi başına yeni kariyer düğmesi — ayrıca bir "Yeni kariyer"
   düğmesi eklemiyoruz, o aynı yuvayı ikinci kez göstermek olurdu. */
function cmEmptyRowHtml(n){
  return `<button class="cmRow cmNewRow" onclick="newCareerSlot(${n})">
    <span class="cmPlus">+</span>
    <span class="cmRowI">
      <span class="cmRowN acc">${t('slotNew')}</span>
      <span class="cmRowM">${t('slotN').replace('{n}',n)} · ${t('slotEmpty')}</span>
    </span>
    <span class="cmRowC">›</span>
  </button>`;
}
/* Hiç kayıt yokken birincil yerin sahibi. Boş ekran üç eşit boşluk listelemek
   yerine tek bir davet olmalı. */
function cmNewMainHtml(n){
  return `<button class="cmMain cmNewMain" onclick="newCareerSlot(${n})">
    <span class="cmNewIc">+</span>
    <span class="cmNewT">${t('slotNew')}</span>
    <span class="cmNewS">${t('slotN').replace('{n}',n)} · ${t('slotEmptyHint')}</span>
  </button>`;
}
/* Kariyer işlemleri. Silme kartın yüzünde kırmızı bir düğme değil: parmağın
   "devam et"e giderken geçtiği yerde durmuyor. Silmenin kendisi değişmedi —
   askDeleteSlot() ve onun onayı aynen çağrılıyor. */
function cmOptions(n){
  const c=cmSlot(n);
  if(!c)return;
  openModal(`<h2>${esc(cmLabel(c))}</h2>
    <div class="sub" style="margin:6px 0 14px">${esc(t('slotN').replace('{n}',n))}${(c.name&&c.agency)?' · '+esc(c.name):''}</div>
    <button class="btn d cmDel" onclick="cmDeleteSlot(${n})">${t('deleteCareer')}</button>`);
}
function cmDeleteSlot(n){closeModal();askDeleteSlot(n);}
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
const DEFTHEME='saha';
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
/* ================= ANA EKRAN ROZET İKONLARI =================
   Sekiz hazır rozet görseli yalnız saha temasında kullanılıyor: kendi dairesi,
   çemberi ve glow'unu taşıdıkları için oradaki CSS halkası ayrıca çizilmiyor,
   yoksa çift çember olurdu. Diğer temalar mevcut SVG setini kullanmaya devam
   ediyor — onların dili renk değil veri anlamı üzerine kurulu.

   Görseller yalnız saha'da markup'a giriyor. display:none ile gizlemek de
   olurdu ama tarayıcı onları yine indirirdi; sekiz dosya ~160KB, mobil bir
   oyunda diğer üç temaya bunu ödetmenin anlamı yok. render() tema
   değişiminde zaten yeniden çalışıyor. */
/* Yollar tam ve düz literal: build.js tek dosya sürümünde bunları data URI ile
   değiştiriyor ve bunu metinden yapıyor. Parça birleştirerek kurulan bir yol
   (…'home-icon-'+ad+'.webp') derleme sırasında görünmez, dist'te 404 olurdu. */
const HM_BADGE={
  calendar:'assets/ui/home-icon-calendar.webp',
  clients :'assets/ui/home-icon-players.webp',
  transfer:'assets/ui/home-icon-transfers.webp',
  inbox   :'assets/ui/home-icon-inbox.webp',
  scout   :'assets/ui/home-icon-scout.webp',
  contract:'assets/ui/home-icon-contract.webp',
  alert   :'assets/ui/home-icon-warning.webp',
  /* aynı geometri, turuncu ton: mutsuzluk kritik olayla aynı görünmesin */
  alertWarn:'assets/ui/home-icon-warning-orange.webp',
  trend   :'assets/ui/home-icon-trend.webp'
};
/* Rozeti olan ama kendi SVG'si olmayan anahtarlar için yedek eşlemesi. */
const HM_SVG={alertWarn:'alert'};
function hmHasBadge(name){return !!HM_BADGE[name]&&themeOf()==='saha';}
/* Rozet + altında SVG yedeği. Görsel yüklenemezse hmBadgeFail() rozeti
   kaldırıp kabın 'badge' sınıfını düşürüyor; CSS o anda halkayı ve SVG'yi
   geri getiriyor. Erişilebilir adı metin etiketi taşıyor, görsel dekoratif. */
function hmIcon(name,px){
  const svg=ICONS[HM_SVG[name]||name]||'';
  if(!hmHasBadge(name))return svg;
  return `<img class="hmBadge" src="${HM_BADGE[name]}" alt="" aria-hidden="true"`+
         ` width="${px}" height="${px}" onerror="hmBadgeFail(this)">${svg}`;
}
function hmBadgeFail(img){
  const p=img.parentNode;
  if(p&&p.classList)p.classList.remove('badge');
  img.remove();
}
/* ================= KUTU KATEGORİLERİ =================
   Kutu mesajlarının TEK eşleme kaynağı. Her kategori kendi rozetini, iki
   dildeki adını, filtre grubunu ve ürettiği NEWS anahtarlarını taşıyor;
   anahtar→kategori aramasi bundan türetiliyor (IB_OF), elle ikinci bir liste
   tutulmuyor. Yeni bir pushNews anahtarı eklendiğinde yapılacak tek iş onu
   buradaki keys dizilerinden birine yazmak — hiçbir davranış koduna
   dokunulmuyor.

   Adlar STR yerine satır içi {tr,en}: kategori kendi kendine yeten bir kayıt
   olsun ve bir anahtar eklemek iki ayrı sözlüğü senkron tutmayı gerektirmesin
   (aynı desen RIV_ARCH ve SK_BRANCH'te de kullanılıyor).

   ic:null olan kategori mevcut zarf SVG'sini kullanır — 'system' hem tut'u hem
   de sözlükte yeri olmayan anahtarları toplayan yedek kova. */
const IB_CAT=[
  {id:'transfer',grp:'players',ic:'assets/ui/inbox-transfer.webp',
   n:{tr:'Transfer',en:'Transfer'},
   keys:['transfer','agreedWait','offerRej','clubOffer']},
  {id:'contract',grp:'players',ic:'assets/ui/inbox-contract.webp',
   n:{tr:'Sözleşme',en:'Contract'},
   keys:['contractAgreed','contractSigned','renewed','released','expire']},
  {id:'finance',grp:'finance',ic:'assets/ui/inbox-finance.webp',
   n:{tr:'Finans',en:'Finance'},
   keys:['instPay','gbPaid','soPaid','inDebt']},
  {id:'client',grp:'players',ic:'assets/ui/inbox-client.webp',
   n:{tr:'Müşteri',en:'Client'},
   keys:['sign','retire','firedYou']},
  {id:'rival',grp:'players',ic:'assets/ui/inbox-rival.webp',
   n:{tr:'Rakip Ajans',en:'Rival Agency'},
   keys:['firedRival','chaseOn','chaseLost','poachWarn','poached','poachHeld']},
  {id:'growth',grp:'players',ic:'assets/ui/inbox-growth.webp',
   n:{tr:'Gelişim',en:'Development'},
   keys:['valUp','valDown','devUp']},
  {id:'status',grp:'players',ic:'assets/ui/inbox-status.webp',
   n:{tr:'Oyuncu Durumu',en:'Squad Status'},
   keys:['outgrow','rivalSigned','unhappyMsg','wantsOutMsg']},
  {id:'trophy',grp:'world',ic:'assets/ui/inbox-trophy.webp',
   n:{tr:'Şampiyonluk',en:'Silverware'},
   keys:['champ','finalN','cupWin','wcWin']},
  {id:'league',grp:'world',ic:'assets/ui/inbox-league.webp',
   n:{tr:'Lig',en:'League'},
   keys:['promoted','relegated']},
  {id:'scout',grp:'world',ic:'assets/ui/inbox-scout.webp',
   n:{tr:'Keşif Ağı',en:'Scouting'},
   keys:['scoutDone']},
  {id:'system',grp:'world',ic:null,
   n:{tr:'Ajans',en:'Agency'},
   keys:['tut']}
];
/* anahtar → kategori; sözlükten bir kez türetiliyor */
const IB_OF={};
IB_CAT.forEach(c=>c.keys.forEach(k=>{IB_OF[k]=c;}));
const IB_FALLBACK=IB_CAT[IB_CAT.length-1];      // 'system' — bilinmeyen anahtarlar
function ibCat(key){return IB_OF[key]||IB_FALLBACK;}
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
/* ================= SAHA KUTUSU =================
   Kapı diğer saha ekranlarıyla aynı desende (useSahaMarket/useSahaLeague/
   useSahaSkills): yalnız VIEWS.inbox dallanıyor, geri kalan üç tema
   msgHtml()'i ve toplu okuma davranışını olduğu gibi kullanmaya devam ediyor. */
function useSahaInbox(){return themeOf()==='saha';}
/* Seçili filtre yalnız görünüm durumu — MKQ, SKTAB ve atlas CAM gibi S'ye ve
   kayda hiç girmiyor, tema ya da sekme değiştirmek okundu bilgisine dokunamaz. */
let IBF='all';
const IB_FILTER=[
  {id:'all',    lbl:()=>t('all')},
  {id:'action', lbl:()=>t('ibFAct')},
  {id:'players',lbl:()=>t('ibFPly')},
  {id:'finance',lbl:()=>t('ibFFin')},
  {id:'world',  lbl:()=>t('ibFWorld')}
];
/* Aksiyon filtresi kategoriye değil mesajın kendisine bakıyor: karar bekleyen
   mesaj hangi kategoriden gelirse gelsin aynı yerde toplanmalı. */
function ibMatch(m,f){
  if(f==='all')return true;
  if(f==='action')return !!m.action;
  return ibCat(m.key).grp===f;
}
function ibSetF(f){if(IB_FILTER.some(x=>x.id===f)){IBF=f;render();}}
/* Saha'da kutuyu açmak mesajları okumuş saymıyor. Okundu bilgisi yalnız burada
   değişiyor: aksiyonsuz bir karta dokunmak ya da "Tümünü oku". Aksiyonlu mesaj
   Kabul/Reddet verilene kadar okunmamış kalır (bkz. inboxAction). */
function ibRead(i){
  const m=S.inbox[i];
  if(!m||m.action||m.read)return;
  m.read=true;save();render();
}
function ibReadAll(){
  let n=0;
  S.inbox.forEach(m=>{if(!m.action&&!m.read){m.read=true;n++;}});
  if(n){save();render();}
}
/* Karar düğmelerinin işlem ikonları — yalnız saha Kutu'su kullanıyor.
   ICONS'ta onay ve çarpı yok; ICONS.clients ise iki kişilik "müşteriler"
   glifi, tek bir oyuncunun profilini anlatmıyor ve 20px'te kalabalık kalıyor.
   Bu yüzden üçü burada tanımlı. Çizim dili ICONS/SK_ICON ile birebir aynı:
   24x24 kutu, fill yok, currentColor, 1.8 kalınlık, yuvarlak uç ve köşe. */
const IB_ACT_ICON={
  ok  :'<path d="M5 12.5l4.6 4.6L19 7.2"/>',
  no  :'<path d="M6.6 6.6l10.8 10.8"/><path d="M17.4 6.6L6.6 17.4"/>',
  prof:'<circle cx="12" cy="8.2" r="3.6"/><path d="M5.2 19.8a6.8 6.8 0 0 1 13.6 0"/>'
};
function ibActSvg(k){
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'+
         ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+IB_ACT_ICON[k]+'</svg>';
}
/* Erişilebilir ad ve yerel ipucu mevcut çevirilerden geliyor: görünür yazı
   kalktı, anlamı taşıyan tek şey artık bu iki öznitelik. */
function ibActBtn(k,cls,label,handler){
  const l=esc(label);
  return `<button class="ibAct ${cls}" onclick="${handler}" aria-label="${l}" title="${l}">${ibActSvg(k)}</button>`;
}
/* Rozet yüklenemezse zarf SVG'si devreye giriyor — hmBadgeFail ile aynı desen. */
function ibIconFail(img){
  const p=img.parentNode;
  if(p&&p.classList)p.classList.add('noimg');
  img.remove();
}
function ibMsgHtml(m){
  const i=S.inbox.indexOf(m);
  const c=ibCat(m.key);
  const txt=NEWS[L][m.key]?NEWS[L][m.key](m.params):t(m.key);
  const un=!m.read;
  /* Kart dokunuşu yalnız aksiyonsuz mesajda: aksiyonlu kartta okundu işareti
     kararın kendisinden gelmeli, kartı sıyırmaktan değil. */
  const tap=m.action?'':` onclick="ibRead(${i})"`;
  return `<div class="ibMsg ${m.type}${un?' un':''}"${tap}>
    <span class="ibIc${c.ic?'':' noimg'}">${c.ic
      ?`<img src="${c.ic}" alt="" aria-hidden="true" width="46" height="46" onerror="ibIconFail(this)">`
      :''}${ICONS.inbox}</span>
    <div class="ibMain">
      <div class="ibHead">
        <span class="ibCat">${c.n[L]}</span>
        <span class="ibWhen num">${t('season')} ${m.se} · ${t('week')} ${m.w}</span>
        ${un?'<i class="ibDot"></i>':''}
      </div>
      <div class="ibTxt">${txt}</div>
      ${m.action?`<div class="ibActs">
        ${ibActBtn('ok','ok',t('accept'),`inboxAction(${i},true)`)}
        ${ibActBtn('no','no',t('decline'),`inboxAction(${i},false)`)}
        ${m.action.pid?ibActBtn('prof','prof',t('viewProfile'),`pushV('player',${m.action.pid})`):''}
      </div>`:''}
    </div>
  </div>`;
}
function ibSahaView(){
  const unread=S.inbox.filter(m=>!m.read).length;
  /* "Tümünü oku" yalnız aksiyonsuz mesajları okur; hepsi aksiyonluysa
     düğmenin yapacağı bir iş yok, o yüzden kapalı görünüyor. */
  const readable=S.inbox.filter(m=>!m.action&&!m.read).length;
  const chips=IB_FILTER.map(f=>{
    const n=S.inbox.filter(m=>ibMatch(m,f.id)).length;
    const on=IBF===f.id;
    return `<button class="ibChip${on?' on':''}" onclick="ibSetF('${f.id}')" aria-pressed="${on?'true':'false'}">
      <span>${f.lbl()}</span><b class="ibChipN num">${n}</b></button>`;
  }).join('');
  const list=S.inbox.filter(m=>ibMatch(m,IBF));
  const body=!S.inbox.length
    ? `<div class="card">${emptyState('inbox',t('noNews'),t('noNewsSub'))}</div>`
    : list.length
      ? list.map(ibMsgHtml).join('')
      : `<div class="card">${emptyState('inbox',t('ibNoneF'),'')}</div>`;
  return `<div class="ibBar">
    <div class="ibCount">${unread?`<b class="num">${unread}</b> ${t('ibUnread')}`:t('ibAllRead')}</div>
    <button class="ibAll" onclick="ibReadAll()"${readable?'':' disabled'}>${t('ibReadAll')}</button>
  </div>
  <div class="ibChips">${chips}</div>
  ${body}`;
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
/* ===================== MÜŞTERİ DURUMLARI =====================
   Müşteriler ekranında her kart tek bir ana durum rengi taşıyor. Rengi seçen
   yer burası ve sıralama deterministik: listede yukarıdaki kazanır, böylece aynı
   oyuncu her çizimde aynı rengi taşır ve kartlar arasında renk enflasyonu olmaz.

   Hiçbiri yeni alan okumuyor — hepsi simülasyonun zaten ürettiği durumlar; bu
   yalnızca bir sunum önceliği, oyun mantığına dokunmuyor.

   İkon kategoriyi söylüyor (uyarı / sözleşme / transfer / form), renk aciliyeti.
   attn=1 olanlar "İlgi Gerektiren" filtresini besliyor: senden bir hamle
   bekleyenler. Kulüp düşünüyor ya da ön anlaşma imzalandıysa iş sende değil,
   o yüzden onlar bilgi (mavi) ve filtreye girmiyorlar. */
const CL_ST=[
  {k:'free', tone:'bad',  ic:'alert',    attn:1, is:p=>isFree(p),                     lbl:()=>t('faShort')},
  {k:'poach',tone:'bad',  ic:'alert',    attn:1, is:p=>!!(S.poach&&S.poach.pid===p.id),lbl:()=>t('poachT')},
  {k:'sign', tone:'gold', ic:'contract', attn:1, is:p=>!!pendCFor(p.id),              lbl:()=>t('signPending')},
  /* Ön anlaşma sözleşme bitişinin önünde: transfer bağlandıysa eski sözleşmeyi
     yenilemek artık senin işin değil. */
  {k:'pend', tone:'blue', ic:'transfer', attn:0, is:p=>!!pendingFor(p.id),            lbl:()=>t('pendingTag')},
  {k:'exp',  tone:'gold', ic:'contract', attn:1, is:p=>p.yrs<=1,                      lbl:()=>t('expiring')},
  {k:'offer',tone:'blue', ic:'transfer', attn:0, is:p=>!!offerFor(p.id),              lbl:()=>t('considering')},
  /* Eşik oyunun kendi eşiği: player() ekranı da mutsuzluğu 40'ın altında etiketliyor. */
  {k:'mood', tone:'warn', ic:'alert',    attn:1, is:p=>p.morale<40,
   lbl:p=>p.wage<marketWage(p.r)*0.8?t('wantsNew'):t('wantsOut')},
  /* "Formda" uydurma bir eşik değil: renewReason() iyi formu zaten böyle tanımlıyor. */
  {k:'form', tone:'acc',  ic:'trend',    attn:0, is:p=>last5Avg(p)>=7.2,              lbl:()=>t('clInForm')}
];
function clState(p){for(let i=0;i<CL_ST.length;i++)if(CL_ST[i].is(p))return CL_ST[i];return null;}
function clNeedsAttn(p){const s=clState(p);return !!(s&&s.attn);}
/* Filtre yalnızca arayüz durumu. atlas.js'teki CAM ile aynı gerekçe: geçici olan
   hiçbir şey kayda sızmasın — S'ye yazsaydık kayıt biçimini büyütürdü. */
let CLFILTER='all';
function clSetFilter(f){CLFILTER=f;render();}
/* Portföy kartı: üçü de gerçek yardımcılardan geliyor.
   weeklyIncome() yalnızca müşterilerin maaşından alınan komisyonu topluyor
   (bkz. core.js) — ajansın gideri ya da transfer payı buraya karışmıyor. */
/* ===================== OYUNCU PORTRELERİ =====================
   Sekiz anonim silüet. Kaynak tabakada on iki özne vardı ama dördü (01, 06, 07,
   12) görüntünün sol/sağ kenarına yaslanmıştı: merkezli bir kare orada en fazla
   344-436px olabiliyor, yani o dördü diğerlerinden belirgin daha yakın kadrajlı
   çıkıyordu (baş genişliği 150-182px, diğerleri 114-125px). Pad/blur ile arka
   plan uydurmak yerine havuzdan çıkarıldılar; tutarlılık çeşitlilikten önce.

   Hangi oyuncuya hangisinin düştüğü YALNIZCA p.id'den
   türüyor: kayıt dosyasına portre alanı yazılmıyor. Gerekçe CLAUDE.md'nin kuralı
   — her yeni alan yokken de çalışmak zorunda; yazılmayan alan bu sınavı hep geçer.
   Sonuç olarak kayıt açılınca, liste yeniden sıralanınca ya da müşteri listesi
   değişince hiçbir yüz değişmiyor. Dağıtım liste üyeliğine göre YAPILMIYOR: bir
   oyuncuyu bırakmak başka bir oyuncunun yüzünü değiştirirdi.

   Yollar tam metin olarak duruyor, birleştirilerek üretilmiyor: build.js tek
   dosya sürümünde "assets/ui/…" dizgilerini data URI ile değiştiriyor ve
   parça parça kurulan bir yolu göremezdi (404 olurdu).

   Math.random() yok; karıştırıcı murmur3'ün son adımı. id%8 yetmezdi: id'ler
   ardışık üretiliyor, o yüzden yan yana duran oyuncular sıralı yüzler alırdı.
   Havuz 8'e inince mod yalnız alt 3 biti kullanıyor — karıştırıcının alt bitleri
   de yaydığı ölçüldü: 7000 id üzerinde kovalar 839–913 (ideal 875), ki-kare 4.76
   (df=7, %95 eşiği 14.07). Ardışık id çiftlerinin %12.9'u aynı yüze düşüyor,
   rastgele beklenti %12.5. Sekiz yüzle aynı listede tekrar normaldir; tekrarı
   engellemek için listeye bakan bir kural KURULMADI, çünkü o kural yeni müşteri
   eklendiğinde mevcut müşterilerin yüzünü değiştirirdi. */
const PORTRAITS=[
  'assets/ui/player-portrait-02.webp','assets/ui/player-portrait-03.webp',
  'assets/ui/player-portrait-04.webp','assets/ui/player-portrait-05.webp',
  'assets/ui/player-portrait-08.webp','assets/ui/player-portrait-09.webp',
  'assets/ui/player-portrait-10.webp','assets/ui/player-portrait-11.webp'
];
function portraitOf(id){
  let h=id>>>0;
  h=Math.imul(h^(h>>>16),2246822507);
  h=Math.imul(h^(h>>>13),3266489909);
  h=(h^(h>>>16))>>>0;
  return PORTRAITS[h%PORTRAITS.length];
}
/* Portreler bu turda yalnız saha temasında. Diğer üç tema renk yerine veri
   anlamı taşıyor; oraya fotoğraf koymak o temaların dilini bozardı — aynı
   gerekçe ana ekranın görselleri için de yazılı (css/themes/saha.css).
   Kapı JS'te: setTheme() render() çağırdığı için tema değişince işaretleme
   yeniden kuruluyor, geride portre kalıntısı kalmıyor. */
function usePortraits(){return themeOf()==='saha';}
/* Sol sütun: portre varsa altında yedek olarak mevcut takım rozeti durur ve
   köşede küçük bir kulüp rozeti olur. Portre yüklenemezse onerror kendini
   siler; bitişik kardeş seçicisi (.clAvImg + .clAvTm) köşe rozetini de
   otomatik gizler ve geriye bugünkü baş harf rozeti kalır — :has() gerekmiyor. */
function clAvatar(p,tm){
  if(!usePortraits())return `<span class="clBadge">${tmBadge(tm,46)}</span>`;
  return `<span class="clBadge port">${tmBadge(tm,62)}<img class="clAvImg"
    src="${portraitOf(p.id)}" alt="" aria-hidden="true" width="62" height="62"
    decoding="async" onerror="this.remove()"><span class="clAvTm">${tmBadge(tm,16)}</span></span>`;
}
function clCard(p){
  const st=clState(p),tm=teamOf(p);
  /* Moral alanı eksik bir kayıtta Math.round(undefined) ekrana NaN basardı;
     ölçer genişliği de NaN% olurdu. Varsayılanla oku — trustOf() ile aynı gerekçe. */
  const mood=Math.round(p.morale||0);
  return `<div class="clCard${st?' t-'+st.tone:''}" onclick="pushV('player',${p.id})">
    <span class="clRail"></span>
    ${clAvatar(p,tm)}
    <span class="clBody">
      <span class="clName">${esc(p.n)}</span>
      <span class="clMeta">${POSFULL[L][p.pos]} · ${NATNAME[p.nat][L]}</span>
      <span class="clFacts"><b class="num">${fmtM(valueOf(p))}</b>${isFree(p)?''
        :`<i></i><span class="num">${t('contract')} ${p.yrs} ${t('yrs')}</span>`}</span>
      ${st?`<span class="clStat">${ICONS[st.ic]}<span>${st.lbl(p)}</span></span>`:''}
    </span>
    <span class="clRight">
      <span class="clRt num">${p.r}</span>
      <span class="clRtL">${t('rating')}</span>
      <span class="clMood" title="${t('morale')} ${mood}">
        <i style="width:${mood}%;background:${moodColor(mood)}"></i></span>
    </span>
    <span class="clGo">›</span>
  </div>`;
}
/* ===================== PİYASA DURUMLARI =====================
   Müşteri kartlarındaki CL_ST ile aynı fikir, başka bir soru: müşteride "senden
   ne bekleniyor", burada "bu oyuncuya bugün ulaşabilir misin". Sıra
   deterministik, ilk eşleşen kazanır; kart başına tek renk.

   Dördü de piyasa satırının (playerRow) bugün zaten yazdığı durumlar; yeni alan
   okunmuyor, yeni mekanik eklenmiyor. Uydurma "fırsat" ya da "takip listesinde"
   durumu YOK — oyunda karşılığı olmayan bir rozet listeyi süsler ama yalan söyler. */
const MK_ST=[
  /* Rakip aynı oyuncuyu kovalıyor: acele etmenin tek gerçek sebebi. */
  {k:'chase',tone:'bad', ic:'alert',   is:p=>!!chaseFor(p.id),
   lbl:p=>t('chaseTag')+' · '+chaseLeft(chaseFor(p.id))+' '+t('wk')},
  /* İtibarın yetmiyor: oyuncunun profili repCap()'in üstünde. */
  {k:'rep',  tone:'blue',ic:'rep',     is:p=>profileOf(p)>repCap(),
   lbl:p=>t('rep')+' '+repNeedFor(profileOf(p))+'+'},
  /* Görüşme soğuma süresi dolmadı. */
  {k:'cd',   tone:'warn',ic:'calendar',is:p=>pitchCd(p)>0,
   lbl:p=>pitchCd(p)+' '+t('wk')},
  /* Geriye tek durum kalıyor: görüşmeye açık. Sayı gerçek pitchChance(), etiketi
     de piyasanın kendi sıralama seçeneğiyle aynı sözcük ("İmza şansı") — yeni
     bir terim uydurmuyoruz, oyuncu bu ifadeyi filtre panelinde zaten görüyor. */
  {k:'open', tone:'acc', ic:'clients',  is:()=>true,
   lbl:p=>t('chance')+' '+pctOf(pitchChance(p))}
];
function mkState(p){for(let i=0;i<MK_ST.length;i++)if(MK_ST[i].is(p))return MK_ST[i];return null;}

/* Yeni işaretleme yalnız saha temasında üretiliyor — usePortraits() ile aynı
   gerekçe ve aynı kapı. Diğer üç tema bugünkü piyasa ekranını harfi harfine
   koruyor: market() onlar için hiç dallanmıyor. */
function useSahaMarket(){return themeOf()==='saha';}
/* Yüzde işareti Türkçede önde, İngilizcede arkada durur (ana ekranla aynı kural). */
function pctOf(x){const n=Math.round(x*100);return L==='tr'?'%'+n:n+'%';}

/* Arama metni ve filtre panelinin açıklığı yalnızca arayüz durumu; CLFILTER ve
   atlas.js'teki CAM ile aynı gerekçe — S'ye yazsaydık kayıt biçimini büyütürdü
   ve eski kayıtlar için yeni bir "yokken de çalış" sınavı açardı. */
let MKQ='';
let MKF=false;
const MK_PAGE=50;
/* ETKİLİ FİLTRE — tema sızıntısının kapandığı tek yer.
   S.f dört temanın ORTAK filtresi ve kayda yazılıyor; 'cl' (kulüplü) ise yalnız
   saha piyasasının çipi. İkisi yan yana durunca sahada bir kez seçilen çip,
   dosya/gazete/terminal ekranlarını da sessizce kulüplü oyuncularla
   filtreliyordu — o üç temada böyle bir seçenek, çip ya da açıklama olmadığı
   için liste sebepsiz kısalıyordu.

   Çözüm okuma tarafında: saha dışında 'cl' yalnız ÇİZİM sırasında 'all' gibi
   davranıyor. S.f'nin kendisine dokunulmuyor ve save() çağrılmıyor — tema
   değiştirmek kullanıcının seçimini silmemeli, sahaya dönüldüğünde 'cl' hâlâ
   seçili olmalı. Kopya sığ ve alan adı saymıyor: S.f'ye ileride bir alan
   eklenirse kendiliğinden taşınır.

   Diğer filtreler (fa, lig indeksi, mevki, yaş, sıralama, erişilebilirlik) dört
   temada da ortak kalıyor; onların hepsinin karşılığı her temanın seçicisinde
   var, yani paylaşılmaları yalan söylemiyor. */
function mkEffF(){
  S.f=S.f||{lg:'all',pos:'all',age:'all',sort:'r',elig:true};
  const f=S.f;
  return (f.lg==='cl'&&!useSahaMarket())?Object.assign({},f,{lg:'all'}):f;
}
/* Liste tek yerden türüyor: ilk çizim de, aramadaki kısmi güncelleme de aynı
   sonucu görsün. Filtre zinciri bugünküyle aynı sırada — yalnız 'cl' (kulüplü)
   dalı ve ada göre arama eklendi, ikisi de saha kapısının arkasında. */
function mkData(){
  const f=mkEffF();
  let list=S.players.filter(p=>p.agent===null&&knownLg(teamOf(p).lg));
  if(f.elig)list=list.filter(p=>profileOf(p)<=repCap());
  if(f.lg==='fa')list=list.filter(p=>isFree(p));
  else if(f.lg==='cl')list=list.filter(p=>!isFree(p));
  else if(f.lg!=='all')list=list.filter(p=>teamOf(p).lg===+f.lg);
  if(f.pos!=='all')list=list.filter(p=>p.pos===f.pos);
  if(f.age==='u18')list=list.filter(p=>p.age<=18);
  else if(f.age==='u21')list=list.filter(p=>p.age<=21);
  else if(f.age==='u24')list=list.filter(p=>p.age<=24);
  else if(f.age==='o25')list=list.filter(p=>p.age>=25);
  /* Arama yalnız ada bakıyor; yeni bir sorgu dili yok. Küçültme dile duyarlı:
     Türkçede 'I' -> 'ı', İngilizcede 'I' -> 'i'. */
  const q=useSahaMarket()?MKQ.trim().toLocaleLowerCase(L):'';
  if(q)list=list.filter(p=>String(p.n).toLocaleLowerCase(L).indexOf(q)>=0);
  const sorts={r:(a,b)=>b.r-a.r,pot:(a,b)=>b.pot-a.pot||b.r-a.r,age:(a,b)=>a.age-b.age||b.pot-a.pot,ch:(a,b)=>pitchChance(b)-pitchChance(a)||b.r-a.r};
  list.sort(sorts[f.sort]||sorts.r);
  return {f:f,total:list.length,rows:list.slice(0,MK_PAGE)};
}
function mkSetQ(v){
  MKQ=String(v==null?'':v);
  /* Her tuşta render() çağırmıyoruz: render() #view'i baştan yazıyor ve odak da
     imleç konumu da kaybolurdu. Yalnız liste ve sayaç tazeleniyor; ikisi de aynı
     mkData() okumasından geldiği için birbirine düşmüyor. */
  const d=mkData();
  const box=document.getElementById('mkListBox');
  if(box)box.innerHTML=mkRowsHtml(d);
  const num=document.getElementById('mkNumBox');
  if(num)num.textContent=String(d.total);
}
function mkTogF(){MKF=!MKF;render();}
/* Boş sonuçtan çıkış: aramayı ve filtreleri kurulum değerlerine döndürür. */
function mkReset(){MKQ='';S.f={lg:'all',pos:'all',age:'all',sort:'r',elig:true};save();render();}

/* Kart müşteri kartının görsel dilini aynen sürdürüyor (aynı sınıflar); tek
   farkı sağdaki moral ölçeri yerine oyuncunun ulaşılabilirlik durumu. */
function mkCard(p){
  const st=mkState(p),tm=teamOf(p);
  /* Gerçek wonderkid işareti — playerRow'daki eşiğin aynısı, uydurma değil. */
  const gem=(p.age<=21&&p.pot-p.r>=14)?`<span class="mkGem">${ICONS.gem}</span>`:'';
  return `<div class="clCard mkCard${st?' t-'+st.tone:''}" onclick="pushV('player',${p.id})">
    <span class="clRail"></span>
    ${clAvatar(p,tm)}
    <span class="clBody">
      <span class="clName">${esc(p.n)}${gem}</span>
      <span class="clMeta">${POSFULL[L][p.pos]} · ${NATNAME[p.nat][L]}</span>
      <span class="clFacts"><b class="num">${fmtM(valueOf(p))}</b><i></i>${isFree(p)
        ?`<span class="mkFree">${t('faShort')}</span>`
        :`<span class="num">${t('contract')} ${p.yrs} ${t('yrs')}</span>`}</span>
      ${st?`<span class="clStat">${ICONS[st.ic]}<span>${st.lbl(p)}</span></span>`:''}
    </span>
    <span class="clRight">
      <span class="clRt num">${p.r}</span>
      <span class="clRtL">${t('rating')}</span>
    </span>
    <span class="clGo">›</span>
  </div>`;
}
/* Liste gövdesi ayrı bir parça: arama sırasında yalnız burası yeniden yazılıyor. */
function mkRowsHtml(d){
  if(!d.rows.length)
    /* Çıkışı olmayan boş ekran bırakmıyoruz: temizleme düğmesi gerçek bir eylem. */
    return `<div class="mkEmpty">
      <span class="mkEmptyIc">${ICONS.market}</span>
      <span class="mkEmptyB"><b>${t('noResults')}</b><span>${t('noResultsSub')}</span></span>
      <button class="mkClear" onclick="mkReset()">${t('mkClear')}</button>
    </div>`;
  /* "Daha fazla oyuncu gör" düğmesi YOK: oyunda sayfalama mekaniği yok, düğme
     yalan olurdu. Onun yerine listenin gerçekten nerede kesildiği yazıyor. */
  const foot=d.total>d.rows.length
    ?`<div class="mkFoot">${t('mkShown').replace('{n}',d.rows.length).replace('{t}',d.total)}</div>`:'';
  return `<div class="mkList">${d.rows.map(mkCard).join('')}</div>${foot}`;
}
/* Lig seçici iki dünyada da aynı; tek fark 'cl' seçeneği ve o KOŞULSUZ olarak
   yalnız saha piyasasında yazılıyor. Seçici yalan söylemiyor çünkü mkEffF()
   saha dışında f.lg'yi zaten 'all'a indiriyor: seçenek yoksa o değer de yok. */
function mkLgSel(f){
  return `<label class="fitem"><span>${t('league')}</span>
    <select class="fsel" onchange="setF('lg',this.value)">
    <option value="all" ${f.lg==='all'?'selected':''}>${t('all')}</option>
    <option value="fa" ${f.lg==='fa'?'selected':''}>${t('freeAgentsF')} (${freeAgents().filter(p=>p.agent===null).length})</option>${
    useSahaMarket()?`\n    <option value="cl" ${f.lg==='cl'?'selected':''}>${t('mkChipClub')}</option>`:''}
    ${Object.keys(CTRYS).map(cc=>{
      const opts=LEAGUES.map((lg,i)=>lg.ctry===cc&&knownLg(i)?
        `<option value="${i}" ${String(f.lg)===String(i)?'selected':''}>${lgName(i)}</option>`:'').join('');
      return opts?`<optgroup label="${CTRYS[cc][L]}">${opts}</optgroup>`:'';
    }).join('')}
    </select></label>`;
}
function mkSahaView(d){
  const f=d.f;
  const known=(S.known||[]).length,lgN=LEAGUES.length;
  const pct=Math.round(known/lgN*100);
  const terrs=terrList(),disc=terrs.filter(terrDiscovered).length;
  const pend=(S.scout||[]).length;
  const slots=Math.max(0,maxClients()-S.clients.length);
  /* Filtre düğmesindeki nokta: kurulum dışında açık bir filtre var mı? */
  const fOn=f.lg!=='all'||f.pos!=='all'||f.age!=='all'||f.sort!=='r'||!f.elig;
  const chip=(v,lbl)=>`<button class="mkChip${String(f.lg)===v?' on':''}" onclick="setF('lg','${v}')">${lbl}</button>`;
  const sel=(k,opts)=>`<label class="fitem"><span>${t(k==='pos'?'posF':k==='age'?'ageF':'sortF')}</span>
    <select class="fsel" onchange="setF('${k}',this.value)">${opts.map(([v,lbl])=>
    `<option value="${v}" ${String(f[k])===String(v)?'selected':''}>${lbl}</option>`).join('')}</select></label>`;
  return `<div class="mkTop">
    <div class="mkTitle">${t('mkTitle')}</div>
    <div class="mkSub">${t('mkSub')}</div>
  </div>
  <div class="clSum">
    <div class="clSumI"><span class="clSumV num" id="mkNumBox">${d.total}</span>
      <span class="clSumL">${t('found')}</span></div>
    <i></i>
    <div class="clSumI"><span class="clSumV acc num">${pctOf(known/lgN)}</span>
      <span class="clSumL">${t('scoutNet')}</span></div>
    <i></i>
    <div class="clSumI"><span class="clSumV num${slots?'':' bad'}">${slots}</span>
      <span class="clSumL">${t('mkSlots')}</span></div>
  </div>
  <button class="mkNet" onclick="pushV('atlas')">
    <span class="mkNetIc">${ICONS.scout}</span>
    <span class="mkNetT">
      <span class="mkNetTitle">${t('scoutNet')}</span>
      <span class="mkNetBar"><i style="width:${pct}%"></i></span>
      <span class="mkNetSub">${pctOf(known/lgN)} ${t('mkCoverage')} · ${disc}/${terrs.length} ${t('mkRegions')}${
        pend?' · '+pend+' '+t('scoutPendingT'):''}</span>
    </span>
    <span class="mkNetGo">›</span>
  </button>
  <div class="mkFind">
    <span class="mkBox">
      <span class="mkBoxIc">${ICONS.market}</span>
      <input class="mkInp" id="mkQinp" type="text" inputmode="search" autocomplete="off"
        placeholder="${esc(t('mkSearch'))}" aria-label="${esc(t('mkSearch'))}"
        value="${esc(MKQ)}" oninput="mkSetQ(this.value)">
    </span>
    <button class="mkFbtn${MKF?' on':''}${fOn?' dot':''}" onclick="mkTogF()"
      aria-label="${esc(t('mkFilters'))}" aria-expanded="${MKF?'true':'false'}">${ICONS.filters}</button>
  </div>
  <div class="mkChips">${chip('all',t('all'))}${chip('fa',t('mkChipFree'))}${chip('cl',t('mkChipClub'))}</div>
  ${MKF?`<div class="mkPanel">
    <div class="fgrid">
      ${mkLgSel(f)}
      ${sel('pos',[['all',t('all')],['KL',POSFULL[L].KL],['DF',POSFULL[L].DF],['OS',POSFULL[L].OS],['FV',POSFULL[L].FV]])}
      ${sel('age',[['all',t('all')],['u18','≤ 18'],['u21','≤ 21'],['u24','≤ 24'],['o25','25+']])}
      ${sel('sort',[['r',t('sortR')],['pot',t('sortPot')],['age',t('sortAge')],['ch',t('sortCh')]])}
    </div>
    <button class="ftoggle ${f.elig?'on':''}" onclick="setF('elig',${!f.elig})">
      <span class="sw"></span>${t('onlyElig')}<span class="spacer"></span></button>
    <div class="mkHint">${t('marketHint')}</div>
  </div>`:''}
  <div class="mkBody" id="mkListBox">${mkRowsHtml(d)}</div>
  ${slots?''
    /* Kapasite doluyken imza atılamaz; müşteriler ekranındaki pasif satırın aynısı. */
    :`<div class="clCta full"><span class="clCtaIc">${ICONS.clients}</span>
      <span class="clCtaT">${t('clFullNote')}</span></div>`}`;
}

/* ===================== LİG EKRANI (yalnız saha) =====================
   Ekranın tek sorusu var: "ligde şu anda ne oluyor ve müşterilerim bu tablonun
   neresinde?" Sıralama o soruya göre: kimlik → sekme → haftanın maçı → tablo.

   Kapı market()/clients() ile aynı desen (useSahaMarket, usePortraits): yeni
   işaretleme yalnız saha temasında üretiliyor, diğer üç tema bugünkü lig
   ekranını harfi harfine koruyor.

   Sekmeler S.ltab'ı kullanıyor — bu alan zaten kayıtta var, yeni alan
   eklenmiyor. Üç birincil sekmenin de gerçek karşılığı var:
     table -> leagueTable()/groupTable()
     fix   -> S.fx[lg] haftalık fikstür (weekFixHtml ile aynı veri)
     istatistik -> scorers/assists (S.players[].g/.a), transferler (S.tlog),
                   tarihçe (S.lgHist) — dördü de bugün de çalışan sekmeler,
                   yalnız ikinci bir satırda toplandılar. */
function useSahaLeague(){return themeOf()==='saha';}

/* Müşteri kulüpleri: takım kimliği -> müşteri sayısı. Tek kaynak; hem haftanın
   maçı seçimi hem de tablodaki vurgu buradan okuyor, böylece iki yer farklı
   sayı gösteremiyor. Kulüpsüz müşteri (team<0) sayılmıyor. */
function lgClientTeams(){
  const m={};
  (S.clients||[]).forEach(id=>{
    const p=byId(id);
    if(!p||p.team<0)return;
    m[p.team]=(m[p.team]||0)+1;
  });
  return m;
}
function lgClientsLbl(n){return n===1?t('lgClient1'):t('lgClientsN').replace('{n}',n);}

/* Bölgeler TÜRETİLİYOR, boyanmıyor. Oyunda gerçekten olan iki kural var:
     · TIERS (data.js): üst ligin son 3'ü düşer, alt ligin ilk 3'ü çıkar
     · CUPQ (core.js): yalnız sekiz ligin 1-2 / 3-4 / 5-6. sıraları kupalara gider
   Bu iki kuralın dışındaki liglerde düşme ya da Avrupa bölgesi YOK; oralarda
   tabloyu renklendirmek uydurma olurdu. Gruplu ligde (AR1/US1) grup lideri
   finale gider — o da gerçek bir mekanik (bkz. weekFixHtml). */
function lgTierDown(lg){const c=LEAGUES[lg].c;return TIERS.some(x=>x[0]===c);}
function lgTierUp(lg){const c=LEAGUES[lg].c;return TIERS.some(x=>x[1]===c);}
function lgHasCups(lg){return typeof CUPQ!=='undefined'&&CUPQ.indexOf(LEAGUES[lg].c)>=0;}
function lgZoneOf(lg,pos,total){
  const l=LEAGUES[lg];
  if(l.grp)return pos===1?'ch':'';
  if(lgTierUp(lg))return pos<=3?'up':'';
  if(lgTierDown(lg)&&pos>total-3)return 'down';
  if(pos===1)return 'ch';
  if(lgHasCups(lg))return pos<=2?'ec1':pos<=4?'ec2':pos<=6?'ec3':'';
  return '';
}
/* Gösterge yalnız o ligde gerçekten var olan bölgeleri yazıyor. */
function lgLegend(lg,total){
  const seen=[];
  for(let p=1;p<=total;p++){const z=lgZoneOf(lg,p,total);if(z&&seen.indexOf(z)<0)seen.push(z);}
  const lbl={ch:t('champion'),up:t('lgUpZone'),down:t('lgDownZone'),
    ec1:(CUPS[0]||{n:{}}).n[L]||'',ec2:(CUPS[1]||{n:{}}).n[L]||'',ec3:(CUPS[2]||{n:{}}).n[L]||''};
  if(!seen.length)return '';
  return `<div class="lgKeys">${seen.map(z=>
    `<span class="lgKey z-${z}"><i></i>${esc(lbl[z]||'')}</span>`).join('')}</div>`;
}

/* Haftanın maçı: önce müşterinin takımı, yoksa tablodaki en iyi iki takımın
   eşleşmesi. Uydurma bir "öne çıkan maç" alanı yok — seçim tamamen mevcut
   fikstürden ve teamPos()'tan türüyor. */
function lgFeat(lg){
  const fx=(S.fx||[])[lg]||[];
  if(!fx.length)return null;
  const wk=Math.max(0,Math.min((S.week||1)-1,fx.length-1));
  const ms=fx[wk]||[];
  if(!ms.length)return null;
  const cnt=lgClientTeams();
  let best=null,bs=-1e9;
  ms.forEach(m=>{
    const mine=(cnt[m.h]||0)+(cnt[m.a]||0);
    const sc=(mine?1e6+mine*1000:0)-(teamPos(m.h)+teamPos(m.a));
    if(sc>bs){bs=sc;best=m;}
  });
  return best?{m:best,wk:wk,mine:(cnt[best.h]||0)+(cnt[best.a]||0)}:null;
}

/* Lig kodu bir arma değil, veride zaten duran kısaltma (LEAGUES[i].c). Yeni
   raster varlık üretmemek için tipografik işaret kullanılıyor; takım rozetleri
   ise her yerdeki tmBadge() ile çiziliyor. */
function lgMark(i){return `<span class="lgMark">${esc(LEAGUES[i].c)}</span>`;}

/* Seçici gerçek: 22 lig, beş kıta ve kupalar. Sahte açılır menü yok — dokunulunca
   mevcut setCurLg/setCon çağrılıyor, yani diğer temalarla aynı durum yazılıyor. */
function lgPickOpen(){
  const cur=S.curLg;
  const groups=CONTS.filter(x=>x[0]!=='cup').map(([cc,nm])=>{
    const items=LEAGUES.map((l,i)=>l.con===cc?
      `<button class="lgOpt${i===cur&&(S.curCon||'eu')!=='cup'?' on':''}" onclick="lgPickSet(${i})">
        ${lgMark(i)}<span class="lgOptT">${esc(lgName(i))}</span>
        <span class="lgOptN">${S.teams.filter(tm=>tm&&tm.lg===i).length}</span></button>`:'').join('');
    return items?`<div class="lgGrp">${esc(nm[L])}</div>${items}`:'';
  }).join('');
  const cupBtn=`<div class="lgGrp">${esc((CONTS.find(x=>x[0]==='cup')||[,{}])[1][L]||'')}</div>
    <button class="lgOpt${(S.curCon||'eu')==='cup'?' on':''}" onclick="lgPickCup()">
      <span class="lgMark">EC</span><span class="lgOptT">${esc(CUPS.map(c=>c.n[L]).join(' · '))}</span></button>`;
  openModal(`<h2>${t('lgPick')}</h2><div class="lgPickList">${groups}${cupBtn}</div>`);
}
function lgPickSet(i){closeModal();setCurLg(i);}
function lgPickCup(){closeModal();setCon('cup');}

function lgSahaView(){
  /* Kıta/ülke/lig seçimi dört temanın ortak S alanlarında duruyor. Diğer temada
     bir kıta seçilip saha'ya dönüldüğünde seçili ülke ile lig uyuşmayabilir;
     league()'in kendi düzeltmesinin aynısı burada da yapılıyor, aksi hâlde
     ekran o ligin adını yazıp başka bir ligin tablosunu çizerdi. */
  {
    const con0=S.curCon||'eu';
    const list0=[...new Set(LEAGUES.filter(x=>x.con===con0).map(x=>x.ctry))];
    /* Ligi olmayan bir kıta kodu (bozuk ya da ileriden gelmiş bir kayıt) list0'ı
       boş bırakıyor. Eski hâlde S.curCtry=undefined ve findIndex -1 yazılıyordu:
       ekran S.curLg=-1 ile patlıyor ve bu değer ortak kayda sızıyordu. Böyle bir
       durumda ilk lige dönüyoruz — setCurLg(0) ile aynı üçlü, yalnız render
       çağrısı olmadan; yeni alan eklenmiyor. */
    if(!list0.length){S.curLg=0;S.curCtry=LEAGUES[0].ctry;S.curCon=LEAGUES[0].con;}
    else{
      if(!list0.includes(S.curCtry))S.curCtry=list0[0];
      if(!LEAGUES[S.curLg]||LEAGUES[S.curLg].ctry!==S.curCtry){
        const f=LEAGUES.findIndex(x=>x.ctry===S.curCtry);
        S.curLg=f<0?0:f;
      }
    }
  }
  const lg=S.curLg,l2=LEAGUES[lg];
  const tab=S.ltab||'table';
  /* Üç birincil sekme; istatistik dalı bugünkü dört alt sekmeyi taşıyor. */
  const prim=tab==='table'?'table':tab==='fix'?'fix':'stat';
  S.arch=S.arch||LEAGUES.map(()=>[]);
  const archL=S.arch[lg]||[];
  const live=S.season,minSe=archL.length?archL[0].se:live;
  let vSe=S.vSe===undefined?live:S.vSe;
  vSe=Math.max(minSe,Math.min(live,vSe));
  const isLive=vSe===live;
  /* tm&&: bozuk bir kayıtta S.teams deliği olabilir. leagueTable() bunu bugün de
     kaldıramıyor (dört temada da aynı), ama bu ekranın kendi saydığı yerler en
     azından patlamasın. */
  const nTeams=S.teams.filter(tm=>tm&&tm.lg===lg).length;

  const head=`<div class="lgTop">
    <div class="lgTitle">${t('lgHub')}</div>
    <div class="lgSub">${t('lgHubSub')}</div>
  </div>`;

  /* --- kimlik kartı: gerçek lig, gerçek sezon; arşiv okları yalnız arşiv varsa --- */
  const idCard=`<button class="lgId" onclick="lgPickOpen()">
    ${lgMark(lg)}
    <span class="lgIdT">
      <span class="lgIdN">${esc(lgName(lg))}</span>
      <span class="lgIdM">${t('season')} ${vSe} · ${isLive?t('liveLbl'):t('archLbl')} · ${nTeams} ${t('lgTeamsN')}</span>
    </span>
    <span class="lgIdGo">›</span>
  </button>
  ${minSe<live&&(prim==='table'||prim==='stat')?`<div class="lgSeas">
    <button class="lgSeasB" ${vSe<=minSe?'disabled':''} onclick="S.vSe=${vSe-1};render()" aria-label="‹">‹</button>
    <span class="lgSeasT">${t('season')} ${vSe} · ${isLive?t('liveLbl'):t('archLbl')}</span>
    <button class="lgSeasB" ${vSe>=live?'disabled':''} onclick="S.vSe=${vSe+1};render()" aria-label="›">›</button>
  </div>`:''}`;

  const tabBtn=(k,lbl,go)=>`<button class="lgTab${prim===k?' on':''}" onclick="${go}">${lbl}</button>`;
  const tabs=`<div class="lgTabs">
    ${tabBtn('table',t('standings'),"S.ltab='table';render()")}
    ${tabBtn('fix',t('fixtures'),"S.ltab='fix';render()")}
    ${tabBtn('stat',t('lgStats'),"S.ltab='scorers';render()")}
  </div>`;

  let body='';
  if(prim==='table')body=lgTableHtml(lg,isLive,archL.find(x=>x.se===vSe),l2);
  else if(prim==='fix')body=lgFixHtml(lg);
  else body=lgStatHtml(lg,tab);

  /* Haftanın maçı yalnız puan durumu sekmesinde: fikstür sekmesi zaten maç
     listesi, orada aynı maçı ikinci kez göstermek tekrar olurdu. */
  const feat=prim==='table'&&isLive?lgFeatHtml(lg):'';
  /* "Tüm fikstürü gör" gerçekten başka bir görünüme gidiyor: 34-38 haftalık
     fikstür tarayıcısı. Aynı içeriği tekrar açan düğme eklenmedi. */
  const allFix=prim==='table'&&isLive&&(S.fx||[])[lg]&&S.fx[lg].length
    ?`<button class="lgAll" onclick="S.ltab='fix';render()">
       <span class="lgAllIc">${ICONS.calendar}</span>
       <span class="lgAllT">${t('lgAllFix')}</span><span class="lgAllGo">›</span></button>`:'';
  return `${head}${idCard}${tabs}${feat}${body}${allFix}`;
}

/* --- haftanın maçı --- */
function lgFeatHtml(lg){
  const f=lgFeat(lg);
  if(!f)return `<div class="lgEmpty"><span class="lgEmptyIc">${ICONS.calendar}</span>
    <span class="lgEmptyT">${t('lgNoFix')}</span></div>`;
  const m=f.m,h=S.teams[m.h],a=S.teams[m.a];
  const cnt=lgClientTeams();
  const played=m.hg!==null&&m.hg!==undefined;
  const side=(tm,mine)=>`<button class="lgSide${mine?' mine':''}" onclick="pushV('team',${tm.id})">
    ${tmBadge(tm,34)}<span class="lgSideN">${esc(tm.n)}</span></button>`;
  return `<div class="lgFeat">
    <div class="lgFeatTop">
      <span class="lgFeatL">${t('lgMatchWk')}</span>
      <span class="lgFeatW">${f.wk+1}. ${t('week')}</span>
    </div>
    <div class="lgFeatRow">
      ${side(h,cnt[h.id])}
      <span class="lgScore${played?'':' pend'}">${played?m.hg+' : '+m.ag:'–'}</span>
      ${side(a,cnt[a.id])}
    </div>
    ${f.mine?`<div class="lgFeatTag">${ICONS.clients}<span>${t('lgClientClub')}</span></div>`:''}
  </div>`;
}

/* --- puan durumu --- */
function lgTableHtml(lg,isLive,aEntry,l2){
  const cnt=lgClientTeams();
  const glbl=g=>l2.gl?l2.gl[g][L==='tr'?0:1]:null;
  const toRows=tbl=>tbl.map(tm=>[tm.id,tm.pts,tm.w,tm.d,tm.l,tm.gf,tm.ga]);
  let parts=null;
  if(isLive){
    parts=l2.grp?[[glbl(0),toRows(groupTable(lg,0))],[glbl(1),toRows(groupTable(lg,1))]]
                :[[null,toRows(leagueTable(lg))]];
  } else if(aEntry){
    parts=aEntry.tabs?[[glbl(0),aEntry.tabs[0]],[glbl(1),aEntry.tabs[1]]]:[[null,aEntry.tab]];
  }
  if(!parts)return `<div class="lgEmpty"><span class="lgEmptyIc">${ICONS.league}</span>
    <span class="lgEmptyT">${t('notArch')}</span></div>`;
  const anyPlayed=parts.some(([,rows])=>rows.some(r=>r[2]+r[3]+r[4]>0));
  const block=([lbl,rows])=>{
    if(!rows.length)return `<div class="lgEmpty"><span class="lgEmptyIc">${ICONS.league}</span>
      <span class="lgEmptyT">${t('lgNoTable')}</span></div>`;
    return `${lbl?`<div class="lgGrpT">${esc(lbl)}</div>`:''}
    <div class="lgTable">
      <div class="lgHead"><span class="lgH-p">#</span><span class="lgH-t">${t('team')}</span>
        <span class="lgH-n">${t('P')}</span><span class="lgH-n">${t('GD')}</span><span class="lgH-n">${t('PTS')}</span></div>
      ${rows.map((r,i)=>{
        const tm=S.teams[r[0]];
        if(!tm)return '';
        const z=lgZoneOf(lg,i+1,rows.length);
        const n=cnt[tm.id]||0;
        const gd=r[5]-r[6];
        return `<div class="lgRow${z?' z-'+z:''}${n?' mine':''}" onclick="pushV('team',${tm.id})">
          <span class="lgRail"></span>
          <span class="lgPos num">${i+1}</span>
          <span class="lgBadge">${tmBadge(tm,26)}</span>
          <span class="lgTeam">
            <span class="lgTeamN">${esc(tm.n)}</span>
            ${n?`<span class="lgTeamC">${ICONS.clients}<span>${esc(lgClientsLbl(n))}</span></span>`:''}
          </span>
          <span class="lgN num">${r[2]+r[3]+r[4]}</span>
          <span class="lgN num${gd<0?' neg':''}">${gd>0?'+':''}${gd}</span>
          <span class="lgN pts num">${r[1]}</span>
        </div>`;}).join('')}
    </div>`;
  };
  const total=parts[0][1].length;
  return `${!anyPlayed?`<div class="lgNote">${t('lgNotStarted')}</div>`:''}
    ${parts.map(block).join('')}${lgLegend(lg,total)}`;
}

/* --- fikstür: bugünkü hafta tarayıcısının aynısı, saha diliyle --- */
function lgFixHtml(lg){
  const fx=(S.fx||[])[lg]||[];
  if(!fx.length)return `<div class="lgEmpty"><span class="lgEmptyIc">${ICONS.calendar}</span>
    <span class="lgEmptyT">${t('lgNoFix')}</span></div>`;
  const len=fx.length,lim=len-1+(LEAGUES[lg].grp?1:0);
  const wk=Math.min(S.fxWeek!==undefined?S.fxWeek:Math.min((S.week||1)-1,lim),lim);
  const lbl=wk<len?`${wk+1}. ${t('week')}`:t('finalLbl');
  const cnt=lgClientTeams();
  let rows;
  if(LEAGUES[lg].grp&&wk===len){
    /* Gruplu ligin final sayfası — weekFixHtml ile aynı kaynak. */
    const f=(S.finals||{})[lg];
    let h,a,sc;
    if(f&&f.se===S.season){h=S.teams[f.h];a=S.teams[f.a];sc=f.hg+' : '+f.ag;}
    else{h=groupTable(lg,0)[0];a=groupTable(lg,1)[0];sc=null;}
    rows=h&&a?[{h:h.id,a:a.id,sc:sc}]:[];
  } else rows=(fx[wk]||[]).map(m=>({h:m.h,a:m.a,sc:m.hg===null||m.hg===undefined?null:m.hg+' : '+m.ag}));
  const body=rows.length?rows.map(r=>{
    const h=S.teams[r.h],a=S.teams[r.a];
    if(!h||!a)return '';
    const mine=(cnt[h.id]||0)+(cnt[a.id]||0);
    return `<div class="lgFix${mine?' mine':''}">
      <button class="lgFixS r" onclick="pushV('team',${h.id})">
        <span class="lgFixN">${esc(h.n)}</span>${tmBadge(h,24)}</button>
      <span class="lgFixSc${r.sc?'':' pend'}">${r.sc||'–'}</span>
      <button class="lgFixS" onclick="pushV('team',${a.id})">
        ${tmBadge(a,24)}<span class="lgFixN">${esc(a.n)}</span></button>
    </div>`;}).join('')
   :`<div class="lgEmpty"><span class="lgEmptyIc">${ICONS.calendar}</span>
     <span class="lgEmptyT">${t('lgNoFix')}</span></div>`;
  return `<div class="lgWk">
    <button class="lgWkB" ${wk<=0?'disabled':''} onclick="S.fxWeek=${Math.max(0,wk-1)};render()" aria-label="‹">‹</button>
    <span class="lgWkT">${lbl}<i>/${len}</i></span>
    <button class="lgWkB" ${wk>=lim?'disabled':''} onclick="S.fxWeek=${Math.min(lim,wk+1)};render()" aria-label="›">›</button>
  </div>${body}`;
}

/* --- istatistik: bugün de var olan dört alt sekme --- */
function lgStatHtml(lg,tab){
  const sub=(k,lbl)=>`<button class="lgSub2${tab===k?' on':''}" onclick="S.ltab='${k}';render()">${lbl}</button>`;
  const bar=`<div class="lgSubs">${sub('scorers',t('scorers'))}${sub('assists',t('assistsT'))}
    ${sub('tr',t('transfersT'))}${sub('hist',t('history'))}</div>`;
  /* Alt sekmelerin gövdesi dört temanın ortak işaretlemesi; kendi kartlarını
     zaten taşıdığı için ayrıca sarmalanmıyor. vSe/arşiv hesabı league() ile
     birebir aynı olsun diye lgLegacyTab kendi içinde yapıyor. */
  return bar+lgLegacyTab(lg,tab);
}
/* Gol/asist krallığı, transferler ve tarihçe sekmelerinin gövdesi. Dört tema da
   aynı işaretlemeyi kullanıyor: league() buradan okuyor, saha lig ekranı da.
   Kopyalanmadı çünkü iki kopya er ya da geç ayrışırdı — piyasa ekranındaki
   mkLgSel() ile aynı gerekçe. */
function lgLegacyTab(lg,tab,isLive,aEntry){
  /* league() bu iki değeri zaten hesaplayıp geçiyor; saha lig ekranı geçmiyor,
     o yüzden burada aynı kuralla türetiliyorlar. İki yerde de sonuç aynı olsun
     diye hesap league()'inkiyle birebir. */
  if(isLive===undefined){
    const archL=(S.arch||[])[lg]||[];
    const live=S.season,minSe=archL.length?archL[0].se:live;
    const vSe=Math.max(minSe,Math.min(live,S.vSe===undefined?live:S.vSe));
    isLive=vSe===live;
    aEntry=isLive?null:archL.find(x=>x.se===vSe);
  }
  let body='';
  if(tab==='tr'){
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
          ${/* Gol atılmamış bir sezonun kaydında x.ts yok — satırı hiç yazma. */''}
          ${x.ts?`<div class="psub">${t('topScorer')}: ${x.ts} (${x.g})</div>`:''}</div>
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
  return body;
}
/* ================= SAHA: OYUNCU PROFİLİ =================
   Kapı diğer saha ekranlarıyla aynı desende (useSahaMarket/useSahaLeague/
   useSahaSkills/useSahaInbox): yalnız VIEWS.player dallanıyor, geri kalan üç
   tema bugünkü profili harfi harfine koruyor.

   Model hiç değişmiyor. Üç sekme aynı oyuncu nesnesinin üç kesiti; yeni alan
   okunmuyor, yeni istatistik üretilmiyor, kayıt biçimine hiçbir şey eklenmiyor.
   Aksiyonlar da bugünkü fonksiyonların aynısını çağırıyor — openNeg,
   openTransfer, pitchPlayer, askReleaseClient (releaseClient'ın onay sarmalayıcısı,
   dört temada da aynı) ve pushV('team'|'rival') olduğu gibi duruyor; yeniden
   yazılan tek şey çizim. */
function useSahaPlayerProfile(){return themeOf()==='saha';}

/* Bölüm rozetleri. Yollar tam metin olarak duruyor, birleştirilerek
   üretilmiyor: build.js tek dosya sürümünde "assets/ui/…" dizgilerini data URI
   ile değiştiriyor ve parça parça kurulan bir yolu göremezdi (bkz. PORTRAITS). */
const PF_IC={
  ov :'assets/ui/profile-overview.webp',
  mt :'assets/ui/profile-matches.webp',
  ct :'assets/ui/profile-contract.webp',
  pre:'assets/ui/profile-preagreement.webp',
  cd :'assets/ui/profile-cooldown.webp',
  rel:'assets/ui/profile-release.webp'
};
/* Rozet yüklenemezse CSS'in çizdiği boş halkaya düşülüyor — ibIconFail ve
   evIconFail ile aynı desen; ekran rozetsiz de okunur kalıyor. */
function pfIconFail(img){
  const p=img.parentNode;
  if(p&&p.classList)p.classList.add('noimg');
  img.remove();
}

/* Seçili sekme yalnız görünüm durumu — MKQ, SKTAB, IBF ve atlas CAM ile aynı
   gerekçe: S'ye yazsaydık kayıt biçimi büyür ve eski kayıtlar için yeni bir
   "yokken de çalış" sınavı açılırdı; üstelik hangi sekmede kaldığın kariyerin
   bir parçası değil. Sekme değiştirmek yalnız bu değişkeni ve çizimi
   etkiliyor, oyuncu verisine ve kayda dokunmuyor. */
let PFTAB='ov';
const PF_TABS=['ov','mt','ct'];
function pfSetTab(k){if(PF_TABS.indexOf(k)>=0){PFTAB=k;render();}}

/* Sekme her YENİ açılışta Genel'e dönüyor. Ölçüt render()'ın lastSig'i: view
   fonksiyonu çizimden önce çalıştığı için lastSig hâlâ bir önceki ekranı
   gösteriyor, yani "bu oyuncuya yeni mi girdik" sorusunun cevabı burada hazır
   — atlas'ın mapHome() çerçevelemesiyle birebir aynı ölçüt. Aynı oyuncuda
   kalan yeniden çizimler (sekme, aksiyon, hafta) seçimi koruyor. */
function pfTabFor(id){
  if(lastSig!=='player:'+id)PFTAB='ov';
  return PFTAB;
}

function pfSectHtml(k,title,sub){
  return `<div class="pfSect">
    <span class="pfSectIc"><img src="${PF_IC[k]}" alt="" aria-hidden="true"
      width="40" height="40" decoding="async" onerror="pfIconFail(this)"></span>
    <span class="pfSectT"><b>${title}</b>${sub?`<em>${sub}</em>`:''}</span>
  </div>`;
}
function pfCell(v,lbl){
  return `<span class="pfCell"><b class="num">${v}</b><em>${lbl}</em></span>`;
}
/* Temsil durumu tek yerden okunuyor: başlık hücresi, ilişki satırı ve
   sözleşme sekmesi aynı kaynaktan besleniyor, böylece üçü çelişemez. Adlı bir
   ajans tıklanabilir; eski kayıtlarda p.ra yok, o zaman rivalOf null döner ve
   eski isimsiz metin doğru cevaptır. */
function pfAgentHtml(p){
  if(p.agent==='you')return `<span class="pfMine">${t('you')}</span>`;
  if(p.agent==='rival'){
    const rv=rivalOf(p);
    return rv?lkR(rv.id,esc(rivalName(rv))):t('rival');
  }
  return `<span class="pfFree">${t('pfUnrep')}</span>`;
}
/* Sonuç harfi oyunun kendi dilinde: TR'de G/M/B, EN'de W/L/D. Renk üçlüsü
   sabit — galibiyet yeşil, mağlubiyet kırmızı, beraberlik amber. */
function pfResCh(res){
  return L==='en'?(res==='W'?'W':res==='L'?'L':'D')
                 :(res==='W'?'G':res==='L'?'M':'B');
}
function pfResCls(res){return res==='W'?'w':res==='L'?'l':'d';}
function pfRtCls(rt){return rt>=7.5?'g':rt>=6.5?'y':'o';}

/* ---------- ortak üst bölüm ----------
   Üç sekmede de aynı: kimlik, kulüp, üç sayı, durum pilleri ve varsa ön
   anlaşma. Kulüp arması dinamik kalıyor (tmBadge) — Midjourney rozetleri
   bölüm başlıklarının işi, armanın yerine geçmiyorlar. */
function pfHeadHtml(p,tm,cx){
  const free=isFree(p);
  const tags=[];
  if(cx.mine)tags.push(`<span class="pfPill on">${t('myClient')}</span>`);
  if(p.yrs<=1&&!free)tags.push(`<span class="pfPill w">${t('expiring')}</span>`);
  if(cx.mine&&p.morale<40)
    tags.push(`<span class="pfPill w">${p.wage<marketWage(p.r)*0.8?t('wantsNew'):t('wantsOut')}</span>`);
  if(cx.pc)tags.push(`<span class="pfPill w">${t('signPending')}</span>`);
  if(!cx.pen&&cx.off)
    tags.push(`<span class="pfPill b">${t('considering')} · ${cx.offs.length}</span>`);
  if(cx.chaseRv)
    tags.push(`<span class="pfPill r">${t('chaseTag')} · ${chaseLeft(cx.chase)} ${t('wk')}</span>`);
  /* Kulüp satırı serbest oyuncuda tıklanmıyor: FREETM'in id'si -1, dokunmak
     S.teams[-1] demek olurdu. */
  const clubSub=free?t('faSub'):`${lgName(tm.lg)} · #${teamPos(tm.id)} · ${tm.pts} ${t('PTS')}`;
  const club=free
    ? `<div class="pfClub off">${tmBadge(tm,26)}
        <span class="pfClubT"><b>${esc(tm.n)}</b><em>${clubSub}</em></span></div>`
    : `<button class="pfClub" onclick="pushV('team',${tm.id})">${tmBadge(tm,26)}
        <span class="pfClubT"><b>${esc(tm.n)}</b><em>${clubSub}</em></span>
        <span class="pfGo">›</span></button>`;
  /* Ön anlaşma kendi satırında: kulüp adı uzun olabiliyor ve pil şeridine
     sığdırmak taşmaya en açık yerdi. */
  const pre=cx.pen?`<div class="pfPre">
    <span class="pfPreL">${t('pendingTag')}</span>
    ${tmBadge(S.teams[cx.pen.tid],18)}
    <span class="pfPreN">${esc(S.teams[cx.pen.tid].n)}</span>
    <span class="pfPreW">${nextWindowLabel()}</span></div>`:'';
  return `<div class="pfHead">
    <span class="pfBar" style="background:linear-gradient(180deg,${tm.c1} 50%,${tm.c2} 50%)"></span>
    <div class="pfId">
      ${tmBadge(tm,46)}
      <span class="pfIdT">
        <span class="pfName">${esc(p.n)}</span>
        <span class="pfMeta">${p.age} ${L==='tr'?'yaş':'yrs'} · ${POSFULL[L][p.pos]} · ${NATNAME[p.nat][L]}</span>
      </span>
      <span class="pfRt ${rtClass(p.r)}"><b class="num">${p.r}</b><em>${t('rating')}</em></span>
    </div>
    ${club}
    <div class="pfKeys">
      ${pfCell(fmtM(valueOf(p)),t('value'))}
      ${pfCell(p.pot,t('pfPot'))}
      <span class="pfCell pfCellA"><b>${pfAgentHtml(p)}</b><em>${t('agent')}</em></span>
    </div>
    ${tags.length?`<div class="pfPills">${tags.join('')}</div>`:''}
    ${pre}
  </div>`;
}

function pfTabsHtml(tab){
  const lbl={ov:t('pfOv'),mt:t('pfMt'),ct:t('contract')};
  return `<div class="pfTabs" role="tablist">${PF_TABS.map(k=>
    `<button class="pfTab${k===tab?' on':''}" role="tab" aria-selected="${k===tab?'true':'false'}"
      onclick="pfSetTab('${k}')">${lbl[k]}</button>`).join('')}</div>`;
}

/* ---------- sekme 1: genel ---------- */
function pfOvHtml(p,tm,cx){
  const rtAvg=p.rtN?(p.rtSum/p.rtN):0;
  const vm=valueMult(p);
  const trend=vm>=1.08?'<i class="pfUp">▲</i>':vm<=0.93?'<i class="pfDn">▼</i>':'';
  /* İlişki satırı temsil durumunun karşılığı: müşteriysen güven metni, rakip
     ajanstaysa kimin elinde olduğu, boştaysa temsilcisiz olduğu. Üçü de mevcut
     anahtarlardan geliyor; yeni bir değerlendirme uydurulmuyor. */
  let rel;
  if(cx.mine)rel=t(trustLabel(trustOf(p)));
  else if(p.agent==='rival'){
    const rv=rivalOf(p);
    rel=rv?t('pfRepBy').replace('{a}',esc(rivalName(rv))):t('hasAgent');
  } else rel=t('pfUnrep');
  const l5=(p.l5||[]);
  /* Form şeridi kronolojik: soldan sağa zaman akıyor, çünkü bu şeridin tek işi
     eğilimi göstermek. Maçlar sekmesindeki liste ise en yenisi üstte — orada
     soru "en son ne oldu". */
  const strip=l5.length?`<div class="pfForm">
    <span class="pfFormL">${t('last5')}</span>
    <span class="pfFormR">${l5.map(m=>
      `<i class="pfFormC ${pfResCls(m.res)}"><b>${pfResCh(m.res)}</b><em class="num">${m.rt.toFixed(1)}</em></i>`).join('')}</span>
  </div>`:'';
  return `${pfSectHtml('ov',t('pfOv'),t('season')+' '+S.season)}
  <div class="card pfCard">
    <div class="pfGrid pfG3">
      ${pfCell(p.app||0,t('apps'))}
      ${pfCell((p.min||0)+"'",t('mins'))}
      ${pfCell(p.g,t('goals'))}
      ${pfCell(p.a,t('assists'))}
      <span class="pfCell"><b class="num ${rtAvg?pfRtCls(rtAvg):''}">${rtAvg?rtAvg.toFixed(1):'—'}</b><em>${t('avgRt')}</em></span>
      <span class="pfCell"><b class="num">${fmtM(valueOf(p))}${trend}</b><em>${t('value')}</em></span>
    </div>
    <div class="pfRule"></div>
    ${bar(t('form'),p.form)}
    ${bar(t('morale'),p.morale)}
    ${cx.mine?bar(t('trustL'),trustOf(p)):''}
    <div class="pfRel"><span class="pfRelL">${t('pfRel')}</span><span class="pfRelT">${rel}</span></div>
  </div>
  ${strip?`<div class="card pfCard">${strip}</div>`:''}
  <div class="card pfCard">
    <div class="pfLine">
      <span class="pfLineC"><em>${t('wage')}</em><b class="num">${isFree(p)?'—':fmtK(p.wage)+'/'+t('wk')}</b></span>
      <span class="pfLineC"><em>${t('contract')}</em><b class="num">${isFree(p)?'—':p.yrs+' '+t('yrs')}</b></span>
      <span class="pfLineC"><em>${t('agent')}</em><b>${pfAgentHtml(p)}</b></span>
    </div>
  </div>
  <div class="card pfCard">
    <div class="pfSub">${t('personal')}</div>
    <div class="pfGrid pfG4">
      ${pfCell(NATS[p.nat].c,t('nation'))}
      ${pfCell(p.age,t('age'))}
      ${pfCell(p.h?p.h+' cm':'—',t('height'))}
      ${pfCell(p.ft==='L'?t('left'):t('right'),t('foot'))}
    </div>
  </div>`;
}

/* ---------- sekme 2: maçlar ----------
   Oyun oyuncu başına yalnız son beş maçı saklıyor (sim.js p.l5'i beşte
   kırpıyor); sezonun tamamı satır satır hiçbir yerde yok. "Sezon" filtresi bu
   yüzden PASİF ve nedeni ekranda yazıyor — uydurulmuş satırlarla dolu bir liste
   boş bir listeden daha kötü olurdu. p.seasons gerçek veri ama maç değil sezon
   toplamı; o yüzden filtre değil, ayrı bir "Kariyer" bölümü. */
function pfMtHtml(p,tm,cx){
  const rtAvg=p.rtN?(p.rtSum/p.rtN):0;
  const l5=(p.l5||[]).slice().reverse();
  const rows=l5.length?l5.map(m5=>{
    const o=S.teams[m5.o];
    const facts=[m5.min?m5.min+"'":'',m5.g?m5.g+' G':'',m5.a?m5.a+' A':'',
      m5.mm?`<b class="pfMotm">${t('motm')}</b>`:''].filter(Boolean).join(' · ');
    return `<button class="pfMatch" onclick="pushV('team',${o.id})">
      ${tmBadge(o,28)}
      <span class="pfMatchM">
        <span class="pfMatchT">${esc(o.n)}</span>
        <span class="pfMatchS"><b class="num">${m5.sc}</b>
          <i class="pfRes ${pfResCls(m5.res)}">${pfResCh(m5.res)}</i>
          <em>${facts||'—'}</em></span>
      </span>
      <span class="pfMatchR ${pfRtCls(m5.rt)}"><b class="num">${m5.rt.toFixed(1)}</b><em>${t('ratingShort')}</em></span>
    </button>`;
  }).join(''):`<div class="pfNone">${t('pfNoMt')}</div>`;
  const seasons=(p.seasons||[]).slice().reverse();
  return `${pfSectHtml('mt',t('pfMt'),t('season')+' '+S.season)}
  <div class="card pfCard">
    <div class="pfGrid pfG5">
      ${pfCell(p.app||0,t('apps'))}
      ${pfCell((p.min||0)+"'",t('mins'))}
      ${pfCell(p.g,t('goals'))}
      ${pfCell(p.a,t('assists'))}
      <span class="pfCell"><b class="num ${rtAvg?pfRtCls(rtAvg):''}">${rtAvg?rtAvg.toFixed(1):'—'}</b><em>${t('avgRt')}</em></span>
    </div>
  </div>
  <div class="pfFilt">
    <div class="pfChips">
      <button class="pfChip on" aria-pressed="true">${t('pfL5')}</button>
      <button class="pfChip" disabled aria-disabled="true">${t('season')}</button>
    </div>
    <div class="pfChipWhy">${t('pfSeOff')}</div>
  </div>
  <div class="card pfCard tight">${rows}</div>
  ${seasons.length?`<div class="card pfCard">
    <div class="pfSub">${t('career')}</div>
    ${seasons.map(s=>`<div class="pfSeason">
      <span class="pfSeasonS num">S${s.se}</span>
      <span class="pfSeasonT">${esc(s.tm)}</span>
      <span class="pfSeasonV num">${s.app!==undefined?s.app+' '+t('apps')+' · '+(s.min||0)+"' · ":''}${s.g} G · ${s.a} A${s.rt?` · <b class="${pfRtCls(s.rt)}">${s.rt.toFixed(1)}</b>`:''}</span>
    </div>`).join('')}
  </div>`:''}`;
}

/* ---------- sekme 3: sözleşme ----------
   Yalnız modelde gerçekten olan alanlar: maaş, kalan yıl, menajer, ön anlaşma
   ve yenileme bekleme süresi. Komisyon oranı, serbest kalma bedeli ya da
   sözleşmenin kesin bitiş tarihi oyunda YOK — kutuyu doldurmak için
   uydurulmuyorlar. */
function pfCtHtml(p,tm,cx){
  const free=isFree(p);
  const blk=cx.mine?renewBlock(p):null;
  const cd=blk==='cooldown'?renewCd(p):0;
  /* Sezon sonu geçişi: iki dinamik arma ve aralarında bir ok. Ön anlaşma
     oyunun tek "ileri tarihli" durumu, ekranda da öyle görünmesi gerekiyor. */
  const move=cx.pen?`${pfSectHtml('pre',t('pendingTag'),nextWindowLabel())}
  <div class="card pfCard">
    <div class="pfMove">
      <span class="pfMoveS">
        ${tmBadge(tm,44)}
        <span class="pfMoveN">${esc(tm.n)}</span>
        <span class="pfMoveL">${t('pfNow')}</span>
      </span>
      <span class="pfArrow" aria-hidden="true">
        <svg viewBox="0 0 72 18" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round">
          <path class="pfArrowL" d="M4 9H54"/>
          <path d="M49 3.5 54.5 9 49 14.5"/>
        </svg>
      </span>
      <span class="pfMoveS">
        ${tmBadge(S.teams[cx.pen.tid],44)}
        <span class="pfMoveN">${esc(S.teams[cx.pen.tid].n)}</span>
        <span class="pfMoveL">${nextWindowLabel()}</span>
      </span>
    </div>
  </div>`:'';
  /* Bekleme süresi metni gerçek cooldown değerinden geliyor: renewCd() kaç
     hafta kaldığını söylüyor, ekranda başka bir sayı yazmıyor. */
  const wait=cd?`${pfSectHtml('cd',t('pfWait'),cd+' '+t('wk'))}
  <div class="card pfCard">
    <div class="pfWait">${t('pfWaitTx').replace('{n}',cd)}</div>
  </div>`:'';
  const hist=(p.hist||[]).slice().reverse();
  return `${pfSectHtml('ct',t('contract'),free?t('faSub'):esc(tm.n))}
  <div class="card pfCard">
    <div class="pfKv"><span>${t('wage')}</span><b class="num">${free?'—':fmtK(p.wage)+'/'+t('wk')}</b></div>
    <div class="pfKv"><span>${t('contract')}</span><b class="num">${free?'—':p.yrs+' '+t('yrs')}</b></div>
    <div class="pfKv"><span>${t('agent')}</span><b>${pfAgentHtml(p)}</b></div>
    ${cx.pc?`<div class="pfNote">${t('signPending')}</div>`:''}
    ${blk==='noreason'?`<div class="pfNote">${t('renewLocked')}</div>`:''}
  </div>
  ${move}
  ${wait}
  ${hist.length?`<div class="card pfCard">
    <div class="pfSub">${t('transferH')}</div>
    ${hist.map(h=>`<div class="pfKv"><span class="num">S${h.se}</span>
      <b class="pfHist">${esc(h.a)} → ${esc(h.b)} <i class="num">${fmtM(h.f)}</i></b></div>`).join('')}
  </div>`:''}`;
}

/* ---------- aksiyonlar ----------
   Bugünkü davranışın birebir aynısı: aynı koşullar, aynı sıra, aynı çağrılar.
   Değişen tek şey görünüm — ve devre dışı her düğmenin nedeni düğmenin kendi
   yazısında duruyor. */
function pfActsHtml(p,tm,cx){
  if(cx.mine){
    const blk=renewBlock(p);
    const neg=cx.pc
      ? `<button class="btn p" disabled>${t('signPending')}…</button>`
      : blk==='cooldown'
        ? `<button class="btn p" disabled>${t('renewWait')} · ${renewCd(p)} ${t('wk')}</button>`
        : blk==='noreason'
          ? `<button class="btn p" disabled>${t('renewLocked')}</button>`
          : `<button class="btn p" ${cx.pen?'disabled':''} onclick="openNeg(${p.id})">${t('negotiate')}</button>`;
    const tr=cx.pen
      ? `<button class="btn b" disabled>${t('pendingTag')} · ${nextWindowLabel()}</button>`
      : cx.off
        ? `<button class="btn b" disabled>${t('considering')} (${cx.offs.length})…</button>`
        : `<button class="btn b" onclick="openTransfer(${p.id})">${t('offerClubs')}</button>`;
    /* Rozet metnin yerine geçmiyor, yanında duruyor: yıkıcı bir düğmede
       yazının kaybolması kabul edilemez. */
    return `<div class="grid2">${neg}${tr}</div>
    <button class="btn d pfRelease" onclick="askReleaseClient(${p.id})">
      <img src="${PF_IC.rel}" alt="" aria-hidden="true" width="26" height="26"
        decoding="async" onerror="this.remove()">
      <span>${t('release')}</span></button>`;
  }
  if(p.agent!==null)return `<div class="pfNone">${t('hasAgent')}</div>`;
  /* Yarış varsa düğmenin üstünde yazsın: yüzdedeki düşüşün sebebi görünür
     olmalı, yoksa oyuncu şansının neden azaldığını anlamaz. */
  const warn=cx.chaseRv?`<div class="dctx" style="margin-bottom:10px">${ICONS.alert}<span>${
    t('chaseWith').replace('{a}',esc(rivalName(cx.chaseRv)))} · ${chaseLeft(cx.chase)} ${t('wk')}</span></div>`:'';
  if(!knownLg(tm.lg))return warn+`<button class="btn s" disabled>${t('scoutLock')}</button>`;
  if(profileOf(p)>repCap())
    return warn+`<button class="btn s" disabled>${t('repLock')} · ${t('rep')} ${repNeedFor(profileOf(p))}+</button>`;
  if(pitchCd(p)>0)
    return warn+`<button class="btn s" disabled>${t('rejectedCd')} · ${pitchCd(p)} ${t('wk')}</button>`;
  return warn+`<button class="btn p" onclick="pitchPlayer(${p.id})">${t('pitch')} · ${fmtK(pitchCost(p))} · ${pctOf(pitchChance(p))}</button>`;
}

function pfSahaView(id){
  const p=byId(id),tm=teamOf(p),tab=pfTabFor(id);
  const offs=(S.offers||[]).filter(x=>x.pid===p.id);
  const chase=chaseFor(p.id);
  const cx={
    mine:p.agent==='you',
    offs:offs, off:offs[0],
    pen:pendingFor(p.id), pc:pendCFor(p.id),
    chase:chase, chaseRv:chase?rivalById(chase.ri):null
  };
  const body=tab==='mt'?pfMtHtml(p,tm,cx):tab==='ct'?pfCtHtml(p,tm,cx):pfOvHtml(p,tm,cx);
  return pfHeadHtml(p,tm,cx)+pfTabsHtml(tab)+body
    +`<div class="pfActs">${pfActsHtml(p,tm,cx)}</div>`;
}

const VIEWS={
/* Kariyer menüsü. Kurgusu ve özetin neden tek kaynak olduğu yukarıda,
   "KARİYER MENÜSÜ" bloğunda yazıyor. */
menu(){
  /* Kayıtlar henüz okunmadı (ya da eski sürümden göç ediyor). Boş yuva çizmek
     ilerlemenin silindiğini düşündürürdü — bekleyen bir satır dürüst olan. */
  if(!storeReady){
    let wait='';
    for(let n=1;n<=SLOTS;n++)wait+=`<div class="cmRow cmWait">
      <span class="cmRowI"><span class="cmRowN">${t('slotN').replace('{n}',n)}</span>
      <span class="cmRowM">${t('slotLoading')}</span></span></div>`;
    return cmTopHtml()+`<div class="sect cmSect">${t('slotsLbl')}</div>`+wait;
  }
  /* Birincil kart en son oynanan kariyer. ts'i olmayan çok eski bir özet 0
     sayılıyor; sıralamanın hiç olmaması listeyi rastgele gösterirdi. */
  let head=null;
  for(let n=1;n<=SLOTS;n++){
    const c=cmSlot(n);
    if(c&&(!head||(c.ts||0)>(head.ts||0)))head=c;
  }
  /* Hiç kayıt yokken ekranda tek bir iş var: ilk kariyeri kurmak. Boş yuvaları
     ayrıca listelemek aynı eylemi SLOTS kez tekrarlamak olurdu — yuvalar hâlâ
     üç, ama boşken aralarında seçim diye bir şey yok. Kart yine 1. yuvayı
     hedefliyor; ilk kayıt düştüğü anda liste kendiliğinden geri geliyor. */
  if(!head)return cmTopHtml()+cmNewMainHtml(1);
  const rest=[];
  for(let n=1;n<=SLOTS;n++){
    if(n===head.n)continue;
    const c=cmSlot(n);
    rest.push(c?cmRowHtml(c):cmEmptyRowHtml(n));
  }
  return cmTopHtml()+cmMainHtml(head)+`<div class="sect cmSect">${t('slotsLbl')}</div>`+rest.join('');
},
setup(){return setupHtml();},
dash(){
  /* Ana ekran 360x800'e kaydırmadan sığmak zorunda, bu yüzden burada yalnız
     "bu hafta ne yapmalıyım" var. Müşterilerin maç listesi Müşteriler ve
     oyuncu ekranlarında duruyor — veri ve mekanik aynen yerinde. */
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
    else if(p.morale<40)ag.push({rail:'warn',ic:'alertWarn',txt:t('unhappy')+' · '+p.n,go:`pushV('player',${p.id})`});
  });
  (S.pendC||[]).forEach(x=>{const p=byId(x.pid);if(p)ag.push({rail:'gold',ic:'contract',txt:t('signPending')+' · '+p.n,go:`pushV('player',${p.id})`});});
  (S.offers||[]).forEach(x=>{const p=byId(x.pid);if(p)ag.push({rail:'gold',ic:'transfer',txt:t('considering')+' · '+p.n,go:`pushV('player',${p.id})`});});
  (S.chase||[]).forEach(x=>{const p=byId(x.pid);if(p)ag.push({rail:'teal',ic:'gem',txt:t('hmChase').replace('{n}',p.n),go:`pushV('player',${p.id})`});});
  (S.scout||[]).forEach(x=>ag.push({rail:'teal',ic:'scout',txt:t('hmScoutSoon').replace('{n}',lgName(x.lg)),go:`pushV('atlas')`}));
  S.inbox.filter(m=>m.action).slice(0,2).forEach(()=>ag.push({rail:'blue',ic:'inbox',txt:t('notifs'),go:`navTo('inbox')`}));
  const agTop=ag.slice(0,2);

  /* ===== Değerlenen müşteri =====
     Uydurma veri yok: p.vm form kaynaklı değer çarpanı (core.js, VAL). 1'in
     üstündeyse oyuncunun piyasa değeri temel değerinin üzerine çıkmış demektir.
     Hiçbir müşteride hareket yoksa kart hiç çizilmiyor.

     Bu kart HAFTALIK bir fark göstermiyor ve göstermeye çalışmamalı: aşağıdaki
     gain, taban değerin üzerine binmiş BİRİKMİŞ primdir —
     marketValue(p.r) · (p.vm − 1) · (1 + skillBonus('val')). p.vm yalnızca
     VAL.every (12) maçta bir yazılıyor (core.js — updateValue) ve sezon geçişinde
     VAL.revert ile sönüyor (sim.js — endSeason), yani haftadan haftaya çoğu zaman
     hiç değişmiyor. Ölçüldü: 38 haftalık bir sezonda müşteri değerleri yalnız 3
     haftada hareket ediyor. Başlık bir dönem "Haftanın Yükseleni" diyordu; veri
     hiçbir zaman haftalık olmadığı için başlık değişti, hesap değil.

     gain M € cinsindendir (valueOf → marketValue), bu yüzden fmtM ile basılıyor.
     fmtK bin euro bekler; bu kart bir dönem onu kullandığı için 9 milyon euroluk
     bir prim ekranda "9K €" görünüyordu. */
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
  /* Büyütme dile duyarlı — cmIni() ile aynı gerekçe ve aynı sonuç. */
  const ini=S.agent?((S.agent.fn||' ')[0]+(S.agent.ln||' ')[0]).toLocaleUpperCase(L):'—';

  /* Etiket ve sayı tek sarmalayıcıda: 360px'te ikon + metin + oku aynı satıra
     dizmek metni kırpıyordu, ok köşeye alınınca metne yer kaldı. */
  const qCard=(cls,icon,label,value,go)=>`<button class="hmQ ${cls}" onclick="${go}">
    <span class="hmQi${hmHasBadge(icon)?' badge':''}">${hmIcon(icon,52)}</span>
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
    <span class="hmAdvIc${hmHasBadge('calendar')?' badge':''}">${hmIcon('calendar',56)}</span>
    <span class="hmAdvT">
      <span class="hmAdvTitle">${t('hmAdvance')}</span>
      <span class="hmAdvSub">${wkNow}. ${t('week')} · ${t('season')} ${S.season}</span>
    </span>
    <span class="hmAdvGo">→</span>
  </button>

  <div class="hmSect">${t('hmToday')}</div>
  ${agTop.length?agTop.map(x=>`<button class="hmAg ${x.rail}" onclick="${x.go}">
      <span class="hmAgIc${hmHasBadge(x.ic)?' badge':''}">${hmIcon(x.ic,50)}</span>
      <span class="hmAgT">${esc(x.txt)}</span>
      <span class="hmAgC">›</span></button>`).join('')
   /* Müşteri yokken gündem boş olmaz, sadece tek bir iş vardır: piyasaya gidip
      ilk oyuncuyu bulmak. O yüzden burası pasif bir "yapacak iş yok" metni
      değil, satırın tamamı dokunulabilir bir yönlendirme. Gündem satırının
      kendi ölçüsünü kullanıyor — ayrı bir kart eklemek ana ekranı 360x800'de
      taşırıyordu ve aynı cümleyi iki kez söylüyordu. */
   :S.clients.length
     ?`<div class="hmEmpty">${t('hmNoAgenda')}</div>`
     :`<button class="hmAg onb" onclick="navTo('market')">
        <span class="hmAgIc${hmHasBadge('market')?' badge':''}">${hmIcon('market',50)}</span>
        <span class="hmAgT"><b>${t('goMarket')}</b><i>${t('noClientsSub')}</i></span>
        <span class="hmAgC">›</span></button>`}

  <div class="hmQuick">
    ${qCard('green','clients',t('hmMyPlayers'),`${S.clients.length}<small>/${maxClients()}</small>`,"navTo('clients')")}
    ${qCard('green','transfer',t('hmTransfers'),deals,"navTo('market')")}
    ${qCard('blue','inbox',t('inbox'),unread,"navTo('inbox')")}
    ${qCard('viol','scout',t('scoutNet'),pctStr,"pushV('atlas')")}
  </div>

  ${riser?`<button class="hmRise" onclick="pushV('player',${riser.p.id})">
    <span class="hmRiseIc${hmHasBadge('trend')?' badge':''}">${hmIcon('trend',48)}</span>
    <span class="hmRiseT">
      <span class="hmRiseL">${t('hmRiser')}</span>
      <span class="hmRiseV">+${fmtM(riser.gain)} <i>▲</i></span>
      <span class="hmRiseN">${esc(riser.p.n)}</span>
    </span>
    <span class="hmAgC">›</span></button>`
  /* Yükselen yoksa kart kaldırılmıyor, aynı yükseklikte dürüst bir boş durum
     kalıyor: ana ekranın toplam yüksekliği haftadan haftaya oynamasın. */
  :`<div class="hmRise empty">
    <span class="hmRiseIc${hmHasBadge('trend')?' badge':''}">${hmIcon('trend',48)}</span>
    <span class="hmRiseT"><span class="hmRiseL">${t('hmRiser')}</span>
    <span class="hmRiseNone">${t('hmNoRiser')}</span></span></div>`}`;
},
clients(){
  const ps=S.clients.map(byId).filter(Boolean).sort((a,b)=>b.r-a.r);
  const cap=maxClients(),full=ps.length>=cap;
  const attn=ps.filter(clNeedsAttn);
  const shown=CLFILTER==='attn'?attn:ps;
  /* Portföy değeri müşterilerin gerçek valueOf() toplamı; haftalık gelir de
     yalnızca onların maaşından gelen komisyon. İkisi de sabit yazılmıyor. */
  const worth=ps.reduce((s,p)=>s+valueOf(p),0);
  const head=`<div class="clTop">
    <div class="clTitle">${t('clTitle')}</div>
    <div class="clSub">${t('clSub')}</div>
  </div>`;
  if(!ps.length)
    /* Boş durum kompakt: ana ekrandaki ilk-adım düzeltmesiyle aynı gerekçe —
       devasa bir kart aynı cümleyi iki kez söylüyor ve 360x800'i taşırıyor.
       Tek cümle, tek dokunulabilir yönlendirme. */
    return `${head}
    <div class="clEmpty">
      <span class="clEmptyIc">${ICONS.clients}</span>
      <span class="clEmptyT">${t('noClientsSub')}</span>
    </div>
    <button class="clCta" onclick="navTo('market')">
      <span class="clCtaIc">${ICONS.market}</span>
      <span class="clCtaT">${t('goMarket')}</span>
      <span class="clCtaGo">›</span>
    </button>`;
  const chip=(k,lbl,n)=>`<button class="clChip${CLFILTER===k?' on':''}" onclick="clSetFilter('${k}')">
    <span class="clChipIc">${ICONS[k==='attn'?'alert':'clients']}</span>
    <span class="clChipT">${lbl}</span><b class="num">${n}</b></button>`;
  return `${head}
  <div class="clSum">
    <div class="clSumI"><span class="clSumV"><b class="num">${ps.length}</b><small class="num">/${cap}</small></span>
      <span class="clSumL">${t('clientCount')}</span></div>
    <i></i>
    <div class="clSumI"><span class="clSumV gold num">${fmtM(worth)}</span>
      <span class="clSumL">${t('clValue')}</span></div>
    <i></i>
    <div class="clSumI"><span class="clSumV gold num">${fmtK(weeklyIncome())}</span>
      <span class="clSumL">${t('weeklyIncome')}</span></div>
  </div>
  <div class="clFil">${chip('all',t('all'),ps.length)}${chip('attn',t('clAttn'),attn.length)}</div>
  ${shown.length
    ?`<div class="clList">${shown.map(clCard).join('')}</div>`
    /* Filtre boş dönebilir ve bu iyi haberdir; çıkışı olmayan bir ekran bırakmamak
       için dönüş düğmesi burada. */
    :`<div class="clEmpty">
       <span class="clEmptyIc">${ICONS.clients}</span>
       <span class="clEmptyT">${t('clNoAttn')}</span>
       <button class="clBack" onclick="clSetFilter('all')">${t('all')}</button>
     </div>`}
  ${full
    /* Kapasite doluyken aktif bir çağrı yalan olurdu: dokunsa piyasada
       imza atamaz. Aynı satır pasif bir açıklamaya dönüyor. */
    ?`<div class="clCta full"><span class="clCtaIc">${ICONS.clients}</span>
       <span class="clCtaT">${t('clFullNote')}</span></div>`
    :`<button class="clCta" onclick="navTo('market')">
       <span class="clCtaIc">${ICONS.market}</span>
       <span class="clCtaT">${t('clFind')}</span>
       <span class="clCtaGo">›</span></button>`}`;
},
market(){
  const d=mkData();
  if(useSahaMarket())return mkSahaView(d);
  const f=d.f,total=d.total,free=d.rows;
  const sel=(k,opts)=>`<label class="fitem"><span>${t(k==='lg'?'league':k==='pos'?'posF':k==='age'?'ageF':'sortF')}</span>
    <select class="fsel" onchange="setF('${k}',this.value)">${opts.map(([v,lbl])=>
    `<option value="${v}" ${String(f[k])===String(v)?'selected':''}>${lbl}</option>`).join('')}</select></label>`;
  const lgSel=mkLgSel(f);
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
  /* Kapı market()/clients() ile aynı: yeni ekran yalnız saha temasında üretiliyor,
     aşağıdaki gövde diğer üç tema için harfi harfine bugünkü hâlinde kalıyor. */
  if(useSahaLeague())return lgSahaView();
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
  } else body=lgLegacyTab(lg,tab,isLive,aEntry);
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
  /* Saha kendi okuma modelini taşıyor: ekranı açmak hiçbir şeyi okundu
     yapmıyor. Diğer üç tema eski toplu işaretlemeyi aynen sürdürüyor. */
  if(useSahaInbox())return ibSahaView();
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
  /* Üst sınır ligin KENDİ fikstür uzunluğu. totalWeeks() en uzun ligin hafta
     sayısı (38); 26/30/34 haftalık ligler sezonun son haftalarında o indeksi
     taşımıyor ve eski hâl orada S.fx[lg][w] üzerinde patlayıp ekranı boş
     bırakıyordu. weekFixHtml ve lgFixHtml bu sınırı zaten gözetiyordu.
     Diziler savunmacı okunuyor: bozuk ya da eksik bir fikstür de çökertmesin. */
  const lgFx=(S.fx||[])[tm.lg]||[];
  const upto=Math.min(Math.max(0,(S.week||1)-1),lgFx.length);
  for(let w=0;w<upto;w++){
    (lgFx[w]||[]).forEach(m=>{if((m.h===id||m.a===id)&&m.hg!==null)played.push(m);});
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
  /* Kapı market()/clients()/league() ile aynı: aşağıdaki gövde diğer üç tema
     için harfi harfine bugünkü hâlinde kalıyor. */
  if(useSahaSkills())return skSahaView();
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
  if(useSahaPlayerProfile())return pfSahaView(id);
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
    ${/* Boy yoksa birim de yazılmaz: "— cm" diye bir ölçü yok. Saha profili
         (pfOvHtml) zaten böyle davranıyor. */''}
    <div class="kv"><span class="k">${t('height')}</span><span class="v">${p.h?p.h+' cm':'—'}</span></div>
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
    <button class="btn d" style="margin-top:10px" onclick="askReleaseClient(${p.id})">${t('release')}</button>`
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
    /* Küçültme dile duyarlı: Türkçede düz toLowerCase() "İtibar"ı birleşen
       noktayla "i̇tibar" yapıyordu. Saha karşılığı (skSahaView) zaten böyle. */
    ? `${t('skNext')} · <b class="num">${Math.floor(lp.cur)}/${lp.need}</b> ${t('rep').toLocaleLowerCase(L)}`
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
  if(useSahaSkills())return skSahaSheet(sk);
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
/* ===================== YETENEK EKRANI (yalnız saha) =====================
   Ekranın üç sorusu var ve sıralama o üçünü izliyor: kaç puanım var (özet kart),
   şimdi neyi alabilirim (dal sekmesi + kartlar), alırsam ne değişir (detay).

   Kapı market()/clients()/league() ile aynı desen: yeni işaretleme yalnız saha
   temasında üretiliyor, diğer üç tema bugünkü ağaç ekranını harfi harfine
   koruyor — skills() ve skOpen() onlar için hiç dallanmıyor.

   NEDEN AĞAÇ DEĞİL DE KART: ağacın kendisi doğru bir resim ama telefonda
   okunmuyor; 25 düğümlük tek SVG'de düğüm çapı 34px'e kadar iniyor ve etkiyi
   görmek için her düğüme tek tek dokunmak gerekiyor. Kart ızgarası aynı veriyi
   —ad, simge, gerçek etki, gerçek maliyet, gerçek durum— dokunmadan gösteriyor.
   Bağımlılık kaybolmuyor: kilitli kartın alt şeridi gereken düğümün ADINI
   yazıyor. Gerçek olan tek ilişki bu, ve yazıyla göstermek çizgiyle göstermekten
   hem daha dar ekranda hem de ekran okuyucuda daha iyi çalışıyor.

   MEKANİK OLDUĞU GİBİ: düğümler ikili (alınmış / alınmamış), seviyeleri yok.
   Ekranda "2/5" gibi bir kademe, "sonraki seviye etkisi" ya da tekrar tekrar
   yükseltme yok — çünkü oyunda yok. skillState()'in dört durumu neyse ekranın
   dört durumu da o: owned / open / poor / lock. */
function useSahaSkills(){return themeOf()==='saha';}

/* Seçili dal yalnızca arayüz durumu — MKQ ve atlas.js'teki CAM ile aynı gerekçe.
   S'ye yazsaydık kayıt biçimini büyütür ve eski kayıtlar için yeni bir "yokken de
   çalış" sınavı açardı; üstelik hangi sekmede kaldığın kariyerin bir parçası
   değil. Tema değiştirip geri dönmek puanları ya da alınmışları etkilemiyor,
   yalnız bu değişken duruyor. */
let SKTAB=SK_BRANCH[0].id;
function skSetTab(b){if(skBranch(b)){SKTAB=b;render();}}

/* Kart ve detay aynı işaretleri kullanıyor; ikisi de buradan okuyor. */
const SK_TICK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.6 4.6 4.6L19 7.4"/></svg>';
const SK_LOCKI='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4.6" y="10.4" width="14.8" height="10" rx="2.4"/><path d="M8.2 10.4V7.6a3.8 3.8 0 0 1 7.6 0v2.8"/></svg>';

/* Durumun tek sözlüğü: alt şeridin simgesi ve metni. Kart da detay da buradan
   okuyor, yani ekranda iki farklı gerekçe yazamaz. Kilitte gereken düğümün adı
   veriliyor — "biri açıksa açılır" kuralı gereği aralarında "/" var. */
function skFoot(sk,st){
  if(st==='owned')return {ic:SK_TICK,t:t('skOwned')};
  if(st==='lock'){
    const r=(sk.req||[]).map(x=>skById(x)).filter(Boolean).map(x=>x.n[L]).join(' / ');
    return {ic:SK_LOCKI,t:t('skReq')+': '+r};
  }
  if(st==='poor')return {ic:'',t:t('skPoorShort')};
  return {ic:'',t:t('skUpgradeBtn')};
}
/* Maliyet her zaman gerçek sk.cost; çoğul eki de oyunun kendi anahtarlarından. */
function skCostTxt(c){return c+' '+(c>1?t('skPts'):t('skPt'));}
function skSvg(inner,cls){
  return `<svg class="${cls||''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
    stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}
/* Kartın simgesi düğümün kendi çizimi; yoksa dal glifine düşüyor (bkz. skIcon). */
function skNodeIcon(sk){return skIcon(sk.id)||SKICONS[sk.br||'hub']||SKICONS.hub;}

function skCardHtml(sk){
  const st=skillState(sk), f=skFoot(sk,st);
  const effs=Object.keys(sk.eff||{}).map(k=>
    `<span class="skCardE">${skEffLabel(k,sk.eff[k])}</span>`).join('');
  return `<button class="skCard ${st}" style="--skc:var(--sk-${sk.br||'hub'})"
    onclick="skOpen('${sk.id}')" aria-label="${esc(sk.n[L])} · ${esc(f.t)}">
    <span class="skCardH">
      <span class="skCardIc">${skSvg(skNodeIcon(sk))}</span>
      ${st==='owned'
        ?`<span class="skCost ok">${SK_TICK}</span>`
        :`<span class="skCost"><b class="num">${sk.cost}</b>${ICONS.gem}</span>`}
    </span>
    <span class="skCardN">${sk.n[L]}</span>
    <span class="skCardEs">${effs}</span>
    <span class="skCardF">${f.ic?`<i>${f.ic}</i>`:''}<span>${f.t}</span></span>
  </button>`;
}

function skSahaView(){
  const pts=skillPoints(), spent=skillSpent(), total=skillTreeCost();
  const lp=levelProgress();
  const br=skBranch(SKTAB)?SKTAB:SK_BRANCH[0].id;
  const tabs=SK_BRANCH.map(b=>{
    const got=branchTaken(b.id), tot=branchTotal(b.id);
    return `<button class="skTab${b.id===br?' on':''}" style="--skc:var(--sk-${b.id})"
      onclick="skSetTab('${b.id}')" aria-pressed="${b.id===br?'true':'false'}">
      <span class="skTabIc">${skSvg(skBranchIcon(b.id)||SKICONS[b.id])}</span>
      <span class="skTabN">${b.n[L]}</span>
      <span class="skTabP num">${got}/${tot}</span></button>`;
  }).join('');
  /* Seviye satırı puanın NEREDEN geldiğini söylüyor: puan seviyeden, seviye
     itibardan. Onsuz özet kart "9" diyor ve onuncunun nereden geleceğini
     söylemiyor. */
  const lvLine=lp.need
    ? `${t('skLvShort')} ${lp.lv} · ${t('skNext')} <b class="num">${Math.floor(lp.cur)}/${lp.need}</b> ${t('rep').toLocaleLowerCase(L)}`
    : `${t('skLvShort')} ${lp.lv} · ${t('skMaxLv')}`;
  const bpct=total?Math.round(spent/total*100):0;
  return `<div class="skTop">
    <div class="skTitle">${t('skTitle')}</div>
    <div class="skSub">${t('skSub')}</div>
  </div>
  <div class="skSum">
    <div class="skSumP">
      <b class="skSumV num${pts?' hot':''}">${pts}</b>
      <span class="skSumL">${t('skPointsL')}</span>
    </div>
    <i></i>
    <div class="skSumR">
      <div class="skSumT"><b class="num">${spent}/${total}</b><span>${t('skProgress')}</span></div>
      <div class="skPrg"><i style="width:${bpct}%"></i></div>
      <div class="skSumLv">${lvLine}</div>
    </div>
  </div>
  <div class="skTabs">${tabs}</div>
  <div class="skBrD">${skBranch(br).d[L]}</div>
  <div class="skGrid">${SKILLS.filter(sk=>sk.br===br).map(skCardHtml).join('')}</div>
  <div class="skNote">${t('skHint').replace('{n}',LV.bonus)}</div>`;
}

/* Detay: mevcut modal/sheet sistemine giriyor, kendi kapatma yolunu açmıyor —
   dışarı dokunma ve Android geri düğmesi bugünkü davranışında kalıyor.
   "Sonraki seviye" bölümü YOK: düğümün ikinci bir kademesi yok. */
function skSahaSheet(sk){
  const st=skillState(sk), br=skBranch(sk.br), f=skFoot(sk,st);
  /* Etiket ile değer iki sütuna ayrılıyor ama biçimlendirme YENİDEN YAZILMIYOR:
     skEffLabel her zaman "ad + boşluk + değer" üretiyor, burada yalnız adın
     uzunluğu kadar kesiliyor. Yüzde işaretinin dile göre yer değiştirmesi gibi
     kurallar tek yerde, skills.js'te kalıyor. */
  const effs=Object.keys(sk.eff||{}).map(k=>{
    const n=SK_KEY[k]?SK_KEY[k].n[L]:k, full=skEffLabel(k,sk.eff[k]);
    return `<div class="skDE"><span>${n}</span><b>${full.slice(n.length+1)||full}</b></div>`;
  }).join('');
  const cta=
    st==='owned'? `<div class="skCta done">${SK_TICK}<span>${t('skOwned')}</span></div>`
   :st==='open' ? `<button class="skCta go" onclick="skillBuy('${sk.id}')">
                     <span>${t('skUpgradeBtn')}</span><i class="num">${skCostTxt(sk.cost)}</i></button>`
   :st==='poor' ? `<div class="skCta no">${t('skNeedPts').replace('{n}',sk.cost)}</div>`
   /* Kilidin gerekçesi hemen üstteki satırda, gereken yeteneğin ADIYLA duruyor;
      düğme yalnız durumu söylüyor. skReqLock ağacın sözlüğünden ("bağlı düğüm")
      konuşuyor ve bu ekranda düğüm yok — o anahtar diğer üç temada yerinde. */
   :              `<div class="skCta no">${t('skLockedBtn')}</div>`;
  openModal(`<div class="skSheet ${st}" style="--skc:var(--sk-${sk.br||'hub'})">
    <div class="skSheetH">
      <span class="skSheetIc">${skSvg(skNodeIcon(sk))}</span>
      <div class="skSheetT">
        <h2>${sk.n[L]}</h2>
        <div class="sub">${br?br.n[L]:t('agency')} · <b class="num">${skCostTxt(sk.cost)}</b></div>
      </div>
    </div>
    <div class="skSheetD">${sk.dsc[L]}</div>
    ${effs?`<div class="sect">${t('skEffects')}</div><div class="skDEs">${effs}</div>`:''}
    ${st==='lock'?`<div class="skSheetR"><i>${SK_LOCKI}</i><span>${f.t}</span></div>`:''}
    ${cta}
  </div>`);
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
/* Kariyer menüsünün iki ikonu. Dil düğmesi küre, kariyer işlemleri üç nokta —
   üçünü de nokta olarak CSS ile çizmek yerine tek SVG, dört temada da
   currentColor ile boyanıyor ve ayrıca kural gerektirmiyor. */
globe:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.2 2.3 3.4 5.3 3.4 8.5S14.2 18.2 12 20.5c-2.2-2.3-3.4-5.3-3.4-8.5S9.8 5.8 12 3.5z"/></svg>',
more:'<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="12" cy="19" r="1.9"/></svg>',
dash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
clients:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/></svg>',
market:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
/* Filtre düğmesi: aynı 1.8 kalınlıkta üç sürgü. Diğer ikonlarla aynı çizim dili. */
filters:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h11M19 7h1"/><path d="M4 12h3M11 12h9"/><path d="M4 17h9M17 17h3"/><circle cx="17" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="15" cy="17" r="2"/></svg>',
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
    /* Menü ekranı kendi başlığını taşıyor (KARİYERLERİM); üst çubukta ikinci
       kez "Ana Menü" yazmak aynı şeyi iki kez söylemek olurdu. Üst çubuk burada
       yalnız uygulama kimliğini gösteriyor. */
    document.getElementById('hT2').textContent=c.v==='setup'?t('setupTitle'):'';
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
/* ================= SAHA: HAFTALIK RAPOR VE OLAYLAR =================
   Kapılar diğer saha ekranlarıyla aynı desende (useSahaInbox/useSahaMarket/
   useSahaSkills): yalnız showWeekReport, showEvent ve evChoose dallanıyor,
   geri kalan üç tema eski görünümleri olduğu gibi kullanmaya devam ediyor.
   Modal sırası, kilit, S.evCur kalıcılığı ve applyEff yolu hiç değişmiyor —
   değişen tek şey aynı verinin nasıl çizildiği. */
function useSahaWeekReport(){return themeOf()==='saha';}
function useSahaEvent(){return themeOf()==='saha';}

/* Olay kategorisinin ekrandaki karşılığı: rozet, iki dildeki ad ve vurgu rengi.
   Kategorinin kendisi olayın kaydında (js/events.js, cat alanı) — burada ikinci
   bir olay-id listesi yok, yalnız kategori kimliğinin görsel karşılığı var.
   Adlar STR yerine satır içi {tr,en}: kategori kendi kendine yeten bir kayıt
   olsun (aynı desen IB_CAT, RIV_ARCH ve SK_BRANCH'te de kullanılıyor).
   Renkler rozetin kendi baskın tonundan seçildi; rozetin renklerine hiç
   dokunulmuyor, vurgu yalnız yazıda ve halede taşınıyor. */
const EV_CAT={
  media  :{ic:'assets/ui/event-media.webp',  n:{tr:'Medya',en:'Media'},    c:'var(--warn)'},
  player :{ic:'assets/ui/event-player.webp', n:{tr:'Oyuncu',en:'Player'},  c:'var(--acc)'},
  club   :{ic:'assets/ui/event-club.webp',   n:{tr:'Kulüp',en:'Club'},     c:'var(--blue)'},
  agency :{ic:'assets/ui/event-agency.webp', n:{tr:'Ajans',en:'Agency'},   c:'var(--viol)'},
  finance:{ic:'assets/ui/event-finance.webp',n:{tr:'Finans',en:'Finance'}, c:'var(--gold)'},
  crisis :{ic:'assets/ui/event-crisis.webp', n:{tr:'Kriz',en:'Crisis'},    c:'var(--bad)'}
};
const EV_REPORT_IC='assets/ui/event-weekly-report.webp';
function evCatOf(ev){return EV_CAT[evCat(ev)];}

/* Bu üç ekranın çizgileri. ICONS'ta kilit, onay, kapalı göz ve chevron yok;
   IB_ACT_ICON ise yorumuyla birlikte Kutu'nun kendi seti — oradan okumak o
   sözü yanlışa çevirirdi. Çizim dili ICONS/SK_ICON/IB_ACT_ICON ile birebir
   aynı: 24x24 kutu, fill yok, currentColor, 1.8 kalınlık, yuvarlak uç. */
const EV_ICON={
  lock :'<rect x="4.7" y="10.4" width="14.6" height="9.3" rx="2.2"/><path d="M8.3 10.4V7.9a3.7 3.7 0 0 1 7.4 0v2.5"/>',
  ok   :'<path d="M5 12.5l4.6 4.6L19 7.2"/>',
  hide :'<path d="M3.6 10.3c2.2 3.1 5 4.6 8.4 4.6s6.2-1.5 8.4-4.6"/><path d="M4.9 13.3l-1.7 2.5"/><path d="M9.4 15.4l-.8 2.7"/><path d="M14.6 15.4l.8 2.7"/><path d="M19.1 13.3l1.7 2.5"/>',
  chev :'<path d="M9.6 5.8l6.4 6.2-6.4 6.2"/>'
};
/* Etki kartlarının ikonları — applyEff'in ürettiği anahtarlarla aynı kümede.
   Yeni bir etki anahtarı eklenirse buraya da bir çizim gerekir; eksikse
   evEffSvg() boş döner ve kart yalnız sayı ve etiketle çizilir. */
const EV_EFF_ICON={
  cash   :'<ellipse cx="12" cy="7.2" rx="6.6" ry="2.6"/><path d="M5.4 7.2v9.6c0 1.44 2.95 2.6 6.6 2.6s6.6-1.16 6.6-2.6V7.2"/><path d="M5.4 12c0 1.44 2.95 2.6 6.6 2.6s6.6-1.16 6.6-2.6"/>',
  rep    :'<path d="M12 3.7l2.58 5.23 5.77.84-4.17 4.07.98 5.75L12 16.86l-5.16 2.73.98-5.75-4.17-4.07 5.77-.84z"/>',
  morale :'<path d="M12 19.5l-6.9-6.5a4.15 4.15 0 0 1 6.9-4.6 4.15 4.15 0 0 1 6.9 4.6z"/>',
  trust  :'<path d="M12 3.5l7 2.8v5.1c0 4.15-2.87 7.32-7 9.1-4.13-1.78-7-4.95-7-9.1V6.3z"/><path d="M8.9 11.9l2.3 2.3 4-4.4"/>',
  form   :'<path d="M3.7 15.3l4.8-4.8 3.4 3.4 6.1-6.5"/><path d="M14.4 7.4h3.6V11"/>',
  ag_comm:'<circle cx="8" cy="8" r="2.2"/><circle cx="16" cy="16" r="2.2"/><path d="M17.6 6.4L6.4 17.6"/>',
  ag_cap :'<circle cx="9.4" cy="8.4" r="3.2"/><path d="M3.9 19.4a5.5 5.5 0 0 1 11 0"/><path d="M18.5 8.7v4.6"/><path d="M20.8 11h-4.6"/>',
  ag_cost:'<path d="M4.5 7.7h13.3a2 2 0 0 1 2 2v7.3a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2z"/><path d="M4.5 7.7V6.5a1.6 1.6 0 0 1 1.6-1.6h9.3"/><circle cx="16.3" cy="13.3" r="1.3"/>'
};
function evSvg(d,cls){
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'+
         ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"'+
         (cls?' class="'+cls+'"':'')+'>'+d+'</svg>';
}
function evEffSvg(k){return EV_EFF_ICON[k]?evSvg(EV_EFF_ICON[k]):'';}
/* Rozet yüklenemezse CSS'in çizdiği boş halkaya düşülüyor — ibIconFail ile
   aynı desen, ekran rozetsiz de okunur kalıyor. */
function evIconFail(img){
  const p=img.parentNode;
  if(p&&p.classList)p.classList.add('noimg');
  img.remove();
}
function evBadgeHtml(src,cls,accent){
  return '<span class="evBadge'+(cls?' '+cls:'')+'"'+(accent?' style="--evc:'+accent+'"':'')+'>'+
    '<img src="'+src+'" alt="" aria-hidden="true" width="72" height="72" onerror="evIconFail(this)"></span>';
}

/* ---------- haftalık müşteri raporu ----------
   Özet dört hücrenin tamamı S.wkRep'ten türetiliyor; hiçbir maç yeniden
   hesaplanmıyor ve rapora yeni veri eklenmiyor. Ortalama puan yalnız
   oynayanlar üzerinden alınıyor — oynamayanı sıfır saymak haftayı olduğundan
   kötü gösterirdi. Kartlar <button>: dokunma sesi (SFX_SEL) ve klavye odağı
   kendiliğinden geliyor, içerik de tümüyle satır içi öğelerden kuruluyor. */
function wkSahaCell(v,lbl){
  return '<span class="wrCell"><b class="num">'+v+'</b><em>'+lbl+'</em></span>';
}
function wkSahaCard(r){
  const tm=S.teams[r.tid],opp=S.teams[r.opp];
  const resCh=r.res==='W'?(L==='en'?'W':'G'):r.res==='L'?(L==='en'?'L':'M'):(L==='en'?'D':'B');
  const resCls=r.res==='W'?'w':r.res==='L'?'l':'d';
  const stat=(v,lbl,cls)=>'<i class="wrStat'+(cls?' '+cls:'')+'"><b class="num">'+v+'</b><em>'+lbl+'</em></i>';
  const body=r.dnp
    ? '<span class="wrDnp">'+t('wkDnp')+'</span>'
    : '<span class="wrStats">'+stat(r.min+"'",t('minShort'))
      +stat(r.g||0,t('goals'),r.g?'on gl':'')
      +stat(r.a||0,t('assists'),r.a?'on as':'')+'</span>';
  const rt=r.dnp?''
    :'<span class="wrRt '+(r.rt>=7.5?'g':r.rt>=6.5?'y':'o')+'"><b class="num">'+r.rt.toFixed(1)+'</b><em>'+t('ratingShort')+'</em></span>';
  return '<button class="wrCard'+(r.mm?' mm':'')+(r.dnp?' out':'')+'" onclick="closeModal();pushV(\'player\','+r.pid+')">'
    +'<span class="wrCrest">'+tmBadge(tm,38)+'</span>'
    +'<span class="wrMain">'
    +'<span class="wrName"><span class="wrNameT">'+esc(r.n)+'</span>'+(r.mm?'<i class="wrMotm">'+t('motm')+'</i>':'')+'</span>'
    +'<span class="wrVs">'+(opp?esc(opp.n):'—')+' <b class="wrRes '+resCls+'">'+r.sc+' '+resCh+'</b></span>'
    +body+'</span>'+rt+'</button>';
}
function wkSahaReport(wk){
  const rows=(S.wkRep||[]).slice().sort((a,b)=>(b.rt||0)-(a.rt||0));
  const on=rows.filter(r=>!r.dnp);
  const sum=k=>on.reduce((s,r)=>s+(r[k]||0),0);
  const avg=on.length?(sum('rt')/on.length).toFixed(1):'–';
  const mute=esc(t('dontShow'));   // ikon düğmesinin görünür yazısı yok, adı burada
  openModal(
    '<div class="evTop">'
    +evBadgeHtml(EV_REPORT_IC,'','var(--acc)')
    +'<h2 class="evTtl wrTtl">'+t('wkRepHead').replace('{w}',wk)+'</h2>'
    +'<div class="evCat" style="--evc:var(--acc)">'+t('wkRepSub')+'</div>'
    +'</div>'
    +'<div class="wrSum">'
    +wkSahaCell(on.length,t('wkPlayed'))
    +wkSahaCell(sum('g'),t('goals'))
    +wkSahaCell(sum('a'),t('assists'))
    +wkSahaCell(avg,t('avgRt'))
    +'</div>'
    +'<div class="wrList">'+rows.map(wkSahaCard).join('')+'</div>'
    /* İki işlem sabit bir şeritte: liste beş oyuncuda sheet'i aşıyordu ve
       "Bir daha gösterme" katlamanın altında kalıyordu. Sticky, fixed değil —
       şerit akışın son öğesi olduğu için sona kaydırıldığında son oyuncu kartı
       tam üstünde kalıyor, hiçbir zaman örtülmüyor. Kapatma ve
       S.wkRepOn=false;save() davranışı aynen korunuyor. */
    +'<div class="wrFoot">'
    +'<button class="btn p evGo" onclick="closeModal()">'+evSvg(EV_ICON.ok)+'<span>'+t('gotIt')+'</span></button>'
    +'<button class="wrMute" aria-label="'+mute+'" title="'+mute+'"'
    +' onclick="S.wkRepOn=false;save();closeModal();toast(t(\'wkRepOff\'))">'+evSvg(EV_ICON.hide)+'</button>'
    +'</div>');
}

/* ---------- olay: karar ve sonuç ----------
   Kimlik satırı üç durumu ayırıyor: geçerli oyuncu varsa oyuncu satırı, oyuncu
   yoksa ama kulüp bağlamı varsa kompakt kulüp satırı, ikisi de yoksa satır hiç
   çizilmiyor — menajerin kendi olaylarında boş bir kimlik kutusu yalan olurdu.
   Sonuç ekranında aynı satır applyEff sonrası değerleri gösteriyor: c.p canlı
   oyuncu nesnesi olduğu için ayrıca bir kopya tutmaya gerek yok. */
function evWhoHtml(c){
  if(c.p){
    const st=(v,lbl)=>'<i class="evStat"><b class="num">'+v+'</b><em>'+lbl+'</em></i>';
    return '<div class="evWho">'
      +'<span class="evWhoCrest">'+tmBadge(c.tm,40)+'</span>'
      +'<span class="evWhoMain">'
      +'<span class="evWhoName">'+esc(c.p.n)+'</span>'
      +'<span class="evWhoSub">'+(c.tm?esc(c.tm.n):'—')+'</span></span>'
      +'<span class="evStats">'+st(c.p.r,t('rating'))
      +st(Math.round(c.p.morale),t('morale'))
      +st(Math.round(trustOf(c.p)),t('trustL'))+'</span></div>';
  }
  if(c.tm)return '<div class="evWho slim">'
    +'<span class="evWhoCrest">'+tmBadge(c.tm,34)+'</span>'
    +'<span class="evWhoMain"><span class="evWhoName">'+esc(c.tm.n)+'</span></span></div>';
  return '';
}
function evSahaAsk(ev,c){
  const k=evCatOf(ev);
  openModal(
    '<div class="evTop">'
    +evBadgeHtml(k.ic,'',k.c)
    +'<div class="evCat" style="--evc:'+k.c+'">'+k.n[L]+'</div>'
    +'<div class="evLock">'+evSvg(EV_ICON.lock)+'<span>'+t('evNeed')+'</span></div>'
    +'</div>'
    +'<h2 class="evTtl">'+ev.ttl(c)[L]+'</h2>'
    +evWhoHtml(c)
    +'<div class="evCtx">'+ev.txt(c)[L]+'</div>'
    +'<div class="evAsk">'+t('evAnswer')+'</div>'
    +'<div class="evOpts">'+ev.opts.map((o,i)=>
      '<button class="evOpt" onclick="evChoose('+i+')"><span class="evOptT">'+o.t[L]+'</span>'
      +evSvg(EV_ICON.chev,'evChev')+'</button>').join('')+'</div>',true);
}
function evSahaResult(ev,c,r,changes,lbl){
  const k=evCatOf(ev);
  const neg=changes.some(x=>x.v<0),pos=changes.some(x=>x.v>0);
  const val=neg?(pos?'mid':'bad'):'good';
  const verdict=val==='good'?t('evOutGood'):val==='bad'?t('evOutBad'):t('evOutMid');
  const effs=changes.map(x=>{
    /* Kalıcı ajans değişiklikleri oran olarak yazılır; giderde artış kötü,
       azalış iyi — eski davranışın birebir aynısı. */
    const isPct=x.k==='ag_comm'||x.k==='ag_cost';
    const good=x.k==='ag_cost'?x.v<0:x.v>0;
    const v=x.k==='cash'?fmtK(Math.abs(x.v)):isPct?'%'+Math.round(Math.abs(x.v)*100):Math.abs(x.v);
    const perm=x.k.indexOf('ag_')===0?'<i class="evPerm">'+t('permanent')+'</i>':'';
    return '<div class="evEff '+(good?'g':'b')+'">'
      +'<span class="evEffIc">'+evEffSvg(x.k)+'</span>'
      +'<span class="evEffV num">'+(x.v>0?'+':'−')+v+'</span>'
      +'<span class="evEffK">'+(lbl[x.k]||x.k)+perm+'</span></div>';
  }).join('');
  openModal(
    '<div class="evTop">'
    +evBadgeHtml(k.ic,val,k.c)
    +'<div class="evCat" style="--evc:'+k.c+'">'+k.n[L]+'</div>'
    +'<div class="evVerdict '+val+'">'+verdict+'</div>'
    +'</div>'
    +'<h2 class="evTtl">'+ev.ttl(c)[L]+'</h2>'
    +'<div class="evOut '+val+'">'+(r.msg?r.msg[L]:'')+'</div>'
    +evWhoHtml(c)
    +(effs?'<div class="evAsk">'+t('evImpact')+'</div><div class="evEffs">'+effs+'</div>':'')
    +'<button class="btn p evGo" onclick="closeModal()">'+evSvg(EV_ICON.ok)+'<span>'+t('evCont')+'</span></button>');
}
function showEvent(ref){
  const ev=ref?evById(ref.id):null;
  /* Olay tanınmıyor (kaldırılmış ya da yeniden adlandırılmış bir id taşıyan
     kayıt). Sessizce dönmek olmaz: kuyruk yalnız closeModal ile ilerlediği için
     arkada bekleyen her modal askıda kalırdı (bkz. showLevelUp). Karar da
     düşürülüyor, yoksa ana ekranın gündem satırı hiç açılmayan bir olayı
     sonsuza kadar gösterirdi. */
  if(!ev){
    if(S&&S.evCur){S.evCur=null;save();}
    runNextModal();
    return;
  }
  const c=evCtx(ref.pid);
  S.evCur=ref;save();   // sayfa yenilense de karar bekliyor olarak kalsın
  if(useSahaEvent()){evSahaAsk(ev,c);return;}
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
  const opt=(ev&&ev.opts)?ev.opts[i]:null;
  /* Olay ya da seçenek tanınmıyor. Burada sessizce dönmek en kötüsü: soru modalı
     kilitli açılıyor (dışarı dokunmak kapatmıyor), yani ekran çıkışsız kalır ve
     kuyruk hiç ilerlemez. Kararı düşürüp normal kapanış yolundan çıkıyoruz —
     closeModal() hem kilidi bırakıyor hem sıradakini çağırıyor. */
  if(!opt){
    S.evCur=null;save();closeModal();render();
    return;
  }
  const r=opt.eff(c)||{};
  const changes=applyEff(r,c);
  S.evCur=null;
  const lbl={cash:t('cash'),rep:t('rep'),morale:t('morale'),trust:t('trustL'),form:t('form'),
             ag_comm:t('commission'),ag_cap:t('capacity'),ag_cost:t('weeklyCost')};
  if(useSahaEvent()){evSahaResult(ev,c,r,changes,lbl);save();render();return;}
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
  if(useSahaWeekReport()){wkSahaReport(wk);return;}
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
       ${/* Gol kralı yoksa yalnız lig adı kalır — uydurma bir "0 gol" yazmıyoruz. */''}
       <div class="psub">${lgName(c.lgi)}${c.ts?` · ${t('topScorer')}: ${c.ts.n} (${c.ts.g})`:''}</div></div>
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
