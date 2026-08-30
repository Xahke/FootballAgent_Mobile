// node build.js → dist/menajer.html (tek dosya)
const fs=require('fs');
const path=require('path');

/* Arayüz görselleri ve yazı tipleri tek dosya sürümünde data URI olarak
   gömülüyor. Normal web ve Capacitor çıktısı harici dosyaları kullanmaya devam
   ediyor — orada dosyalar zaten yanında ve service worker onları önbelleğe
   alıyor. Tek dosya sürümünün ise yanında hiçbir şey olmamalı;
   url(../assets/...) dist/menajer.html'in yanından çözülemez ve 404 verirdi. */
function dataUri(rel){
  const file=path.join(__dirname,rel);
  if(!fs.existsSync(file)){console.warn('varlık bulunamadı, gömülmedi:',rel);return null;}
  const ext=path.extname(file).slice(1).toLowerCase();
  const mime=ext==='webp'?'image/webp':ext==='png'?'image/png':ext==='jpg'||ext==='jpeg'?'image/jpeg':
    ext==='woff2'?'font/woff2':'application/octet-stream';
  return 'data:'+mime+';base64,'+fs.readFileSync(file).toString('base64');
}
/* CSS'te url(../assets/…) — stylesheet css/ içinden bir seviye yukarı bakar.
   @font-face src'leri de buradan geçiyor. */
function inlineCssAssets(css){
  return css.replace(/url\((['"]?)\.\.\/(assets\/(?:ui|fonts)\/[a-z0-9._-]+)\1\)/gi,(m,q,rel)=>{
    const d=dataUri(rel);return d?'url('+d+')':m;
  });
}
/* Markup'ta src="assets/…" — kök göreli. Menajer portresi ve rozetler buradan
   geliyor; gömülmezse tek dosya sürümünde 404 olur ve yedeğe düşerdi. */
function inlineJsAssets(js){
  return js.replace(/(["'])(assets\/(?:ui|fonts)\/[a-z0-9._-]+)\1/gi,(m,q,rel)=>{
    const d=dataUri(rel);return d?q+d+q:m;
  });
}
/* HTML çözümleyicisi <script> gövdesini ilk ham </script dizisinde bitirir;
   dizinin bir string, şablon değişmezi ya da yorum içinde olması onu
   ilgilendirmiyor. <\/script ise JS için birebir aynı şey — \/ kimlik kaçışı,
   düzenli ifadede de aynı karakter — ama HTML için artık kapanış değil.
   Bugün kaynaklarda ham </script yok, yani dönüşüm çıktıyı değiştirmiyor;
   yarın biri yazarsa sessizce yarım kalan bir paket yerine doğru gömme oluyor.
   <!-- ve --> kasten elden geçirilmiyor: js/atlas.js bunları gerçek markup
   olarak üretiyor, körlemesine kaçırmak anlamlarını bozardı. Gerçekten sorun
   çıkarırlarsa tools/check-dist.js build'i düşürüyor. */
function escapeScriptEnd(js){
  return js.replace(/<\/(script)/gi,(m,tag)=>'<\\/'+tag);
}

const css=inlineCssAssets(fs.readFileSync('css/style.css','utf8'));
const order=['js/i18n.js','js/store.js','js/saves.js','js/data.js','js/worldgeo.js','js/atlas.js','js/rivals.js','js/badges.js','js/core.js','js/sim.js','js/market.js','js/events.js','js/skills.js','js/sfx.js','js/actions.js','js/ui.js','js/main.js'];
/* \r?\n: depo Windows'ta CRLF ile checkout ediliyor. Yalnız \n arayan desen
   hiç eşleşmiyordu, yani çıktı çalışma kopyasının satır sonlarına göre
   değişiyordu — tek dosya sürümü tekrar üretilebilir olmuyordu. */
const js=inlineJsAssets(order.map(p=>fs.readFileSync(p,'utf8').replace(/'use strict';\r?\n/,'')).join('\n'));
const jsInline=escapeScriptEnd(js);
if(/<\/script/i.test(jsInline))throw new Error('gömülecek JS içinde ham </script kaldı');
/* Gömülen metin replace()'e replacement STRING olarak verilirse içindeki $&,
   $`, $', $$ ve $1 gibi diziler ikame kalıbı sayılır. Kaynakta duran tek bir
   $& (js/actions.js, askReleaseClient yorumu) eşleşmenin tamamını — yani
   index.html'in script bloğunu — paketin ortasına geri yazıyordu; oradaki açık
   yorum kapanmadan kalınca tek dosya sürümü hiç çalışmıyordu. Callback biçiminde
   böyle bir yorum yok, içerik literal giriyor. Manifest/ikon satırlarını silen
   replace gömülü içerik taşımadığı için olduğu gibi kalıyor. */
const styleBlock='<style>\n'+css+'</style>';
const scriptBlock='<script>\n'+"'use strict';\n"+jsInline+'\n</'+'script>\n</body>';
const skel=fs.readFileSync('index.html','utf8')
  /* tek dosya sürümünde yanında duracak bir manifest ya da ikon yok */
  .replace(/^[ \t]*<link rel="(manifest|icon|apple-touch-icon)"[^>]*>\r?\n/gm,'')
  .replace(/<link rel="stylesheet"[^>]*>/,()=>styleBlock)
  .replace(/<script src=[^]*?<\/body>/,()=>scriptBlock);
fs.mkdirSync('dist',{recursive:true});
fs.writeFileSync('dist/menajer.html',skel);
console.log('dist/menajer.html',Math.round(skel.length/1024)+'KB');
