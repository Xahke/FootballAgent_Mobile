// node build.js → dist/menajer.html (tek dosya)
const fs=require('fs');
const css=fs.readFileSync('css/style.css','utf8');
const order=['js/i18n.js','js/data.js','js/core.js','js/sim.js','js/actions.js','js/ui.js','js/main.js'];
const js=order.map(p=>fs.readFileSync(p,'utf8').replace(/'use strict';\n/,'')).join('\n');
const skel=fs.readFileSync('index.html','utf8')
  .replace(/<link rel="stylesheet"[^>]*>/,'<style>\n'+css+'</style>')
  .replace(/<script src=[^]*?<\/body>/,'<script>\n'+"'use strict';\n"+js+'\n</'+'script>\n</body>');
fs.mkdirSync('dist',{recursive:true});
fs.writeFileSync('dist/menajer.html',skel);
console.log('dist/menajer.html',Math.round(skel.length/1024)+'KB');
