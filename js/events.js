'use strict';
/* js/events.js — olaylar: menajerliğin sahada olmayan tarafı.
   Yeni olay eklemek için EVENTS dizisine bir kayıt yazmak yeterli:
     id   : benzersiz kısa ad
     w    : ağırlık (büyük olan daha sık çıkar)
     need : 'client' ise bir müşteri gerekir; yoksa menajerle ilgili olaydır
     when : (c)=>bool — ek uygunluk koşulu
     ttl  : (c)=>{tr,en} başlık
     txt  : (c)=>{tr,en} gövde
     opts : [{ t:{tr,en}, eff:(c)=>({cash,rep,morale,trust,form,msg}) }]
   Sonuçlar tek bir uygulayıcıdan geçer (applyEff), böylece her olay aynı
   kaldıraçları kullanır ve denge tek yerden ayarlanır. */

const EV_CHANCE=0.16;   // uygun bir hafta içinde olay çıkma olasılığı
const EV_GAP=3;         // iki olay arasında en az bu kadar hafta

/* Olay bağlamı: seçilen müşteri (varsa) ve türetilmiş bilgiler */
function evCtx(pid){
  const p=pid!==undefined&&pid!==null?byId(pid):null;
  return {p,tm:p?teamOf(p):null,pid};
}
const EVENTS=[
/* ================= MÜŞTERİYLE İLGİLİ ================= */
{id:'rivalAgent',w:10,need:'client',
 ttl:()=>({tr:'Rakip menajer devrede',en:'A rival agent is circling'}),
 txt:c=>({tr:`Kulislerde bir isim dolaşıyor: ${c.p.n} ile başka bir menajer görüşmüş. Oyuncu sana bir şey söylemedi ama haber kulağına geldi.`,
          en:`Word is going around that another agent has been meeting ${c.p.n}. He hasn't mentioned it to you, but you've heard.`}),
 opts:[
  {t:{tr:'Doğrudan sor, açık konuş',en:'Ask him straight out'},
   eff:c=>RF()<0.55+trustOf(c.p)/300
     ?{trust:8,morale:2,msg:{tr:'Dürüstlüğün hoşuna gitti. "Sen sorana kadar söylemeye çekiniyordum." Aranız daha da sağlamlaştı.',
                             en:'He appreciated the directness. "I was hesitant to bring it up." You came out stronger.'}}
     :{trust:-7,msg:{tr:'Sorgulanmaktan hoşlanmadı. "Beni takip mi ediyorsun?" Araya soğukluk girdi.',
                     en:'He didn\'t like being questioned. "Are you keeping tabs on me?" Things cooled off.'}}},
  {t:{tr:'Sessiz kal, işini daha iyi yap',en:'Say nothing, just do better work'},
   eff:()=>({trust:3,msg:{tr:'Konuyu açmadın. Zaman kazandın ama belirsizlik sürüyor.',
                          en:'You let it lie. You bought time, but the uncertainty remains.'}})},
  {t:{tr:'Komisyonundan feda et, bağlılığını satın al',en:'Cut your commission to keep him close'},
   eff:c=>({cash:-Math.max(20,Math.round(c.p.wage*8)),trust:14,morale:4,
            msg:{tr:'Cebinden çıktı ama oyuncu bunu unutmayacak.',en:'It cost you, but he won\'t forget it.'}})}]},

{id:'playTime',w:9,need:'client',when:c=>c.p.min<600&&!isFree(c.p),
 ttl:()=>({tr:'Forma şansı meselesi',en:'A question of minutes'}),
 txt:c=>({tr:`${c.p.n} arıyor. "${c.tm.n}'de oynamıyorum. Ya bir şey yap ya da bana doğruyu söyle."`,
          en:`${c.p.n} calls. "I'm not playing at ${c.tm.n}. Either fix it or tell me the truth."`}),
 opts:[
  {t:{tr:'Söz ver: sezon sonunda taşırım',en:'Promise to move him at season\'s end'},
   eff:()=>({trust:9,morale:8,msg:{tr:'Rahatladı. Ama artık bir sözün var — tutmazsan hatırlayacak.',
                                   en:'He\'s relieved. But now you owe him — he\'ll remember if you don\'t deliver.'}})},
  {t:{tr:'Kulüple konuş, teknik ekibe git',en:'Talk to the club and the coaching staff'},
   eff:c=>({cash:-Math.max(15,Math.round(c.p.wage*3)),morale:6,trust:5,
            msg:{tr:'Bir öğle yemeği ve birkaç telefon. Antrenör "bakarız" dedi — bu da bir şey.',
                 en:'A lunch and a few calls. The coach said "we\'ll see" — that\'s something.'}})},
  {t:{tr:'Gerçeği söyle: hak etmiyor',en:'Tell him the truth: he hasn\'t earned it'},
   eff:c=>RF()<0.45+c.p.form/200
     ?{trust:-4,form:8,morale:-3,msg:{tr:'Sert oldu ama işe yaradı. Antrenmanlara asıldı.',
                                      en:'It stung, but it worked. He\'s thrown himself into training.'}}
     :{trust:-12,morale:-8,msg:{tr:'Yanlış gün, yanlış cümle. Telefonu kapattı.',
                                en:'Wrong day, wrong words. He hung up.'}}}]},

{id:'mediaStorm',w:8,need:'client',
 ttl:()=>({tr:'Basında fırtına',en:'A media storm'}),
 txt:c=>({tr:`${c.p.n} maç sonu mikrofona talihsiz bir cümle kurdu. Sabah bütün spor sayfalarında.`,
          en:`${c.p.n} said something careless to a microphone after the match. It's on every back page.`}),
 opts:[
  {t:{tr:'Onun adına özür yayınla',en:'Issue an apology on his behalf'},
   eff:()=>({rep:-1,trust:6,morale:4,msg:{tr:'Mesele kapandı. Oyuncu arkasında durduğunu gördü.',
                                          en:'It blew over. He saw you stand behind him.'}})},
  {t:{tr:'Bir iletişim ajansı tut',en:'Hire a PR firm'},
   eff:()=>({cash:-90,rep:2,morale:3,trust:3,msg:{tr:'Profesyonelce yönetildi, hatta itibarın arttı.',
                                                  en:'Handled professionally — your standing even improved.'}})},
  {t:{tr:'Kendi başının çaresine baksın',en:'Let him clean up his own mess'},
   eff:c=>RF()<0.4
     ?{trust:-3,msg:{tr:'Kendi kendine toparladı. Ama yalnız bırakıldığını fark etti.',
                     en:'He sorted it himself — and noticed he was on his own.'}}
     :{rep:-3,trust:-9,morale:-7,msg:{tr:'Daha da büyüdü. Kulüp ceza kesti, oyuncu sana kızgın.',
                                      en:'It escalated. The club fined him, and he blames you.'}}}]},

{id:'sponsor',w:8,need:'client',when:c=>c.p.r>=62,
 ttl:()=>({tr:'Sponsorluk teklifi',en:'A sponsorship offer'}),
 txt:c=>({tr:`Bir spor markası ${c.p.n} için krampon anlaşması istiyor. Rakam fena değil ama pazarlık payı var.`,
          en:`A sportswear brand wants a boot deal with ${c.p.n}. The number is decent, but there's room to push.`}),
 opts:[
  {t:{tr:'Masadaki teklifi kabul et',en:'Take the offer on the table'},
   eff:c=>({cash:Math.round(marketValue(c.p.r)*22),morale:5,trust:4,
            msg:{tr:'Temiz iş. Herkes memnun.',en:'Clean deal. Everyone happy.'}})},
  {t:{tr:'Daha fazlası için diren',en:'Push for more'},
   eff:c=>RF()<0.42+S.rep/250
     ?{cash:Math.round(marketValue(c.p.r)*45),rep:2,morale:7,trust:8,
       eff_msg:1,msg:{tr:'Blöfü tuttu. Rakam neredeyse ikiye katlandı, oyuncu sana hayran.',
                      en:'The bluff held. The figure nearly doubled — he\'s impressed.'}}
     :{trust:-6,msg:{tr:'Marka masadan kalktı. Oyuncu fırsatın kaçtığını düşünüyor.',
                     en:'The brand walked. He thinks you let it slip away.'}}},
  {t:{tr:'Reddet — markayla imajı uyuşmuyor',en:'Decline — the brand doesn\'t fit him'},
   eff:()=>({trust:7,rep:1,msg:{tr:'Uzun vadeli düşündüğünü gördü. Para gitti, itibar kaldı.',
                                en:'He saw you thinking long-term. The money went; the standing stayed.'}})}]},

{id:'family',w:7,need:'client',
 ttl:()=>({tr:'Ailevi mesele',en:'A family matter'}),
 txt:c=>({tr:`${c.p.n} gece geç saatte aradı. Memleketinde işler karışık, kafası sahada değil.`,
          en:`${c.p.n} called late at night. Something's wrong back home, and his head isn't on football.`}),
 opts:[
  {t:{tr:'Uçağa atla, yanında ol',en:'Get on a plane and be there'},
   eff:()=>({cash:-140,trust:20,morale:10,msg:{tr:'İki gün kaybettin. Karşılığında hayat boyu sürecek bir bağ kazandın.',
                                               en:'You lost two days. You gained something that lasts a career.'}})},
  {t:{tr:'Maddi destek gönder',en:'Send money to help'},
   eff:()=>({cash:-70,trust:9,morale:6,msg:{tr:'Minnettar. Ama arayan sesin yerini para tutmadı.',
                                            en:'He\'s grateful — though money didn\'t replace a voice on the phone.'}})},
  {t:{tr:'Profesyonel sınırı koru',en:'Keep it professional'},
   eff:()=>({trust:-11,morale:-9,msg:{tr:'"Anladım." Kısa bir cevap. Aranızda bir şey kırıldı.',
                                      en:'"Understood." A short reply. Something broke.'}})}]},

{id:'cutRequest',w:7,need:'client',when:c=>trustOf(c.p)<70,
 ttl:()=>({tr:'Komisyon pazarlığı',en:'He wants a better cut'}),
 txt:c=>({tr:`${c.p.n} komisyon oranını konuşmak istiyor. "Diğer menajerler daha az alıyormuş."`,
          en:`${c.p.n} wants to talk about your commission. "I hear other agents take less."`}),
 opts:[
  {t:{tr:'İndirimi kabul et',en:'Accept the cut'},
   eff:c=>({cash:-Math.max(25,Math.round(c.p.wage*10)),trust:12,
            msg:{tr:'Cebinden çıktı ama ilişki güçlendi.',en:'It cost you, but the relationship is stronger.'}})},
  {t:{tr:'Ne yaptığını anlat, oranı savun',en:'Explain your worth, hold the rate'},
   eff:c=>RF()<0.4+S.rep/200
     ?{trust:5,rep:1,msg:{tr:'Rakamları gösterdin. İkna oldu — hatta saygısı arttı.',
                          en:'You showed him the numbers. He was convinced, and respected you more for it.'}}
     :{trust:-8,msg:{tr:'İkna olmadı. "Düşüneceğim" dedi, bu iyiye işaret değil.',
                     en:'He wasn\'t convinced. "I\'ll think about it" — never a good sign.'}}},
  {t:{tr:'Ortada buluş',en:'Meet in the middle'},
   eff:c=>({cash:-Math.max(10,Math.round(c.p.wage*4)),trust:6,
            msg:{tr:'İkiniz de biraz verdiniz. Mesele kapandı.',en:'You both gave a little. It\'s settled.'}})}]},

{id:'knock',w:7,need:'client',when:c=>!isFree(c.p),
 ttl:()=>({tr:'Sakatlık şüphesi',en:'Playing through a knock'}),
 txt:c=>({tr:`${c.p.n} ağrılı. ${c.tm.n} önemli maç öncesi oynamasını istiyor, kulüp doktoru "idare eder" diyor.`,
          en:`${c.p.n} is carrying a knock. ${c.tm.n} want him for a big match and the club doctor says he'll manage.`}),
 opts:[
  {t:{tr:'Dinlenmesi için diretiyorum',en:'Insist that he rests'},
   eff:()=>({trust:8,morale:-4,form:-5,msg:{tr:'Kulüp memnun değil ama oyuncu kendini korunmuş hissetti.',
                                            en:'The club isn\'t pleased, but he felt protected.'}})},
  {t:{tr:'Karar onun, ne derse',en:'It\'s his call'},
   eff:c=>RF()<0.5
     ?{form:10,morale:8,trust:4,msg:{tr:'Oynadı ve iyi oynadı. Riski aldı, kazandı.',
                                     en:'He played, and played well. The gamble paid off.'}}
     :{form:-16,morale:-10,trust:-5,msg:{tr:'Ağrı büyüdü, formu düştü. "Beni uyarman gerekirdi."',
                                         en:'The knock worsened and his form dipped. "You should have warned me."'}}},
  {t:{tr:'Bağımsız doktora göndert',en:'Send him to an independent doctor'},
   eff:()=>({cash:-45,trust:11,morale:3,msg:{tr:'Netleşti, doğru karar verildi. Profesyonelliğin fark edildi.',
                                             en:'It cleared things up and the right call was made. Your professionalism registered.'}})}]},

/* ================= MENAJERLE İLGİLİ ================= */
{id:'taxAudit',w:6,
 ttl:()=>({tr:'Vergi incelemesi',en:'Tax inspection'}),
 txt:()=>({tr:'Ajansına inceleme açıldı. Kağıtlar duruyor ama süreç karışık ve zaman alacak.',
           en:'Your agency is under inspection. The paperwork is in order, but the process is messy and slow.'}),
 opts:[
  {t:{tr:'İyi bir mali müşavir tut',en:'Hire a proper accountant'},
   eff:()=>({cash:-120,rep:1,msg:{tr:'Temiz çıktın. Pahalıya patladı ama adın lekelenmedi.',
                                  en:'You came out clean. Expensive, but your name is intact.'}})},
  {t:{tr:'Kendin hallet',en:'Handle it yourself'},
   eff:()=>RF()<0.5
     ?{msg:{tr:'Haftalarca uğraştın ama kapandı. Kimse bir şey duymadı.',
             en:'Weeks of paperwork, but it closed. Nobody heard a thing.'}}
     :{cash:-260,rep:-3,msg:{tr:'Bir eksik belge, ceza ve dedikodu. Kötü bir dönem.',
                             en:'One missing document, a fine, and gossip. A bad stretch.'}}}]},

{id:'interview',w:6,
 ttl:()=>({tr:'Röportaj teklifi',en:'An interview request'}),
 txt:()=>({tr:'Tanınmış bir spor dergisi seninle portre röportajı yapmak istiyor.',
           en:'A well-known sports magazine wants to profile you.'}),
 opts:[
  {t:{tr:'Kabul et, açık konuş',en:'Accept and speak openly'},
   eff:()=>RF()<0.7?{rep:4,msg:{tr:'İyi geçti. Adın daha çok kapıyı açıyor artık.',en:'It went well. Your name opens more doors now.'}}
                   :{rep:-2,msg:{tr:'Bir cümlen bağlamından koparıldı. Küçük bir tatsızlık.',en:'A line was taken out of context. A minor mess.'}}},
  {t:{tr:'Ücret talep et',en:'Ask for a fee'},
   eff:()=>({cash:60,rep:-1,msg:{tr:'Ödediler ama "para canlısı" etiketini de yapıştırdılar.',
                                 en:'They paid — and quietly filed you under "money first".'}})},
  {t:{tr:'Reddet, sessiz kal',en:'Decline and stay quiet'},
   eff:()=>({msg:{tr:'Gündeme girmedin. Bazen en iyi haber, haber olmamaktır.',
                  en:'You stayed out of the news. Sometimes that is the news.'}})}]},

{id:'shadyDeal',w:6,
 ttl:()=>({tr:'Masanın altından teklif',en:'An offer under the table'}),
 txt:()=>({tr:'Bir aracı, adını bir transfere karıştırman karşılığında pay öneriyor. Kimsenin duymayacağını söylüyor.',
           en:'An intermediary offers you a cut for putting your name to a transfer. He says nobody will hear.'}),
 opts:[
  {t:{tr:'Al',en:'Take it'},
   eff:()=>RF()<0.65?{cash:340,msg:{tr:'Para geldi, kimse bir şey sormadı. Şimdilik.',en:'The money landed. Nobody asked. For now.'}}
                    :{cash:340,rep:-9,msg:{tr:'Para geldi ama biri konuştu. Çevrede adın kirlendi.',
                                           en:'The money landed — but someone talked. Your name took damage.'}}},
  {t:{tr:'Reddet',en:'Refuse'},
   eff:()=>({rep:2,msg:{tr:'Hayır dedin. Bu tür haberler de dolaşıyor.',en:'You said no. Word of that travels too.'}})}]},

{id:'youngAgent',w:5,
 ttl:()=>({tr:'Yanına biri isteniyor',en:'Someone wants to learn from you'}),
 txt:()=>({tr:'Genç bir menajer adayı yanında çalışmak istiyor. Maaş beklemiyor ama zamanını alacak.',
           en:'A young would-be agent wants to work under you. No salary expected, but he\'ll take up your time.'}),
 opts:[
  {t:{tr:'Yanına al',en:'Take him on'},
   eff:()=>({cash:-50,rep:3,msg:{tr:'Öğretmek zaman aldı ama ağın genişledi.',en:'Teaching cost you time, but your network widened.'}})},
  {t:{tr:'Şimdi sırası değil',en:'Not the right time'},
   eff:()=>({msg:{tr:'Kibarca reddettin. İşine odaklandın.',en:'You declined politely and got back to work.'}})}]}
];
/* ================= MOTOR ================= */
function evEligible(){
  const cl=S.clients.map(byId).filter(Boolean);
  return EVENTS.filter(e=>{
    if(e.need==='client'&&!cl.length)return false;
    if(!e.when)return true;
    return cl.some(p=>{try{return e.when({p,tm:teamOf(p)});}catch(x){return false;}});
  });
}
function rollEvent(){
  if(S.evOn===false)return null;
  if(!S.agent)return null;
  if((S.evNext||0)>(S.tw||0))return null;
  if(RF()>=EV_CHANCE)return null;
  const pool=evEligible();
  if(!pool.length)return null;
  let tot=pool.reduce((s,e)=>s+e.w,0),x=RF()*tot,ev=pool[pool.length-1];
  for(const e of pool){x-=e.w;if(x<=0){ev=e;break;}}
  let pid=null;
  if(ev.need==='client'){
    const cands=S.clients.map(byId).filter(p=>p&&(!ev.when||ev.when({p,tm:teamOf(p)})));
    if(!cands.length)return null;
    pid=cands[R(0,cands.length-1)].id;
  }
  S.evNext=(S.tw||0)+EV_GAP+R(0,3);
  return {id:ev.id,pid};
}
function evById(id){return EVENTS.find(e=>e.id===id);}
/* Tek uygulayıcı: bütün olaylar aynı kaldıraçlardan geçer. */
function applyEff(r,c){
  const out=[];
  if(r.cash){S.cash=Math.round((S.cash+r.cash)*10)/10;out.push({k:'cash',v:r.cash});}
  if(r.rep){S.rep=clamp(S.rep+r.rep,0,100);out.push({k:'rep',v:r.rep});}
  if(c.p){
    if(r.morale){moraleEvent(c.p,r.morale);out.push({k:'morale',v:r.morale});}
    if(r.trust){trustEvent(c.p,r.trust);out.push({k:'trust',v:r.trust});}
    if(r.form){c.p.form=stat(c.p.form+r.form,5);out.push({k:'form',v:r.form});}
  }
  return out;
}
