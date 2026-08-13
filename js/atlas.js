'use strict';
/* js/atlas.js — keşif ağı haritası.

   Oyunun keşif birimi lig; harita ise BÖLGE gösteriyor. 22 lig 16 bölgeye
   düşüyor (altı ülkenin iki kademesi var, bkz. LEAGUES[].ctry). Bir bölgenin
   işareti tektir, satın alma ligler üzerinden yürür.

   ===== tek doğruluk kaynağı =====
   Bölge durumu hiçbir yerde saklanmıyor. S.known lig indekslerini tutmaya devam
   ediyor — kayıt biçimi bu — ve buradaki her şey ondan türetiliyor. Bu dosya
   duruma yazmaz, yalnız okur.

   ===== coğrafya oynanışı kısıtlamaz =====
   Harita saf bir sunum katmanı. Keşfedilmemiş her lig, parası yetiyorsa,
   dünyanın neresinde olursa olsun satın alınabilir; komşuluk koşulu yok.
   Bu yüzden "ulaşılamaz bölge" diye bir durum da yok — olsaydı ekran yalan
   söylerdi. Bölge renkleri yalnızca ne kadar ilerlediğini anlatıyor:

     full     bölgedeki tüm ligler keşfedildi
     partial  bir kısmı keşfedildi, alınacak lig kaldı
     scouting bölgede ağ kurulumu sürüyor
     open     hiçbir ligi keşfedilmedi — alınmayı bekliyor

   Kamera (kaydırma/yakınlaştırma) modül değişkeninde duruyor, S'ye yazılmıyor:
   oturuma ait bir görünüm ayarı, kaydın parçası değil. */

/* ===== lig ↔ bölge =====
   Bölge listesi LEAGUES'ten türetiliyor: veri iki yerde durmasın. */
let ATL_CACHE=null;
function atlCache(){
  if(ATL_CACHE)return ATL_CACHE;
  const byTerr={}, order=[];
  LEAGUES.forEach((l,i)=>{
    if(!byTerr[l.ctry]){byTerr[l.ctry]=[];order.push(l.ctry);}
    byTerr[l.ctry].push(i);
  });
  ATL_CACHE={byTerr,order};
  return ATL_CACHE;
}
function terrList(){return atlCache().order;}
function terrOf(i){const l=LEAGUES[i];return l?l.ctry:null;}
function terrLeagues(c){return atlCache().byTerr[c]||[];}
function terrName(c){return CTRYS[c]?CTRYS[c][L]:c;}

/* ===== türetilmiş durum ===== */
function terrDiscovered(c){return terrLeagues(c).some(i=>knownLg(i));}
function terrRemaining(c){return terrLeagues(c).filter(i=>!knownLg(i));}
/* "Açık" = alınacak ligi var. Coğrafi bir koşul değil. */
function terrOpen(c){return terrRemaining(c).length>0;}
function terrScouting(c){return terrLeagues(c).some(i=>scoutPending(i));}
/* Sıra önemli. fog en sonda duruyor ve bugünkü veriyle hiç çalışmıyor: on altı
   bölgenin hepsinin en az bir ligi var. Yine de duruyor — haritada karşılığı olup
   oyunda hiç ligi olmayan bir bölge eklenirse (ya da GEO'da öksüz bir şekil
   kalırsa) o bölge yeşile boyanmak yerine nötr kalsın. */
function terrState(c){
  if(terrScouting(c))return 'scouting';
  const total=terrLeagues(c).length;
  if(!total)return 'fog';                       // ilerleyecek bir şeyi yok
  if(!terrRemaining(c).length)return 'full';    // hepsi keşfedildi
  return terrDiscovered(c)?'partial':'open';    // bir kısmı / hiçbiri
}
/* Bir ligin ağı şu anda kurulabilir mi? Arayüz bunu sorar; parayı buyScout
   kendi kontrol eder, burada kasaya bakılmıyor. */
function canScout(i){return !!LEAGUES[i]&&!knownLg(i)&&!scoutPending(i);}

/* ================= ÇİZİM =================
   Coğrafya js/worldgeo.js'ten geliyor (üretilmiş dosya). */
function atlasHasGeo(){return typeof GEO!=='undefined'&&GEO&&GEO.t;}
function atlasMapSvg(){
  if(!atlasHasGeo())return '';
  const vb=GEO.vb;
  const terrs=terrList().filter(c=>GEO.t[c]).map(c=>
    `<path class="mapterr ${terrState(c)}" d="${GEO.t[c].d}" fill-rule="evenodd"/>`).join('');
  const marks=terrList().filter(c=>GEO.t[c]).map(c=>{
    const a=GEO.t[c].a;
    return `<g class="mapmark ${terrState(c)}" data-t="${c}" data-x="${a[0]}" data-y="${a[1]}"
       transform="translate(${a[0]},${a[1]})">
      <circle class="mk" r="30"/><circle class="mkdot" r="11"/></g>`;
  }).join('');
  /* Kamera tek bir grubu dönüştürüyor: kaydırma ve yakınlaştırma sırasında
     SVG yeniden kurulmuyor, yalnız bu transform yazılıyor. */
  return `<svg class="mapsvg" id="mapSvg" viewBox="${vb.join(' ')}"
    preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(t('scoutNet'))}">
    <rect class="mapsea" x="${vb[0]-vb[2]}" y="${vb[1]-vb[3]}" width="${vb[2]*3}" height="${vb[3]*3}"/>
    <g id="mapCam">
      <path class="mapland" d="${GEO.ctx}" fill-rule="evenodd"/>
      <g class="mapterrs">${terrs}</g>
      <g class="mapmarks" id="mapMarks">${marks}</g>
    </g>
  </svg>`;
}
function atlasLegend(){
  const cnt={};
  terrList().forEach(c=>{const s=terrState(c);cnt[s]=(cnt[s]||0)+1;});
  const item=(st,lbl)=>cnt[st]?`<span class="mapkey ${st}"><i></i>${lbl} <b>${cnt[st]}</b></span>`:'';
  return `<div class="maplegend">
    ${item('full',t('mapFull'))}${item('partial',t('mapPartial'))}
    ${item('scouting',t('scoutPendingT'))}${item('open',t('mapOpen'))}${item('fog',t('mapFog'))}
  </div>`;
}
function atlasView(){
  if(!atlasHasGeo())
    return `<h2 class="sec">${t('scoutNet')}</h2><div class="card"><div class="empty">—</div></div>`;
  const known=(S.known||[]).length;
  return `<h2 class="sec">${t('scoutNet')}</h2>
  <div class="mapwrap" id="mapWrap">
    ${atlasMapSvg()}
    <div class="mapzoom">
      <button onclick="mapZoom(1)" aria-label="+">+</button>
      <button onclick="mapZoom(-1)" aria-label="−">−</button>
      <button onclick="mapHome()" aria-label="${esc(t('mapRecentre'))}">⌂</button>
    </div>
  </div>
  ${atlasLegend()}
  <div class="card tight" style="padding:14px">
    <div class="kv"><span class="k">${t('knownLbl')}</span>
      <span class="v">${known}/${LEAGUES.length}</span></div>
    <div class="kv"><span class="k">${t('cash')}</span><span class="v">${fmtK(S.cash)}</span></div>
  </div>
  <div class="sub" style="margin:0 2px 10px">${t('mapHint')}</div>
  <!-- GEÇİCİ: satın alma paneli 6. adımda gelecek. O gelene kadar mevcut liste
       erişilebilir kalsın ki ağ kurma özelliği kaybolmasın. -->
  <button class="btn b" onclick="openScout()">${t('scoutBuild')} · ${t('mapListTmp')}</button>`;
}

/* ================= KAMERA =================
   Yalnız modül değişkeni: kayda yazılmıyor, kariyerle taşınmıyor.
   Dönüşüm doğrudan DOM'a yazılıyor; her harekette görünümü yeniden çizmek
   telefonda gözle görülür bir takılma demek. */
let CAM={x:0,y:0,k:1};
const CAM_K={min:1,max:12};
/* Ev çerçevesi bir ülkeyi yapıştırmasın: en az bu kadar genişlik gösterilsin,
   böylece komşuları da görünür ve nereye gidebileceğin belli olur. */
const CAM_SPAN=1000;
function mapSvgEl(){return document.getElementById('mapSvg');}
function mapCamEl(){return document.getElementById('mapCam');}
/* Ekranda gerçekten görünen viewBox penceresi. preserveAspectRatio="meet"
   kutuyu ortalayıp boşluk bıraktığı için görünen alan viewBox'tan geniş
   olabiliyor; sınırlama bunu bilmek zorunda. */
function mapWindow(){
  const vb=GEO.vb, el=mapSvgEl();
  const r=el&&el.getBoundingClientRect?el.getBoundingClientRect():null;
  if(!r||!r.width||!r.height)return {x:vb[0],y:vb[1],w:vb[2],h:vb[3],sc:1};
  const sc=Math.min(r.width/vb[2],r.height/vb[3])||1;
  const w=r.width/sc, h=r.height/sc;
  return {x:vb[0]+(vb[2]-w)/2, y:vb[1]+(vb[3]-h)/2, w:w, h:h, sc:sc, rect:r};
}
/* Harita tamamen ekrandan çıkmasın. Kural "içerik pencereyi tümüyle örtsün"
   değil "en az yarısı görünsün": kuzeydeki Hollanda ya da güneydeki Arjantin
   ancak haritanın kenarının ötesinde bir miktar boşluk gösterilerek ortalanabilir.
   O boşluk boş değil — deniz katmanı kameranın dışında ve tüm görünümü kaplıyor,
   yani haritanın dışı okyanus olarak çiziliyor. */
const CAM_KEEP=0.5;
function mapClamp(){
  CAM.k=Math.max(CAM_K.min,Math.min(CAM_K.max,CAM.k));
  const vb=GEO.vb, w=mapWindow();
  const axis=(camv,vb0,vbLen,win0,winLen)=>{
    const keep=Math.min(vbLen*CAM.k,winLen)*CAM_KEEP;
    const lo=win0+keep-CAM.k*(vb0+vbLen);
    const hi=win0+winLen-keep-CAM.k*vb0;
    return lo>hi?(lo+hi)/2:Math.max(lo,Math.min(hi,camv));
  };
  CAM.x=axis(CAM.x,vb[0],vb[2],w.x,w.w);
  CAM.y=axis(CAM.y,vb[1],vb[3],w.y,w.h);
}
/* İşaretler haritayla birlikte büyümesin: uzakta küçük nokta, yakında okunur
   bir işaret. Üs 1 olsaydı ekran boyutu sabit kalır, 0 olsaydı harita kadar
   büyürdü; arası ikisini de vermiyor ama ikisine de yaklaşıyor. */
function mapMarkScale(){
  const g=document.getElementById('mapMarks');
  if(!g||!g.children)return;
  const s=Math.pow(CAM.k,-0.45);
  Array.prototype.forEach.call(g.children,el=>{
    if(!el.getAttribute)return;
    el.setAttribute('transform',
      'translate('+el.getAttribute('data-x')+','+el.getAttribute('data-y')+') scale('+s.toFixed(3)+')');
  });
}
function mapApply(){
  const g=mapCamEl();
  if(g&&g.setAttribute)
    g.setAttribute('transform','translate('+CAM.x.toFixed(1)+' '+CAM.y.toFixed(1)+') scale('+CAM.k.toFixed(4)+')');
  mapMarkScale();
}
/* Ekran noktası → viewBox koordinatı */
function mapToVb(sx,sy){
  const w=mapWindow();
  if(!w.rect)return {x:0,y:0};
  return {x:w.x+(sx-w.rect.left)/w.sc, y:w.y+(sy-w.rect.top)/w.sc};
}
/* Verilen ekran noktası sabit kalacak şekilde yakınlaştır. */
function mapZoomAt(factor,sx,sy){
  const v=(sx===undefined)?null:mapToVb(sx,sy);
  const p=v||(function(){const w=mapWindow();return {x:w.x+w.w/2,y:w.y+w.h/2};})();
  const lx=(p.x-CAM.x)/CAM.k, ly=(p.y-CAM.y)/CAM.k;
  CAM.k=Math.max(CAM_K.min,Math.min(CAM_K.max,CAM.k*factor));
  CAM.x=p.x-lx*CAM.k;
  CAM.y=p.y-ly*CAM.k;
  mapClamp();mapApply();
}
function mapZoom(dir){mapZoomAt(dir>0?1.45:1/1.45);}
function mapFitWorld(){CAM.k=1;CAM.x=0;CAM.y=0;mapClamp();mapApply();}
/* Ekranı oyuncunun kendi bölgesine çerçevele. Hiç ağı yoksa dünya. */
function mapHome(){
  if(!atlasHasGeo())return;
  const own=terrList().filter(c=>GEO.t[c]&&terrDiscovered(c));
  if(!own.length){mapFitWorld();return;}
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  own.forEach(c=>{const b=GEO.t[c].bb;
    x0=Math.min(x0,b[0]);y0=Math.min(y0,b[1]);x1=Math.max(x1,b[2]);y1=Math.max(y1,b[3]);});
  const cx=(x0+x1)/2, cy=(y0+y1)/2;
  /* dar bölgeleri en az CAM_SPAN genişliğinde bir alana yay */
  const w=mapWindow();
  const spanX=Math.max(x1-x0,CAM_SPAN), spanY=Math.max(y1-y0,CAM_SPAN*(w.h/w.w));
  CAM.k=Math.min(w.w/spanX,w.h/spanY);
  CAM.k=Math.max(CAM_K.min,Math.min(CAM_K.max,CAM.k));
  CAM.x=w.x+w.w/2-CAM.k*cx;
  CAM.y=w.y+w.h/2-CAM.k*cy;
  mapClamp();mapApply();
}
/* Olay bağlama. render() her çizimden sonra çağırıyor: innerHTML eski
   dinleyicileri sildiği için yeniden bağlanmak zorunda. */
function mapMount(){
  const el=mapSvgEl();
  if(!el||!el.addEventListener)return;
  mapApply();
  const pts=new Map();
  let base=null, drag=null;
  const two=()=>{const a=[...pts.values()];return {d:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),
    mx:(a[0].x+a[1].x)/2,my:(a[0].y+a[1].y)/2};};
  el.addEventListener('pointerdown',e=>{
    pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(el.setPointerCapture)try{el.setPointerCapture(e.pointerId);}catch(_){}
    if(pts.size===1)drag={x:e.clientX,y:e.clientY,ox:CAM.x,oy:CAM.y};
    else if(pts.size===2){const m=two();base={d:m.d,k:CAM.k,p:mapToVb(m.mx,m.my)};drag=null;}
  });
  el.addEventListener('pointermove',e=>{
    if(!pts.has(e.pointerId))return;
    pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
    const w=mapWindow();
    if(pts.size>=2&&base){
      const m=two();
      if(base.d>6){
        const lx=(base.p.x-CAM.x)/CAM.k, ly=(base.p.y-CAM.y)/CAM.k;
        CAM.k=Math.max(CAM_K.min,Math.min(CAM_K.max,base.k*(m.d/base.d)));
        /* iki parmağın ortası hangi noktayı tutuyorsa orada kalsın */
        const now=mapToVb(m.mx,m.my);
        CAM.x=now.x-lx*CAM.k;CAM.y=now.y-ly*CAM.k;
        mapClamp();mapApply();
      }
      return;
    }
    if(!drag)return;
    CAM.x=drag.ox+(e.clientX-drag.x)/w.sc;
    CAM.y=drag.oy+(e.clientY-drag.y)/w.sc;
    mapClamp();mapApply();
  });
  const up=e=>{
    pts.delete(e.pointerId);
    if(pts.size<2)base=null;
    if(pts.size===0)drag=null;
  };
  el.addEventListener('pointerup',up);
  el.addEventListener('pointercancel',up);
  el.addEventListener('wheel',e=>{
    e.preventDefault();
    mapZoomAt(e.deltaY<0?1.18:1/1.18,e.clientX,e.clientY);
  },{passive:false});
}
