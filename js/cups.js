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
/* Bir önceki sezonun kupa sahibi (seedCups sezon sonunda, S.season artmadan
   çalışıyor; o yüzden "bu sezonun" şampiyonu bir sonraki sezonun sahibi). */
function cupHolder(ci){
  const h=(S.cupHist||{})[CUPS[ci].c];const x=h&&h[h.length-1];
  return x&&x.se===S.season&&S.teams[x.tid]?x.tid:null;
}

/* ===== KATILIMCI DAĞITIMI =====
   Gerçek 2026/27 kontenjan listesinin oyundaki 17 ülkeye uyarlanmış hâli. Sıra
   önemli: önce ŞL doğrudan girişleri, sonra ŞL ön elemesi, sonra AL, sonra KL.
   Bir kulüp yalnız bir yere girer (used). "nxt" = o ülkenin henüz yer almamış
   en iyi kulübü — gerçekte kupa galibinin ya da zaten yer almış kulübün boşalttığı
   yerin "bir sonraki sıraya" geçmesi böyle işliyor (oyunda yerel kupa yok, kupa
   galibi yeri de bu yolla ligin bir sonraki sırasına gidiyor).
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
  cupRange(1,5).forEach(r=>{add(d2,nxt(r));add(d2,nxt(r));});
  cupRange(6,7).forEach(r=>add(d2,nxt(r)));
  const w2=Math.max(0,CUP_LPN-d2.length-w1);
  const p2=[];
  /* AL ön elemesi: 8–12 kupa yerleri; ŞL'ye sığmayan alt sıra şampiyonları
     (gerçekte ŞL ön elemesinin ilk turlarında kaybedip AL'ye düşenler); sonra
     8–17'nin bir sonraki kulüpleri ve 18–30'un kupa yerleri. */
  fill(p2,2*w2,[...cupRange(8,12).map(r=>()=>nxt(r)),...cupRange(16,30).map(r=>()=>pos(r,1)),
    ...cupRange(7,12).map(r=>()=>nxt(r)),()=>nxt(6),...cupRange(13,17).map(r=>()=>nxt(r)),
    ...cupRange(18,30).map(r=>()=>nxt(r))]);
  /* KL — doğrudan giriş yok: AL ön eleme kaybedenleri ve KL ön eleme kazananları. */
  const w3=Math.max(0,CUP_LPN-w2);
  const p3=[];
  fill(p3,2*w3,[...cupRange(1,5).map(r=>()=>nxt(r)),()=>nxt(6),...cupRange(7,15).map(r=>()=>nxt(r)),
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
  /* Yön: Euler devresi boyunca her kenarı geçiş yönünde ver — derecesi 6 olan
     her düğüm 3 kez girer 3 kez çıkar: 3 iç saha, 3 dış saha. */
  const adj=new Map();U.forEach(([x,y],k)=>{(adj.get(x)||adj.set(x,[]).get(x)).push(k);(adj.get(y)||adj.set(y,[]).get(y)).push(k);});
  const usedE=new Array(U.length).fill(false),E=[];
  for(const start of adj.keys()){
    const st=[start];
    while(st.length){
      const v=st[st.length-1],l=adj.get(v);
      while(l.length&&usedE[l[l.length-1]])l.pop();
      if(!l.length){st.pop();continue;}
      const k=l.pop();usedE[k]=true;
      const [x,y]=U[k],w=x===v?y:x;
      E.push([v,w]);st.push(w);
    }
  }
  return E;
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
  const hold=ci===0?cupHolder(0):null;
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
    for(let c=0;c<40;c++){
      const col=cupColor(L,E,fmt.games);
      if(!col)continue;
      const md=[];for(let d=0;d<fmt.games;d++)md.push([]);
      E.forEach(([h,a],e)=>md[col[e]].push({h,a,hg:null,ag:null}));
      return {t:L,pot,md};
    }
  }
  return null;
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
   Puan, averaj, atılan gol, deplasmanda atılan gol, galibiyet; sonra katsayı.
   Saklanmıyor, oynanmış maçlardan türetiliyor — lig tablosu gibi. */
function cupLpTable(cp){
  const R={};
  (cp.lp.t||[]).forEach(id=>R[id]={id,pl:0,w:0,d:0,l:0,gf:0,ga:0,agf:0,pts:0});
  cp.lp.md.forEach(day=>day.forEach(m=>{
    if(m.hg===null)return;
    const h=R[m.h],a=R[m.a];if(!h||!a)return;
    h.pl++;a.pl++;h.gf+=m.hg;h.ga+=m.ag;a.gf+=m.ag;a.ga+=m.hg;a.agf+=m.ag;
    if(m.hg>m.ag){h.w++;a.l++;h.pts+=3;}else if(m.hg<m.ag){a.w++;h.l++;a.pts+=3;}else{h.d++;a.d++;h.pts++;a.pts++;}
  }));
  return Object.values(R).sort((x,y)=>y.pts-x.pts||(y.gf-y.ga)-(x.gf-x.ga)||y.gf-x.gf||y.agf-x.agf||y.w-x.w||clubCoef(y.id)-clubCoef(x.id));
}

/* ===== MAÇ =====
   Ayaklar lig skor modeliyle (beraberlik var, ev avantajı var); final tarafsız
   sahada. Oyuncu tarafı her yarışmada aynı motor: playFixture (sim.js). */
function cupScore(h,a,neutral){
  const sh=teamStr(h),sa=teamStr(a),hf=neutral?1.3:1.45,af=neutral?1.3:1.15;
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
    A.push(cupTie(seeds[0],wins[0]));B.push(cupTie(seeds[1],wins[1]));
  });
  cp.ko.r16=A.concat(B);
}
/* Sonraki tur: sıradaki ikililer; lig aşamasında daha iyi bitiren seri başı. */
function cupNext(cp,ties,single){
  const out=[];
  for(let i=0;i<ties.length;i+=2){
    const a=ties[i].w,b=ties[i+1].w;
    const s=(cp.rk[a]||99)<=(cp.rk[b]||99)?a:b,u=s===a?b:a;
    out.push(cupTie(s,u,single));
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
}

/* ===== OKUYUCULAR (arayüz) ===== */
/* Bu kupada yer alan bütün kulüpler — ön eleme, doğrudan giriş, lig aşaması. */
function cupTeams(cp){
  if(cp.v!==2)return (cp.rounds&&cp.rounds[0]||[]).flatMap(m=>[m.h,m.a]);
  const s=new Set(cp.d||[]);
  (cp.po||[]).forEach(t=>{s.add(t.s);s.add(t.u);});
  if(cp.lp)cp.lp.t.forEach(x=>s.add(x));
  return [...s];
}
/* "Sezon şimdi bitse" kupa dağılımı: tid → kupa indeksi. Lig tablosundaki Avrupa
   bölgeleri bunu okuyor — sabit bir "ilk altı" değil, gerçek kontenjan. Hafta
   başına bir kez hesaplanıyor. */
let CUPPROJ=null,CUPPROJK='';
function cupProj(){
  const key=S?(S.season+':'+(S.tw||0)+':'+S.week):'';
  if(CUPPROJ&&CUPPROJK===key)return CUPPROJ;
  const al=cupAllocate(),m={};
  al.d.forEach((arr,ci)=>arr.forEach(t=>m[t]=ci));
  al.p.forEach((arr,ci)=>arr.forEach(t=>{if(m[t]===undefined)m[t]=ci;}));
  CUPPROJ=m;CUPPROJK=key;
  return m;
}
