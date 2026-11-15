'use strict';
/* js/cups.js — Avrupa kupaları: gerçek formatın (2024/25'ten beri, 2026/27 dahil)
   oyundaki karşılığı.

   Üç kupa (CUPS: Kıta / Birlik / Bölge Kupası = ŞL / AL / KL karşılığı), her biri:
     ön eleme play-off'u (rövanşlı)  →  36 takımlı tek tablolu LİG AŞAMASI
     (ŞL/AL 8 maç, KL 6 maç; her maç farklı rakip)  →  1–8 son 16'ya, 9–24
     rövanşlı play-off'a, 25–36 elenir  →  son 16, çeyrek, yarı final rövanşlı,
     final tek maç.

   Neden "uyarlama": gerçek kontenjan listesi 55 ülke üzerine kurulu, oyunda
   UEFA sıralamasının ilk 17'si var. Doğrudan girişler gerçek listeden birebir
   (CUP_ACCESS); ön elemeden gelen yerler gerçekte 18+ ülkelerin kulüplerinden de
   doluyor. Burada her kupada TEK bir rövanşlı ön eleme turu var ve gereken takım
   sayısı oyundaki liglerin bir sonraki sıralarından, gerçek listenin öncelik
   sırasıyla geliyor. Elenme yolları gerçekteki gibi: ŞL ön elemesini kaybeden
   AL lig aşamasına, AL ön elemesini kaybeden KL lig aşamasına düşer.

   Eski (v1) kayıtlar: sezonu 16 takımlı elemeyle başlamış bir kayıt o sezonu
   aynı kuralla bitirir (cupLegacyWeek). seedCups() her sezon sonunda yeni
   formatı kurar; kupa nesnesi v:2 taşıyorsa yeni kural işler. */

/* Takvim: hafta numaraları (S.week). Ön eleme lig başlarken (gerçekte ağustos),
   lig aşaması kış arası dahil sekiz maç günü, sonra rövanşlı turlar ve final.
   Hepsi 38 haftalık sezonun içinde; AL ve KL aynı haftaları kullanıyor, KL lig
   aşaması ilk altı maç gününde bitiyor. */
const CUP_WK={po:[2,4],lp:[6,8,10,13,15,17,21,23],kpo:[25,26],r16:[28,29],qf:[31,32],sf:[34,35],f:37};
const CUP_FMT=[{pots:4,games:8},{pots:4,games:8},{pots:6,games:6}];
const CUP_LPN=36;
/* Avrupa performans yerleri (EPS): bir önceki sezon en başarılı iki ülkeye ŞL'de
   beşinci sıra. 2026/27'de İngiltere ve İspanya. Kulüp katsayıları gibi SABİT. */
const CUP_EPS=[1,3];

/* ===== yardımcılar ===== */
function cupRange(a,b){const r=[];for(let i=a;i<=b;i++)r.push(i);return r;}
function cupShuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(RF()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function cupAssocOf(tid){const tm=S.teams[tid];return tm?LEAGUES[tm.lg].ctry:'';}
/* Kulüp katsayısı: gerçek kulübün katsayısı ya da ülke tabanı (UEFA'nın kuralı). */
function clubCoef(tid){
  const tm=S.teams[tid];if(!tm)return 0;
  const a=UEFA_ASSOC[LEAGUES[tm.lg].ctry];
  return CCOEF[tm.n]||(a?a.f:0);
}
/* Oyundaki Avrupa üst ligleri, ülke sırasına göre, güncel tablolarıyla. */
function cupAssocs(){
  const out=[];
  LEAGUES.forEach((l,i)=>{
    const a=UEFA_ASSOC[l.ctry];
    if(!a||l.tier!==1)return;
    out.push({ctry:l.ctry,r:a.r,tbl:leagueTable(i).map(t=>t.id)});
  });
  return out.sort((x,y)=>x.r-y.r);
}
/* Kupa sahibi: se sezonunun şampiyonu. seedCups sezon sonunda, S.season artmadan
   çalışıyor; o yüzden dağıtımda "bu sezonun" şampiyonu bir sonraki sezonun sahibi.
   Kura ise yeni sezonun 4. haftasında, S.season arttıktan SONRA — orada sahip bir
   önceki sezonunki (se = S.season−1). Varsayılanla çağrılınca sahip hiç bulunamıyor
   ve 1. torbaya konmuyordu. */
function cupHolder(ci,se){
  if(se===undefined)se=S.season;
  const h=(S.cupHist||{})[CUPS[ci].c];const x=h&&h[h.length-1];
  return x&&x.se===se&&S.teams[x.tid]?x.tid:null;
}

/* ===== KATILIMCI DAĞITIMI =====
   Gerçek 2026/27 kontenjan listesinin oyundaki 17 ülkeye uyarlanmış hâli. Sıra
   önemli: önce ŞL doğrudan girişleri, sonra ŞL ön elemesi, sonra AL, sonra KL.
   Bir kulüp yalnız bir yere girer (used). "nxt" = o ülkenin henüz yer almamış
   en iyi kulübü — gerçekte kupa galibinin ya da zaten yer almış kulübün boşalttığı
   yerin "bir sonraki sıraya" geçmesi böyle işliyor (kupa galibi yerleri cw: ulusal
   kupanın galibi;
   galibi zaten yer almışsa yeri de bu yolla ligin bir sonraki sırasına gidiyor).
   Saf: S'ye yazmıyor, zar atmıyor — lig tablosundaki Avrupa bölgeleri de bunu
   "sezon şimdi bitse" diye okuyor (cupProj). */
function cupAllocate(){
  const A=cupAssocs(),byR={};A.forEach(a=>byR[a.r]=a);
  const ranks=A.map(a=>a.r);
  const used=new Set(),cnt={};
  const rOf=tid=>{const a=UEFA_ASSOC[cupAssocOf(tid)];return a?a.r:0;};
  const ok=t=>t!==null&&t!==undefined&&!used.has(t);
  const mark=t=>{used.add(t);const r=rOf(t);cnt[r]=(cnt[r]||0)+1;};
  const pos=(r,n)=>{const a=byR[r];const t=a?a.tbl[n-1]:undefined;return ok(t)?t:null;};
  const nxt=r=>{const a=byR[r];if(!a)return null;const t=a.tbl.find(x=>!used.has(x));return t===undefined?null:t;};
  const add=(arr,t)=>{if(ok(t)){mark(t);arr.push(t);}};
  /* Kupa galibi yeri: ülkenin ulusal kupasını bu sezon kazanan; zaten yer almışsa
     (ya da kupa henüz bitmediyse — lig tablosundaki tahmin) ligin sıradaki kulübü. */
  const cw=r=>{const a=byR[r];const w=a?dcWinner(a.ctry):null;return ok(w)?w:nxt(r);};
  /* Öncelik listesi bitince: ülkeler sırayla, her ülke gerçek toplam Avrupa
     kontenjanına yakın bir tavana kadar. Tavanlar dolarsa tavansız devam — oyundaki 28
     ülkede ~430 üst lig kulübü var, gereken ~135. */
  const capOf=r=>r<=5?8:r<=7?7:r<=10?6:r<=15?5:4;
  const fill=(arr,need,list)=>{
    for(const f of list){if(arr.length>=need)return;add(arr,f());}
    for(let relax=0;relax<2&&arr.length<need;relax++){
      let moved=true;
      while(arr.length<need&&moved){
        moved=false;
        for(const r of ranks){
          if(arr.length>=need)break;
          if(!relax&&(cnt[r]||0)>=capOf(r))continue;
          const t=nxt(r);if(ok(t)){add(arr,t);moved=true;}
        }
      }
    }
  };
  /* ŞL — lig aşamasına doğrudan: şampiyon 1–10, ikinci 1–6, üçüncü 1–5,
     dördüncü 1–4, iki EPS beşincisi, 7. ülkenin ikincisi (2026/27 dengelemesi),
     ŞL ve AL sahipleri (zaten yer almamışlarsa). */
  const d1=[];
  cupRange(1,10).forEach(r=>add(d1,pos(r,1)));
  cupRange(1,6).forEach(r=>add(d1,pos(r,2)));
  cupRange(1,5).forEach(r=>add(d1,pos(r,3)));
  cupRange(1,4).forEach(r=>add(d1,pos(r,4)));
  CUP_EPS.forEach(r=>add(d1,pos(r,5)));
  add(d1,pos(7,2));
  add(d1,cupHolder(0));add(d1,cupHolder(1));
  const w1=Math.max(0,CUP_LPN-d1.length);
  /* ŞL ön elemesi: şampiyonlar yolu ile lig yolu iç içe — gerçekte son turda
     şampiyonlar yolu 10, lig yolu 4 takım. Önce 11–15 şampiyonları, sonra lig
     yolunun başı (6.'nın üçüncüsü, 5.'nin dördüncüsü, 8–9 ikincileri), sonra daha
     alt sıraların şampiyonları, en son 10–17 ikincileri. Sırası boş kalan ülke
     (18 İsrail kullanıcı kararıyla, 26 Rusya UEFA meni nedeniyle oyunda yok) pos()'tan null döner ve atlanır. */
  const p1=[];
  fill(p1,2*w1,[...cupRange(11,15).map(r=>()=>pos(r,1)),()=>pos(6,3),()=>pos(5,4),()=>pos(8,2),()=>pos(9,2),
    ...cupRange(16,30).map(r=>()=>pos(r,1)),...cupRange(10,17).map(r=>()=>pos(r,2))]);
  /* AL — doğrudan: KL sahibi; 1–5 için iki yer (beşinci sıra + kupa galibi
     yeri), 6–7 için bir (kupa galibi yeri). ŞL ön eleme kaybedenleri sonra eklenir. */
  const d2=[];
  add(d2,cupHolder(2));
  cupRange(1,5).forEach(r=>{add(d2,cw(r));add(d2,nxt(r));});
  cupRange(6,7).forEach(r=>add(d2,cw(r)));
  const w2=Math.max(0,CUP_LPN-d2.length-w1);
  const p2=[];
  /* AL ön elemesi: 8–12 kupa yerleri; ŞL'ye sığmayan alt sıra şampiyonları
     (gerçekte ŞL ön elemesinin ilk turlarında kaybedip AL'ye düşenler); sonra
     8–17'nin bir sonraki kulüpleri ve 18–30'un kupa yerleri. */
  fill(p2,2*w2,[...cupRange(8,12).map(r=>()=>cw(r)),...cupRange(16,30).map(r=>()=>pos(r,1)),
    ...cupRange(7,12).map(r=>()=>nxt(r)),()=>nxt(6),...cupRange(13,17).map(r=>()=>cw(r)),
    ...cupRange(18,30).map(r=>()=>cw(r))]);
  /* KL — doğrudan giriş yok: AL ön eleme kaybedenleri ve KL ön eleme kazananları.
     AL'ye sığmayan 13–30 kupa galipleri önce: gerçekte KL ön elemesine giriyorlar,
     liste sırası yüzünden dışarıda kalmasınlar. */
  const w3=Math.max(0,CUP_LPN-w2);
  const p3=[];
  fill(p3,2*w3,[...cupRange(13,30).map(r=>()=>cw(r)),...cupRange(1,5).map(r=>()=>nxt(r)),()=>nxt(6),...cupRange(7,15).map(r=>()=>nxt(r)),
    ...cupRange(13,17).map(r=>()=>nxt(r)),...cupRange(16,30).map(r=>()=>nxt(r))]);
  return {d:[d1,d2,[]],p:[p1,p2,p3]};
}

/* ===== ELEME EŞLEŞMELERİ =====
   Bir eşleşme (tie): s = seri başı (ikinci maçı evinde oynar), u = diğeri,
   m = maçlar (iki ayak ya da finalde tek maç), w = kazanan, pen = penaltılarla. */
function cupTie(s,u,single){
  return {s,u,w:null,pen:0,m:single?[{h:s,a:u,hg:null,ag:null,n:1}]
    :[{h:u,a:s,hg:null,ag:null},{h:s,a:u,hg:null,ag:null}]};
}
/* Ön eleme kurası: katsayıya göre üst yarı seri başı, alt yarıyla eşleşir;
   aynı ülkeden iki kulüp karşılaşmaz (gerçek kural). */
function cupPoTies(ids){
  const L=ids.slice().sort((a,b)=>clubCoef(b)-clubCoef(a));
  const half=Math.floor(L.length/2),seeds=L.slice(0,half),uns=L.slice(half,half*2);
  for(let tr=0;tr<50;tr++){
    const u=cupShuffle(uns.slice()),out=[];let bad=false;
    for(const s of seeds){
      const k=u.findIndex(x=>cupAssocOf(x)!==cupAssocOf(s));
      if(k<0){bad=true;break;}
      out.push(cupTie(s,u.splice(k,1)[0]));
    }
    if(!bad)return out;
  }
  return seeds.map((s,i)=>cupTie(s,uns[i]));
}

/* ===== LİG AŞAMASI KURASI =====
   Gerçek kurallar: torbalar katsayıyla (ŞL sahibi 1. torbada); ŞL/AL'de 4 torba
   × 9, her takım her torbadan iki rakiple (biri iç biri dış saha) oynar; KL'de
   6 torba × 6, her torbadan bir rakip, 3 iç 3 dış. Aynı ülkeden rakip yok, bir
   ülkeden en fazla iki rakip. Sonra maçlar maç günlerine dağıtılıyor: her takım
   her maç gününde tam bir maç — oyuncu aynı hafta iki kupa maçı oynamasın. */
/* "Bir ülkeden en fazla iki rakip" sayacı. Eşleşme KURULURKEN uygulanıyor:
   önce ilk denemede bütün torbalar bağımsız eşlenip sınır en sonda sınanıyordu
   ve İngiltere/İspanya beşer kulüple gelince 300 kuranın 300'ü de sınırı aştı. */
function cupCap(){
  const c=new Map();
  const key=(x,y)=>x+'|'+cupAssocOf(y);
  return {
    ok:(x,y)=>cupAssocOf(x)!==cupAssocOf(y)&&(c.get(key(x,y))||0)<2&&(c.get(key(y,x))||0)<2,
    add:(x,y,d)=>{c.set(key(x,y),(c.get(key(x,y))||0)+d);c.set(key(y,x),(c.get(key(y,x))||0)+d);}
  };
}
function cupMatch(A,B,cond,cap){
  /* A'dan B'ye rastgele bir eşleme (birebir), cond(a,b,map) sağlanarak. Geri
     izlemeli: 6–9 elemanlı torbalarda anlık. cap verilirse ülke sayacı eşleşme
     kuruldukça artar, geri alındıkça azalır. */
  const a=cupShuffle(A.slice()),map=new Map(),usedB=new Set();
  let steps=0;
  const go=i=>{
    if(i===a.length)return true;
    if(++steps>4000)return false;
    for(const b of cupShuffle(B.slice())){
      if(usedB.has(b)||!cond(a[i],b,map)||(cap&&!cap.ok(a[i],b)))continue;
      map.set(a[i],b);usedB.add(b);if(cap)cap.add(a[i],b,1);
      if(go(i+1))return true;
      map.delete(a[i]);usedB.delete(b);if(cap)cap.add(a[i],b,-1);
    }
    return false;
  };
  return go(0)?map:null;
}
function cupDiffAssoc(x,y){return cupAssocOf(x)!==cupAssocOf(y);}
function cupEdges8(P){
  const E=[],cap=cupCap();
  /* Bileşenler rastgele sırayla: hep aynı sırada kurulsa son torba çiftleri
     sistematik olarak sıkışırdı. */
  const jobs=[];
  P.forEach((pot,i)=>jobs.push(['in',i]));
  for(let i=0;i<P.length;i++)for(let j=i+1;j<P.length;j++)jobs.push(['x',i,j]);
  for(const [k,i,j] of cupShuffle(jobs)){
    if(k==='in'){
      const pot=P[i];
      /* torba içi: x, m(x)'i ağırlıyor; 2'li döngü yok ki iki rakip ayrı olsun */
      const m=cupMatch(pot,pot,(x,y,mp)=>x!==y&&mp.get(y)!==x,cap);
      if(!m)return null;
      pot.forEach(x=>E.push([x,m.get(x)]));
    } else {
      const sg=cupMatch(P[i],P[j],()=>true,cap);
      if(!sg)return null;
      /* Pj'nin her takımı Pi'den birini ağırlıyor; aynı rakip ikinci kez gelmesin */
      const tg=cupMatch(P[j],P[i],(y,x)=>sg.get(x)!==y,cap);
      if(!tg)return null;
      sg.forEach((y,x)=>E.push([x,y]));
      tg.forEach((x,y)=>E.push([y,x]));
    }
  }
  return E;
}
/* Torbayı ikişerli eşle (aynı ülke yok) — KL'de torba içi tek rakip için. */
function cupPairUp(pot){
  const pairs=[];
  const go=rest=>{
    if(!rest.length)return true;
    const x=rest[0];
    for(let i=1;i<rest.length;i++){
      const y=rest[i];if(!cupDiffAssoc(x,y))continue;
      pairs.push([x,y]);
      if(go(rest.filter((_,k)=>k!==0&&k!==i)))return true;
      pairs.pop();
    }
    return false;
  };
  return go(cupShuffle(pot.slice()))?pairs:null;
}
function cupEdges6(P){
  const U=[],cap=cupCap();
  for(const pot of P){
    const pr=cupPairUp(pot);
    if(!pr)return null;
    pr.forEach(([x,y])=>{U.push([x,y]);cap.add(x,y,1);});
  }
  for(let i=0;i<P.length;i++)for(let j=i+1;j<P.length;j++){
    const sg=cupMatch(P[i],P[j],()=>true,cap);
    if(!sg)return null;
    sg.forEach((y,x)=>U.push([x,y]));
  }
  /* Yön (kim kimi ağırlıyor) burada verilmiyor: cupInitCol6 maç günleriyle birlikte
     kuruyor ki iç/dış saha sırası kurala uysun (3 iç, 3 dış saha da oradan çıkıyor). */
  return U;
}
/* Maç günlerine boyama: her kenara bir maç günü, bir takımın iki maçı aynı güne
   düşmeden (k = takım başına maç sayısı). Kempe zinciri değişimli açgözlü boyama;
   tek döngüye takılırsa null — çağıran yeniden dener. */
function cupColor(nodes,E,k){
  const ix=new Map(nodes.map((t,i)=>[t,i])),at=nodes.map(()=>new Array(k).fill(-1)),col=new Array(E.length).fill(-1);
  const ends=e=>[ix.get(E[e][0]),ix.get(E[e][1])];
  for(const e of cupShuffle(E.map((_,i)=>i))){
    const [u,v]=ends(e);
    let c=-1;
    for(let x=0;x<k;x++)if(at[u][x]<0&&at[v][x]<0){c=x;break;}
    if(c<0){
      const a=at[u].findIndex(z=>z<0),b=at[v].findIndex(z=>z<0);
      if(a<0||b<0)return null;
      const path=[];let cur=v,want=a;
      while(at[cur][want]>=0){
        const ee=at[cur][want];path.push(ee);
        const [p,q]=ends(ee);cur=p===cur?q:p;want=want===a?b:a;
        if(path.length>E.length)return null;
      }
      if(cur===u)return null;
      path.forEach(ee=>{const [p,q]=ends(ee);at[p][col[ee]]=-1;at[q][col[ee]]=-1;});
      path.forEach(ee=>{const [p,q]=ends(ee);const nw=col[ee]===a?b:a;col[ee]=nw;at[p][nw]=ee;at[q][nw]=ee;});
      if(at[u][a]>=0||at[v][a]>=0)return null;
      c=a;
    }
    col[e]=c;at[u][c]=e;at[v][c]=e;
  }
  return col;
}
function cupDrawLp(ids,ci){
  const fmt=CUP_FMT[ci],per=ids.length/fmt.pots;
  const hold=ci===0?cupHolder(0,S.season-1):null;
  const L=ids.slice().sort((a,b)=>(b===hold)-(a===hold)||clubCoef(b)-clubCoef(a));
  /* Torbalar katsayı sırasıyla. Bir torbada tek ülkeden çok kulüp toplanırsa
     (KL'de olabiliyor: 6'lık torbada 4 kulüp aynı ülkeden) ülke koruması
     imkânsızlaşır; o zaman komşu torbalarla birkaç kulüp yer değiştiriyor ve
     kura yeniden deneniyor. Sapma küçük: kulüp en fazla bir torba kayar. */
  for(let lay=0;lay<8;lay++){
    const LL=L.slice();
    for(let s=0;s<lay*2;s++){
      const p=Math.floor(RF()*(fmt.pots-1)),i=p*per+Math.floor(RF()*per),j=(p+1)*per+Math.floor(RF()*per);
      if(LL[i]===hold||LL[j]===hold)continue;
      [LL[i],LL[j]]=[LL[j],LL[i]];
    }
    const r=cupDrawPots(LL,fmt,per,lay?60:200);
    if(r)return r;
  }
  return null;
}
function cupDrawPots(L,fmt,per,tries){
  const P=[];for(let p=0;p<fmt.pots;p++)P.push(L.slice(p*per,(p+1)*per));
  const pot={};P.forEach((pp,i)=>pp.forEach(t=>pot[t]=i));
  for(let tr=0;tr<tries;tr++){
    const E=fmt.games===8?cupEdges8(P):cupEdges6(P);
    if(!E)continue;
    /* bir ülkeden en fazla iki rakip */
    const per2={};let bad=false;
    for(const [x,y] of E){
      for(const [me,op] of [[x,y],[y,x]]){
        const key=me+'|'+cupAssocOf(op);per2[key]=(per2[key]||0)+1;
        if(per2[key]>2){bad=true;break;}
      }
      if(bad)break;
    }
    if(bad)continue;
    /* ŞL/AL: yön çevirme torba çifti içinde kalsın diye grup = torba çifti. KL'de
       torba başına iç/dış kuralı yok (yalnız toplam 3–3): tek grup. */
    const g8=fmt.games===8;
    const grp=E.map(([x,y])=>g8?Math.min(pot[x],pot[y])*10+Math.max(pot[x],pot[y]):0);
    for(let c=0;c<40;c++){
      const col=g8?cupInitCol8(L,E,pot):cupInitCol6(E,pot);
      if(!col)continue;
      if(!cupSeqFix(L,E,col,fmt.games,grp,6000))continue;
      const md=[];for(let d=0;d<fmt.games;d++)md.push([]);
      E.forEach(([h,a],e)=>md[col[e]].push({h,a,hg:null,ag:null}));
      return {t:L,pot,md};
    }
  }
  return null;
}
/* İç/dış saha sırası (UEFA md. 17.02): bir kulüp art arda en fazla iki iç ya da iki
   dış saha maçı oynar; ilk iki ve son iki maç gününde birer iç ve dış saha maçı.
   Eskiden boyama her kulübe her gün tam bir maç veriyor ama sırayı hiç gözetmiyordu:
   ölçülen kuralarda kulüplerin %70'i kuralı çiğniyordu.

   Rakipler (kura) değişmiyor. Değişen iki şey: hangi maçın hangi güne düştüğü ve
   bir YÖNLÜ DÖNGÜ boyunca kimin kimi ağırladığı. Döngüde her kulübün bir iç bir dış
   saha maçı yer değiştiriyor: kulüp başına iç/dış sayısı aynı kalıyor, ŞL/AL'de
   döngü aynı torba çifti içinde (grp) seçildiği için "her torbadan biri iç biri dış
   saha" kuralı da. Yön kuradan değil bu aramadan çıkıyor — gerçekte de iç/dış saha
   kurada, takvim kurulabilsin diye birlikte belirleniyor.

   Arama tavlamalı yerel arama, iki hamleyle:
   - Kempe takası: a ve b renkleri arasındaki dönüşümlü döngü (her kulübün her renkte
     tam bir maçı var, bileşenler çift döngü) boyunca a ile b'yi değiştirmek boyamayı
     geçerli bırakıp döngüdeki kulüplerin a ve b günlerini takas ediyor.
   - Yön çevirme: yukarıdaki yönlü döngü.
   Hamleler çoğunlukla kuralı çiğneyen bir kulüpten başlıyor. Yalnız gün sırasını
   aramak (8! dizi) yetmedi: rastgele boyamada 36 kulübün hepsine uyan sıra yok
   gibi; Kempe takası tek başına da 2–8 ihlalde takılıyordu. Bulunamazsa false —
   çağıran yeni bir başlangıçla dener. col ve E yerinde değişiyor. */
function cupSeqFix(nodes,E,col,k,grp,iters){
  const n=nodes.length,ix=new Map(nodes.map((t,i)=>[t,i]));
  const eu=E.map(e=>ix.get(e[0])),ev=E.map(e=>ix.get(e[1]));
  /* at[düğüm][gün] = kenar; ha[düğüm][gün] = 1 iç saha; out[düğüm] = ağırladığı maçlar */
  const at=[],ha=[],out=[];
  for(let i=0;i<n;i++){at.push(new Int32Array(k).fill(-1));ha.push(new Uint8Array(k));out.push([]);}
  col.forEach((c,e)=>{at[eu[e]][c]=e;at[ev[e]][c]=e;ha[eu[e]][c]=1;out[eu[e]].push(e);});
  const cost=i=>{
    const s=ha[i];let x=(s[0]===s[1]?1:0)+(s[k-2]===s[k-1]?1:0);
    for(let d=0;d+2<k;d++)if(s[d]===s[d+1]&&s[d]===s[d+2])x++;
    return x;
  };
  const cs=new Int32Array(n);let tot=0;
  for(let i=0;i<n;i++){cs[i]=cost(i);tot+=cs[i];}
  const badNode=()=>{const b=[];for(let i=0;i<n;i++)if(cs[i])b.push(i);return b[Math.floor(RF()*b.length)];};
  const take=(nd,nw,T)=>nw<=nd||RF()<Math.exp((nd-nw)/T);
  for(let it=0;it<iters&&tot>0;it++){
    const T=1-it/iters+0.05,focus=RF()<0.8;
    if(RF()<0.5){
      /* yön çevirme: bir maçtan başla, aynı gruptaki ağırladığı maçlarla ilerle */
      let e0;
      if(focus){const v=badNode();const oe=[];for(let c=0;c<k;c++)oe.push(at[v][c]);e0=oe[Math.floor(RF()*k)];}
      else e0=Math.floor(RF()*E.length);
      const g=grp[e0],path=[e0],seen=new Map([[eu[e0],0]]);
      let v=ev[e0],cyc=null;
      for(let st=0;st<=n;st++){
        if(seen.has(v)){cyc=path.slice(seen.get(v));break;}
        seen.set(v,path.length);
        const cand=out[v].filter(e=>grp[e]===g);
        if(!cand.length)break;
        const e=cand[Math.floor(RF()*cand.length)];path.push(e);v=ev[e];
      }
      if(!cyc)continue;
      const ns=new Set();cyc.forEach(e=>{ns.add(eu[e]);ns.add(ev[e]);});
      let nd=0,nw=0;ns.forEach(i=>nd+=cs[i]);
      cyc.forEach(e=>{ha[eu[e]][col[e]]=0;ha[ev[e]][col[e]]=1;});
      ns.forEach(i=>nw+=cost(i));
      if(take(nd,nw,T)){
        cyc.forEach(e=>{const u=eu[e];out[u].splice(out[u].indexOf(e),1);eu[e]=ev[e];ev[e]=u;out[eu[e]].push(e);});
        ns.forEach(i=>{const q=cost(i);tot+=q-cs[i];cs[i]=q;});
      } else cyc.forEach(e=>{ha[eu[e]][col[e]]=1;ha[ev[e]][col[e]]=0;});
      continue;
    }
    /* Kempe takası */
    const a=Math.floor(RF()*k);let b=Math.floor(RF()*(k-1));if(b>=a)b++;
    const v0=focus?badNode():Math.floor(RF()*n),cyc=[],ce=[];
    let v=v0,c=a;
    do{const e=at[v][c];cyc.push(v);ce.push(e);v=eu[e]===v?ev[e]:eu[e];c=c===a?b:a;}while(v!==v0||c!==a);
    let nd=0,nw=0;
    for(const i of cyc){nd+=cs[i];const t=ha[i][a];ha[i][a]=ha[i][b];ha[i][b]=t;nw+=cost(i);}
    if(take(nd,nw,T)){
      ce.forEach(e=>{const x=col[e]===a?b:a;col[e]=x;at[eu[e]][x]=e;at[ev[e]][x]=e;});
      for(const i of cyc){const q=cost(i);tot+=q-cs[i];cs[i]=q;}
    } else for(const i of cyc){const t=ha[i][a];ha[i][a]=ha[i][b];ha[i][b]=t;}
  }
  E.forEach((_,e)=>{E[e]=[nodes[eu[e]],nodes[ev[e]]];});
  return tot===0;
}
/* ŞL/AL için başlangıç boyaması. Bir torba çiftinin maçları yönlü bir 2-faktör ve
   döngüleri iki torba arasında gidip geldiği için ÇİFT uzunlukta: dönüşümlü iki
   güne boyanınca her kulüp o iki günde bir iç bir dış saha oynuyor. 0–1 ile 2–3
   çiftleri ilk iki güne, 0–2 ile 1–3 son iki güne — ilk/son iki gün kuralı daha
   başlangıçta sağlanmış oluyor; aramaya yalnız ortadaki dört gün kalıyor. (Torba içi
   maçlar 9'luk torbada tek uzunlukta döngü verdiği için bu yapıya giremiyor.) */
function cupInitCol8(L,E,pot){
  const key=e=>{const p=pot[E[e][0]],q=pot[E[e][1]];return p===q?'i':Math.min(p,q)+''+Math.max(p,q);};
  const col=new Array(E.length).fill(-1);
  const alt=(ks,d0)=>{
    const ed=[],nx=new Map();
    E.forEach((x,e)=>{if(ks.includes(key(e))){ed.push(e);nx.set(x[0]+'|'+key(e),e);}});
    ed.forEach(e0=>{
      if(col[e0]>=0)return;
      let e=e0,c=RF()<0.5?0:1;
      do{col[e]=d0+c;c=1-c;e=nx.get(E[e][1]+'|'+key(e));}while(e!==e0);
    });
  };
  alt(['01','23'],0);alt(['02','13'],6);
  const mid=[];E.forEach((_,e)=>{if(col[e]<0)mid.push(e);});
  const cc=cupColor(L,mid.map(e=>E[e]),4);
  if(!cc)return null;
  mid.forEach((e,j)=>col[e]=2+cc[j]);
  return col;
}
/* KL için arama gerektirmeyen boyama. Altı torbanın çiftleri K6'nın beş tam
   eşleşmesine ayrılıyor (döner devre); her biri 36 kulübün tam bir eşleşmesi = bir
   maç günü, torba içi çiftler altıncı gün. Günler ikişer ikişer (1–2, 3–4, 5–6)
   gruplanınca iki tam eşleşmenin birleşimi çift döngüler veriyor ve döngü boyunca
   dolaşma yönünde ağırlatmak her kulübe her ikilide bir iç bir dış saha veriyor:
   üç iç üç dış, art arda üçüncü maç yok, ilk ve son iki gün kuralı kendiliğinden.
   Eski Euler yönlendirmesi burada yerini bu yöne bırakıyor. E yerinde değişiyor. */
function cupInitCol6(E,pot){
  const np=6,perm=cupShuffle(cupRange(0,np-1));
  const rnd=new Map();
  for(let r=0;r<np-1;r++){
    const pr=[[np-1,r]];
    for(let i=1;i<np/2;i++)pr.push([(r+i)%(np-1),(r-i+np-1)%(np-1)]);
    pr.forEach(([x,y])=>{const a=perm[x],b=perm[y];rnd.set(Math.min(a,b)+'-'+Math.max(a,b),r);});
  }
  const roundOf=e=>{const p=pot[E[e][0]],q=pot[E[e][1]];return p===q?np-1:rnd.get(Math.min(p,q)+'-'+Math.max(p,q));};
  const dayOf=cupShuffle(cupRange(0,np-1));
  const col=E.map((_,e)=>dayOf[roundOf(e)]);
  for(let d0=0;d0<np;d0+=2){
    /* düğüm → [d0 günündeki maç, d0+1 günündeki maç] */
    const adj=new Map();
    E.forEach((x,e)=>{if(col[e]!==d0&&col[e]!==d0+1)return;
      for(const v of x){if(!adj.has(v))adj.set(v,[-1,-1]);adj.get(v)[col[e]-d0]=e;}});
    const done=new Set();
    adj.forEach((_,v0)=>{
      if(done.has(adj.get(v0)[0]))return;
      let v=v0,side=RF()<0.5?0:1;
      for(;;){
        const e=adj.get(v)[side];if(done.has(e))break;
        done.add(e);
        const w=E[e][0]===v?E[e][1]:E[e][0];
        E[e]=[v,w];v=w;side=1-side;
      }
    });
  }
  return col;
}
/* Kura çıkmazsa (beklenmiyor; test binlerce kurada ölçüyor) oyun durmasın:
   ülke kuralı gevşetilmiş, yalnız "haftada bir maç" korunan yedek kura. */
function cupDrawLpLoose(ids,ci){
  const fmt=CUP_FMT[ci],L=cupShuffle(ids.slice());
  const n=L.length,md=[];
  const arr=L.slice(1);
  for(let d=0;d<fmt.games;d++){
    const round=[],line=[L[0],...arr];
    for(let i=0;i<n/2;i++){const h=line[i],a=line[n-1-i];round.push(d%2?{h:a,a:h,hg:null,ag:null}:{h,a,hg:null,ag:null});}
    md.push(round);arr.unshift(arr.pop());
  }
  const pot={};L.forEach((t,i)=>pot[t]=Math.floor(i/(n/fmt.pots)));
  return {t:L,pot,md};
}

/* ===== LİG AŞAMASI TABLOSU =====
   UEFA'nın eşitlik kriterleri, sırasıyla (2026/27 yönetmeliği md. 18): puan, averaj,
   atılan gol, deplasmanda atılan gol, galibiyet, deplasman galibiyeti, sonra lig
   aşaması RAKİPLERİNİN toplam puanı, toplam averajı ve toplam golü. Disiplin puanı
   oyunda kart olmadığı için yok; en son kulüp katsayısı. Deplasman galibiyeti ve
   rakip kriterleri eksikken 24./25. sıra çizgisini katsayı belirliyordu.
   Saklanmıyor, oynanmış maçlardan türetiliyor — lig tablosu gibi. Aşama sürerken
   rakip kriterleri o ana kadar oynanmış rakipler üzerinden. */
function cupLpTable(cp){
  const R={};
  (cp.lp.t||[]).forEach(id=>R[id]={id,pl:0,w:0,d:0,l:0,gf:0,ga:0,agf:0,aw:0,pts:0,op:[],opts:0,ogd:0,ogf:0});
  cp.lp.md.forEach(day=>day.forEach(m=>{
    if(m.hg===null)return;
    const h=R[m.h],a=R[m.a];if(!h||!a)return;
    h.pl++;a.pl++;h.gf+=m.hg;h.ga+=m.ag;a.gf+=m.ag;a.ga+=m.hg;a.agf+=m.ag;
    h.op.push(m.a);a.op.push(m.h);
    if(m.hg>m.ag){h.w++;a.l++;h.pts+=3;}else if(m.hg<m.ag){a.w++;a.aw++;h.l++;a.pts+=3;}else{h.d++;a.d++;h.pts++;a.pts++;}
  }));
  const rows=Object.values(R);
  rows.forEach(r=>r.op.forEach(o=>{const q=R[o];r.opts+=q.pts;r.ogd+=q.gf-q.ga;r.ogf+=q.gf;}));
  return rows.sort((x,y)=>y.pts-x.pts||(y.gf-y.ga)-(x.gf-x.ga)||y.gf-x.gf||y.agf-x.agf||y.w-x.w||y.aw-x.aw
    ||y.opts-x.opts||y.ogd-x.ogd||y.ogf-x.ogf||clubCoef(y.id)-clubCoef(x.id));
}

/* ===== MAÇ =====
   Ayaklar lig skor modeliyle (beraberlik var, ev avantajı var); final tarafsız
   sahada. Oyuncu tarafı her yarışmada aynı motor: playFixture (sim.js). */
function cupScore(h,a,neutral){return goalPair(teamStr(h),teamStr(a),neutral);}
/* Güçten skor: kupa ayakları ve milli maçlar (nations.js) aynı modeli kullanıyor. */
/* neutral 'h': turnuvada ev sahibi — kulüp maçının tam saha avantajı (1.45/1.15)
   her maçta uygulanınca ev sahibi neredeyse her turnuvayı kazanıyordu. */
function goalPair(sh,sa,neutral){
  const hf=neutral==='h'?1.36:neutral?1.3:1.45,af=neutral==='h'?1.24:neutral?1.3:1.15;
  return [poisson(clamp(hf*Math.pow(sh/sa,2.4),0.3,4.2)),poisson(clamp(af*Math.pow(sa/sh,2.4),0.3,4.2))];
}
function cupPlay(m,ci,cp,neutral){
  const [g1,g2]=cupScore(m.h,m.a,neutral);
  m.hg=g1;m.ag=g2;
  const gm=playFixture(m,ci);
  /* Kupanın kendi gol defteri {pid: gol} — oyuncunun p.cs'i bütün kupaları topluyor */
  for(const id in gm)(cp.sc=cp.sc||{})[id]=(cp.sc[id]||0)+gm[id];
}
/* Toplam skor eşitse uzatma ve penaltılar: sonuç zarla, güçlü tarafa hafif eğik. */
function cupTieEnd(t){
  const gf=x=>t.m.reduce((s,m)=>s+(m.h===x?m.hg:m.ag),0);
  const a=gf(t.s),b=gf(t.u);
  if(a!==b){t.w=a>b?t.s:t.u;return;}
  t.pen=1;
  const p=clamp(0.5+(teamStr(t.s)-teamStr(t.u))*0.01,0.35,0.65);
  t.w=RF()<p?t.s:t.u;
}
function cupLoser(t){return t.w===t.s?t.u:t.s;}
function cupLeg(ties,k,ci,cp){
  if(!ties||!ties.length)return;
  ties.forEach(t=>{if(t.m[k]&&t.m[k].hg===null)cupPlay(t.m[k],ci,cp,false);});
  if(k===ties[0].m.length-1)ties.forEach(t=>{if(t.w===null)cupTieEnd(t);});
}
function cupChampion(cp,ci,tid){
  const champ=S.teams[tid];
  const cupN=tx(CUPS[ci].n);
  pushNews('cupWin',{c:champ.n,tid:champ.id,cup:cupN,ci},'good');
  S.cupHist=S.cupHist||{};
  (S.cupHist[cp.c]=S.cupHist[cp.c]||[]).push({se:S.season,tid:champ.id});
  if(S.cupHist[cp.c].length>20)S.cupHist[cp.c].shift();
  if(S.clients.some(id=>byId(id).team===champ.id))repEvent(1.5);
}

/* ===== KURULUM (sezon sonunda ve yeni oyunda) ===== */
function seedCups(){
  const al=cupAllocate();
  S.cups=CUPS.map((cp,ci)=>({v:2,c:cp.c,st:'po',d:al.d[ci],po:cupPoTies(al.p[ci]),lp:null,ko:null,sc:{}}));
}
/* Ön elemeler bitince: kazananlar ve düşenler lig aşamasına, sonra kuralar.
   ŞL ön eleme kaybedenleri AL'ye, AL ön eleme kaybedenleri KL'ye. */
function cupAfterPo(){
  const C=S.cups;
  const win=cp=>cp.po.map(t=>t.w),lose=cp=>cp.po.map(cupLoser);
  const ids=[C[0].d.concat(win(C[0])),C[1].d.concat(lose(C[0]),win(C[1])),C[2].d.concat(lose(C[1]),win(C[2]))];
  C.forEach((cp,ci)=>{
    const t=ids[ci];
    cp.lp=(t.length%CUP_FMT[ci].pots===0&&t.length%2===0&&cupDrawLp(t,ci))||cupDrawLpLoose(t,ci);
    cp.st='lp';
  });
}
/* Lig aşaması bitince: sıralama dondurulur (rk), 9–24 rövanşlı play-off'a.
   Gerçek eşleşme kalıbı: 9/10–23/24, 11/12–21/22, 13/14–19/20, 15/16–17/18;
   hangi seri başının hangisiyle eşleşeceği kurayla. */
function cupLpEnd(cp){
  const tb=cupLpTable(cp);cp.rk={};tb.forEach((r,i)=>cp.rk[r.id]=i+1);
  const at=n=>tb[n-1]?tb[n-1].id:null;
  const kpo=[];
  [[9,23],[11,21],[13,19],[15,17]].forEach(([s,u],g)=>{
    const S2=cupShuffle([at(s),at(s+1)]),U2=cupShuffle([at(u),at(u+1)]);
    for(let k=0;k<2;k++)if(S2[k]!==null&&U2[k]!==null){const t=cupTie(S2[k],U2[k]);t.g=g;kpo.push(t);}
  });
  cp.ko={kpo};cp.st='ko';
}
/* Son 16: 1/2 seri başları 15–18 eşleşmesinin, 3/4 13–20'nin, 5/6 11–22'nin,
   7/8 9–24'ün kazananlarıyla. Ağaç iki yarıya bölünüyor ki 1 ile 2, 3 ile 4…
   ancak finalde karşılaşabilsin. */
function cupR16(cp){
  const tb=Object.keys(cp.rk).sort((a,b)=>cp.rk[a]-cp.rk[b]).map(Number);
  const A=[],B=[];
  [[0,3],[6,0],[4,1],[2,2]].forEach(([si,g])=>{
    const seeds=cupShuffle([tb[si],tb[si+1]]);
    const wins=cupShuffle(cp.ko.kpo.filter(t=>t.g===g).map(t=>t.w));
    const ta=cupTie(seeds[0],wins[0]),tb2=cupTie(seeds[1],wins[1]);
    ta.ps=cp.rk[seeds[0]];tb2.ps=cp.rk[seeds[1]];
    A.push(ta);B.push(tb2);
  });
  cp.ko.r16=A.concat(B);
}
/* Yol tohumu (ps): eşleşmenin ağaçtaki seri başı sırası. Son 16'da seri başının lig
   aşaması sırası, sonra turdan tura daha iyi olan yolunki. ps'siz (eski kayıt) bir
   eşleşmede seri başının kendi sırası. */
function cupPs(cp,t){return t.ps||cp.rk[t.s]||99;}
/* Sonraki tur: sıradaki ikililer. İkinci maçı evinde oynayan, sırası daha iyi olan
   YOLUN kazananı — UEFA md. 19.04: seri başını eleyen onun ağaçtaki yerini alır,
   sıralama turdan tura yeniden hesaplanmaz. Ağaç dizilişi (1/2–7/8, 5/6–3/4, sonra
   1/2 yolu–3/4 yolu) bunu "çeyrekte 1–4, yarı finalde 1–2 evinde" kuralına çeviriyor.
   Önce kalan kulüplerin kendi sırası okunuyordu: 1.'yi eleyen 17., 8.'ye deplasmanda
   rövanş oynuyordu. */
function cupNext(cp,ties,single){
  const out=[];
  for(let i=0;i<ties.length;i+=2){
    const pa=cupPs(cp,ties[i]),pb=cupPs(cp,ties[i+1]);
    const top=pa<=pb?ties[i]:ties[i+1],oth=top===ties[i]?ties[i+1]:ties[i];
    const t=cupTie(top.w,oth.w,single);t.ps=Math.min(pa,pb);
    out.push(t);
  }
  return out;
}

/* ===== HAFTALIK AKIŞ ===== */
function cupWeek(cp,ci){
  const w=S.week,W=CUP_WK;
  if(cp.st==='po'){
    if(w===W.po[0])cupLeg(cp.po,0,ci,cp);
    else if(w===W.po[1])cupLeg(cp.po,1,ci,cp);
    return;
  }
  if(cp.st==='lp'&&cp.lp){
    const k=W.lp.indexOf(w);
    if(k<0||k>=cp.lp.md.length)return;
    cp.lp.md[k].forEach(m=>{if(m.hg===null)cupPlay(m,ci,cp,false);});
    if(k===cp.lp.md.length-1)cupLpEnd(cp);
    return;
  }
  if(cp.st!=='ko'||!cp.ko)return;
  const K=cp.ko;
  [['kpo','r16'],['r16','qf'],['qf','sf'],['sf','f']].forEach(([st,nx])=>{
    const ties=K[st];if(!ties||!ties.length||K[nx])return;
    const k=W[st].indexOf(w);if(k<0)return;
    cupLeg(ties,k,ci,cp);
    if(k===1){
      if(st==='kpo')cupR16(cp);
      else if(st==='sf')K.f=cupNext(cp,ties,true)[0];
      else K[nx]=cupNext(cp,ties,false);
    }
  });
  if(w===W.f&&K.f&&K.f.w===null){
    cupPlay(K.f.m[0],ci,cp,true);
    cupTieEnd(K.f);
    cupChampion(cp,ci,K.f.w);
    cp.st='done';
  }
}
/* Eski (v1) kayıt: 16 takımlı tek maçlık eleme, sezonu bu kuralla bitirir. */
function cupLegacyWeek(cp,ci){
  const ri=cp.rounds.length-1,round=cp.rounds[ri];
  if(!round||!round.length||round[0].hg!==null)return;
  if(S.week!==CUPWKS[ri])return;
  const winners=[];
  round.forEach(m=>{
    const [g1,g2]=playKO(teamStr(m.h),teamStr(m.a));
    m.hg=g1;m.ag=g2;winners.push(g1>g2?m.h:m.a);
    const gm=playFixture(m,ci);
    for(const id in gm)(cp.sc=cp.sc||{})[id]=(cp.sc[id]||0)+gm[id];
  });
  if(winners.length>1)cp.rounds.push(consPair(winners));
  else cupChampion(cp,ci,winners[0]);
}
/* simWeekRun()'ın içinden çağrılıyor: haftanın kadro dizini (SQIDX) hazır. */
function simCups(){
  const C=S.cups||[];
  C.forEach((cp,ci)=>{if(cp.v===2)cupWeek(cp,ci);else cupLegacyWeek(cp,ci);});
  if(S.week===CUP_WK.po[1]&&C.length===3&&C.every(cp=>cp.v===2&&cp.st==='po'))cupAfterPo();
  simDomCups();
}

/* ===== OKUYUCULAR (arayüz) ===== */
/* Bu kupada yer alan bütün kulüpler — ön eleme, doğrudan giriş, lig aşaması. */
function cupTeams(cp){
  if(cp.ctry)return (cp.t||[]).slice();
  if(cp.v!==2)return (cp.rounds&&cp.rounds[0]||[]).flatMap(m=>[m.h,m.a]);
  const s=new Set(cp.d||[]);
  (cp.po||[]).forEach(t=>{s.add(t.s);s.add(t.u);});
  if(cp.lp)cp.lp.t.forEach(x=>s.add(x));
  return [...s];
}
/* "Sezon şimdi bitse" kupa dağılımı: tid → kupa indeksi. Lig tablosundaki Avrupa
   bölgeleri bunu okuyor — sabit bir "ilk altı" değil, gerçek kontenjan. Hafta
   başına bir kez hesaplanıyor. */
/* Önbellek kariyerin kendisine de bağlı (CUPPROJS): iki kayıt aynı sezon/haftadaysa
   anahtar aynı çıkıyor ve yüklenen kariyer öbürünün Avrupa bölgelerini görüyordu.
   loadSlot()/newGame() S'yi yeni bir nesneyle değiştiriyor, kimlik bunu yakalıyor. */
let CUPPROJ=null,CUPPROJK='',CUPPROJS=null;
function cupProj(){
  const key=S?(S.season+':'+(S.tw||0)+':'+S.week):'';
  if(CUPPROJ&&CUPPROJK===key&&CUPPROJS===S)return CUPPROJ;
  const al=cupAllocate(),m={};
  al.d.forEach((arr,ci)=>arr.forEach(t=>m[t]=ci));
  al.p.forEach((arr,ci)=>arr.forEach(t=>{if(m[t]===undefined)m[t]=ci;}));
  CUPPROJ=m;CUPPROJK=key;CUPPROJS=S;
  return m;
}

/* ===== ULUSAL KUPALAR =====
   Her ülkenin kendi kupası, gerçekteki gibi: o ülkenin bütün kulüpleri (üst ve
   alt lig), TEK MAÇLIK eleme, eşitlikte penaltılar, final tarafsız sahada. Tur
   sayısı kulüp sayısının bir üst ikinin kuvvetine göre; fazlalık kadar en üst
   tohum ilk turu bay geçer (gerçekte üst lig kulüpleri sonraki turlarda katılıyor).
   Her tur ayrı kurayla — gerçek kupalar da turdan tura yeniden çekiliyor. Farklı
   kademeden iki kulüp eşleşirse alt kademedeki ev sahibi; yarı final İspanya,
   İtalya, Portekiz ve Brezilya'da rövanşlı (gerçekte de öyle).
   Kuzey ve Batı Afrika ligleri tek bir federasyon değil, bölge karması: kupası yok.

   Kupa galibi gerçek kontenjandaki kupa galibi yerini alıyor (cupAllocate →
   dcSlot): galip zaten ligden yer almışsa yer ligin bir sonraki sırasına geçer.

   Haftalar Avrupa haftalarının (CUP_WK) dışında: 9, 12, 16, 20, 27, 33, final
   36. Turlar sondan alınıyor; 64'lük kupa 12. haftada başlar, 16'lık 20'de.
   Kayıt: S.dc (bu sezonun kupaları) ve S.dcHist {ülke: [{se,tid}]}. İkisi de eski
   kayıtlarda yok; o kayıtlar ilk kupalarını bir sonraki sezon başında alır. */
const DC_RW=[9,12,16,20,27,33,36];
const DC_SF2=['ES','IT','PT','BR'],DC_SF2W=30;
const DC_SKIP=['NAF','WAF'];
function dcCtrys(){
  const out=[];
  LEAGUES.forEach(l=>{if(!DC_SKIP.includes(l.ctry)&&!out.includes(l.ctry))out.push(l.ctry);});
  return out;
}
function dcName(c){return CTRYS[c]?fmtStr(t('dcFmt'),{c:tx(CTRYS[c])}):'';}
function dcTier(tid){const tm=S.teams[tid];return tm&&LEAGUES[tm.lg]?LEAGUES[tm.lg].tier:9;}
/* Turun haftaları: tek maç ya da rövanşlı yarı final için iki hafta. */
function dcWks(dc,ri){
  const w=DC_RW[Math.max(0,DC_RW.length-dc.n+ri)];
  return ri===dc.n-2&&DC_SF2.includes(dc.ctry)?[DC_SF2W,w]:[w];
}
/* Açık kura. Tek maçta s ev sahibi: alt kademe ev sahibi, aynı kademede zar.
   Rövanşlı turda ve finalde s tohumu daha iyi olan (ikinci maçı evinde oynar). */
function dcDraw(dc,ids,ri){
  const L=cupShuffle(ids.slice()),out=[];
  const single=dcWks(dc,ri).length===1,fin=ri===dc.n-1;
  for(let i=0;i+1<L.length;i+=2){
    let a=L[i],b=L[i+1];
    if(fin||!single){if((dc.rk[b]||99)<(dc.rk[a]||99))[a,b]=[b,a];}
    else if(dcTier(b)>dcTier(a))[a,b]=[b,a];
    out.push(cupTie(a,b,single));
  }
  return out;
}
/* Tohum sırası, ülke başına: kademe, sonra biten sezonun sırası (yeni oyunda takım
   sırası). Sezon sonunda düşme/çıkmadan ÖNCE alınmalı — sonra tablolar karışıyor. */
function dcSeedOrder(){
  const o={};
  dcCtrys().forEach(c=>{
    const seed=o[c]=[];
    LEAGUES.map((l,i)=>[l,i]).filter(([l])=>l.ctry===c).sort((x,y)=>x[0].tier-y[0].tier)
      .forEach(([,i])=>leagueTable(i).forEach(tm=>seed.push(tm.id)));
  });
  return o;
}
/* ord: dcSeedOrder() — sezon sonunda düşme/çıkmadan önce alınıp buraya, düşme/çıkmadan
   SONRA veriliyor. Kademeye göre kararlı sıralama yeni sezonun kademesini okuyor: düşen
   kulüp alt ligin başına, çıkan üst ligin sonuna geçiyor. Önceden kupa düşme/çıkmadan
   önce kuruluyordu ve az önce düşen kulüp üst lig kulübü sayılıp bay geçebiliyordu. */
function seedDomCups(ord){
  ord=ord||dcSeedOrder();
  S.dc=dcCtrys().map(c=>{
    const seed=(ord[c]||[]).filter(id=>S.teams[id]).sort((a,b)=>dcTier(a)-dcTier(b));
    let B=1;while(B<seed.length)B*=2;
    const nb=B-seed.length;
    const dc={ctry:c,t:seed,rk:{},by:seed.slice(0,nb),n:Math.round(Math.log2(B)),r:[],w:null,sc:{}};
    seed.forEach((id,i)=>dc.rk[id]=i+1);
    if(dc.n>0)dc.r.push(dcDraw(dc,seed.slice(nb),0));
    return dc;
  }).filter(dc=>dc.r.length);
}
function dcChampion(dc,tid){
  dc.w=tid;
  S.dcHist=S.dcHist||{};
  const h=S.dcHist[dc.ctry]=S.dcHist[dc.ctry]||[];
  h.push({se:S.season,tid});
  if(h.length>20)h.shift();
  const mine=S.clients.some(id=>(byId(id)||{}).team===tid);
  if(mine)repEvent(0.8);
  /* Otuz dört kupanın hepsi haber olsa gelen kutusu boğulur: yalnız müşterinin
     kulübü kazandıysa ya da kendi ülkenin kupasıysa. */
  if(mine||dc.ctry===homeCtry())pushNews('dcWin',{c:S.teams[tid].n,tid,ctry:dc.ctry},'good');
}
/* simCups()'tan, yani simWeekRun()'ın içinden: kadro dizini hazır. */
function simDomCups(){
  (S.dc||[]).forEach(dc=>{
    if(dc.w!==null)return;
    const ri=dc.r.length-1,ties=dc.r[ri];
    if(!ties||!ties.length)return;
    const k=dcWks(dc,ri).indexOf(S.week);if(k<0)return;
    const fin=ri===dc.n-1,id='d:'+dc.ctry;
    ties.forEach(ti=>{const m=ti.m[k];if(m&&m.hg===null)cupPlay(m,id,dc,fin);});
    if(k<ties[0].m.length-1)return;
    ties.forEach(ti=>{if(ti.w===null)cupTieEnd(ti);});
    if(fin){dcChampion(dc,ties[0].w);return;}
    dc.r.push(dcDraw(dc,ties.map(ti=>ti.w).concat(ri===0?dc.by:[]),ri+1));
  });
}
/* Bu sezonun kupa galibi — yalnız kupa bu sezon bittiyse. seedCups() sezon sonunda
   S.season artmadan çalıştığı için "bu sezonun" galibi gelecek sezonun yeri. */
function dcWinner(c){
  const h=(S.dcHist||{})[c];const x=h&&h[h.length-1];
  return x&&x.se===S.season&&S.teams[x.tid]&&LEAGUES[S.teams[x.tid].lg].ctry===c?x.tid:null;
}
