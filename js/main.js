'use strict';
/* js/main.js — kayıt/yükleme ve başlatma */
/* ================= SAVE ================= */
function save(){try{localStorage.setItem('menajerSaveV8',JSON.stringify({S,PID}));}catch(e){}}
function load(){
  try{
    const d=JSON.parse(localStorage.getItem('menajerSaveV8'));
    if(d&&d.S&&d.S.players&&d.S.fx&&d.S.fx.length===LEAGUES.length){S=d.S;PID=d.PID;L=S.lang||'tr';return true;}
  }catch(e){}
  return false;
}
if(!load())newGame();
render();
