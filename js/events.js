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

const EV_CHANCE=0.40;   // uygun bir hafta içinde olay çıkma olasılığı
const EV_GAP=1;         // iki olay arasında en az bu kadar hafta
/* Büyük bir karardan sonra üst üste bir büyük daha gelmesin: art arda çıkan olay
   küçük olanlardan seçilir. Böylece sıklık artarken oyun kriz yağmuruna dönmüyor. */
const EV_BIGGAP=5;      // iki büyük olay arasında en az bu kadar hafta

/* Olay bağlamı: seçilen müşteri (varsa) ve türetilmiş bilgiler */
function evCtx(pid){
  const p=pid!==undefined&&pid!==null?byId(pid):null;
  return {p,tm:p?teamOf(p):null,pid};
}
/* Olay metinlerinde geçen rakip ajans adı. Rakipler kurulmamışsa (çok eski kayıt)
   eski isimsiz metne düşer — olay yine de anlamlıdır. */
function evRivalName(c){
  const rs=(S&&S.rivals)||[];
  if(!rs.length)return L==='tr'?'başka bir menajer':'another agent';
  /* Aynı olayın metni ve seçenekleri aynı ajansı görsün: oyuncunun id'sinden
     türetilen sabit bir seçim, hafta içinde değişmez. */
  const r=rs[((c&&c.p?c.p.id:0)+(S.tw||0))%rs.length];
  return rivalName(r);
}
const EVENTS=[
/* ================= MÜŞTERİYLE İLGİLİ ================= */
/* Ayartma artık rakip ajanslar üzerinden kendi kanalında da işliyor (bkz. rivals.js).
   Bu olay o kanalın hafif hali: kaybetme riski yok, yalnızca ilişkiyi yokluyor.
   İkisi aynı anda taşmasın diye ağırlığı düşük tutuluyor. */
{id:'rivalAgent',w:6,need:'client',
 ttl:()=>({tr:'Rakip menajer devrede',en:'A rival agent is circling'}),
 txt:c=>{const a=evRivalName(c);
   return {tr:`Kulislerde bir isim dolaşıyor: ${c.p.n} ile ${a} görüşmüş. Oyuncu sana bir şey söylemedi ama haber kulağına geldi.`,
           en:`Word is going around that ${a} has been meeting ${c.p.n}. He hasn't mentioned it to you, but you've heard.`};},
 opts:[
  {t:{tr:'Doğrudan sor, açık konuş',en:'Ask him straight out'},
   eff:c=>RF()<0.55+trustOf(c.p)/300
     ?{trust:8,morale:2,msg:{tr:'Dürüstlüğün hoşuna gitti. "Sen sorana kadar söylemeye çekiniyordum." Aranız daha da sağlamlaştı.',
                             en:'He appreciated the directness. "I was hesitant to bring it up." You came out stronger.'}}
     :{trust:-7,msg:{tr:'Sorgulanmaktan hoşlanmadı. "Beni takip mi ediyorsun?" Araya soğukluk girdi.',
                     en:'He didn\'t like being questioned. "Are you keeping tabs on me?" Things cooled off.'}}},
  {t:{tr:'Sessiz kal, işini daha iyi yap',en:'Say nothing, just do better work'},
   eff:()=>RF()<0.6
     ?{msg:{tr:'Konuyu açmadın. Şimdilik bir şey değişmedi.',en:'You let it lie. Nothing changed — for now.'}}
     :{trust:-5,msg:{tr:'Sessizliğini kayıtsızlık saydı. Rakip menajerle bir kez daha görüşmüş.',
                     en:'He read your silence as indifference — and met the other agent again.'}}},
  {t:{tr:'Komisyonundan feda et, bağlılığını satın al',en:'Cut your commission to keep him close'},
   eff:c=>({cash:-Math.max(20,Math.round(c.p.wage*8)),trust:14,morale:4,
            msg:{tr:'Cebinden çıktı ama oyuncu bunu unutmayacak.',en:'It cost you, but he won\'t forget it.'}})}]},

{id:'playTime',w:9,need:'client',when:c=>c.p.min<600&&!isFree(c.p),
 ttl:()=>({tr:'Forma şansı meselesi',en:'A question of minutes'}),
 txt:c=>({tr:`${c.p.n} arıyor. "${c.tm.n}'de oynamıyorum. Ya bir şey yap ya da bana doğruyu söyle."`,
          en:`${c.p.n} calls. "I'm not playing at ${c.tm.n}. Either fix it or tell me the truth."`}),
 opts:[
  {t:{tr:'Söz ver: sezon sonunda taşırım',en:'Promise to move him at season\'s end'},
   eff:()=>({trust:5,morale:5,msg:{tr:'Rahatladı. Ama artık bir sözün var — sezon sonunda taşımazsan bunu hatırlayacak.',
                                   en:'He\'s relieved. But now you owe him — if he isn\'t moved by season\'s end, he\'ll remember.'}})},
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
   eff:c=>({cash:Math.round(valueOf(c.p)*10),morale:4,trust:3,
            msg:{tr:'Temiz iş. Herkes memnun.',en:'Clean deal. Everyone happy.'}})},
  {t:{tr:'Daha fazlası için diren',en:'Push for more'},
   eff:c=>RF()<0.34+S.rep/300
     ?{cash:Math.round(valueOf(c.p)*19),rep:1,morale:6,trust:6,
       eff_msg:1,msg:{tr:'Blöfü tuttu. Rakam neredeyse ikiye katlandı, oyuncu sana hayran.',
                      en:'The bluff held. The figure nearly doubled — he\'s impressed.'}}
     :{trust:-9,morale:-4,msg:{tr:'Marka masadan kalktı. Oyuncu fırsatın kaçtığını düşünüyor.',
                     en:'The brand walked. He thinks you let it slip away.'}}},
  {t:{tr:'Reddet — markayla imajı uyuşmuyor',en:'Decline — the brand doesn\'t fit him'},
   eff:()=>({trust:4,msg:{tr:'Uzun vadeli düşündüğünü gördü. Para gitti, itibar kaldı.',
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

/* ----- küçük olaylar: sık çıkar, kariyeri tek başına değiştirmez ----- */
{id:'shirtNumber',w:10,sz:'s',need:'client',when:c=>!isFree(c.p),
 ttl:()=>({tr:'Forma numarası',en:'The shirt number'}),
 txt:c=>({tr:`${c.p.n} istediği numarayı istiyor ama forma başkasının sırtında. O oyuncu "boşaltırım, ama bedeli var" diyor.`,
          en:`${c.p.n} wants his number, but it's on someone else's back. That player says he'll give it up — for a price.`}),
 opts:[
  {t:{tr:'Parayı sen öde',en:'Pay for it yourself'},
   eff:c=>({cash:-Math.max(12,Math.round(c.p.wage*3)),trust:6,morale:4,
            msg:{tr:'Küçük bir jest, büyük bir memnuniyet. Numara sırtında.',en:'A small gesture, a large amount of goodwill. He has the number.'}})},
  {t:{tr:'Kulüp halletsin',en:'Let the club sort it'},
   eff:()=>RF()<0.5?{trust:3,morale:3,msg:{tr:'Kulüp araya girdi, mesele tatlıya bağlandı.',en:'The club stepped in and smoothed it over.'}}
                   :{morale:-3,msg:{tr:'Kulüp karışmak istemedi. Numara sahibinde kaldı.',en:'The club wouldn\'t get involved. The number stayed where it was.'}}},
  {t:{tr:'Bu sezon idare etsin',en:'He can live with it'},
   eff:()=>({morale:-4,msg:{tr:'"Tamam." Küçük bir şey ama aklında kaldı.',en:'"Fine." A small thing, but it stuck with him.'}})}]},

{id:'socialLike',w:10,sz:'s',need:'client',when:c=>!isFree(c.p),
 ttl:()=>({tr:'Sosyal medyada bir beğeni',en:'A like on the wrong post'}),
 txt:c=>({tr:`${c.p.n} rakip kulübün paylaşımını beğenmiş. Ekran görüntüsü çoktan dolaşımda.`,
          en:`${c.p.n} liked a rival club's post. The screenshot is already going around.`}),
 opts:[
  {t:{tr:'Hesabını profesyonele devret',en:'Put a professional on his account'},
   eff:()=>({cash:-25,trust:3,msg:{tr:'Bundan sonra ne paylaşacağını bilen biri var.',en:'Someone who knows what to post is handling it now.'}})},
  {t:{tr:'Kendisi açıklasın',en:'Let him explain'},
   eff:()=>RF()<0.5?{morale:2,msg:{tr:'İki cümlelik bir açıklama yetti.',en:'Two sentences and it was over.'}}
                   :{rep:-1,morale:-5,msg:{tr:'Açıklama beğeniden daha çok konuşuldu.',en:'The explanation got more attention than the like.'}}},
  {t:{tr:'Görmezden gel',en:'Ignore it'},
   eff:()=>({morale:-3,msg:{tr:'Birkaç gün üstüne gittiler. Hoş değildi.',en:'They went at him for a few days. Not pleasant.'}})}]},

{id:'barber',w:9,sz:'s',need:'client',when:c=>!isFree(c.p),
 ttl:()=>({tr:'Maç sabahı berber',en:'A haircut on matchday'}),
 txt:c=>({tr:`${c.p.n} maç sabahı saç kestirmek için şehir dışına çıkmış ve antrenmana geç kalmış. ${c.tm.n} hiç memnun değil.`,
          en:`${c.p.n} drove out of town for a haircut on the morning of the match and turned up late. ${c.tm.n} are not amused.`}),
 opts:[
  {t:{tr:'Kulübe sen izah et',en:'Explain it to the club yourself'},
   eff:()=>({rep:-1,trust:7,msg:{tr:'Suçu üstlendin. Oyuncu bunu gördü.',en:'You took the blame. He noticed.'}})},
  {t:{tr:'Cezasını çeksin',en:'Let him take the fine'},
   eff:()=>({trust:-4,form:6,morale:-3,msg:{tr:'Kesinti canını yaktı. Ertesi hafta antrenmanda ilk gelen oydu.',
                                            en:'The fine stung. He was first in to training the next week.'}})},
  {t:{tr:'Şakaya vur',en:'Laugh it off'},
   eff:()=>RF()<0.7?{morale:5,trust:3,msg:{tr:'Gülüp geçtiniz. Soyunma odası da öyle.',en:'You both laughed. So did the dressing room.'}}
                   :{rep:-2,morale:-2,msg:{tr:'Espriyi kulüp komik bulmadı. Ciddiyetsiz göründün.',en:'The club didn\'t find it funny. You looked unserious.'}}}]},

{id:'gameRating',w:9,sz:'s',need:'client',when:c=>c.p.r>=60,
 ttl:()=>({tr:'Reytingi beğenmedi',en:'He doesn\'t like his rating'}),
 txt:c=>({tr:`${c.p.n} bir futbol oyununda çıkan puanını beğenmemiş. Telefonda sesi gerçekten kırgın.`,
          en:`${c.p.n} has seen his rating in a football video game and he's genuinely hurt by it.`}),
 opts:[
  {t:{tr:'Yapımcıyla konuş',en:'Call the publisher'},
   eff:()=>({cash:-20,morale:6,msg:{tr:'Bir sonraki güncellemede bakılacakmış. Çocuk gibi sevindi.',
                                    en:'They\'ll look at it in the next update. He lit up like a kid.'}})},
  {t:{tr:'Sahada cevap versin',en:'Tell him to answer on the pitch'},
   eff:()=>({form:7,morale:-4,msg:{tr:'Somurttu ama antrenmanda bir şey değişti.',en:'He sulked — and something changed in training.'}})},
  {t:{tr:'Ciddiye alma',en:'Don\'t indulge it'},
   eff:()=>RF()<0.6?{msg:{tr:'Birkaç gün sonra kendisi de güldü.',en:'A few days later he was laughing about it himself.'}}
                   :{morale:-4,trust:-3,msg:{tr:'Küçük bir şeydi ama ciddiye alınmadığını hissetti.',en:'A small thing, but he felt brushed aside.'}}}]},

{id:'homesick',w:9,sz:'s',need:'client',
 when:c=>!isFree(c.p)&&LEAGUES[c.tm.lg]&&LEAGUES[c.tm.lg].nat!==c.p.nat,
 ttl:()=>({tr:'Yabancı bir şehirde',en:'A long way from home'}),
 txt:c=>({tr:`${c.p.n} yeni ülkeye alışamıyor. Dili yok, soyunma odasında kimseyle konuşmuyor.`,
          en:`${c.p.n} isn't settling. He has no language, and he says nothing in the dressing room.`}),
 opts:[
  {t:{tr:'Dil hocası tut',en:'Get him a language tutor'},
   eff:()=>({cash:-35,form:6,morale:6,msg:{tr:'İki ay sonra saha içinde bağırabiliyordu. Fark ediliyor.',
                                           en:'Two months later he was shouting on the pitch. It shows.'}})},
  {t:{tr:'Ailesini getirt',en:'Fly his family over'},
   eff:()=>({cash:-60,morale:12,trust:8,msg:{tr:'Evinde ışık yanıyor artık. Gerisi kendiliğinden geldi.',
                                             en:'There are lights on at home now. The rest followed.'}})},
  {t:{tr:'Kendi alışsın',en:'He\'ll adapt'},
   eff:()=>({morale:-8,form:-4,msg:{tr:'Alışamadı. Antrenmandan sonra ilk çıkan hep o.',en:'He didn\'t adapt. He\'s always first out after training.'}})}]},

{id:'preseasonWeight',w:8,sz:'s',need:'client',when:c=>!isFree(c.p),
 ttl:()=>({tr:'Ara dönüşü',en:'Back from the break'}),
 txt:c=>({tr:`${c.p.n} aradan kilolu döndü. Ölçümler kulübü memnun etmedi.`,
          en:`${c.p.n} came back from the break heavy. The measurements did not please the club.`}),
 opts:[
  {t:{tr:'Özel kondisyoner tut',en:'Hire a private fitness coach'},
   eff:()=>({cash:-40,form:10,trust:4,msg:{tr:'Üç haftada toparladı. Kimse bir daha konuşmadı.',en:'Three weeks and it was gone. Nobody mentioned it again.'}})},
  {t:{tr:'Kulübün programına bırak',en:'Leave it to the club\'s programme'},
   eff:()=>RF()<0.55?{form:5,msg:{tr:'Kulüp halletti. Yavaş ama oldu.',en:'The club handled it. Slowly, but it happened.'}}
                    :{form:-5,morale:-3,msg:{tr:'Program işe yaramadı, kadro dışı kaldığı haftalar oldu.',en:'The programme didn\'t take. He lost weeks out of the squad.'}}},
  {t:{tr:'Üstüne sert git',en:'Come down hard on him'},
   eff:()=>({trust:-5,form:12,morale:-5,msg:{tr:'Hoşuna gitmedi ama sahaya bambaşka döndü.',en:'He hated it, and came back a different player.'}})}]},

{id:'oldClubGoal',w:8,sz:'s',need:'client',when:c=>!isFree(c.p)&&(c.p.hist||[]).length>0,
 ttl:()=>({tr:'Eski takımına gol',en:'A goal against his old club'}),
 txt:c=>({tr:`${c.p.n} eski kulübüne gol attı ve ne yapacağını bilemedi. Sonrasında sana soruyor.`,
          en:`${c.p.n} scored against his old club and froze. Afterwards he asks you what he should have done.`}),
 opts:[
  {t:{tr:'Sevinme, saygı göster',en:'Don\'t celebrate — show respect'},
   eff:()=>({rep:1,msg:{tr:'Elini kaldırıp özür diledi. İki tarafın da taraftarı bunu sevdi.',
                        en:'He raised a hand and apologised. Both sets of supporters liked it.'}})},
  {t:{tr:'Coş, o senin golün',en:'Celebrate — it\'s his goal'},
   eff:()=>RF()<0.6?{morale:7,msg:{tr:'Köşe direğine koştu. Kendi taraftarı bayıldı.',en:'He ran to the corner flag. His own end loved it.'}}
                   :{morale:7,rep:-2,msg:{tr:'Kendi taraftarı bayıldı, eskiler affetmedi. Adın günlerce anıldı.',
                                          en:'His own end loved it. His old one didn\'t forget. Your name was in it for days.'}}},
  {t:{tr:'Ona bırak',en:'His call'},
   eff:()=>RF()<0.5?{morale:3,msg:{tr:'Doğru olanı kendi buldu.',en:'He found the right thing to do on his own.'}}
                   :{msg:{tr:'Ne yaptığını kendisi de bilmiyor. Kimse de umursamadı.',en:'He isn\'t sure what he did. Nobody minded either way.'}}}]},

/* ----- büyük olaylar ----- */
{id:'familyAgent',w:7,need:'client',when:c=>trustOf(c.p)<80,
 ttl:()=>({tr:'Ailede bir menajer adayı',en:'An agent in the family'}),
 txt:c=>({tr:`${c.p.n} için bir akrabası "bu işi ben de yaparım" diyormuş. Oyuncunun kulağına fısıldayıp duruyor.`,
          en:`A relative of ${c.p.n} reckons he could do your job. He keeps whispering it in the player's ear.`}),
 opts:[
  {t:{tr:'Ekibine al, öğret',en:'Bring him in and teach him'},
   eff:()=>({cash:-80,trust:16,msg:{tr:'İşin içine girince zorluğunu gördü. Artık senin tarafında.',
                                    en:'He saw how hard it is once he was inside. He\'s on your side now.'}})},
  {t:{tr:'Oyuncuyla açık konuş',en:'Talk to the player openly'},
   eff:c=>RF()<0.5+trustOf(c.p)/300
     ?{trust:12,rep:1,msg:{tr:'Ne yaptığını anlattın. Aralarına mesafe koydu.',en:'You showed him what you actually do. He put distance between them.'}}
     :{trust:-10,morale:-5,msg:{tr:'Kan bağı ağır bastı. "O benim ailem." Konuşma kötü bitti.',
                                en:'Blood won. "That\'s my family." The conversation ended badly.'}}},
  {t:{tr:'Sert çık',en:'Shut it down hard'},
   eff:()=>({trust:-16,morale:-6,msg:{tr:'Sesini yükselttin. Sözlerin geri alınmıyor.',en:'You raised your voice. Those words don\'t come back.'}})}]},

{id:'badInvestment',w:7,need:'client',when:c=>c.p.wage>=15,
 ttl:()=>({tr:'Garantili getiri',en:'A guaranteed return'}),
 txt:c=>({tr:`${c.p.n} bir "danışmana" güvenip birikiminin çoğunu bir yatırıma koymuş. Para yok.`,
          en:`${c.p.n} trusted an "adviser" and put most of his savings into an investment. The money is gone.`}),
 opts:[
  {t:{tr:'Zararı sen kapat',en:'Cover the loss yourself'},
   eff:c=>({cash:-Math.max(120,Math.round(c.p.wage*6)),trust:26,morale:12,
            msg:{tr:'Ağır bir fatura. Ama bu adam ömrünün sonuna kadar seninle.',
                 en:'A heavy bill. This man is with you for the rest of his career.'}})},
  {t:{tr:'Avukat tut, peşine düş',en:'Get a lawyer and chase it'},
   eff:c=>{const won=RF()<0.55;
     return won?{cash:Math.round(c.p.wage*4)-60,trust:12,morale:8,
                 msg:{tr:'Aylar sürdü ama paranın çoğu geri geldi.',en:'It took months, but most of it came back.'}}
               :{cash:-60,trust:4,morale:-4,
                 msg:{tr:'Adam ortadan kayboldu. Avukat parası cebinden gitti.',en:'The man vanished. The legal fees didn\'t.'}};}},
  {t:{tr:'Ders olsun',en:'Let it be a lesson'},
   eff:()=>({morale:-14,trust:-9,msg:{tr:'Haklıydın ve bunu söyledin. İhtiyacı olan şey bu değildi.',
                                      en:'You were right and you said so. That wasn\'t what he needed.'}})}]},

{id:'deadlineDay',w:7,need:'client',when:c=>!isFree(c.p)&&windowOpen(),
 ttl:()=>({tr:'Son gün, son saat',en:'Deadline day'}),
 txt:c=>({tr:`Bir kulüp ${c.p.n} için son dakikada masaya oturdu. Evrakların yetişmesine kırk dakika var ve imzalar başka şehirde.`,
          en:`A club came in for ${c.p.n} at the last minute. There are forty minutes to file the paperwork and the signatures are in another city.`}),
 opts:[
  {t:{tr:'Arabaya atla, elden yetiştir',en:'Get in the car and hand-deliver it'},
   eff:()=>RF()<0.72?{cash:-55,rep:3,morale:8,trust:8,
                      msg:{tr:'Son yedi dakika. Elin titriyordu ama oldu.',en:'Seven minutes to spare. Your hands were shaking. It went through.'}}
                    :{cash:-55,rep:-1,morale:-6,
                      msg:{tr:'Trafik. Kapı kapandığında hâlâ yoldaydın.',en:'Traffic. You were still on the road when the window shut.'}}},
  {t:{tr:'Kulübün memuruna bırak',en:'Leave it to the club\'s office'},
   eff:()=>RF()<0.45?{rep:2,morale:6,msg:{tr:'Hallettiler. Sen de rahat bir nefes aldın.',en:'They got it done. You could breathe again.'}}
                    :{morale:-8,trust:-5,msg:{tr:'Bir belge eksikti. Transfer yattı ve suçu sen aldın.',
                                              en:'One document was missing. The move died and the blame landed on you.'}}},
  {t:{tr:'Bu iş yaza kalsın',en:'It can wait until summer'},
   eff:()=>({morale:-5,trust:-3,msg:{tr:'Belki doğru karardı. Oyuncu öyle düşünmüyor.',en:'It may have been the right call. He doesn\'t think so.'}})}]},

{id:'newCoach',w:7,need:'client',when:c=>!isFree(c.p),
 ttl:()=>({tr:'Yeni teknik direktör',en:'A new manager'}),
 txt:c=>({tr:`${c.tm.n} hocasını değiştirdi. Yeni isim ${c.p.n} için "planlarımda yok" demiş.`,
          en:`${c.tm.n} have changed manager. The new one has said ${c.p.n} isn't in his plans.`}),
 opts:[
  {t:{tr:'Hocayla tanış',en:'Get in front of the manager'},
   eff:()=>RF()<0.6?{cash:-50,morale:10,form:5,msg:{tr:'Bir kahve ve yirmi dakika. Fikri değişti.',en:'A coffee and twenty minutes. He changed his mind.'}}
                   :{cash:-50,morale:-5,msg:{tr:'Kibardı ama kararlıydı. Para da boşa gitti.',en:'Polite, and immovable. The money went with it.'}}},
  {t:{tr:'Kış transferine hazırla',en:'Start lining up a January move'},
   eff:()=>({trust:9,morale:6,msg:{tr:'Bir planı olduğunu bilmek onu rahatlattı.',en:'Knowing there\'s a plan settled him.'}})},
  {t:{tr:'Bekle, gör',en:'Wait and see'},
   eff:()=>({form:-7,morale:-8,msg:{tr:'Üç ay tribünde. Kimse beklemedi, sadece unuttular.',en:'Three months in the stands. Nobody waited — they just forgot.'}})}]},

{id:'redCard',w:6,need:'client',when:c=>!isFree(c.p),
 ttl:()=>({tr:'Disiplin kurulu',en:'A disciplinary hearing'}),
 txt:c=>({tr:`${c.p.n} ağır bir kırmızı kart gördü. Kurul cezayı bu hafta görüşüyor.`,
          en:`${c.p.n} was sent off for a bad one. The panel hears the case this week.`}),
 opts:[
  {t:{tr:'İyi bir avukatla savun',en:'Defend him properly'},
   eff:()=>({cash:-95,morale:6,trust:8,msg:{tr:'Ceza yarıya indi. Arkasında durduğunu gördü.',en:'The ban was halved. He saw you stand behind him.'}})},
  {t:{tr:'Özür ve gönüllü ceza',en:'Apologise and accept it'},
   eff:()=>({rep:2,morale:-6,form:-5,msg:{tr:'Doğru olanı yaptın. Ona pahalıya patladı.',en:'You did the right thing. It cost him.'}})},
  {t:{tr:'Savaş aç',en:'Fight it publicly'},
   eff:()=>RF()<0.6?{rep:-1,morale:3,msg:{tr:'Ceza aynı kaldı ama oyuncu yalnız olmadığını hissetti.',en:'The ban stood, but he didn\'t feel alone.'}}
                   :{rep:-4,morale:-10,form:-8,msg:{tr:'Kurul kızdı, ceza uzadı. Herkes senin yüzünden olduğunu biliyor.',
                                                    en:'The panel took offence and extended it. Everyone knows why.'}}}]},

{id:'unpaidBonus',w:6,need:'client',when:c=>!isFree(c.p),
 ttl:()=>({tr:'Ödenmeyen imza parası',en:'The bonus that never came'}),
 txt:c=>({tr:`${c.tm.n} taahhüt ettiği imza bedelini aylardır geciktiriyor. ${c.p.n} sana soruyor.`,
          en:`${c.tm.n} have been sitting on the signing fee for months. ${c.p.n} is asking you about it.`}),
 opts:[
  {t:{tr:'Sessizce diren, ödet',en:'Push quietly until they pay'},
   eff:c=>RF()<0.65?{cash:Math.round(c.p.wage*8),trust:10,msg:{tr:'Gürültü çıkarmadan aldın. En iyi menajerlik böyle görünür.',
                                                               en:'You got it without a sound. That\'s what good agency looks like.'}}
                   :{trust:-4,msg:{tr:'Oyalandın ve oyalandın. Hâlâ ödenmedi.',en:'You were passed along and along. Still unpaid.'}}},
  {t:{tr:'Resmî şikâyette bulun',en:'File a formal complaint'},
   eff:c=>({cash:Math.round(c.p.wage*10),rep:-3,
            msg:{tr:'Para geldi. Bu kulüple bir daha kolay iş yapamazsın — diğerleri de duydu.',
                 en:'The money came. You won\'t deal easily with this club again — and the others heard.'}})},
  {t:{tr:'Sabır iste',en:'Ask him to be patient'},
   eff:()=>({trust:-9,morale:-4,msg:{tr:'"Sen kimin tarafındasın?" Cevabın yoktu.',en:'"Whose side are you on?" You didn\'t have an answer.'}})}]},

{id:'nationalTeam',w:6,need:'client',when:c=>c.p.age<=24,
 ttl:()=>({tr:'İki bayrak',en:'Two flags'}),
 txt:c=>({tr:`${c.p.n} iki ülkeye de oynayabiliyor ve ikisi de arıyor. Karar onun ama fikrini soruyor.`,
          en:`${c.p.n} is eligible for two countries and both have called. It's his decision, but he's asking you.`}),
 opts:[
  {t:{tr:'Güçlü olanı seç',en:'Take the bigger one'},
   eff:()=>RF()<0.45?{rep:4,morale:10,trust:6,msg:{tr:'İlk maçta oynadı. Bir anda başka bir oyuncu oldu.',
                                                   en:'He played in the first camp. Overnight he became a different player.'}}
                    :{morale:-8,form:-4,msg:{tr:'Kadroya bir daha çağrılmadı. Diğer kapı da kapandı.',
                                             en:'He was never called again. And the other door had closed.'}}},
  {t:{tr:'Doğduğu yeri seç',en:'Take the one he grew up with'},
   eff:()=>({morale:12,trust:10,msg:{tr:'Marşı söylerken ağladı. Bunu sana borçlu olduğunu biliyor.',
                                     en:'He cried during the anthem. He knows who told him to.'}})},
  {t:{tr:'Acele etmesin',en:'Tell him not to rush'},
   eff:()=>({morale:-5,trust:-4,msg:{tr:'Bekledi ve iki taraf da soğudu. Kararsızlık da bir karardır.',
                                     en:'He waited, and both went cold. Indecision is a decision.'}})}]},

{id:'documentary',w:6,need:'client',when:c=>c.p.r>=70,
 ttl:()=>({tr:'Belgesel teklifi',en:'A documentary crew'}),
 txt:c=>({tr:`Bir yapım şirketi ${c.p.n} için bir sezonluk belgesel çekmek istiyor. Kamera her yerde olacak.`,
          en:`A production company wants to follow ${c.p.n} for a season. The camera would be everywhere.`}),
 opts:[
  {t:{tr:'Kabul et',en:'Say yes'},
   eff:c=>({cash:Math.round(valueOf(c.p)*14),rep:2,form:-8,
            msg:{tr:'İyi para ve iyi tanıtım. Kamera soyunma odasına girince futbol biraz geri kaldı.',
                 en:'Good money, good exposure. With a camera in the dressing room, the football slipped a little.'}})},
  {t:{tr:'Sadece sezon sonu çeksinler',en:'Only at the end of the season'},
   eff:c=>({cash:Math.round(valueOf(c.p)*5),rep:1,
            msg:{tr:'Az para, sıfır risk. İki taraf da razı.',en:'Less money, no risk. Both sides content.'}})},
  {t:{tr:'Reddet',en:'Decline'},
   eff:()=>({trust:4,msg:{tr:'"Sen benim işimi düşünüyorsun." Aynen öyle.',en:'"You\'re thinking about my football." Exactly.'}})}]},

{id:'tpoOffer',w:6,need:'client',when:c=>!isFree(c.p)&&c.p.pot-c.p.r>=6,
 ttl:()=>({tr:'Geleceğine yatırım',en:'An investment in his future'}),
 txt:c=>({tr:`Bir fon ${c.p.n} için şimdi para veriyor. Karşılığında bir sonraki transferinden senin payın onların oluyor.`,
          en:`A fund will pay you now for ${c.p.n}. In return, your cut of his next transfer becomes theirs.`}),
 opts:[
  {t:{tr:'Kabul et',en:'Take the money'},
   /* Ödeme, bir sonraki satıştan beklenen komisyonun yaklaşık yarısı: bugünkü
      kesin para, yarınki büyük paranın yerine geçiyor. */
   eff:c=>({cash:Math.round(valueOf(c.p)*90),flag:'tpo',trust:-4,
            msg:{tr:'Para bugün cebinde. Bir dahaki satıştan sana bir kuruş yok.',
                 en:'The money is in your pocket today. His next sale pays you nothing.'}})},
  {t:{tr:'Oyuncuya sor',en:'Ask the player'},
   eff:c=>RF()<0.5
     ?{cash:Math.round(valueOf(c.p)*55),flag:'tpo',trust:8,
       msg:{tr:'Birlikte karar verdiniz, daha küçük bir rakama razı oldu. Ama sorduğunu unutmayacak.',
            en:'You decided together and settled for less. He won\'t forget that you asked.'}}
     :{trust:8,rep:1,msg:{tr:'"Benim geleceğim satılık değil." Haklıydı ve sen de sordun.',
                          en:'"My future isn\'t for sale." He was right — and you asked.'}}},
  {t:{tr:'Reddet',en:'Refuse'},
   eff:()=>({rep:2,msg:{tr:'Bu tür fonlarla çalışmayan bir isim olarak anıldın.',en:'You became known as someone who doesn\'t work with those funds.'}})}]},

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
   eff:()=>RF()<0.62?{rep:3,msg:{tr:'İyi geçti. Adın daha çok kapıyı açıyor artık.',en:'It went well. Your name opens more doors now.'}}
                   :{rep:-2,msg:{tr:'Bir cümlen bağlamından koparıldı. Küçük bir tatsızlık.',en:'A line was taken out of context. A minor mess.'}}},
  {t:{tr:'Ücret talep et',en:'Ask for a fee'},
   eff:()=>({cash:35,rep:-2,msg:{tr:'Ödediler ama "para canlısı" etiketini de yapıştırdılar.',
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
   eff:()=>RF()<0.5?{cash:170,msg:{tr:'Para geldi, kimse bir şey sormadı. Şimdilik.',en:'The money landed. Nobody asked. For now.'}}
                    :{cash:170,rep:-12,msg:{tr:'Para geldi ama biri konuştu. Çevrede adın kirlendi.',
                                           en:'The money landed — but someone talked. Your name took damage.'}}},
  {t:{tr:'Reddet',en:'Refuse'},
   eff:()=>({rep:1,msg:{tr:'Hayır dedin. Bu tür haberler de dolaşıyor.',en:'You said no. Word of that travels too.'}})}]},

{id:'agentExam',w:6,when:()=>S.rep>=12,
 ttl:()=>({tr:'Temsilci lisansı sınavı',en:'The agent licence exam'}),
 txt:()=>({tr:'Futbolcu temsilcisi lisansın yenileniyor. Federasyonun sınavına yeniden girmen gerekiyor — geçemezsen kimseyi temsil edemezsin. Tarih yakın.',
           en:'Your football agent licence is up for renewal. You have to sit the federation exam again — fail it and you can\'t represent anyone. The date is close.'}),
 opts:[
  {t:{tr:'Haftalarca çalış',en:'Study for weeks'},
   eff:()=>({rep:3,msg:{tr:'Geçtin. Haftalarca yönetmelik okudun ama kimse bir daha lisansını sormayacak.',
                        en:'You passed. Weeks of reading regulations, and nobody will ask about your licence again.'}})},
  {t:{tr:'Hazırlık kursu al',en:'Pay for a prep course'},
   eff:()=>({cash:-110,rep:2,msg:{tr:'Pahalı ama garanti. Sınavda sürpriz yoktu.',
                                  en:'Expensive but certain. No surprises in the exam.'}})},
  {t:{tr:'Şansını dene',en:'Wing it'},
   eff:()=>RF()<0.5?{rep:1,msg:{tr:'Kıl payı geçtin. Kimsenin bilmesine gerek yok.',en:'You scraped through. Nobody needs to know.'}}
                   :{rep:-5,cash:-40,msg:{tr:'Kaldın. Tekrar ücreti ve birkaç ay boyunca kulislerde espri konusu oldun.',
                                          en:'You failed. A re-sit fee, and a running joke in the corridors for months.'}}}]},

{id:'journalistTrade',w:6,
 ttl:()=>({tr:'Muhabirle takas',en:'A trade with a journalist'}),
 txt:()=>({tr:'Tanınmış bir muhabir sana kulis bilgisi öneriyor. Karşılığında senden düzenli haber bekliyor.',
           en:'A well-connected journalist offers you inside information. In return he expects stories from you.'}),
 opts:[
  {t:{tr:'Anlaş',en:'Make the trade'},
   eff:()=>RF()<0.65?{cash:60,msg:{tr:'Bilgi işe yaradı, kimse nereden geldiğini sormadı.',en:'The information paid off. Nobody asked where it came from.'}}
                    :{cash:60,rep:-6,msg:{tr:'Bir haberin kaynağı olarak adın geçti. Kulüpler artık yanında dikkatli konuşuyor.',
                                          en:'You were named as a source. Clubs choose their words around you now.'}}},
  {t:{tr:'Bilgiyi al ama haber verme',en:'Take the tip, give nothing back'},
   eff:()=>({cash:60,rep:-3,msg:{tr:'Bir kez işe yaradı. O numara bir daha açılmayacak.',
                                 en:'It worked once. That number won\'t pick up again.'}})},
  {t:{tr:'Reddet',en:'Turn him down'},
   eff:()=>({rep:1,msg:{tr:'Kapıyı kapattın. Bu tür haberler de dolaşıyor.',en:'You closed the door. Word of that travels too.'}})}]},

{id:'fanProtest',w:6,when:()=>S.rep>=12,
 ttl:()=>({tr:'Tesis önünde pankart',en:'A banner outside the training ground'}),
 txt:()=>({tr:'Yaptığın bir transfer taraftarı kızdırdı. Tesisin önünde adının geçtiği bir pankart asılı.',
           en:'One of your transfers angered the supporters. There\'s a banner outside the training ground with your name on it.'}),
 opts:[
  {t:{tr:'Açıklama yap',en:'Make a statement'},
   eff:()=>RF()<0.62?{rep:2,msg:{tr:'Sakin, net bir açıklama. Tartışma birkaç günde söndü.',en:'Calm and clear. The argument burned out in days.'}}
                    :{rep:-3,msg:{tr:'Açıklama yeni bir tartışma başlattı. Konuşmasan daha iyiydi.',en:'The statement started a new argument. Silence would have been cheaper.'}}},
  {t:{tr:'Sessiz kal',en:'Say nothing'},
   eff:()=>({rep:-1,msg:{tr:'Bir süre üstüne gittiler, sonra unuttular. Küçük bir iz kaldı.',
                         en:'They kept at it for a while, then moved on. A small mark stayed.'}})},
  {t:{tr:'Güvenlik tut',en:'Hire security'},
   eff:()=>({cash:-45,msg:{tr:'Bir süre gölge gibi peşinde biri oldu. Rahat ama pahalı.',
                           en:'Someone shadowed you for a few weeks. Comfortable, and costly.'}})}]},

{id:'agencyBuyout',w:5,when:()=>S.rep>=40,
 ttl:()=>({tr:'Satın alma teklifi',en:'A buyout offer'}),
 txt:()=>({tr:'Büyük bir ajans seni bünyesine katmak istiyor. Rakam ciddi — ama masa artık senin masan olmayacak.',
           en:'A major agency wants to absorb you. The number is serious — but the table stops being yours.'}),
 opts:[
  {t:{tr:'Sat ve onlara katıl',en:'Sell up and join them'},
   eff:()=>({cash:Math.round(600+S.rep*22),ag:{comm:-0.03},
             msg:{tr:'Para bir kerede geldi. Bundan sonra her anlaşmadan onların da payı var.',
                  en:'The money landed at once. From now on they take a slice of every deal.'}})},
  {t:{tr:'Ortak ol, bağımsız kal',en:'Partner up, stay independent'},
   eff:()=>({cash:Math.round(220+S.rep*8),ag:{cap:1,cost:0.15},
             msg:{tr:'Sermayeleri, senin adın. Daha fazla oyuncu taşıyabilirsin — ofis de büyüdü.',
                  en:'Their capital, your name. You can carry more players — and the office got bigger.'}})},
  {t:{tr:'Reddet',en:'Decline'},
   eff:()=>({rep:3,msg:{tr:'Hayır dedin ve bu duyuldu. Tek başına ayakta durabilen bir isimsin.',
                        en:'You said no, and it was noticed. You\'re a name that stands on its own.'}})}]},

{id:'officeMove',w:8,sz:'s',when:()=>S.rep>=20,
 ttl:()=>({tr:'Yeni ofis',en:'A bigger office'}),
 txt:()=>({tr:'İş büyüdü, ekip sığmıyor. Şehrin daha görünür bir yerinde bir yer tutabilirsin.',
           en:'The work has grown and the team doesn\'t fit. You could take a place somewhere more visible.'}),
 opts:[
  {t:{tr:'Taşın',en:'Move'},
   eff:()=>({cash:-130,ag:{cap:1,cost:0.25},
             msg:{tr:'Artık insanları ağırlayabileceğin bir yerin var. Kirası da öyle.',
                  en:'You have somewhere to receive people now. The rent reflects it.'}})},
  {t:{tr:'Ekip uzaktan çalışsın',en:'Let the team work remotely'},
   eff:()=>({ag:{cost:-0.10},msg:{tr:'Kimse ofise gelmiyor, kimse de şikâyet etmiyor. Gider düştü.',
                                  en:'Nobody comes in, nobody complains. Overheads dropped.'}})},
  {t:{tr:'Şimdilik burası yeter',en:'This will do for now'},
   eff:()=>({msg:{tr:'Ertelendi. Kutular hâlâ koridorda.',en:'Postponed. The boxes are still in the corridor.'}})}]},

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
function evSmall(e){return e.sz==='s';}
function evEligible(smallOnly){
  const cl=S.clients.map(byId).filter(Boolean);
  return EVENTS.filter(e=>{
    if(smallOnly&&!evSmall(e))return false;
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
  /* Son büyük olayın üstünden yeterli zaman geçmediyse bu hafta yalnızca küçükler çıkar. */
  const smallOnly=(S.evBig||0)+EV_BIGGAP>(S.tw||0);
  let pool=evEligible(smallOnly);
  if(!pool.length&&smallOnly)pool=evEligible(false);
  if(!pool.length)return null;
  let tot=pool.reduce((s,e)=>s+e.w,0),x=RF()*tot,ev=pool[pool.length-1];
  for(const e of pool){x-=e.w;if(x<=0){ev=e;break;}}
  let pid=null;
  if(ev.need==='client'){
    const cands=S.clients.map(byId).filter(p=>p&&(!ev.when||ev.when({p,tm:teamOf(p)})));
    if(!cands.length)return null;
    pid=cands[R(0,cands.length-1)].id;
  }
  S.evNext=(S.tw||0)+EV_GAP+R(0,1);
  if(!evSmall(ev))S.evBig=(S.tw||0);
  return {id:ev.id,pid};
}
function evById(id){return EVENTS.find(e=>e.id===id);}
/* Tek uygulayıcı: bütün olaylar aynı kaldıraçlardan geçer. */
function applyEff(r,c){
  const out=[];
  if(r.cash){S.cash=Math.round((S.cash+r.cash)*10)/10;out.push({k:'cash',v:r.cash});}
  if(r.rep){repEvent(r.rep);out.push({k:'rep',v:r.rep});}
  if(c.p){
    if(r.morale){moraleEvent(c.p,r.morale);out.push({k:'morale',v:r.morale});}
    if(r.trust){trustEvent(c.p,r.trust);out.push({k:'trust',v:r.trust});}
    if(r.form){c.p.form=stat(c.p.form+r.form,5);out.push({k:'form',v:r.form});}
    /* oyuncuya iliştirilen kalıcı bayrak (şimdilik: geleceği bir fona satıldı) */
    if(r.flag)c.p[r.flag]=1;
  }
  /* Ajansın kalıcı değiştiricileri: komisyon oranı, müşteri kapasitesi, gider katsayısı.
     Kalıcı oldukları için ekranda ayrıca gösterilir (bkz. evChoose). */
  if(r.ag){S.ag=S.ag||{};
    Object.keys(r.ag).forEach(k=>{S.ag[k]=+((S.ag[k]||0)+r.ag[k]).toFixed(3);out.push({k:'ag_'+k,v:r.ag[k]});});}
  return out;
}
