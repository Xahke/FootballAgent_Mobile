// node build.js → dist/menajer.html (tek dosya)
const fs=require('fs');
const path=require('path');

/* Arayüz görselleri tek dosya sürümünde data URI olarak gömülüyor. Normal web
   ve Capacitor çıktısı harici .webp dosyalarını kullanmaya devam ediyor —
   orada dosyalar zaten yanında ve service worker onları önbelleğe alıyor.
   Tek dosya sürümünün ise yanında hiçbir şey olmamalı; url(../assets/...)
   dist/menajer.html'in yanından çözülemez ve 404 verirdi. */
function dataUri(rel){
  const file=path.join(__dirname,rel);
  if(!fs.existsSync(file)){console.warn('varlık bulunamadı, gömülmedi:',rel);return null;}
  const ext=path.extname(file).slice(1).toLowerCase();
  const mime=ext==='webp'?'image/webp':ext==='png'?'image/png':ext==='jpg'||ext==='jpeg'?'image/jpeg':'application/octet-stream';
  return 'data:'+mime+';base64,'+fs.readFileSync(file).toString('base64');
}
/* CSS'te url(../assets/ui/x) — stylesheet css/ içinden bir seviye yukarı bakar. */
function inlineCssAssets(css){
  return css.replace(/url\((['"]?)\.\.\/(assets\/ui\/[a-z0-9._-]+)\1\)/gi,(m,q,rel)=>{
    const d=dataUri(rel);return d?'url('+d+')':m;
  });
}
/* Markup'ta src="assets/ui/x" — kök göreli. Menajer portresi buradan geliyor;
   gömülmezse tek dosya sürümünde 404 olur ve baş harf yedeğine düşerdi. */
function inlineJsAssets(js){
  return js.replace(/(["'])(assets\/ui\/[a-z0-9._-]+)\1/gi,(m,q,rel)=>{
    const d=dataUri(rel);return d?q+d+q:m;
  });
}

const css=inlineCssAssets(fs.readFileSync('css/style.css','utf8'));
const order=['js/i18n.js','js/store.js','js/saves.js','js/data.js','js/worldgeo.js','js/atlas.js','js/rivals.js','js/core.js','js/sim.js','js/market.js','js/events.js','js/skills.js','js/sfx.js','js/actions.js','js/ui.js','js/main.js'];
/* \r?\n: depo Windows'ta CRLF ile checkout ediliyor. Yalnız \n arayan desen
   hiç eşleşmiyordu, yani çıktı çalışma kopyasının satır sonlarına göre
   değişiyordu — tek dosya sürümü tekrar üretilebilir olmuyordu. */
const js=inlineJsAssets(order.map(p=>fs.readFileSync(p,'utf8').replace(/'use strict';\r?\n/,'')).join('\n'));
const skel=fs.readFileSync('index.html','utf8')
  /* tek dosya sürümünde yanında duracak bir manifest ya da ikon yok */
  .replace(/^[ \t]*<link rel="(manifest|icon|apple-touch-icon)"[^>]*>\r?\n/gm,'')
  .replace(/<link rel="stylesheet"[^>]*>/,'<style>\n'+css+'</style>')
  .replace(/<script src=[^]*?<\/body>/,'<script>\n'+"'use strict';\n"+js+'\n</'+'script>\n</body>');
fs.mkdirSync('dist',{recursive:true});
fs.writeFileSync('dist/menajer.html',skel);
console.log('dist/menajer.html',Math.round(skel.length/1024)+'KB');
