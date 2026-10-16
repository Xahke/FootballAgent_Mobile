'use strict';
/* js/events.js — olaylar: menajerliğin sahada olmayan tarafı.
   Yeni olay eklemek için EVENTS dizisine bir kayıt yazmak yeterli:
     id   : benzersiz kısa ad
     cat  : kategori — media | player | club | agency | finance | crisis
     w    : ağırlık (büyük olan daha sık çıkar)
     need : 'client' ise bir müşteri gerekir; yoksa menajerle ilgili olaydır
     when : (c)=>bool — ek uygunluk koşulu
     ttl  : (c)=>{tr,en} başlık
     txt  : (c)=>{tr,en} gövde
     opts : [{ t:{tr,en}, eff:(c)=>({cash,rep,morale,trust,form,msg}) }]
   Sonuçlar tek bir uygulayıcıdan geçer (applyEff), böylece her olay aynı
   kaldıraçları kullanır ve denge tek yerden ayarlanır.

   Kategori olayın kendi kaydında duruyor — ikinci bir olay-id listesi yok, aynı
   gerekçeyle IB_CAT'in keys dizileri gibi tek kaynak. Kategori yalnız sunum:
   hangi rozetin ve hangi vurgu renginin çizileceğini seçer, olasılığa,
   uygunluğa ya da sonuca hiç dokunmaz. Yeni olayın kategorisi yoksa
   evCat() 'agency'ye düşer, ama EV_CATS o eksiği yakalar. */
const EV_CATS=['media','player','club','agency','finance','crisis'];

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
  if(!rs.length)return t('anotherAgent');
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
{id:'rivalAgent',cat:'agency',w:6,need:'client',
 ttl:()=>({tr:'Rakip menajer devrede',en:'A rival agent is circling',es:'Un agente rival anda cerca',pt:'Um empresário rival está rondando',de:'Ein rivalisierender Berater kreist',fr:'Un agent rival rôde',it:'Un procuratore rivale si aggira'}),
 txt:c=>{const a=evRivalName(c);
   return {tr:`Kulislerde bir isim dolaşıyor: ${c.p.n} ile ${a} görüşmüş. Oyuncu sana bir şey söylemedi ama haber kulağına geldi.`,
           en:`Word is going around that ${a} has been meeting ${c.p.n}. He hasn't mentioned it to you, but you've heard.`,
           es:`Corre el rumor de que ${a} se ha reunido con ${c.p.n}. Él no te ha dicho nada, pero te ha llegado.`,
           pt:`Está correndo o boato de que ${a} se reuniu com ${c.p.n}. Ele não te contou nada, mas a notícia chegou até você.`,
           de:`Es geht das Gerücht um, dass ${a} sich mit ${c.p.n} getroffen hat. Er hat dir nichts davon gesagt, aber du hast es gehört.`,
           fr:`Le bruit court que ${a} a rencontré ${c.p.n}. Il ne t'en a rien dit, mais ça t'est revenu aux oreilles.`,
           it:`Gira voce che ${a} abbia incontrato ${c.p.n}. Lui non ti ha detto niente, ma la cosa ti è arrivata all'orecchio.`};},
 opts:[
  {t:{tr:'Doğrudan sor, açık konuş',en:'Ask him straight out',es:'Pregúntale directamente',pt:'Pergunte direto para ele',de:'Frag ihn geradeheraus',fr:'Lui poser la question franchement',it:'Chiediglielo senza giri di parole'},
   eff:c=>RF()<0.55+trustOf(c.p)/300
     ?{trust:8,morale:2,msg:{tr:'Dürüstlüğün hoşuna gitti. "Sen sorana kadar söylemeye çekiniyordum." Aranız daha da sağlamlaştı.',
                             en:'He appreciated the directness. "I was hesitant to bring it up." You came out stronger.',
                             es:'Agradeció la franqueza. “No me atrevía a sacar el tema.” Saliste reforzado.',
                             pt:'Ele gostou da franqueza. “Eu estava sem jeito de tocar no assunto.” Você saiu fortalecido.',
                             de:'Er hat die Offenheit geschätzt. „Ich habe mich nicht getraut, es anzusprechen.“ Du gehst gestärkt daraus hervor.',
                             fr:"Il a apprécié ta franchise. « J'hésitais à t'en parler. » Tu en sors renforcé.",
                             it:"Ha apprezzato la franchezza. «Non sapevo come tirare fuori l'argomento.» Ne esci rafforzato."}}
     :{trust:-7,msg:{tr:'Sorgulanmaktan hoşlanmadı. "Beni takip mi ediyorsun?" Araya soğukluk girdi.',
                     en:'He didn\'t like being questioned. "Are you keeping tabs on me?" Things cooled off.',
                     es:'No le gustó que lo cuestionaras. “¿Me estás vigilando?” La relación se enfrió.',
                     pt:'Ele não gostou de ser questionado. “Você está me vigiando?” O clima esfriou.',
                     de:'Er mochte es nicht, ausgefragt zu werden. „Behältst du mich im Auge?“ Die Stimmung kühlte ab.',
                     fr:"Il n'a pas aimé être interrogé. « Tu me surveilles ? » L'ambiance s'est rafraîchie.",
                     it:"Non gli è piaciuto essere messo in discussione. «Mi tieni d'occhio?» Il clima si è raffreddato."}}},
  {t:{tr:'Sessiz kal, işini daha iyi yap',en:'Say nothing, just do better work',es:'No digas nada y trabaja mejor',pt:'Não diga nada, só trabalhe melhor',de:'Sag nichts, mach einfach bessere Arbeit',fr:'Ne rien dire, juste mieux travailler',it:'Non dire niente, lavora meglio'},
   eff:()=>RF()<0.6
     ?{msg:{tr:'Konuyu açmadın. Şimdilik bir şey değişmedi.',en:'You let it lie. Nothing changed — for now.',es:'Lo dejaste estar. No cambió nada, de momento.',pt:'Você deixou quieto. Nada mudou — por enquanto.',de:'Du hast es auf sich beruhen lassen. Nichts hat sich geändert — vorerst.',fr:"Tu as laissé couler. Rien n'a changé, pour l'instant.",it:'Hai lasciato correre. Non è cambiato niente, per ora.'}}
     :{trust:-5,msg:{tr:'Sessizliğini kayıtsızlık saydı. Rakip menajerle bir kez daha görüşmüş.',
                     en:'He read your silence as indifference — and met the other agent again.',
                     es:'Interpretó tu silencio como indiferencia, y volvió a reunirse con el otro agente.',
                     pt:'Ele entendeu seu silêncio como indiferença — e se reuniu de novo com o outro empresário.',
                     de:'Er hat dein Schweigen als Gleichgültigkeit gedeutet — und den anderen Berater wieder getroffen.',
                     fr:"Il a pris ton silence pour de l'indifférence, et a revu l'autre agent.",
                     it:"Ha preso il tuo silenzio per indifferenza, e ha rivisto l'altro procuratore."}}},
  {t:{tr:'Komisyonundan feda et, bağlılığını satın al',en:'Cut your commission to keep him close',es:'Rebaja tu comisión para tenerlo cerca',pt:'Reduza sua comissão para mantê-lo por perto',de:'Senk deine Provision, um ihn zu halten',fr:'Baisser ta commission pour le garder',it:'Taglia la tua commissione per tenerlo vicino'},
   eff:c=>({cash:-Math.max(20,Math.round(c.p.wage*8)),trust:14,morale:4,
            msg:{tr:'Cebinden çıktı ama oyuncu bunu unutmayacak.',en:'It cost you, but he won\'t forget it.',es:'Te costó, pero no lo olvidará.',pt:'Saiu caro, mas ele não vai esquecer.',de:'Es hat dich gekostet, aber er wird es nicht vergessen.',fr:"Ça t'a coûté, mais il ne l'oubliera pas.",it:'Ti è costato, ma non lo dimenticherà.'}})}]},

{id:'playTime',cat:'player',w:9,need:'client',when:c=>c.p.min<600&&!isFree(c.p),
 ttl:()=>({tr:'Forma şansı meselesi',en:'A question of minutes',es:'Una cuestión de minutos',pt:'Uma questão de minutos',de:'Eine Frage der Spielzeit',fr:'Une question de temps de jeu',it:'Una questione di minuti'}),
 txt:c=>({tr:`${c.p.n} arıyor. "${c.tm.n}'de oynamıyorum. Ya bir şey yap ya da bana doğruyu söyle."`,
          en:`${c.p.n} calls. "I'm not playing at ${c.tm.n}. Either fix it or tell me the truth."`,
          es:`Te llama ${c.p.n}. “En el ${c.tm.n} no juego. O lo arreglas o me dices la verdad.”`,
          pt:`${c.p.n} liga. “Não estou jogando no ${c.tm.n}. Ou você resolve, ou me fala a verdade.”`,
          de:`${c.p.n} ruft an. „Bei ${c.tm.n} spiele ich nicht. Entweder du regelst das, oder du sagst mir die Wahrheit.“`,
          fr:`${c.p.n} t'appelle. « Je ne joue pas à ${c.tm.n}. Soit tu règles ça, soit tu me dis la vérité. »`,
          it:`Ti chiama ${c.p.n}. «Al ${c.tm.n} non gioco. O sistemi la cosa o mi dici la verità.»`}),
 opts:[
  {t:{tr:'Söz ver: sezon sonunda taşırım',en:'Promise to move him at season\'s end',es:'Prométele un traspaso al final de la temporada',pt:'Prometa transferi-lo no fim da temporada',de:'Versprich ihm einen Wechsel zum Saisonende',fr:'Lui promettre un transfert en fin de saison',it:'Promettigli una cessione a fine stagione'},
   eff:()=>({trust:5,morale:5,msg:{tr:'Rahatladı. Ama artık bir sözün var — sezon sonunda taşımazsan bunu hatırlayacak.',
                                   en:'He\'s relieved. But now you owe him — if he isn\'t moved by season\'s end, he\'ll remember.',
                                   es:'Está aliviado. Pero ahora le debes una: si no sale al final de la temporada, se acordará.',
                                   pt:'Ele ficou aliviado. Mas agora você está devendo: se ele não for transferido no fim da temporada, vai lembrar.',
                                   de:'Er ist erleichtert. Aber jetzt stehst du in seiner Schuld — wenn er zum Saisonende nicht wechselt, wird er sich erinnern.',
                                   fr:"Il est soulagé. Mais maintenant, tu lui dois quelque chose : s'il n'est pas transféré en fin de saison, il s'en souviendra.",
                                   it:"È sollevato. Ma ora sei in debito con lui: se a fine stagione non viene ceduto, se lo ricorderà."}})},
  {t:{tr:'Kulüple konuş, teknik ekibe git',en:'Talk to the club and the coaching staff',es:'Habla con el club y el cuerpo técnico',pt:'Converse com o clube e a comissão técnica',de:'Sprich mit dem Verein und dem Trainerstab',fr:"Parler au club et au staff",it:'Parla con il club e lo staff tecnico'},
   eff:c=>({cash:-Math.max(15,Math.round(c.p.wage*3)),morale:6,trust:5,
            msg:{tr:'Bir öğle yemeği ve birkaç telefon. Antrenör "bakarız" dedi — bu da bir şey.',
                 en:'A lunch and a few calls. The coach said "we\'ll see" — that\'s something.',
                 es:'Una comida y unas cuantas llamadas. El entrenador dijo “ya veremos”, y eso ya es algo.',
                 pt:'Um almoço e umas ligações. O técnico disse “vamos ver” — já é alguma coisa.',
                 de:'Ein Mittagessen und ein paar Anrufe. Der Trainer sagte „mal sehen“ — immerhin etwas.',
                 fr:"Un déjeuner et quelques coups de fil. Le coach a dit « on verra », c'est déjà ça.",
                 it:"Un pranzo e qualche telefonata. L'allenatore ha detto «vedremo», ed è già qualcosa."}})},
  {t:{tr:'Gerçeği söyle: hak etmiyor',en:'Tell him the truth: he hasn\'t earned it',es:'Dile la verdad: no se lo ha ganado',pt:'Diga a verdade: ele não fez por merecer',de:'Sag ihm die Wahrheit: Er hat es sich nicht verdient',fr:"Lui dire la vérité : il ne l'a pas mérité",it:'Digli la verità: non se l’è guadagnato'},
   eff:c=>RF()<0.45+c.p.form/200
     ?{trust:-4,form:8,morale:-3,msg:{tr:'Sert oldu ama işe yaradı. Antrenmanlara asıldı.',
                                      en:'It stung, but it worked. He\'s thrown himself into training.',
                                      es:'Le dolió, pero funcionó. Se ha volcado en los entrenamientos.',
                                      pt:'Doeu, mas funcionou. Ele se jogou nos treinos.',
                                      de:'Es hat wehgetan, aber es hat gewirkt. Er hängt sich im Training rein.',
                                      fr:"Ça a piqué, mais ça a marché. Il s'est jeté à fond dans l'entraînement.",
                                      it:"Ha fatto male, ma ha funzionato. Si è buttato anima e corpo negli allenamenti."}}
     :{trust:-12,morale:-8,msg:{tr:'Yanlış gün, yanlış cümle. Telefonu kapattı.',
                                en:'Wrong day, wrong words. He hung up.',
                                es:'Día equivocado, palabras equivocadas. Te colgó.',
                                pt:'Dia errado, palavras erradas. Ele desligou na sua cara.',
                                de:'Falscher Tag, falsche Worte. Er hat aufgelegt.',
                                fr:"Mauvais jour, mauvais mots. Il t'a raccroché au nez.",
                                it:'Giorno sbagliato, parole sbagliate. Ti ha chiuso il telefono in faccia.'}}}]},

{id:'mediaStorm',cat:'media',w:8,need:'client',
 ttl:()=>({tr:'Basında fırtına',en:'A media storm',es:'Tormenta mediática',pt:'Tempestade na mídia',de:'Ein Mediensturm',fr:'Tempête médiatique',it:'Bufera mediatica'}),
 txt:c=>({tr:`${c.p.n} maç sonu mikrofona talihsiz bir cümle kurdu. Sabah bütün spor sayfalarında.`,
          en:`${c.p.n} said something careless to a microphone after the match. It's on every back page.`,
          es:`${c.p.n} soltó algo sin pensar ante un micrófono después del partido. Sale en todas las portadas.`,
          pt:`${c.p.n} falou uma besteira ao microfone depois do jogo. Está em todas as manchetes.`,
          de:`${c.p.n} hat nach dem Spiel etwas Unbedachtes ins Mikrofon gesagt. Es steht auf jeder Sportseite.`,
          fr:`${c.p.n} a lâché une maladresse au micro après le match. Ça fait la une de tous les journaux.`,
          it:`${c.p.n} si è lasciato scappare una frase infelice al microfono dopo la partita. È su tutte le prime pagine.`}),
 opts:[
  {t:{tr:'Onun adına özür yayınla',en:'Issue an apology on his behalf',es:'Publica una disculpa en su nombre',pt:'Divulgue um pedido de desculpas em nome dele',de:'Veröffentliche in seinem Namen eine Entschuldigung',fr:'Publier des excuses en son nom',it:'Diffondi delle scuse a nome suo'},
   eff:()=>({rep:-1,trust:6,morale:4,msg:{tr:'Mesele kapandı. Oyuncu arkasında durduğunu gördü.',
                                          en:'It blew over. He saw you stand behind him.',
                                          es:'Pasó la tormenta. Vio que lo respaldabas.',
                                          pt:'A poeira baixou. Ele viu que você estava do lado dele.',
                                          de:'Es hat sich gelegt. Er hat gesehen, dass du hinter ihm stehst.',
                                          fr:"L'orage est passé. Il a vu que tu le soutenais.",
                                          it:"La bufera è passata. Ha visto che gli coprivi le spalle."}})},
  {t:{tr:'Bir iletişim ajansı tut',en:'Hire a PR firm',es:'Contrata a una agencia de comunicación',pt:'Contrate uma assessoria de imprensa',de:'Engagiere eine PR-Agentur',fr:'Engager une agence de communication',it:"Ingaggia un'agenzia di comunicazione"},
   eff:()=>({cash:-90,rep:2,morale:3,trust:3,msg:{tr:'Profesyonelce yönetildi, hatta itibarın arttı.',
                                                  en:'Handled professionally — your standing even improved.',
                                                  es:'Se gestionó de forma profesional; tu imagen hasta mejoró.',
                                                  pt:'Tudo foi resolvido de forma profissional — sua imagem até melhorou.',
                                                  de:'Professionell gelöst — dein Ansehen ist sogar gestiegen.',
                                                  fr:'Géré de façon professionnelle : ton image en est même sortie grandie.',
                                                  it:"Gestita in modo professionale: la tua immagine ne è persino uscita meglio."}})},
  {t:{tr:'Kendi başının çaresine baksın',en:'Let him clean up his own mess',es:'Que limpie él su propio desastre',pt:'Deixe ele resolver a própria bagunça',de:'Lass ihn sein Chaos selbst aufräumen',fr:'Le laisser réparer ses propres bêtises',it:'Lascia che sistemi da solo il suo pasticcio'},
   eff:c=>RF()<0.4
     ?{trust:-3,msg:{tr:'Kendi kendine toparladı. Ama yalnız bırakıldığını fark etti.',
                     en:'He sorted it himself — and noticed he was on his own.',
                     es:'Lo arregló él solo, y se dio cuenta de que estaba solo.',
                     pt:'Ele resolveu sozinho — e percebeu que estava sozinho.',
                     de:'Er hat es allein geregelt — und gemerkt, dass er allein war.',
                     fr:"Il s'en est sorti seul, et a remarqué qu'il était seul.",
                     it:'Se l’è cavata da solo, e si è accorto di essere solo.'}}
     :{rep:-3,trust:-9,morale:-7,msg:{tr:'Daha da büyüdü. Kulüp ceza kesti, oyuncu sana kızgın.',
                                      en:'It escalated. The club fined him, and he blames you.',
                                      es:'Fue a más. El club lo multó y te culpa a ti.',
                                      pt:'A coisa cresceu. O clube o multou, e ele culpa você.',
                                      de:'Es eskalierte. Der Verein hat ihn bestraft, und er gibt dir die Schuld.',
                                      fr:"Ça a dégénéré. Le club lui a mis une amende, et il t'en veut.",
                                      it:"La cosa è degenerata. Il club lo ha multato, e lui dà la colpa a te."}}}]},

{id:'sponsor',cat:'finance',w:8,need:'client',when:c=>c.p.r>=62,
 ttl:()=>({tr:'Sponsorluk teklifi',en:'A sponsorship offer',es:'Una oferta de patrocinio',pt:'Uma proposta de patrocínio',de:'Ein Sponsorenangebot',fr:'Une offre de sponsoring',it:'Una proposta di sponsorizzazione'}),
 txt:c=>({tr:`Bir spor markası ${c.p.n} için krampon anlaşması istiyor. Rakam fena değil ama pazarlık payı var.`,
          en:`A sportswear brand wants a boot deal with ${c.p.n}. The number is decent, but there's room to push.`,
          es:`Una marca deportiva quiere un contrato de botas con ${c.p.n}. La cifra está bien, pero hay margen para apretar.`,
          pt:`Uma marca esportiva quer um contrato de chuteiras com ${c.p.n}. O valor é razoável, mas dá para apertar.`,
          de:`Ein Sportartikelhersteller will einen Schuhvertrag mit ${c.p.n}. Die Summe ist ordentlich, aber da geht noch was.`,
          fr:`Une marque de sport veut un contrat chaussures avec ${c.p.n}. Le chiffre est correct, mais il y a de la marge pour pousser.`,
          it:`Un marchio sportivo vuole un contratto per le scarpe con ${c.p.n}. La cifra è discreta, ma c'è margine per spingere.`}),
 opts:[
  {t:{tr:'Masadaki teklifi kabul et',en:'Take the offer on the table',es:'Acepta la oferta que hay sobre la mesa',pt:'Aceite a proposta que está na mesa',de:'Nimm das Angebot an, das auf dem Tisch liegt',fr:"Accepter l'offre sur la table",it:"Accetta l'offerta sul tavolo"},
   eff:c=>({cash:Math.round(valueOf(c.p)*10),morale:4,trust:3,
            msg:{tr:'Temiz iş. Herkes memnun.',en:'Clean deal. Everyone happy.',es:'Trato limpio. Todos contentos.',pt:'Negócio limpo. Todo mundo feliz.',de:'Sauberer Deal. Alle zufrieden.',fr:'Affaire propre. Tout le monde est content.',it:'Affare pulito. Tutti contenti.'}})},
  {t:{tr:'Daha fazlası için diren',en:'Push for more',es:'Aprieta para sacar más',pt:'Aperte por mais',de:'Verlang mehr',fr:'Pousser pour obtenir plus',it:'Spingi per avere di più'},
   eff:c=>RF()<0.34+S.rep/300
     ?{cash:Math.round(valueOf(c.p)*19),rep:1,morale:6,trust:6,
       eff_msg:1,msg:{tr:'Blöfü tuttu. Rakam neredeyse ikiye katlandı, oyuncu sana hayran.',
                      en:'The bluff held. The figure nearly doubled — he\'s impressed.',
                      es:'El farol coló. La cifra casi se duplicó; está impresionado.',
                      pt:'O blefe colou. O valor quase dobrou — ele ficou impressionado.',
                      de:'Der Bluff hat gezogen. Die Summe hat sich fast verdoppelt — er ist beeindruckt.',
                      fr:'Le bluff a tenu. Le montant a presque doublé : il est impressionné.',
                      it:'Il bluff ha retto. La cifra è quasi raddoppiata: è impressionato.'}}
     :{trust:-9,morale:-4,msg:{tr:'Marka masadan kalktı. Oyuncu fırsatın kaçtığını düşünüyor.',
                     en:'The brand walked. He thinks you let it slip away.',
                     es:'La marca se retiró. Cree que dejaste escapar la oportunidad.',
                     pt:'A marca desistiu. Ele acha que você deixou escapar.',
                     de:'Die Marke ist abgesprungen. Er glaubt, du hast es vermasselt.',
                     fr:"La marque s'est retirée. Il pense que tu as laissé filer l'affaire.",
                     it:"Il marchio si è ritirato. Pensa che tu te lo sia lasciato sfuggire."}}},
  {t:{tr:'Reddet — markayla imajı uyuşmuyor',en:'Decline — the brand doesn\'t fit him',es:'Recházala: la marca no va con él',pt:'Recuse — a marca não combina com ele',de:'Lehn ab — die Marke passt nicht zu ihm',fr:'Refuser : la marque ne lui correspond pas',it:'Rifiuta: il marchio non fa per lui'},
   eff:()=>({trust:4,msg:{tr:'Uzun vadeli düşündüğünü gördü. Para gitti, itibar kaldı.',
                                en:'He saw you thinking long-term. The money went; the standing stayed.',
                                es:'Vio que pensabas a largo plazo. El dinero se fue; el prestigio se quedó.',
                                pt:'Ele viu que você pensa no longo prazo. O dinheiro foi embora; o prestígio ficou.',
                                de:'Er hat gesehen, dass du langfristig denkst. Das Geld ist weg, das Ansehen bleibt.',
                                fr:"Il a vu que tu pensais à long terme. L'argent est parti, le crédit est resté.",
                                it:'Ha visto che pensi a lungo termine. I soldi sono sfumati, il prestigio è rimasto.'}})}]},

{id:'family',cat:'player',w:7,need:'client',
 ttl:()=>({tr:'Ailevi mesele',en:'A family matter',es:'Un asunto familiar',pt:'Um assunto de família',de:'Eine Familienangelegenheit',fr:'Une affaire de famille',it:'Una questione di famiglia'}),
 txt:c=>({tr:`${c.p.n} gece geç saatte aradı. Memleketinde işler karışık, kafası sahada değil.`,
          en:`${c.p.n} called late at night. Something's wrong back home, and his head isn't on football.`,
          es:`${c.p.n} te llamó a altas horas. Algo va mal en casa y no tiene la cabeza en el fútbol.`,
          pt:`${c.p.n} ligou tarde da noite. Algo está errado em casa, e a cabeça dele não está no futebol.`,
          de:`${c.p.n} hat spät in der Nacht angerufen. Zu Hause stimmt etwas nicht, und er hat den Kopf nicht beim Fußball.`,
          fr:`${c.p.n} t'a appelé tard dans la nuit. Quelque chose ne va pas chez lui, et il n'a pas la tête au football.`,
          it:`${c.p.n} ti ha chiamato a notte fonda. C'è qualcosa che non va a casa, e non ha la testa nel calcio.`}),
 opts:[
  {t:{tr:'Uçağa atla, yanında ol',en:'Get on a plane and be there',es:'Coge un avión y ve a estar con él',pt:'Pegue um avião e esteja lá',de:'Setz dich in den Flieger und sei für ihn da',fr:"Prendre l'avion et être là",it:"Prendi un aereo e vai da lui"},
   eff:()=>({cash:-140,trust:20,morale:10,msg:{tr:'İki gün kaybettin. Karşılığında hayat boyu sürecek bir bağ kazandın.',
                                               en:'You lost two days. You gained something that lasts a career.',
                                               es:'Perdiste dos días. Ganaste algo que dura toda una carrera.',
                                               pt:'Você perdeu dois dias. Ganhou algo que dura uma carreira inteira.',
                                               de:'Du hast zwei Tage verloren. Du hast etwas gewonnen, das eine ganze Karriere hält.',
                                               fr:'Tu as perdu deux jours. Tu as gagné quelque chose qui dure toute une carrière.',
                                               it:"Hai perso due giorni. Hai guadagnato qualcosa che dura un'intera carriera."}})},
  {t:{tr:'Maddi destek gönder',en:'Send money to help',es:'Envía dinero para ayudar',pt:'Mande dinheiro para ajudar',de:'Schick Geld, um zu helfen',fr:"Envoyer de l'argent pour aider",it:'Manda dei soldi per aiutare'},
   eff:()=>({cash:-70,trust:9,morale:6,msg:{tr:'Minnettar. Ama arayan sesin yerini para tutmadı.',
                                            en:'He\'s grateful — though money didn\'t replace a voice on the phone.',
                                            es:'Te lo agradece, aunque el dinero no sustituyó una voz al teléfono.',
                                            pt:'Ele ficou grato — mas o dinheiro não substituiu uma voz ao telefone.',
                                            de:'Er ist dankbar — auch wenn Geld keine Stimme am Telefon ersetzt hat.',
                                            fr:"Il est reconnaissant, même si l'argent n'a pas remplacé une voix au téléphone.",
                                            it:'Ti è grato, anche se i soldi non hanno sostituito una voce al telefono.'}})},
  {t:{tr:'Profesyonel sınırı koru',en:'Keep it professional',es:'Mantén la relación profesional',pt:'Mantenha o profissionalismo',de:'Bleib professionell',fr:'Rester professionnel',it:'Resta professionale'},
   eff:()=>({trust:-11,morale:-9,msg:{tr:'"Anladım." Kısa bir cevap. Aranızda bir şey kırıldı.',
                                      en:'"Understood." A short reply. Something broke.',
                                      es:'“Entendido.” Una respuesta corta. Algo se rompió.',
                                      pt:'“Entendido.” Uma resposta curta. Alguma coisa se quebrou.',
                                      de:'„Verstanden.“ Eine knappe Antwort. Etwas ist zerbrochen.',
                                      fr:"« Compris. » Une réponse brève. Quelque chose s'est brisé.",
                                      it:"«Capito.» Una risposta secca. Qualcosa si è rotto."}})}]},

{id:'cutRequest',cat:'finance',w:7,need:'client',when:c=>trustOf(c.p)<70,
 ttl:()=>({tr:'Komisyon pazarlığı',en:'He wants a better cut',es:'Quiere una comisión mejor',pt:'Ele quer uma comissão melhor',de:'Er will eine bessere Provision',fr:'Il veut une meilleure part',it:'Vuole una commissione migliore'}),
 txt:c=>({tr:`${c.p.n} komisyon oranını konuşmak istiyor. "Diğer menajerler daha az alıyormuş."`,
          en:`${c.p.n} wants to talk about your commission. "I hear other agents take less."`,
          es:`${c.p.n} quiere hablar de tu comisión. “Me han dicho que otros agentes cobran menos.”`,
          pt:`${c.p.n} quer conversar sobre a sua comissão. “Ouvi dizer que outros empresários cobram menos.”`,
          de:`${c.p.n} will über deine Provision reden. „Ich höre, andere Berater nehmen weniger.“`,
          fr:`${c.p.n} veut parler de ta commission. « On m'a dit que d'autres agents prennent moins. »`,
          it:`${c.p.n} vuole parlare della tua commissione. «Ho sentito che altri procuratori prendono meno.»`}),
 opts:[
  {t:{tr:'İndirimi kabul et',en:'Accept the cut',es:'Acepta la rebaja',pt:'Aceite a redução',de:'Akzeptier die Kürzung',fr:'Accepter la baisse',it:'Accetta il taglio'},
   eff:c=>({cash:-Math.max(25,Math.round(c.p.wage*10)),trust:12,
            msg:{tr:'Cebinden çıktı ama ilişki güçlendi.',en:'It cost you, but the relationship is stronger.',es:'Te costó, pero la relación sale reforzada.',pt:'Custou caro, mas a relação ficou mais forte.',de:'Es hat dich gekostet, aber die Beziehung ist stärker.',fr:'Ça t’a coûté, mais la relation en sort renforcée.',it:'Ti è costato, ma il rapporto ne esce più forte.'}})},
  {t:{tr:'Ne yaptığını anlat, oranı savun',en:'Explain your worth, hold the rate',es:'Explica lo que vales y mantén tu porcentaje',pt:'Mostre o seu valor e mantenha a taxa',de:'Erklär deinen Wert und halte deinen Satz',fr:'Expliquer ta valeur, garder ton taux',it:'Spiega quanto vali e tieni la percentuale'},
   eff:c=>RF()<0.4+S.rep/200
     ?{trust:5,rep:1,msg:{tr:'Rakamları gösterdin. İkna oldu — hatta saygısı arttı.',
                          en:'You showed him the numbers. He was convinced, and respected you more for it.',
                          es:'Le enseñaste los números. Lo convenciste, y ahora te respeta más.',
                          pt:'Você mostrou os números. Ele se convenceu, e passou a te respeitar mais.',
                          de:'Du hast ihm die Zahlen gezeigt. Er war überzeugt und respektiert dich jetzt mehr.',
                          fr:"Tu lui as montré les chiffres. Il a été convaincu, et il te respecte encore plus.",
                          it:'Gli hai mostrato i numeri. Si è convinto, e ora ti rispetta di più.'}}
     :{trust:-8,msg:{tr:'İkna olmadı. "Düşüneceğim" dedi, bu iyiye işaret değil.',
                     en:'He wasn\'t convinced. "I\'ll think about it" — never a good sign.',
                     es:'No lo convenciste. “Me lo pensaré”, nunca es buena señal.',
                     pt:'Ele não se convenceu. “Vou pensar” — nunca é bom sinal.',
                     de:'Er war nicht überzeugt. „Ich denk drüber nach“ — nie ein gutes Zeichen.',
                     fr:"Il n'a pas été convaincu. « Je vais réfléchir », jamais bon signe.",
                     it:"Non si è convinto. «Ci penserò»: mai un buon segno."}}},
  {t:{tr:'Ortada buluş',en:'Meet in the middle',es:'Encontraos a medio camino',pt:'Encontrem um meio-termo',de:'Trefft euch in der Mitte',fr:'Couper la poire en deux',it:'Venitevi incontro'},
   eff:c=>({cash:-Math.max(10,Math.round(c.p.wage*4)),trust:6,
            msg:{tr:'İkiniz de biraz verdiniz. Mesele kapandı.',en:'You both gave a little. It\'s settled.',es:'Los dos cedisteis un poco. Asunto zanjado.',pt:'Os dois cederam um pouco. Está resolvido.',de:'Ihr habt beide ein bisschen nachgegeben. Erledigt.',fr:"Chacun a lâché un peu. C'est réglé.",it:'Avete ceduto un po’ tutti e due. Questione chiusa.'}})}]},

{id:'knock',cat:'player',w:7,need:'client',when:c=>!isFree(c.p),
 ttl:()=>({tr:'Sakatlık şüphesi',en:'Playing through a knock',es:'Jugar tocado',pt:'Jogar no sacrifício',de:'Angeschlagen spielen',fr:'Jouer diminué',it:'Giocare acciaccato'}),
 txt:c=>({tr:`${c.p.n} ağrılı. ${c.tm.n} önemli maç öncesi oynamasını istiyor, kulüp doktoru "idare eder" diyor.`,
          en:`${c.p.n} is carrying a knock. ${c.tm.n} want him for a big match and the club doctor says he'll manage.`,
          es:`${c.p.n} arrastra un golpe. El ${c.tm.n} lo quiere para un partido grande y el médico del club dice que aguantará.`,
          pt:`${c.p.n} está com uma pancada. O ${c.tm.n} quer ele num jogo grande, e o médico do clube diz que ele aguenta.`,
          de:`${c.p.n} ist angeschlagen. ${c.tm.n} will ihn für ein großes Spiel, und der Vereinsarzt sagt, es geht schon.`,
          fr:`${c.p.n} traîne un coup. ${c.tm.n} le veut pour un gros match, et le médecin du club dit qu'il tiendra.`,
          it:`${c.p.n} ha un acciacco. Il ${c.tm.n} lo vuole per una partita importante e il medico del club dice che ce la farà.`}),
 opts:[
  {t:{tr:'Dinlenmesi için diretiyorum',en:'Insist that he rests',es:'Insiste en que descanse',pt:'Insista que ele descanse',de:'Besteh darauf, dass er pausiert',fr:"Insister pour qu'il se repose",it:'Insisti perché si riposi'},
   eff:()=>({trust:8,morale:-4,form:-5,msg:{tr:'Kulüp memnun değil ama oyuncu kendini korunmuş hissetti.',
                                            en:'The club isn\'t pleased, but he felt protected.',
                                            es:'Al club no le hace gracia, pero él se sintió protegido.',
                                            pt:'O clube não gostou, mas ele se sentiu protegido.',
                                            de:'Der Verein ist nicht erfreut, aber er hat sich beschützt gefühlt.',
                                            fr:"Le club n'est pas ravi, mais lui s'est senti protégé.",
                                            it:"Il club non è contento, ma lui si è sentito protetto."}})},
  {t:{tr:'Karar onun, ne derse',en:'It\'s his call',es:'Que decida él',pt:'A decisão é dele',de:'Er soll selbst entscheiden',fr:"C'est à lui de décider",it:'Decide lui'},
   eff:c=>RF()<0.5
     ?{form:10,morale:8,trust:4,msg:{tr:'Oynadı ve iyi oynadı. Riski aldı, kazandı.',
                                     en:'He played, and played well. The gamble paid off.',
                                     es:'Jugó, y jugó bien. La apuesta salió bien.',
                                     pt:'Ele jogou, e jogou bem. A aposta deu certo.',
                                     de:'Er hat gespielt, und zwar gut. Das Risiko hat sich gelohnt.',
                                     fr:"Il a joué, et bien joué. Le pari a payé.",
                                     it:'Ha giocato, e bene. La scommessa ha pagato.'}}
     :{form:-16,morale:-10,trust:-5,msg:{tr:'Ağrı büyüdü, formu düştü. "Beni uyarman gerekirdi."',
                                         en:'The knock worsened and his form dipped. "You should have warned me."',
                                         es:'El golpe fue a peor y su forma bajó. “Deberías haberme avisado.”',
                                         pt:'A pancada piorou e a forma dele caiu. “Você devia ter me avisado.”',
                                         de:'Die Blessur wurde schlimmer, seine Form sank. „Du hättest mich warnen sollen.“',
                                         fr:"Le coup s'est aggravé et sa forme a baissé. « Tu aurais dû me prévenir. »",
                                         it:"L'acciacco è peggiorato e la sua forma è calata. «Avresti dovuto avvisarmi.»"}}},
  {t:{tr:'Bağımsız doktora göndert',en:'Send him to an independent doctor',es:'Llévalo a un médico independiente',pt:'Leve-o a um médico independente',de:'Schick ihn zu einem unabhängigen Arzt',fr:"L'envoyer chez un médecin indépendant",it:'Mandalo da un medico indipendente'},
   eff:()=>({cash:-45,trust:11,morale:3,msg:{tr:'Netleşti, doğru karar verildi. Profesyonelliğin fark edildi.',
                                             en:'It cleared things up and the right call was made. Your professionalism registered.',
                                             es:'Se aclaró todo y se tomó la decisión correcta. Tu profesionalidad no pasó desapercibida.',
                                             pt:'Ficou tudo claro e a decisão certa foi tomada. Seu profissionalismo foi notado.',
                                             de:'Das hat Klarheit gebracht, und es wurde richtig entschieden. Deine Professionalität ist aufgefallen.',
                                             fr:"Tout s'est éclairci et la bonne décision a été prise. Ton professionnalisme a été remarqué.",
                                             it:'Tutto si è chiarito e si è presa la decisione giusta. La tua professionalità è stata notata.'}})}]},

/* ----- küçük olaylar: sık çıkar, kariyeri tek başına değiştirmez ----- */
{id:'shirtNumber',cat:'player',w:10,sz:'s',need:'client',when:c=>!isFree(c.p),
 ttl:()=>({tr:'Forma numarası',en:'The shirt number',es:'El dorsal',pt:'O número da camisa',de:'Die Rückennummer',fr:'Le numéro de maillot',it:'Il numero di maglia'}),
 txt:c=>({tr:`${c.p.n} istediği numarayı istiyor ama forma başkasının sırtında. O oyuncu "boşaltırım, ama bedeli var" diyor.`,
          en:`${c.p.n} wants his number, but it's on someone else's back. That player says he'll give it up — for a price.`,
          es:`${c.p.n} quiere su dorsal, pero lo lleva otro. Ese jugador dice que se lo cede… a cambio de algo.`,
          pt:`${c.p.n} quer o número dele, mas está nas costas de outro. Esse jogador diz que abre mão — por um preço.`,
          de:`${c.p.n} will seine Nummer, aber die trägt ein anderer. Der sagt, er gibt sie ab — gegen Bezahlung.`,
          fr:`${c.p.n} veut son numéro, mais il est sur le dos d'un autre. Ce joueur veut bien le céder… contre un petit quelque chose.`,
          it:`${c.p.n} vuole il suo numero, ma ce l'ha un altro. Quel giocatore dice che lo cede… per un prezzo.`}),
 opts:[
  {t:{tr:'Parayı sen öde',en:'Pay for it yourself',es:'Págalo tú',pt:'Pague do seu bolso',de:'Bezahl es selbst',fr:'Payer toi-même',it:'Paga tu'},
   eff:c=>({cash:-Math.max(12,Math.round(c.p.wage*3)),trust:6,morale:4,
            msg:{tr:'Küçük bir jest, büyük bir memnuniyet. Numara sırtında.',en:'A small gesture, a large amount of goodwill. He has the number.',es:'Un gesto pequeño, una gran cantidad de buena voluntad. Ya tiene su dorsal.',pt:'Um gesto pequeno, uma montanha de boa vontade. O número é dele.',de:'Eine kleine Geste, eine Menge Wohlwollen. Er hat seine Nummer.',fr:'Un petit geste, beaucoup de reconnaissance. Il a son numéro.',it:'Un piccolo gesto, tanta riconoscenza. Ha il suo numero.'}})},
  {t:{tr:'Kulüp halletsin',en:'Let the club sort it',es:'Que lo resuelva el club',pt:'Deixe o clube resolver',de:'Lass den Verein das regeln',fr:'Laisser le club régler ça',it:'Lascia che se ne occupi il club'},
   eff:()=>RF()<0.5?{trust:3,morale:3,msg:{tr:'Kulüp araya girdi, mesele tatlıya bağlandı.',en:'The club stepped in and smoothed it over.',es:'El club intervino y lo arregló.',pt:'O clube entrou no meio e acalmou tudo.',de:'Der Verein hat eingegriffen und es geglättet.',fr:'Le club est intervenu et a arrangé les choses.',it:'Il club è intervenuto e ha appianato tutto.'}}
                   :{morale:-3,msg:{tr:'Kulüp karışmak istemedi. Numara sahibinde kaldı.',en:'The club wouldn\'t get involved. The number stayed where it was.',es:'El club no quiso meterse. El dorsal se quedó donde estaba.',pt:'O clube não quis se envolver. O número ficou onde estava.',de:'Der Verein wollte sich nicht einmischen. Die Nummer blieb, wo sie war.',fr:"Le club n'a pas voulu s'en mêler. Le numéro est resté où il était.",it:'Il club non ha voluto immischiarsi. Il numero è rimasto dov’era.'}}},
  {t:{tr:'Bu sezon idare etsin',en:'He can live with it',es:'Puede vivir con ello',pt:'Ele consegue conviver com isso',de:'Damit kann er leben',fr:'Il peut faire avec',it:'Può conviverci'},
   eff:()=>({morale:-4,msg:{tr:'"Tamam." Küçük bir şey ama aklında kaldı.',en:'"Fine." A small thing, but it stuck with him.',es:'“Vale.” Una tontería, pero se le quedó grabada.',pt:'“Tá bom.” Uma coisa pequena, mas ficou na cabeça dele.',de:'„Na gut.“ Eine Kleinigkeit, aber sie ist bei ihm hängen geblieben.',fr:"« D'accord. » Un détail, mais ça lui est resté en travers.",it:"«Va bene.» Una sciocchezza, ma gli è rimasta impressa."}})}]},

{id:'socialLike',cat:'media',w:10,sz:'s',need:'client',when:c=>!isFree(c.p),
 ttl:()=>({tr:'Sosyal medyada bir beğeni',en:'A like on the wrong post',es:'Un me gusta en la publicación equivocada',pt:'Uma curtida no post errado',de:'Ein Like unter dem falschen Post',fr:'Un like sur la mauvaise publication',it:'Un like al post sbagliato'}),
 txt:c=>({tr:`${c.p.n} rakip kulübün paylaşımını beğenmiş. Ekran görüntüsü çoktan dolaşımda.`,
          en:`${c.p.n} liked a rival club's post. The screenshot is already going around.`,
          es:`${c.p.n} le dio a me gusta a una publicación de un club rival. La captura ya está circulando.`,
          pt:`${c.p.n} curtiu um post de um clube rival. O print já está circulando.`,
          de:`${c.p.n} hat einen Post eines rivalisierenden Vereins geliked. Der Screenshot macht schon die Runde.`,
          fr:`${c.p.n} a liké une publication d'un club rival. La capture d'écran circule déjà.`,
          it:`${c.p.n} ha messo like a un post di un club rivale. Lo screenshot sta già girando.`}),
 opts:[
  {t:{tr:'Hesabını profesyonele devret',en:'Put a professional on his account',es:'Pon a un profesional a llevar su cuenta',pt:'Coloque um profissional para cuidar da conta dele',de:'Setz einen Profi auf seinen Account',fr:'Confier son compte à un professionnel',it:'Affida il suo account a un professionista'},
   eff:()=>({cash:-25,trust:3,msg:{tr:'Bundan sonra ne paylaşacağını bilen biri var.',en:'Someone who knows what to post is handling it now.',es:'Ahora lo lleva alguien que sabe qué publicar.',pt:'Agora quem cuida é alguém que sabe o que postar.',de:'Jetzt kümmert sich jemand darum, der weiß, was man postet.',fr:"Quelqu'un qui sait quoi publier s'en occupe désormais.",it:'Ora se ne occupa qualcuno che sa cosa pubblicare.'}})},
  {t:{tr:'Kendisi açıklasın',en:'Let him explain',es:'Deja que se explique',pt:'Deixe ele se explicar',de:'Lass ihn es erklären',fr:"Le laisser s'expliquer",it:'Lascia che si spieghi'},
   eff:()=>RF()<0.5?{morale:2,msg:{tr:'İki cümlelik bir açıklama yetti.',en:'Two sentences and it was over.',es:'Dos frases y se acabó.',pt:'Duas frases e acabou.',de:'Zwei Sätze, und es war vorbei.',fr:"Deux phrases et c'était fini.",it:'Due frasi ed era finita.'}}
                   :{rep:-1,morale:-5,msg:{tr:'Açıklama beğeniden daha çok konuşuldu.',en:'The explanation got more attention than the like.',es:'La explicación llamó más la atención que el me gusta.',pt:'A explicação chamou mais atenção do que a curtida.',de:'Die Erklärung bekam mehr Aufmerksamkeit als das Like.',fr:"L'explication a fait plus de bruit que le like.",it:'La spiegazione ha attirato più attenzione del like.'}}},
  {t:{tr:'Görmezden gel',en:'Ignore it',es:'Ignóralo',pt:'Ignore',de:'Ignorier es',fr:'Ignorer',it:'Ignora la cosa'},
   eff:()=>({morale:-3,msg:{tr:'Birkaç gün üstüne gittiler. Hoş değildi.',en:'They went at him for a few days. Not pleasant.',es:'Le dieron caña durante unos días. Nada agradable.',pt:'Pegaram no pé dele por uns dias. Nada agradável.',de:'Ein paar Tage lang sind sie auf ihn losgegangen. Nicht schön.',fr:"On lui est tombé dessus pendant quelques jours. Pas agréable.",it:"Lo hanno preso di mira per qualche giorno. Non piacevole."}})}]},

{id:'barber',cat:'player',w:9,sz:'s',need:'client',when:c=>!isFree(c.p),
 ttl:()=>({tr:'Maç sabahı berber',en:'A haircut on matchday',es:'Un corte de pelo el día de partido',pt:'Um corte de cabelo em dia de jogo',de:'Ein Friseurbesuch am Spieltag',fr:'Une coupe de cheveux le jour du match',it:'Un taglio di capelli il giorno della partita'}),
 txt:c=>({tr:`${c.p.n} maç sabahı saç kestirmek için şehir dışına çıkmış ve antrenmana geç kalmış. ${c.tm.n} hiç memnun değil.`,
          en:`${c.p.n} drove out of town for a haircut on the morning of the match and turned up late. ${c.tm.n} are not amused.`,
          es:`${c.p.n} se fue fuera de la ciudad a cortarse el pelo la mañana del partido y llegó tarde. Al ${c.tm.n} no le hace ninguna gracia.`,
          pt:`${c.p.n} saiu da cidade para cortar o cabelo na manhã do jogo e chegou atrasado. O ${c.tm.n} não achou graça nenhuma.`,
          de:`${c.p.n} ist am Morgen des Spiels zum Friseur aus der Stadt gefahren und kam zu spät. ${c.tm.n} ist nicht amüsiert.`,
          fr:`${c.p.n} est sorti de la ville pour se faire couper les cheveux le matin du match et il est arrivé en retard. ${c.tm.n} n'apprécie pas du tout.`,
          it:`${c.p.n} è andato fuori città a tagliarsi i capelli la mattina della partita ed è arrivato in ritardo. Al ${c.tm.n} non è piaciuto per niente.`}),
 opts:[
  {t:{tr:'Kulübe sen izah et',en:'Explain it to the club yourself',es:'Explícaselo tú mismo al club',pt:'Explique você mesmo ao clube',de:'Erklär es dem Verein selbst',fr:"L'expliquer toi-même au club",it:'Spiegalo tu al club'},
   eff:()=>({rep:-1,trust:7,msg:{tr:'Suçu üstlendin. Oyuncu bunu gördü.',en:'You took the blame. He noticed.',es:'Asumiste la culpa. Él se dio cuenta.',pt:'Você assumiu a culpa. Ele percebeu.',de:'Du hast die Schuld auf dich genommen. Er hat es bemerkt.',fr:"Tu as pris la faute sur toi. Il l'a remarqué.",it:"Ti sei preso la colpa. Lui l'ha notato."}})},
  {t:{tr:'Cezasını çeksin',en:'Let him take the fine',es:'Que pague la multa',pt:'Deixe ele pagar a multa',de:'Lass ihn die Strafe zahlen',fr:"Le laisser payer l'amende",it:'Lascia che paghi la multa'},
   eff:()=>({trust:-4,form:6,morale:-3,msg:{tr:'Kesinti canını yaktı. Ertesi hafta antrenmanda ilk gelen oydu.',
                                            en:'The fine stung. He was first in to training the next week.',
                                            es:'La multa le dolió. A la semana siguiente fue el primero en llegar al entrenamiento.',
                                            pt:'A multa doeu. Na semana seguinte, ele foi o primeiro a chegar ao treino.',
                                            de:'Die Strafe hat gesessen. In der Woche darauf war er als Erster beim Training.',
                                            fr:"L'amende a fait mal. La semaine suivante, il était le premier à l'entraînement.",
                                            it:"La multa gli ha bruciato. La settimana dopo era il primo ad arrivare all'allenamento."}})},
  {t:{tr:'Şakaya vur',en:'Laugh it off',es:'Tómatelo a risa',pt:'Leve na brincadeira',de:'Lach darüber',fr:'En rire',it:'Ridici sopra'},
   eff:()=>RF()<0.7?{morale:5,trust:3,msg:{tr:'Gülüp geçtiniz. Soyunma odası da öyle.',en:'You both laughed. So did the dressing room.',es:'Os reísteis los dos. Y el vestuario también.',pt:'Vocês dois riram. O vestiário também.',de:'Ihr habt beide gelacht. Die Kabine auch.',fr:'Vous en avez ri tous les deux. Le vestiaire aussi.',it:'Avete riso tutti e due. Anche lo spogliatoio.'}}
                   :{rep:-2,morale:-2,msg:{tr:'Espriyi kulüp komik bulmadı. Ciddiyetsiz göründün.',en:'The club didn\'t find it funny. You looked unserious.',es:'Al club no le hizo gracia. Pareciste poco serio.',pt:'O clube não achou graça. Você pareceu pouco sério.',de:'Der Verein fand es nicht lustig. Du wirktest unseriös.',fr:"Le club n'a pas trouvé ça drôle. Tu as eu l'air peu sérieux.",it:'Al club non ha fatto ridere. Sei sembrato poco serio.'}}}]},

{id:'gameRating',cat:'media',w:9,sz:'s',need:'client',when:c=>c.p.r>=60,
 ttl:()=>({tr:'Reytingi beğenmedi',en:'He doesn\'t like his rating',es:'No le gusta su media',pt:'Ele não gostou da nota dele',de:'Seine Bewertung gefällt ihm nicht',fr:"Sa note ne lui plaît pas",it:'Non gli piace il suo valore'}),
 txt:c=>({tr:`${c.p.n} bir futbol oyununda çıkan puanını beğenmemiş. Telefonda sesi gerçekten kırgın.`,
          en:`${c.p.n} has seen his rating in a football video game and he's genuinely hurt by it.`,
          es:`${c.p.n} ha visto su media en un videojuego de fútbol y le ha dolido de verdad.`,
          pt:`${c.p.n} viu a nota dele num videogame de futebol e ficou magoado de verdade.`,
          de:`${c.p.n} hat seine Bewertung in einem Fußball-Videospiel gesehen und ist ehrlich gekränkt.`,
          fr:`${c.p.n} a vu sa note dans un jeu vidéo de foot, et ça l'a vraiment vexé.`,
          it:`${c.p.n} ha visto il suo valore in un videogioco di calcio e ci è rimasto davvero male.`}),
 opts:[
  {t:{tr:'Yapımcıyla konuş',en:'Call the publisher',es:'Llama a la desarrolladora',pt:'Ligue para a produtora do jogo',de:'Ruf beim Spielehersteller an',fr:"Appeler l'éditeur du jeu",it:'Chiama la casa del videogioco'},
   eff:()=>({cash:-20,morale:6,msg:{tr:'Bir sonraki güncellemede bakılacakmış. Çocuk gibi sevindi.',
                                    en:'They\'ll look at it in the next update. He lit up like a kid.',
                                    es:'Lo revisarán en la próxima actualización. Se iluminó como un niño.',
                                    pt:'Vão rever na próxima atualização. Ele se iluminou feito criança.',
                                    de:'Sie schauen es sich beim nächsten Update an. Er strahlte wie ein Kind.',
                                    fr:"Ils vont regarder ça à la prochaine mise à jour. Il s'est illuminé comme un gamin.",
                                    it:'Lo rivedranno nel prossimo aggiornamento. Si è illuminato come un bambino.'}})},
  {t:{tr:'Sahada cevap versin',en:'Tell him to answer on the pitch',es:'Dile que responda en el campo',pt:'Diga para ele responder em campo',de:'Sag ihm, er soll auf dem Platz antworten',fr:'Lui dire de répondre sur le terrain',it:'Digli di rispondere in campo'},
   eff:()=>({form:7,morale:-4,msg:{tr:'Somurttu ama antrenmanda bir şey değişti.',en:'He sulked — and something changed in training.',es:'Se enfurruñó, y algo cambió en los entrenamientos.',pt:'Ele ficou emburrado — e alguma coisa mudou nos treinos.',de:'Er hat geschmollt — und im Training hat sich etwas verändert.',fr:"Il a boudé, et quelque chose a changé à l'entraînement.",it:"Ha tenuto il broncio, e in allenamento qualcosa è cambiato."}})},
  {t:{tr:'Ciddiye alma',en:'Don\'t indulge it',es:'No le sigas el juego',pt:'Não dê corda',de:'Geh nicht darauf ein',fr:'Ne pas entrer dans son jeu',it:'Non dargli corda'},
   eff:()=>RF()<0.6?{msg:{tr:'Birkaç gün sonra kendisi de güldü.',en:'A few days later he was laughing about it himself.',es:'Unos días después, se reía él mismo de ello.',pt:'Alguns dias depois, ele mesmo estava rindo disso.',de:'Ein paar Tage später hat er selbst darüber gelacht.',fr:"Quelques jours plus tard, il en riait lui-même.",it:'Qualche giorno dopo ci rideva sopra lui stesso.'}}
                   :{morale:-4,trust:-3,msg:{tr:'Küçük bir şeydi ama ciddiye alınmadığını hissetti.',en:'A small thing, but he felt brushed aside.',es:'Una tontería, pero se sintió ninguneado.',pt:'Uma bobagem, mas ele se sentiu deixado de lado.',de:'Eine Kleinigkeit, aber er fühlte sich abgewimmelt.',fr:"Un détail, mais il s'est senti mis de côté.",it:'Una sciocchezza, ma si è sentito liquidato.'}}}]},

{id:'homesick',cat:'player',w:9,sz:'s',need:'client',
 when:c=>!isFree(c.p)&&LEAGUES[c.tm.lg]&&LEAGUES[c.tm.lg].nat!==c.p.nat,
 ttl:()=>({tr:'Yabancı bir şehirde',en:'A long way from home',es:'Muy lejos de casa',pt:'Longe de casa',de:'Weit weg von zu Hause',fr:'Loin de chez lui',it:'Lontano da casa'}),
 txt:c=>({tr:`${c.p.n} yeni ülkeye alışamıyor. Dili yok, soyunma odasında kimseyle konuşmuyor.`,
          en:`${c.p.n} isn't settling. He has no language, and he says nothing in the dressing room.`,
          es:`${c.p.n} no se adapta. No habla el idioma y en el vestuario no dice ni una palabra.`,
          pt:`${c.p.n} não está se adaptando. Não fala a língua e não abre a boca no vestiário.`,
          de:`${c.p.n} lebt sich nicht ein. Er spricht die Sprache nicht und sagt in der Kabine kein Wort.`,
          fr:`${c.p.n} ne s'acclimate pas. Il ne parle pas la langue et ne dit pas un mot dans le vestiaire.`,
          it:`${c.p.n} non si ambienta. Non parla la lingua e nello spogliatoio non dice una parola.`}),
 opts:[
  {t:{tr:'Dil hocası tut',en:'Get him a language tutor',es:'Ponle un profesor de idiomas',pt:'Arrume um professor de idiomas',de:'Besorg ihm einen Sprachlehrer',fr:'Lui trouver un professeur de langue',it:'Procuragli un insegnante di lingua'},
   eff:()=>({cash:-35,form:6,morale:6,msg:{tr:'İki ay sonra saha içinde bağırabiliyordu. Fark ediliyor.',
                                           en:'Two months later he was shouting on the pitch. It shows.',
                                           es:'Dos meses después ya daba gritos en el campo. Se nota.',
                                           pt:'Dois meses depois ele já gritava em campo. Dá para ver.',
                                           de:'Zwei Monate später hat er auf dem Platz gerufen. Man merkt es.',
                                           fr:'Deux mois plus tard, il donnait de la voix sur le terrain. Ça se voit.',
                                           it:'Due mesi dopo urlava in campo. Si vede.'}})},
  {t:{tr:'Ailesini getirt',en:'Fly his family over',es:'Tráete a su familia',pt:'Traga a família dele',de:'Hol seine Familie her',fr:'Faire venir sa famille',it:'Fai arrivare la sua famiglia'},
   eff:()=>({cash:-60,morale:12,trust:8,msg:{tr:'Evinde ışık yanıyor artık. Gerisi kendiliğinden geldi.',
                                             en:'There are lights on at home now. The rest followed.',
                                             es:'Ahora hay luces encendidas en casa. Lo demás vino solo.',
                                             pt:'Agora tem luz acesa em casa. O resto veio junto.',
                                             de:'Jetzt brennt zu Hause Licht. Der Rest kam von allein.',
                                             fr:"Il y a de la lumière à la maison maintenant. Le reste a suivi.",
                                             it:'Ora a casa ci sono le luci accese. Il resto è venuto da sé.'}})},
  {t:{tr:'Kendi alışsın',en:'He\'ll adapt',es:'Ya se adaptará',pt:'Ele vai se adaptar',de:'Er wird sich schon eingewöhnen',fr:"Il s'adaptera",it:'Si adatterà'},
   eff:()=>({morale:-8,form:-4,msg:{tr:'Alışamadı. Antrenmandan sonra ilk çıkan hep o.',en:'He didn\'t adapt. He\'s always first out after training.',es:'No se adaptó. Siempre es el primero en irse después de entrenar.',pt:'Não se adaptou. É sempre o primeiro a ir embora depois do treino.',de:'Er hat sich nicht eingewöhnt. Nach dem Training ist er immer als Erster weg.',fr:"Il ne s'est pas adapté. Il est toujours le premier parti après l'entraînement.",it:"Non si è adattato. È sempre il primo ad andarsene dopo l'allenamento."}})}]},

{id:'preseasonWeight',cat:'player',w:8,sz:'s',need:'client',when:c=>!isFree(c.p),
 ttl:()=>({tr:'Ara dönüşü',en:'Back from the break',es:'De vuelta de las vacaciones',pt:'Volta das férias',de:'Zurück aus der Pause',fr:'Retour de vacances',it:'Rientro dalle vacanze'}),
 txt:c=>({tr:`${c.p.n} aradan kilolu döndü. Ölçümler kulübü memnun etmedi.`,
          en:`${c.p.n} came back from the break heavy. The measurements did not please the club.`,
          es:`${c.p.n} volvió de las vacaciones con kilos de más. Las mediciones no gustaron al club.`,
          pt:`${c.p.n} voltou das férias acima do peso. As medições não agradaram ao clube.`,
          de:`${c.p.n} kam mit ein paar Kilo zu viel aus der Pause zurück. Die Messwerte haben dem Verein nicht gefallen.`,
          fr:`${c.p.n} est revenu de vacances avec des kilos en trop. Les mesures n'ont pas plu au club.`,
          it:`${c.p.n} è tornato dalle vacanze appesantito. Le misurazioni non sono piaciute al club.`}),
 opts:[
  {t:{tr:'Özel kondisyoner tut',en:'Hire a private fitness coach',es:'Contrata a un preparador físico particular',pt:'Contrate um preparador físico particular',de:'Engagiere einen privaten Fitnesstrainer',fr:'Engager un préparateur physique privé',it:'Ingaggia un preparatore atletico privato'},
   eff:()=>({cash:-40,form:10,trust:4,msg:{tr:'Üç haftada toparladı. Kimse bir daha konuşmadı.',en:'Three weeks and it was gone. Nobody mentioned it again.',es:'Tres semanas y fuera. Nadie volvió a mencionarlo.',pt:'Três semanas e acabou. Ninguém tocou mais no assunto.',de:'Drei Wochen, und es war weg. Niemand hat es mehr erwähnt.',fr:"Trois semaines et c'était réglé. Personne n'en a reparlé.",it:'Tre settimane ed era sparito. Nessuno ne ha più parlato.'}})},
  {t:{tr:'Kulübün programına bırak',en:'Leave it to the club\'s programme',es:'Déjalo en manos del programa del club',pt:'Deixe com o programa do clube',de:'Überlass es dem Programm des Vereins',fr:'Laisser faire le programme du club',it:'Lascialo al programma del club'},
   eff:()=>RF()<0.55?{form:5,msg:{tr:'Kulüp halletti. Yavaş ama oldu.',en:'The club handled it. Slowly, but it happened.',es:'El club se encargó. Despacio, pero se hizo.',pt:'O clube cuidou disso. Devagar, mas aconteceu.',de:'Der Verein hat sich darum gekümmert. Langsam, aber es hat geklappt.',fr:"Le club s'en est occupé. Lentement, mais c'est fait.",it:'Se ne è occupato il club. Lentamente, ma è successo.'}}
                    :{form:-5,morale:-3,msg:{tr:'Program işe yaramadı, kadro dışı kaldığı haftalar oldu.',en:'The programme didn\'t take. He lost weeks out of the squad.',es:'El programa no funcionó. Pasó semanas fuera de la convocatoria.',pt:'O programa não deu certo. Ele ficou semanas fora do time.',de:'Das Programm hat nicht gegriffen. Er war wochenlang nicht im Kader.',fr:"Le programme n'a pas pris. Il a passé des semaines hors du groupe.",it:'Il programma non ha funzionato. È rimasto fuori dai convocati per settimane.'}}},
  {t:{tr:'Üstüne sert git',en:'Come down hard on him',es:'Sé duro con él',pt:'Pegue pesado com ele',de:'Greif hart durch',fr:'Être dur avec lui',it:'Usa il pugno duro'},
   eff:()=>({trust:-5,form:12,morale:-5,msg:{tr:'Hoşuna gitmedi ama sahaya bambaşka döndü.',en:'He hated it, and came back a different player.',es:'Lo odió, y volvió siendo otro jugador.',pt:'Ele odiou — e voltou outro jogador.',de:'Er hat es gehasst — und kam als anderer Spieler zurück.',fr:"Il a détesté ça, et il est revenu transformé.",it:"L'ha odiato, ed è tornato un altro giocatore."}})}]},

{id:'oldClubGoal',cat:'player',w:8,sz:'s',need:'client',when:c=>!isFree(c.p)&&(c.p.hist||[]).length>0,
 ttl:()=>({tr:'Eski takımına gol',en:'A goal against his old club',es:'Un gol a su exequipo',pt:'Um gol contra o ex-clube',de:'Ein Tor gegen den Ex-Verein',fr:'Un but contre son ancien club',it:'Un gol alla sua ex squadra'}),
 txt:c=>({tr:`${c.p.n} eski kulübüne gol attı ve ne yapacağını bilemedi. Sonrasında sana soruyor.`,
          en:`${c.p.n} scored against his old club and froze. Afterwards he asks you what he should have done.`,
          es:`${c.p.n} marcó contra su antiguo club y se quedó helado. Después te pregunta qué debería haber hecho.`,
          pt:`${c.p.n} marcou contra o ex-clube e travou. Depois ele te pergunta o que deveria ter feito.`,
          de:`${c.p.n} hat gegen seinen alten Verein getroffen und ist erstarrt. Hinterher fragt er dich, was er hätte tun sollen.`,
          fr:`${c.p.n} a marqué contre son ancien club et s'est figé. Après coup, il te demande ce qu'il aurait dû faire.`,
          it:`${c.p.n} ha segnato contro la sua ex squadra ed è rimasto di sasso. Dopo ti chiede cosa avrebbe dovuto fare.`}),
 opts:[
  {t:{tr:'Sevinme, saygı göster',en:'Don\'t celebrate — show respect',es:'No lo celebres: muestra respeto',pt:'Não comemore — mostre respeito',de:'Kein Jubel — zeig Respekt',fr:'Ne pas célébrer : montrer du respect',it:'Non esultare: mostra rispetto'},
   eff:()=>({rep:1,msg:{tr:'Elini kaldırıp özür diledi. İki tarafın da taraftarı bunu sevdi.',
                        en:'He raised a hand and apologised. Both sets of supporters liked it.',
                        es:'Levantó la mano y pidió perdón. A las dos aficiones les gustó.',
                        pt:'Ele levantou a mão e pediu desculpas. As duas torcidas gostaram.',
                        de:'Er hob die Hand und entschuldigte sich. Beiden Fanlagern hat es gefallen.',
                        fr:"Il a levé la main et s'est excusé. Les deux camps de supporters ont apprécié.",
                        it:'Ha alzato la mano e chiesto scusa. È piaciuto a entrambe le tifoserie.'}})},
  {t:{tr:'Coş, o senin golün',en:'Celebrate — it\'s his goal',es:'Celébralo: es su gol',pt:'Comemore — o gol é dele',de:'Jubeln — es ist sein Tor',fr:"Célébrer : c'est son but",it:'Esulta: è il suo gol'},
   eff:()=>RF()<0.6?{morale:7,msg:{tr:'Köşe direğine koştu. Kendi taraftarı bayıldı.',en:'He ran to the corner flag. His own end loved it.',es:'Corrió al banderín de córner. Su afición lo adoró.',pt:'Ele correu para a bandeirinha de escanteio. A torcida dele adorou.',de:'Er ist zur Eckfahne gelaufen. Seine Kurve hat es geliebt.',fr:'Il a couru au poteau de corner. Ses supporters ont adoré.',it:"È corso alla bandierina del calcio d'angolo. I suoi tifosi hanno adorato."}}
                   :{morale:7,rep:-2,msg:{tr:'Kendi taraftarı bayıldı, eskiler affetmedi. Adın günlerce anıldı.',
                                          en:'His own end loved it. His old one didn\'t forget. Your name was in it for days.',
                                          es:'Su afición lo adoró. La antigua no lo olvidó. Tu nombre salió en todo aquello durante días.',
                                          pt:'A torcida dele adorou. A antiga não esqueceu. Seu nome ficou no meio da confusão por dias.',
                                          de:'Seine Kurve hat es geliebt. Die alte hat es nicht vergessen. Dein Name stand tagelang mit drin.',
                                          fr:"Ses supporters ont adoré. Les anciens n'ont pas oublié. Ton nom a été mêlé à l'affaire pendant des jours.",
                                          it:"I suoi tifosi hanno adorato. Quelli di prima non hanno dimenticato. Il tuo nome è finito in mezzo per giorni."}}},
  {t:{tr:'Ona bırak',en:'His call',es:'Que decida él',pt:'Ele decide',de:'Seine Entscheidung',fr:"C'est à lui de voir",it:'Decide lui'},
   eff:()=>RF()<0.5?{morale:3,msg:{tr:'Doğru olanı kendi buldu.',en:'He found the right thing to do on his own.',es:'Encontró él solo lo que tenía que hacer.',pt:'Ele descobriu sozinho o que era certo fazer.',de:'Er hat selbst das Richtige gefunden.',fr:'Il a trouvé tout seul la bonne attitude.',it:'Ha trovato da solo la cosa giusta da fare.'}}
                   :{msg:{tr:'Ne yaptığını kendisi de bilmiyor. Kimse de umursamadı.',en:'He isn\'t sure what he did. Nobody minded either way.',es:'No tiene claro qué hizo. A nadie le importó, ni para bien ni para mal.',pt:'Ele não sabe bem o que fez. Ninguém se importou, nem para o bem nem para o mal.',de:'Er weiß nicht genau, was er getan hat. Es hat so oder so niemanden gestört.',fr:"Il ne sait pas trop ce qu'il a fait. Personne n'y a prêté attention, ni dans un sens ni dans l'autre.",it:'Non è sicuro di cosa abbia fatto. Non è importato a nessuno, né in un senso né nell’altro.'}}}]},

/* ----- büyük olaylar ----- */
{id:'familyAgent',cat:'agency',w:7,need:'client',when:c=>trustOf(c.p)<80,
 ttl:()=>({tr:'Ailede bir menajer adayı',en:'An agent in the family',es:'Un agente en la familia',pt:'Um empresário na família',de:'Ein Berater in der Familie',fr:'Un agent dans la famille',it:'Un procuratore in famiglia'}),
 txt:c=>({tr:`${c.p.n} için bir akrabası "bu işi ben de yaparım" diyormuş. Oyuncunun kulağına fısıldayıp duruyor.`,
          en:`A relative of ${c.p.n} reckons he could do your job. He keeps whispering it in the player's ear.`,
          es:`Un familiar de ${c.p.n} cree que él podría hacer tu trabajo. No para de susurrárselo al jugador.`,
          pt:`Um parente de ${c.p.n} acha que poderia fazer o seu trabalho. Vive falando isso no ouvido do jogador.`,
          de:`Ein Verwandter von ${c.p.n} glaubt, er könnte deinen Job machen. Er flüstert es dem Spieler ständig ins Ohr.`,
          fr:`Un proche de ${c.p.n} estime qu'il pourrait faire ton travail. Il ne cesse de le souffler à l'oreille du joueur.`,
          it:`Un parente di ${c.p.n} pensa di poter fare il tuo lavoro. Continua a sussurrarlo all'orecchio del giocatore.`}),
 opts:[
  {t:{tr:'Ekibine al, öğret',en:'Bring him in and teach him',es:'Acércalo y enséñale',pt:'Traga ele para perto e ensine',de:'Hol ihn rein und bring es ihm bei',fr:"L'intégrer et lui apprendre",it:'Coinvolgilo e insegnagli'},
   eff:()=>({cash:-80,trust:16,msg:{tr:'İşin içine girince zorluğunu gördü. Artık senin tarafında.',
                                    en:'He saw how hard it is once he was inside. He\'s on your side now.',
                                    es:'Vio lo difícil que es en cuanto estuvo dentro. Ahora está de tu lado.',
                                    pt:'Ele viu como é difícil quando entrou. Agora está do seu lado.',
                                    de:'Als er drin war, hat er gesehen, wie schwer es ist. Jetzt ist er auf deiner Seite.',
                                    fr:"Une fois dedans, il a vu à quel point c'est dur. Il est de ton côté maintenant.",
                                    it:"Da dentro ha visto quanto è difficile. Ora sta dalla tua parte."}})},
  {t:{tr:'Oyuncuyla açık konuş',en:'Talk to the player openly',es:'Habla abiertamente con el jugador',pt:'Converse abertamente com o jogador',de:'Sprich offen mit dem Spieler',fr:'Parler franchement au joueur',it:'Parla apertamente con il giocatore'},
   eff:c=>RF()<0.5+trustOf(c.p)/300
     ?{trust:12,rep:1,msg:{tr:'Ne yaptığını anlattın. Aralarına mesafe koydu.',en:'You showed him what you actually do. He put distance between them.',es:'Le enseñaste lo que de verdad haces. Él marcó distancias con su familiar.',pt:'Você mostrou o que realmente faz. Ele se afastou do parente.',de:'Du hast ihm gezeigt, was du wirklich tust. Er ist auf Abstand zu seinem Verwandten gegangen.',fr:"Tu lui as montré ce que tu fais vraiment. Il a pris ses distances avec son proche.",it:'Gli hai mostrato cosa fai davvero. Ha preso le distanze dal parente.'}}
     :{trust:-10,morale:-5,msg:{tr:'Kan bağı ağır bastı. "O benim ailem." Konuşma kötü bitti.',
                                en:'Blood won. "That\'s my family." The conversation ended badly.',
                                es:'Ganó la sangre. “Es mi familia.” La conversación acabó mal.',
                                pt:'O sangue falou mais alto. “É a minha família.” A conversa terminou mal.',
                                de:'Blut ist dicker. „Das ist meine Familie.“ Das Gespräch endete übel.',
                                fr:"Le sang a parlé. « C'est ma famille. » La conversation a mal fini.",
                                it:"Ha vinto il sangue. «È la mia famiglia.» La conversazione è finita male."}}},
  {t:{tr:'Sert çık',en:'Shut it down hard',es:'Córtalo de raíz',pt:'Corte o mal pela raiz',de:'Würg es hart ab',fr:'Couper court, fermement',it:'Stronca la cosa sul nascere'},
   eff:()=>({trust:-16,morale:-6,msg:{tr:'Sesini yükselttin. Sözlerin geri alınmıyor.',en:'You raised your voice. Those words don\'t come back.',es:'Levantaste la voz. Esas palabras ya no tienen vuelta atrás.',pt:'Você levantou a voz. Essas palavras não voltam atrás.',de:'Du bist laut geworden. Solche Worte lassen sich nicht zurücknehmen.',fr:'Tu as haussé le ton. Ces mots-là ne se reprennent pas.',it:'Hai alzato la voce. Certe parole non si ritirano.'}})}]},

{id:'badInvestment',cat:'finance',w:7,need:'client',when:c=>c.p.wage>=15,
 ttl:()=>({tr:'Garantili getiri',en:'A guaranteed return',es:'Una rentabilidad garantizada',pt:'Um retorno garantido',de:'Eine garantierte Rendite',fr:'Un rendement garanti',it:'Un rendimento garantito'}),
 txt:c=>({tr:`${c.p.n} bir "danışmana" güvenip birikiminin çoğunu bir yatırıma koymuş. Para yok.`,
          en:`${c.p.n} trusted an "adviser" and put most of his savings into an investment. The money is gone.`,
          es:`${c.p.n} se fió de un “asesor” y metió casi todos sus ahorros en una inversión. El dinero se ha esfumado.`,
          pt:`${c.p.n} confiou num “consultor” e colocou quase todas as economias num investimento. O dinheiro sumiu.`,
          de:`${c.p.n} hat einem „Berater“ vertraut und den Großteil seiner Ersparnisse in eine Anlage gesteckt. Das Geld ist weg.`,
          fr:`${c.p.n} a fait confiance à un « conseiller » et a placé l'essentiel de ses économies dans un investissement. L'argent a disparu.`,
          it:`${c.p.n} si è fidato di un «consulente» e ha messo quasi tutti i suoi risparmi in un investimento. I soldi sono spariti.`}),
 opts:[
  {t:{tr:'Zararı sen kapat',en:'Cover the loss yourself',es:'Cubre la pérdida tú',pt:'Cubra o prejuízo do seu bolso',de:'Übernimm den Verlust selbst',fr:'Couvrir la perte toi-même',it:'Copri tu la perdita'},
   eff:c=>({cash:-Math.max(120,Math.round(c.p.wage*6)),trust:26,morale:12,
            msg:{tr:'Ağır bir fatura. Ama bu adam ömrünün sonuna kadar seninle.',
                 en:'A heavy bill. This man is with you for the rest of his career.',
                 es:'Una factura gorda. Este hombre estará contigo el resto de su carrera.',
                 pt:'Uma conta pesada. Esse cara vai estar com você pelo resto da carreira.',
                 de:'Eine dicke Rechnung. Dieser Mann bleibt für den Rest seiner Karriere bei dir.',
                 fr:"Une sacrée facture. Cet homme sera avec toi jusqu'à la fin de sa carrière.",
                 it:'Un conto salato. Quest’uomo resterà con te per il resto della carriera.'}})},
  {t:{tr:'Avukat tut, peşine düş',en:'Get a lawyer and chase it',es:'Busca un abogado y ve a por ello',pt:'Arrume um advogado e corra atrás',de:'Nimm dir einen Anwalt und geh dagegen vor',fr:'Prendre un avocat et poursuivre',it:"Prendi un avvocato e vai fino in fondo"},
   eff:c=>{const won=RF()<0.55;
     return won?{cash:Math.round(c.p.wage*4)-60,trust:12,morale:8,
                 msg:{tr:'Aylar sürdü ama paranın çoğu geri geldi.',en:'It took months, but most of it came back.',es:'Costó meses, pero recuperó la mayor parte.',pt:'Levou meses, mas a maior parte voltou.',de:'Es hat Monate gedauert, aber das meiste kam zurück.',fr:"Ça a pris des mois, mais l'essentiel est revenu.",it:'Ci sono voluti mesi, ma la maggior parte è tornata.'}}
               :{cash:-60,trust:4,morale:-4,
                 msg:{tr:'Adam ortadan kayboldu. Avukat parası cebinden gitti.',en:'The man vanished. The legal fees didn\'t.',es:'El tipo desapareció. Las costas del abogado, no.',pt:'O sujeito sumiu. Os honorários do advogado, não.',de:'Der Mann ist verschwunden. Die Anwaltskosten nicht.',fr:"L'homme a disparu. Les frais d'avocat, eux, sont restés.",it:"L'uomo è sparito. Le spese legali no."}};}},
  {t:{tr:'Ders olsun',en:'Let it be a lesson',es:'Que le sirva de lección',pt:'Que sirva de lição',de:'Lass es eine Lehre sein',fr:'Que ça lui serve de leçon',it:'Che gli serva da lezione'},
   eff:()=>({morale:-14,trust:-9,msg:{tr:'Haklıydın ve bunu söyledin. İhtiyacı olan şey bu değildi.',
                                      en:'You were right and you said so. That wasn\'t what he needed.',
                                      es:'Tenías razón y se lo dijiste. No era lo que necesitaba.',
                                      pt:'Você tinha razão e falou. Não era disso que ele precisava.',
                                      de:'Du hattest recht und hast es gesagt. Das war nicht, was er gebraucht hat.',
                                      fr:"Tu avais raison et tu l'as dit. Ce n'était pas ce dont il avait besoin.",
                                      it:"Avevi ragione e gliel'hai detto. Non era quello di cui aveva bisogno."}})}]},

{id:'deadlineDay',cat:'club',w:7,need:'client',when:c=>!isFree(c.p)&&windowOpen(),
 ttl:()=>({tr:'Son gün, son saat',en:'Deadline day',es:'Último día de mercado',pt:'Último dia da janela',de:'Deadline Day',fr:'Dernier jour du mercato',it:"L'ultimo giorno di mercato"}),
 txt:c=>({tr:`Bir kulüp ${c.p.n} için son dakikada masaya oturdu. Evrakların yetişmesine kırk dakika var ve imzalar başka şehirde.`,
          en:`A club came in for ${c.p.n} at the last minute. There are forty minutes to file the paperwork and the signatures are in another city.`,
          es:`Un club ha ido a por ${c.p.n} en el último minuto. Quedan cuarenta minutos para presentar los papeles y las firmas están en otra ciudad.`,
          pt:`Um clube apareceu por ${c.p.n} no último minuto. Faltam quarenta minutos para registrar a papelada, e as assinaturas estão em outra cidade.`,
          de:`Ein Verein hat in letzter Minute bei ${c.p.n} angeklopft. Es bleiben vierzig Minuten, um die Unterlagen einzureichen, und die Unterschriften sind in einer anderen Stadt.`,
          fr:`Un club s'est manifesté pour ${c.p.n} à la dernière minute. Il reste quarante minutes pour déposer les papiers, et les signatures sont dans une autre ville.`,
          it:`Un club si è fatto avanti per ${c.p.n} all'ultimo minuto. Restano quaranta minuti per depositare i documenti e le firme sono in un'altra città.`}),
 opts:[
  {t:{tr:'Arabaya atla, elden yetiştir',en:'Get in the car and hand-deliver it',es:'Coge el coche y llévalo en mano',pt:'Pegue o carro e entregue em mãos',de:'Setz dich ins Auto und bring es persönlich hin',fr:'Prendre la voiture et les apporter en main propre',it:'Sali in macchina e consegnali a mano'},
   eff:()=>RF()<0.72?{cash:-55,rep:3,morale:8,trust:8,
                      msg:{tr:'Son yedi dakika. Elin titriyordu ama oldu.',en:'Seven minutes to spare. Your hands were shaking. It went through.',es:'Siete minutos de margen. Te temblaban las manos. Entró.',pt:'Sete minutos de folga. Suas mãos tremiam. Deu certo.',de:'Sieben Minuten Puffer. Deine Hände haben gezittert. Es ging durch.',fr:'Sept minutes de marge. Tes mains tremblaient. Ça est passé.',it:'Sette minuti di margine. Ti tremavano le mani. È andata.'}}
                    :{cash:-55,rep:-1,morale:-6,
                      msg:{tr:'Trafik. Kapı kapandığında hâlâ yoldaydın.',en:'Traffic. You were still on the road when the window shut.',es:'Tráfico. Seguías en la carretera cuando se cerró el mercado.',pt:'Trânsito. Você ainda estava na estrada quando a janela fechou.',de:'Stau. Du warst noch unterwegs, als das Fenster zuging.',fr:'Les bouchons. Tu étais encore sur la route quand le mercato a fermé.',it:'Traffico. Eri ancora per strada quando il mercato ha chiuso.'}}},
  {t:{tr:'Kulübün memuruna bırak',en:'Leave it to the club\'s office',es:'Déjalo en manos de la oficina del club',pt:'Deixe com a secretaria do clube',de:'Überlass es der Geschäftsstelle des Vereins',fr:'Laisser faire le secrétariat du club',it:'Lascialo alla segreteria del club'},
   eff:()=>RF()<0.45?{rep:2,morale:6,msg:{tr:'Hallettiler. Sen de rahat bir nefes aldın.',en:'They got it done. You could breathe again.',es:'Lo sacaron adelante. Pudiste volver a respirar.',pt:'Eles conseguiram. Você voltou a respirar.',de:'Sie haben es geschafft. Du konntest wieder atmen.',fr:'Ils y sont arrivés. Tu as pu respirer à nouveau.',it:"Ce l'hanno fatta. Hai potuto tornare a respirare."}}
                    :{morale:-8,trust:-5,msg:{tr:'Bir belge eksikti. Transfer yattı ve suçu sen aldın.',
                                              en:'One document was missing. The move died and the blame landed on you.',
                                              es:'Faltaba un documento. La operación se cayó y la culpa recayó en ti.',
                                              pt:'Faltou um documento. A transferência morreu, e a culpa caiu em você.',
                                              de:'Ein Dokument fehlte. Der Wechsel platzte, und die Schuld landete bei dir.',
                                              fr:"Il manquait un document. Le transfert est tombé à l'eau et c'est sur toi que ça a retombé.",
                                              it:"Mancava un documento. L'affare è saltato e la colpa è ricaduta su di te."}}},
  {t:{tr:'Bu iş yaza kalsın',en:'It can wait until summer',es:'Puede esperar al verano',pt:'Pode esperar até o meio do ano',de:'Das kann bis zum Sommer warten',fr:"Ça peut attendre l'été",it:"Può aspettare l'estate"},
   eff:()=>({morale:-5,trust:-3,msg:{tr:'Belki doğru karardı. Oyuncu öyle düşünmüyor.',en:'It may have been the right call. He doesn\'t think so.',es:'Quizá fuera lo correcto. Él no lo cree.',pt:'Talvez tenha sido a decisão certa. Ele não acha.',de:'Vielleicht war es richtig. Er sieht das anders.',fr:"C'était peut-être la bonne décision. Lui ne le pense pas.",it:'Forse era la scelta giusta. Lui non la pensa così.'}})}]},

{id:'newCoach',cat:'club',w:7,need:'client',when:c=>!isFree(c.p),
 ttl:()=>({tr:'Yeni teknik direktör',en:'A new manager',es:'Un nuevo entrenador',pt:'Um novo técnico',de:'Ein neuer Trainer',fr:'Un nouvel entraîneur',it:'Un nuovo allenatore'}),
 txt:c=>({tr:`${c.tm.n} hocasını değiştirdi. Yeni isim ${c.p.n} için "planlarımda yok" demiş.`,
          en:`${c.tm.n} have changed manager. The new one has said ${c.p.n} isn't in his plans.`,
          es:`El ${c.tm.n} ha cambiado de entrenador. El nuevo ha dicho que no cuenta con ${c.p.n}.`,
          pt:`O ${c.tm.n} trocou de técnico. O novo disse que ${c.p.n} não está nos planos dele.`,
          de:`${c.tm.n} hat den Trainer gewechselt. Der neue hat gesagt, dass er nicht mit ${c.p.n} plant.`,
          fr:`${c.tm.n} a changé d'entraîneur. Le nouveau a dit que ${c.p.n} ne faisait pas partie de ses plans.`,
          it:`Il ${c.tm.n} ha cambiato allenatore. Il nuovo ha detto che ${c.p.n} non rientra nei suoi piani.`}),
 opts:[
  {t:{tr:'Hocayla tanış',en:'Get in front of the manager',es:'Ve a ver al entrenador',pt:'Vá falar com o técnico',de:'Geh zum Trainer',fr:"Aller voir l'entraîneur",it:"Vai a parlare con l'allenatore"},
   eff:()=>RF()<0.6?{cash:-50,morale:10,form:5,msg:{tr:'Bir kahve ve yirmi dakika. Fikri değişti.',en:'A coffee and twenty minutes. He changed his mind.',es:'Un café y veinte minutos. Cambió de opinión.',pt:'Um café e vinte minutos. Ele mudou de ideia.',de:'Ein Kaffee und zwanzig Minuten. Er hat seine Meinung geändert.',fr:"Un café et vingt minutes. Il a changé d'avis.",it:'Un caffè e venti minuti. Ha cambiato idea.'}}
                   :{cash:-50,morale:-5,msg:{tr:'Kibardı ama kararlıydı. Para da boşa gitti.',en:'Polite, and immovable. The money went with it.',es:'Educado, e inamovible. Y el dinero se fue con ello.',pt:'Educado, e irredutível. O dinheiro foi junto.',de:'Höflich und unnachgiebig. Das Geld war auch weg.',fr:"Poli, et inflexible. L'argent est parti avec.",it:'Cortese, e irremovibile. E i soldi sono andati con lui.'}}},
  {t:{tr:'Kış transferine hazırla',en:'Start lining up a January move',es:'Empieza a preparar una salida en enero',pt:'Comece a preparar uma saída em janeiro',de:'Bereite einen Wechsel im Januar vor',fr:'Préparer un départ en janvier',it:'Inizia a preparare una cessione a gennaio'},
   eff:()=>({trust:9,morale:6,msg:{tr:'Bir planı olduğunu bilmek onu rahatlattı.',en:'Knowing there\'s a plan settled him.',es:'Saber que había un plan lo tranquilizó.',pt:'Saber que havia um plano acalmou ele.',de:'Zu wissen, dass es einen Plan gibt, hat ihn beruhigt.',fr:"Savoir qu'il y avait un plan l'a apaisé.",it:"Sapere che c'era un piano lo ha tranquillizzato."}})},
  {t:{tr:'Bekle, gör',en:'Wait and see',es:'Espera a ver qué pasa',pt:'Espere para ver',de:'Abwarten',fr:'Attendre de voir',it:'Aspetta e vedi'},
   eff:()=>({form:-7,morale:-8,msg:{tr:'Üç ay tribünde. Kimse beklemedi, sadece unuttular.',en:'Three months in the stands. Nobody waited — they just forgot.',es:'Tres meses en la grada. Nadie esperó: simplemente se olvidaron de él.',pt:'Três meses na arquibancada. Ninguém esperou — só esqueceram dele.',de:'Drei Monate auf der Tribüne. Niemand hat gewartet — man hat ihn einfach vergessen.',fr:"Trois mois en tribune. Personne n'a attendu : on l'a juste oublié.",it:'Tre mesi in tribuna. Nessuno ha aspettato: se ne sono semplicemente dimenticati.'}})}]},

{id:'redCard',cat:'crisis',w:6,need:'client',when:c=>!isFree(c.p),
 ttl:()=>({tr:'Disiplin kurulu',en:'A disciplinary hearing',es:'Comité de disciplina',pt:'Julgamento no tribunal esportivo',de:'Eine Disziplinaranhörung',fr:'Une commission de discipline',it:'Il giudice sportivo'}),
 txt:c=>({tr:`${c.p.n} ağır bir kırmızı kart gördü. Kurul cezayı bu hafta görüşüyor.`,
          en:`${c.p.n} was sent off for a bad one. The panel hears the case this week.`,
          es:`A ${c.p.n} lo expulsaron por una entrada fea. El comité ve el caso esta semana.`,
          pt:`${c.p.n} foi expulso por uma entrada feia. O tribunal julga o caso esta semana.`,
          de:`${c.p.n} hat nach einem üblen Foul Rot gesehen. Diese Woche wird der Fall verhandelt.`,
          fr:`${c.p.n} a été expulsé pour un vilain tacle. La commission examine son cas cette semaine.`,
          it:`${c.p.n} è stato espulso per un brutto intervento. Il giudice sportivo esamina il caso questa settimana.`}),
 opts:[
  {t:{tr:'İyi bir avukatla savun',en:'Defend him properly',es:'Defiéndelo como es debido',pt:'Defenda ele direito',de:'Verteidige ihn richtig',fr:'Le défendre comme il faut',it:'Difendilo come si deve'},
   eff:()=>({cash:-95,morale:6,trust:8,msg:{tr:'Ceza yarıya indi. Arkasında durduğunu gördü.',en:'The ban was halved. He saw you stand behind him.',es:'La sanción se redujo a la mitad. Vio que lo respaldabas.',pt:'A suspensão caiu pela metade. Ele viu que você estava do lado dele.',de:'Die Sperre wurde halbiert. Er hat gesehen, dass du hinter ihm stehst.',fr:'La suspension a été réduite de moitié. Il a vu que tu le soutenais.',it:'La squalifica è stata dimezzata. Ha visto che gli coprivi le spalle.'}})},
  {t:{tr:'Özür ve gönüllü ceza',en:'Apologise and accept it',es:'Pide perdón y acéptalo',pt:'Peça desculpas e aceite',de:'Entschuldige dich und akzeptier es',fr:"S'excuser et accepter",it:'Chiedi scusa e accetta'},
   eff:()=>({rep:2,morale:-6,form:-5,msg:{tr:'Doğru olanı yaptın. Ona pahalıya patladı.',en:'You did the right thing. It cost him.',es:'Hiciste lo correcto. A él le costó caro.',pt:'Você fez a coisa certa. Custou caro para ele.',de:'Du hast das Richtige getan. Ihn hat es gekostet.',fr:"Tu as fait ce qu'il fallait. Ça lui a coûté.",it:'Hai fatto la cosa giusta. A lui è costata.'}})},
  {t:{tr:'Savaş aç',en:'Fight it publicly',es:'Pelea en público',pt:'Brigue publicamente',de:'Wehr dich öffentlich',fr:'Se battre publiquement',it:'Dai battaglia in pubblico'},
   eff:()=>RF()<0.6?{rep:-1,morale:3,msg:{tr:'Ceza aynı kaldı ama oyuncu yalnız olmadığını hissetti.',en:'The ban stood, but he didn\'t feel alone.',es:'La sanción se mantuvo, pero él no se sintió solo.',pt:'A suspensão foi mantida, mas ele não se sentiu sozinho.',de:'Die Sperre blieb, aber er fühlte sich nicht allein.',fr:"La suspension a été maintenue, mais il ne s'est pas senti seul.",it:'La squalifica è rimasta, ma lui non si è sentito solo.'}}
                   :{rep:-4,morale:-10,form:-8,msg:{tr:'Kurul kızdı, ceza uzadı. Herkes senin yüzünden olduğunu biliyor.',
                                                    en:'The panel took offence and extended it. Everyone knows why.',
                                                    es:'Al comité le sentó fatal y la amplió. Todo el mundo sabe por qué.',
                                                    pt:'O tribunal se ofendeu e aumentou a pena. Todo mundo sabe por quê.',
                                                    de:'Das Gremium fühlte sich angegriffen und hat verlängert. Jeder weiß, warum.',
                                                    fr:"La commission l'a mal pris et a alourdi la sanction. Tout le monde sait pourquoi.",
                                                    it:"Il giudice se l'è presa e l'ha allungata. Tutti sanno perché."}}}]},

{id:'unpaidBonus',cat:'club',w:6,need:'client',when:c=>!isFree(c.p),
 ttl:()=>({tr:'Ödenmeyen imza parası',en:'The bonus that never came',es:'La prima que nunca llegó',pt:'As luvas que nunca chegaram',de:'Das Handgeld, das nie kam',fr:'La prime qui ne venait jamais',it:'Il premio che non arrivava mai'}),
 txt:c=>({tr:`${c.tm.n} taahhüt ettiği imza bedelini aylardır geciktiriyor. ${c.p.n} sana soruyor.`,
          en:`${c.tm.n} have been sitting on the signing fee for months. ${c.p.n} is asking you about it.`,
          es:`El ${c.tm.n} lleva meses sin pagar la prima de fichaje. ${c.p.n} te pregunta por ello.`,
          pt:`O ${c.tm.n} está segurando as luvas há meses. ${c.p.n} está te perguntando sobre isso.`,
          de:`${c.tm.n} sitzt seit Monaten auf dem Handgeld. ${c.p.n} fragt dich danach.`,
          fr:`${c.tm.n} traîne depuis des mois pour verser la prime à la signature. ${c.p.n} t'en parle.`,
          it:`Il ${c.tm.n} sta trattenendo da mesi il premio alla firma. ${c.p.n} ti chiede notizie.`}),
 opts:[
  {t:{tr:'Sessizce diren, ödet',en:'Push quietly until they pay',es:'Presiona con discreción hasta que paguen',pt:'Pressione com discrição até pagarem',de:'Mach leise Druck, bis sie zahlen',fr:"Mettre la pression en douce jusqu'à ce qu'ils paient",it:'Fai pressione in silenzio finché non pagano'},
   eff:c=>RF()<0.65?{cash:Math.round(c.p.wage*8),trust:10,msg:{tr:'Gürültü çıkarmadan aldın. En iyi menajerlik böyle görünür.',
                                                               en:'You got it without a sound. That\'s what good agency looks like.',
                                                               es:'Lo conseguiste sin hacer ruido. Así se ve un buen agente.',
                                                               pt:'Você conseguiu sem barulho. É assim que trabalha um bom empresário.',
                                                               de:'Du hast es ohne Aufsehen bekommen. So sieht gute Beratung aus.',
                                                               fr:"Tu l'as obtenue sans bruit. Voilà à quoi ressemble un bon agent.",
                                                               it:"L'hai ottenuto senza clamore. Ecco cosa vuol dire essere un buon procuratore."}}
                   :{trust:-4,msg:{tr:'Oyalandın ve oyalandın. Hâlâ ödenmedi.',en:'You were passed along and along. Still unpaid.',es:'Te fueron pasando de uno a otro. Sigue sin cobrar.',pt:'Te empurraram de um para outro. Continua sem receber.',de:'Du wurdest von einem zum Nächsten weitergereicht. Immer noch nicht bezahlt.',fr:"On t'a renvoyé de bureau en bureau. Toujours pas payé.",it:"Ti hanno rimbalzato da uno all'altro. Ancora niente soldi."}}},
  {t:{tr:'Resmî şikâyette bulun',en:'File a formal complaint',es:'Presenta una queja formal',pt:'Faça uma reclamação formal',de:'Reich eine offizielle Beschwerde ein',fr:'Déposer une plainte officielle',it:'Presenta un reclamo formale'},
   eff:c=>({cash:Math.round(c.p.wage*10),rep:-3,
            msg:{tr:'Para geldi. Bu kulüple bir daha kolay iş yapamazsın — diğerleri de duydu.',
                 en:'The money came. You won\'t deal easily with this club again — and the others heard.',
                 es:'Llegó el dinero. Con este club no volverás a tratar fácilmente, y los demás se han enterado.',
                 pt:'O dinheiro veio. Você não vai negociar fácil com esse clube de novo — e os outros ficaram sabendo.',
                 de:'Das Geld kam. Mit diesem Verein wirst du nicht mehr leicht ins Geschäft kommen — und die anderen haben es mitbekommen.',
                 fr:"L'argent est arrivé. Tu ne traiteras plus facilement avec ce club, et les autres l'ont su.",
                 it:"I soldi sono arrivati. Con questo club non tratterai più facilmente, e gli altri lo hanno saputo."}})},
  {t:{tr:'Sabır iste',en:'Ask him to be patient',es:'Pídele paciencia',pt:'Peça paciência a ele',de:'Bitte ihn um Geduld',fr:'Lui demander de patienter',it:'Chiedigli di avere pazienza'},
   eff:()=>({trust:-9,morale:-4,msg:{tr:'"Sen kimin tarafındasın?" Cevabın yoktu.',en:'"Whose side are you on?" You didn\'t have an answer.',es:'“¿Tú de parte de quién estás?” No tenías respuesta.',pt:'“Você está do lado de quem?” Você não teve resposta.',de:'„Auf wessen Seite stehst du eigentlich?“ Du hattest keine Antwort.',fr:"« Tu es de quel côté ? » Tu n'as pas su quoi répondre.",it:"«Ma tu da che parte stai?» Non hai saputo rispondere."}})}]},

{id:'nationalTeam',cat:'player',w:6,need:'client',when:c=>c.p.age<=24,
 ttl:()=>({tr:'İki bayrak',en:'Two flags',es:'Dos banderas',pt:'Duas bandeiras',de:'Zwei Flaggen',fr:'Deux drapeaux',it:'Due bandiere'}),
 txt:c=>({tr:`${c.p.n} iki ülkeye de oynayabiliyor ve ikisi de arıyor. Karar onun ama fikrini soruyor.`,
          en:`${c.p.n} is eligible for two countries and both have called. It's his decision, but he's asking you.`,
          es:`${c.p.n} puede jugar con dos selecciones y las dos le han llamado. La decisión es suya, pero te pregunta a ti.`,
          pt:`${c.p.n} pode defender duas seleções, e as duas ligaram. A decisão é dele, mas ele está te perguntando.`,
          de:`${c.p.n} ist für zwei Länder spielberechtigt, und beide haben angerufen. Es ist seine Entscheidung, aber er fragt dich.`,
          fr:`${c.p.n} peut jouer pour deux sélections, et les deux l'ont appelé. C'est sa décision, mais il te demande ton avis.`,
          it:`${c.p.n} può giocare per due nazionali, e lo hanno chiamato entrambe. La decisione è sua, ma chiede a te.`}),
 opts:[
  {t:{tr:'Güçlü olanı seç',en:'Take the bigger one',es:'Que elija la más grande',pt:'Escolha a maior',de:'Nimm das größere Land',fr:'Choisir la plus grande',it:'Scegli la più grande'},
   eff:()=>RF()<0.45?{rep:4,morale:10,trust:6,msg:{tr:'İlk maçta oynadı. Bir anda başka bir oyuncu oldu.',
                                                   en:'He played in the first camp. Overnight he became a different player.',
                                                   es:'Jugó en la primera convocatoria. De la noche a la mañana se convirtió en otro jugador.',
                                                   pt:'Ele jogou na primeira convocação. Da noite para o dia, virou outro jogador.',
                                                   de:'Er hat beim ersten Lehrgang gespielt. Über Nacht wurde er ein anderer Spieler.',
                                                   fr:"Il a joué dès le premier rassemblement. Du jour au lendemain, il est devenu un autre joueur.",
                                                   it:'Ha giocato nel primo raduno. Da un giorno all’altro è diventato un altro giocatore.'}}
                    :{morale:-8,form:-4,msg:{tr:'Kadroya bir daha çağrılmadı. Diğer kapı da kapandı.',
                                             en:'He was never called again. And the other door had closed.',
                                             es:'No volvieron a llamarle. Y la otra puerta se había cerrado.',
                                             pt:'Nunca mais foi convocado. E a outra porta tinha se fechado.',
                                             de:'Er wurde nie wieder berufen. Und die andere Tür war zu.',
                                             fr:"Il n'a plus jamais été appelé. Et l'autre porte s'était refermée.",
                                             it:"Non l'hanno più chiamato. E l'altra porta si era chiusa."}}},
  {t:{tr:'Doğduğu yeri seç',en:'Take the one he grew up with',es:'Que elija con la que creció',pt:'Escolha aquela com que ele cresceu',de:'Nimm das Land, in dem er aufgewachsen ist',fr:"Choisir celle avec laquelle il a grandi",it:'Scegli quella con cui è cresciuto'},
   eff:()=>({morale:12,trust:10,msg:{tr:'Marşı söylerken ağladı. Bunu sana borçlu olduğunu biliyor.',
                                     en:'He cried during the anthem. He knows who told him to.',
                                     es:'Lloró con el himno. Sabe quién se lo aconsejó.',
                                     pt:'Ele chorou no hino. Ele sabe quem aconselhou.',
                                     de:'Bei der Hymne hat er geweint. Er weiß, wer ihm dazu geraten hat.',
                                     fr:"Il a pleuré pendant l'hymne. Il sait qui le lui a conseillé.",
                                     it:"Ha pianto durante l'inno. Sa chi gliel'ha consigliato."}})},
  {t:{tr:'Acele etmesin',en:'Tell him not to rush',es:'Dile que no se precipite',pt:'Diga para ele não ter pressa',de:'Sag ihm, er soll nichts überstürzen',fr:'Lui dire de ne pas se précipiter',it:'Digli di non avere fretta'},
   eff:()=>({morale:-5,trust:-4,msg:{tr:'Bekledi ve iki taraf da soğudu. Kararsızlık da bir karardır.',
                                     en:'He waited, and both went cold. Indecision is a decision.',
                                     es:'Esperó, y las dos se enfriaron. No decidir también es decidir.',
                                     pt:'Ele esperou, e as duas esfriaram. Indecisão também é decisão.',
                                     de:'Er hat gewartet, und beide sind abgekühlt. Nicht entscheiden ist auch eine Entscheidung.',
                                     fr:"Il a attendu, et les deux se sont refroidies. L'indécision est une décision.",
                                     it:"Ha aspettato, e si sono raffreddate entrambe. Anche non decidere è una decisione."}})}]},

{id:'documentary',cat:'media',w:6,need:'client',when:c=>c.p.r>=70,
 ttl:()=>({tr:'Belgesel teklifi',en:'A documentary crew',es:'Un equipo de documental',pt:'Uma equipe de documentário',de:'Ein Dokumentarfilm-Team',fr:'Une équipe de documentaire',it:'Una troupe per un documentario'}),
 txt:c=>({tr:`Bir yapım şirketi ${c.p.n} için bir sezonluk belgesel çekmek istiyor. Kamera her yerde olacak.`,
          en:`A production company wants to follow ${c.p.n} for a season. The camera would be everywhere.`,
          es:`Una productora quiere seguir a ${c.p.n} durante una temporada. La cámara estaría en todas partes.`,
          pt:`Uma produtora quer acompanhar ${c.p.n} por uma temporada. A câmera estaria em todo lugar.`,
          de:`Eine Produktionsfirma will ${c.p.n} eine Saison lang begleiten. Die Kamera wäre überall.`,
          fr:`Une société de production veut suivre ${c.p.n} pendant une saison. La caméra serait partout.`,
          it:`Una casa di produzione vuole seguire ${c.p.n} per una stagione. La telecamera sarebbe ovunque.`}),
 opts:[
  {t:{tr:'Kabul et',en:'Say yes',es:'Di que sí',pt:'Diga sim',de:'Sag zu',fr:'Dire oui',it:'Di’ di sì'},
   eff:c=>({cash:Math.round(valueOf(c.p)*14),rep:2,form:-8,
            msg:{tr:'İyi para ve iyi tanıtım. Kamera soyunma odasına girince futbol biraz geri kaldı.',
                 en:'Good money, good exposure. With a camera in the dressing room, the football slipped a little.',
                 es:'Buen dinero, buena visibilidad. Con una cámara en el vestuario, el fútbol se resintió un poco.',
                 pt:'Bom dinheiro, boa exposição. Com uma câmera no vestiário, o futebol caiu um pouco.',
                 de:'Gutes Geld, gute Präsenz. Mit einer Kamera in der Kabine hat der Fußball etwas gelitten.',
                 fr:"Bon argent, belle exposition. Avec une caméra dans le vestiaire, le football en a un peu pâti.",
                 it:'Bei soldi, bella visibilità. Con una telecamera nello spogliatoio, il calcio ne ha un po’ risentito.'}})},
  {t:{tr:'Sadece sezon sonu çeksinler',en:'Only at the end of the season',es:'Solo al final de la temporada',pt:'Só no fim da temporada',de:'Nur zum Saisonende',fr:'Seulement en fin de saison',it:'Solo a fine stagione'},
   eff:c=>({cash:Math.round(valueOf(c.p)*5),rep:1,
            msg:{tr:'Az para, sıfır risk. İki taraf da razı.',en:'Less money, no risk. Both sides content.',es:'Menos dinero, ningún riesgo. Todos contentos.',pt:'Menos dinheiro, nenhum risco. Os dois lados satisfeitos.',de:'Weniger Geld, kein Risiko. Beide Seiten zufrieden.',fr:'Moins d’argent, aucun risque. Tout le monde est content.',it:'Meno soldi, nessun rischio. Contenti tutti.'}})},
  {t:{tr:'Reddet',en:'Decline',es:'Recházalo',pt:'Recuse',de:'Lehn ab',fr:'Refuser',it:'Rifiuta'},
   eff:()=>({trust:4,msg:{tr:'"Sen benim işimi düşünüyorsun." Aynen öyle.',en:'"You\'re thinking about my football." Exactly.',es:'“Estás pensando en mi fútbol.” Exacto.',pt:'“Você está pensando no meu futebol.” Exatamente.',de:'„Du denkst an meinen Fußball.“ Genau.',fr:"« Tu penses à mon football. » Exactement.",it:"«Stai pensando al mio calcio.» Esatto."}})}]},

{id:'tpoOffer',cat:'finance',w:6,need:'client',when:c=>!isFree(c.p)&&c.p.pot-c.p.r>=6,
 ttl:()=>({tr:'Geleceğine yatırım',en:'An investment in his future',es:'Una inversión en su futuro',pt:'Um investimento no futuro dele',de:'Eine Investition in seine Zukunft',fr:'Un investissement sur son avenir',it:'Un investimento sul suo futuro'}),
 txt:c=>({tr:`Bir fon ${c.p.n} için şimdi para veriyor. Karşılığında bir sonraki transferinden senin payın onların oluyor.`,
          en:`A fund will pay you now for ${c.p.n}. In return, your cut of his next transfer becomes theirs.`,
          es:`Un fondo te paga ahora por ${c.p.n}. A cambio, tu parte de su próximo traspaso pasa a ser suya.`,
          pt:`Um fundo te paga agora por ${c.p.n}. Em troca, sua parte na próxima transferência dele passa a ser deles.`,
          de:`Ein Fonds zahlt dir jetzt Geld für ${c.p.n}. Im Gegenzug gehört dein Anteil an seinem nächsten Transfer ihnen.`,
          fr:`Un fonds te paie maintenant pour ${c.p.n}. En échange, ta part sur son prochain transfert lui revient.`,
          it:`Un fondo ti paga subito per ${c.p.n}. In cambio, la tua quota sul suo prossimo trasferimento diventa loro.`}),
 opts:[
  {t:{tr:'Kabul et',en:'Take the money',es:'Coge el dinero',pt:'Pegue o dinheiro',de:'Nimm das Geld',fr:"Prendre l'argent",it:'Prendi i soldi'},
   /* Ödeme, bir sonraki satıştan beklenen komisyonun yaklaşık yarısı: bugünkü
      kesin para, yarınki büyük paranın yerine geçiyor. */
   eff:c=>({cash:Math.round(valueOf(c.p)*90),flag:'tpo',trust:-4,
            msg:{tr:'Para bugün cebinde. Bir dahaki satıştan sana bir kuruş yok.',
                 en:'The money is in your pocket today. His next sale pays you nothing.',
                 es:'El dinero está hoy en tu bolsillo. Su próxima venta no te dará nada.',
                 pt:'O dinheiro está no seu bolso hoje. A próxima venda dele não te paga nada.',
                 de:'Das Geld ist heute in deiner Tasche. Sein nächster Verkauf bringt dir nichts.',
                 fr:"L'argent est dans ta poche aujourd'hui. Sa prochaine vente ne te rapportera rien.",
                 it:'Oggi i soldi sono in tasca. La sua prossima cessione non ti darà niente.'}})},
  {t:{tr:'Oyuncuya sor',en:'Ask the player',es:'Pregúntale al jugador',pt:'Pergunte ao jogador',de:'Frag den Spieler',fr:'Demander au joueur',it:'Chiedi al giocatore'},
   eff:c=>RF()<0.5
     ?{cash:Math.round(valueOf(c.p)*55),flag:'tpo',trust:8,
       msg:{tr:'Birlikte karar verdiniz, daha küçük bir rakama razı oldu. Ama sorduğunu unutmayacak.',
            en:'You decided together and settled for less. He won\'t forget that you asked.',
            es:'Lo decidisteis juntos y os conformasteis con menos. No olvidará que se lo preguntaste.',
            pt:'Vocês decidiram juntos e aceitaram menos. Ele não vai esquecer que você perguntou.',
            de:'Ihr habt gemeinsam entschieden und euch mit weniger begnügt. Er wird nicht vergessen, dass du gefragt hast.',
            fr:"Vous avez décidé ensemble et accepté moins. Il n'oubliera pas que tu lui as demandé.",
            it:"Avete deciso insieme e vi siete accontentati di meno. Non dimenticherà che gliel'hai chiesto."}}
     :{trust:8,rep:1,msg:{tr:'"Benim geleceğim satılık değil." Haklıydı ve sen de sordun.',
                          en:'"My future isn\'t for sale." He was right — and you asked.',
                          es:'“Mi futuro no está en venta.” Tenía razón, y tú preguntaste.',
                          pt:'“Meu futuro não está à venda.” Ele tinha razão — e você perguntou.',
                          de:'„Meine Zukunft steht nicht zum Verkauf.“ Er hatte recht — und du hast gefragt.',
                          fr:"« Mon avenir n'est pas à vendre. » Il avait raison, et tu as demandé.",
                          it:"«Il mio futuro non è in vendita.» Aveva ragione, e tu hai chiesto."}}},
  {t:{tr:'Reddet',en:'Refuse',es:'Niégate',pt:'Recuse',de:'Lehn ab',fr:'Refuser',it:'Rifiuta'},
   eff:()=>({rep:2,msg:{tr:'Bu tür fonlarla çalışmayan bir isim olarak anıldın.',en:'You became known as someone who doesn\'t work with those funds.',es:'Te ganaste fama de no trabajar con esos fondos.',pt:'Você ficou conhecido como alguém que não trabalha com esses fundos.',de:'Man kennt dich jetzt als jemanden, der mit solchen Fonds nicht arbeitet.',fr:'On te connaît désormais comme quelqu’un qui ne travaille pas avec ces fonds.',it:'Ti sei fatto la nomea di chi non lavora con quei fondi.'}})}]},

/* ================= MENAJERLE İLGİLİ ================= */
{id:'taxAudit',cat:'crisis',w:6,
 ttl:()=>({tr:'Vergi incelemesi',en:'Tax inspection',es:'Inspección fiscal',pt:'Fiscalização da Receita',de:'Steuerprüfung',fr:'Contrôle fiscal',it:'Controllo fiscale'}),
 txt:()=>({tr:'Ajansına inceleme açıldı. Kağıtlar duruyor ama süreç karışık ve zaman alacak.',
           en:'Your agency is under inspection. The paperwork is in order, but the process is messy and slow.',
           es:'Hacienda está inspeccionando tu agencia. Los papeles están en orden, pero el proceso es lento y engorroso.',
           pt:'Sua agência está sendo fiscalizada. A papelada está em ordem, mas o processo é lento e complicado.',
           de:'Deine Agentur wird geprüft. Die Unterlagen sind in Ordnung, aber das Verfahren ist zäh und mühsam.',
           fr:"Ton agence fait l'objet d'un contrôle. Les papiers sont en règle, mais la procédure est longue et pénible.",
           it:"La tua agenzia è sotto controllo. I documenti sono in ordine, ma la procedura è lenta e complicata."}),
 opts:[
  {t:{tr:'İyi bir mali müşavir tut',en:'Hire a proper accountant',es:'Contrata a un buen contable',pt:'Contrate um contador de verdade',de:'Engagiere einen richtigen Steuerberater',fr:'Engager un vrai comptable',it:'Ingaggia un commercialista serio'},
   eff:()=>({cash:-120,rep:1,msg:{tr:'Temiz çıktın. Pahalıya patladı ama adın lekelenmedi.',
                                  en:'You came out clean. Expensive, but your name is intact.',
                                  es:'Saliste limpio. Caro, pero tu nombre sigue intacto.',
                                  pt:'Você saiu limpo. Caro, mas seu nome continua intacto.',
                                  de:'Du bist sauber rausgekommen. Teuer, aber dein Name ist unbeschadet.',
                                  fr:"Tu t'en sors blanchi. Cher, mais ton nom est intact.",
                                  it:'Ne sei uscito pulito. Caro, ma il tuo nome è intatto.'}})},
  {t:{tr:'Kendin hallet',en:'Handle it yourself',es:'Encárgate tú mismo',pt:'Resolva você mesmo',de:'Kümmer dich selbst darum',fr:"T'en occuper toi-même",it:'Occupatene tu'},
   eff:()=>RF()<0.5
     ?{msg:{tr:'Haftalarca uğraştın ama kapandı. Kimse bir şey duymadı.',
             en:'Weeks of paperwork, but it closed. Nobody heard a thing.',
             es:'Semanas de papeleo, pero se cerró. Nadie se enteró de nada.',
             pt:'Semanas de papelada, mas encerrou. Ninguém ficou sabendo de nada.',
             de:'Wochen voller Papierkram, aber es ist erledigt. Niemand hat etwas mitbekommen.',
             fr:"Des semaines de paperasse, mais c'est bouclé. Personne n'a rien su.",
             it:"Settimane di scartoffie, ma si è chiusa. Nessuno ha saputo niente."}}
     :{cash:-260,rep:-3,msg:{tr:'Bir eksik belge, ceza ve dedikodu. Kötü bir dönem.',
                             en:'One missing document, a fine, and gossip. A bad stretch.',
                             es:'Un documento que faltaba, una multa y habladurías. Una mala racha.',
                             pt:'Um documento faltando, uma multa e fofoca. Uma fase ruim.',
                             de:'Ein fehlendes Dokument, eine Strafe und Gerede. Eine schlechte Phase.',
                             fr:"Un document manquant, une amende et des ragots. Une mauvaise passe.",
                             it:'Un documento mancante, una multa e chiacchiere. Un brutto periodo.'}}}]},

{id:'interview',cat:'media',w:6,
 ttl:()=>({tr:'Röportaj teklifi',en:'An interview request',es:'Una petición de entrevista',pt:'Um pedido de entrevista',de:'Eine Interviewanfrage',fr:"Une demande d'interview",it:"Una richiesta d'intervista"}),
 txt:()=>({tr:'Tanınmış bir spor dergisi seninle portre röportajı yapmak istiyor.',
           en:'A well-known sports magazine wants to profile you.',
           es:'Una conocida revista deportiva quiere hacerte un perfil.',
           pt:'Uma revista esportiva conhecida quer fazer um perfil seu.',
           de:'Ein bekanntes Sportmagazin will ein Porträt über dich bringen.',
           fr:'Un magazine sportif connu veut faire ton portrait.',
           it:'Una nota rivista sportiva vuole farti un ritratto.'}),
 opts:[
  {t:{tr:'Kabul et, açık konuş',en:'Accept and speak openly',es:'Acepta y habla con franqueza',pt:'Aceite e fale abertamente',de:'Sag zu und sprich offen',fr:'Accepter et parler franchement',it:'Accetta e parla apertamente'},
   eff:()=>RF()<0.62?{rep:3,msg:{tr:'İyi geçti. Adın daha çok kapıyı açıyor artık.',en:'It went well. Your name opens more doors now.',es:'Salió bien. Ahora tu nombre abre más puertas.',pt:'Foi bem. Agora seu nome abre mais portas.',de:'Es lief gut. Dein Name öffnet jetzt mehr Türen.',fr:"Ça s'est bien passé. Ton nom ouvre plus de portes maintenant.",it:'È andata bene. Ora il tuo nome apre più porte.'}}
                   :{rep:-2,msg:{tr:'Bir cümlen bağlamından koparıldı. Küçük bir tatsızlık.',en:'A line was taken out of context. A minor mess.',es:'Sacaron una frase de contexto. Un lío menor.',pt:'Tiraram uma frase de contexto. Uma confusãozinha.',de:'Ein Satz wurde aus dem Zusammenhang gerissen. Ein kleines Durcheinander.',fr:'Une phrase a été sortie de son contexte. Un petit couac.',it:'Una frase è stata estrapolata dal contesto. Un piccolo pasticcio.'}}},
  {t:{tr:'Ücret talep et',en:'Ask for a fee',es:'Pide que te paguen',pt:'Cobre um cachê',de:'Verlang ein Honorar',fr:'Demander à être payé',it:'Chiedi un compenso'},
   eff:()=>({cash:35,rep:-2,msg:{tr:'Ödediler ama "para canlısı" etiketini de yapıştırdılar.',
                                 en:'They paid — and quietly filed you under "money first".',
                                 es:'Pagaron, y te archivaron discretamente como “el dinero primero”.',
                                 pt:'Eles pagaram — e discretamente te colocaram na pasta “dinheiro em primeiro lugar”.',
                                 de:'Sie haben gezahlt — und dich stillschweigend unter „Geld zuerst“ abgelegt.',
                                 fr:"Ils ont payé, et t'ont discrètement rangé dans la case « l'argent d'abord ».",
                                 it:"Hanno pagato, e in silenzio ti hanno archiviato alla voce «prima i soldi»."}})},
  {t:{tr:'Reddet, sessiz kal',en:'Decline and stay quiet',es:'Recházala y no digas nada',pt:'Recuse e fique na sua',de:'Lehn ab und halt dich bedeckt',fr:'Refuser et rester discret',it:'Rifiuta e resta in silenzio'},
   eff:()=>({msg:{tr:'Gündeme girmedin. Bazen en iyi haber, haber olmamaktır.',
                  en:'You stayed out of the news. Sometimes that is the news.',
                  es:'Te mantuviste fuera de las noticias. A veces eso es la noticia.',
                  pt:'Você ficou fora do noticiário. Às vezes isso é a notícia.',
                  de:'Du bist aus den Schlagzeilen geblieben. Manchmal ist genau das die Schlagzeile.',
                  fr:"Tu es resté hors de l'actualité. Parfois, c'est ça l'actualité.",
                  it:'Sei rimasto fuori dalle notizie. A volte è proprio quella la notizia.'}})}]},

{id:'shadyDeal',cat:'crisis',w:6,
 ttl:()=>({tr:'Masanın altından teklif',en:'An offer under the table',es:'Una oferta bajo cuerda',pt:'Uma proposta por baixo dos panos',de:'Ein Angebot unter der Hand',fr:'Une offre sous la table',it:'Un’offerta sottobanco'}),
 txt:()=>({tr:'Bir aracı, adını bir transfere karıştırman karşılığında pay öneriyor. Kimsenin duymayacağını söylüyor.',
           en:'An intermediary offers you a cut for putting your name to a transfer. He says nobody will hear.',
           es:'Un intermediario te ofrece una parte por poner tu nombre en un traspaso. Dice que nadie se enterará.',
           pt:'Um intermediário te oferece uma parte para você colocar seu nome numa transferência. Ele diz que ninguém vai ficar sabendo.',
           de:'Ein Vermittler bietet dir einen Anteil, wenn du deinen Namen unter einen Transfer setzt. Er sagt, niemand wird davon erfahren.',
           fr:"Un intermédiaire t'offre une part pour que tu mettes ton nom sur un transfert. Il dit que personne n'en saura rien.",
           it:'Un intermediario ti offre una fetta se metti il tuo nome su un trasferimento. Dice che nessuno lo verrà a sapere.'}),
 opts:[
  {t:{tr:'Al',en:'Take it',es:'Acéptala',pt:'Aceite',de:'Nimm es an',fr:'Accepter',it:'Accetta'},
   eff:()=>RF()<0.5?{cash:170,msg:{tr:'Para geldi, kimse bir şey sormadı. Şimdilik.',en:'The money landed. Nobody asked. For now.',es:'Llegó el dinero. Nadie preguntó. De momento.',pt:'O dinheiro caiu. Ninguém perguntou. Por enquanto.',de:'Das Geld kam. Niemand hat gefragt. Vorerst.',fr:"L'argent est arrivé. Personne n'a posé de question. Pour l'instant.",it:'I soldi sono arrivati. Nessuno ha fatto domande. Per ora.'}}
                    :{cash:170,rep:-12,msg:{tr:'Para geldi ama biri konuştu. Çevrede adın kirlendi.',
                                           en:'The money landed — but someone talked. Your name took damage.',
                                           es:'Llegó el dinero, pero alguien habló. Tu nombre salió dañado.',
                                           pt:'O dinheiro caiu — mas alguém abriu a boca. Seu nome saiu arranhado.',
                                           de:'Das Geld kam — aber jemand hat geredet. Dein Name hat Schaden genommen.',
                                           fr:"L'argent est arrivé, mais quelqu'un a parlé. Ton nom en a pris un coup.",
                                           it:'I soldi sono arrivati, ma qualcuno ha parlato. Il tuo nome ne ha risentito.'}}},
  {t:{tr:'Reddet',en:'Refuse',es:'Recházala',pt:'Recuse',de:'Lehn ab',fr:'Refuser',it:'Rifiuta'},
   eff:()=>({rep:1,msg:{tr:'Hayır dedin. Bu tür haberler de dolaşıyor.',en:'You said no. Word of that travels too.',es:'Dijiste que no. Eso también se sabe.',pt:'Você disse não. Isso também se espalha.',de:'Du hast Nein gesagt. Auch das spricht sich herum.',fr:'Tu as dit non. Ça aussi, ça se sait.',it:'Hai detto di no. Anche questo si viene a sapere.'}})}]},

{id:'agentExam',cat:'agency',w:6,when:()=>S.rep>=12,
 ttl:()=>({tr:'Temsilci lisansı sınavı',en:'The agent licence exam',es:'El examen de licencia de agente',pt:'A prova da licença de empresário',de:'Die Prüfung zur Beraterlizenz',fr:"L'examen de licence d'agent",it:"L'esame da procuratore"}),
 txt:()=>({tr:'Futbolcu temsilcisi lisansın yenileniyor. Federasyonun sınavına yeniden girmen gerekiyor — geçemezsen kimseyi temsil edemezsin. Tarih yakın.',
           en:'Your football agent licence is up for renewal. You have to sit the federation exam again — fail it and you can\'t represent anyone. The date is close.',
           es:'Tu licencia de agente de futbolistas toca renovarla. Tienes que volver a hacer el examen de la federación; si suspendes, no puedes representar a nadie. La fecha está cerca.',
           pt:'Sua licença de empresário de futebol precisa ser renovada. Você tem que fazer de novo a prova da federação — se reprovar, não pode representar ninguém. A data está chegando.',
           de:'Deine Spielerberaterlizenz muss verlängert werden. Du musst die Verbandsprüfung noch einmal ablegen — fällst du durch, darfst du niemanden vertreten. Der Termin ist nah.',
           fr:"Ta licence d'agent de joueurs doit être renouvelée. Tu dois repasser l'examen de la fédération : en cas d'échec, tu ne peux plus représenter personne. La date approche.",
           it:"La tua licenza da procuratore va rinnovata. Devi rifare l'esame federale: se non lo passi, non puoi rappresentare nessuno. La data è vicina."}),
 opts:[
  {t:{tr:'Haftalarca çalış',en:'Study for weeks',es:'Estudia durante semanas',pt:'Estude por semanas',de:'Lern wochenlang',fr:'Réviser pendant des semaines',it:'Studia per settimane'},
   eff:()=>({rep:3,msg:{tr:'Geçtin. Haftalarca yönetmelik okudun ama kimse bir daha lisansını sormayacak.',
                        en:'You passed. Weeks of reading regulations, and nobody will ask about your licence again.',
                        es:'Aprobaste. Semanas leyendo reglamentos, y nadie volverá a preguntarte por tu licencia.',
                        pt:'Você passou. Semanas lendo regulamento, e ninguém mais vai perguntar da sua licença.',
                        de:'Bestanden. Wochenlang Regelwerke gelesen, und niemand wird dich je wieder nach deiner Lizenz fragen.',
                        fr:"Tu as réussi. Des semaines à lire des règlements, et personne ne te reparlera de ta licence.",
                        it:"Promosso. Settimane a leggere regolamenti, e nessuno ti chiederà più della tua licenza."}})},
  {t:{tr:'Hazırlık kursu al',en:'Pay for a prep course',es:'Paga un curso de preparación',pt:'Pague um curso preparatório',de:'Bezahl einen Vorbereitungskurs',fr:'Payer une préparation',it:'Paga un corso di preparazione'},
   eff:()=>({cash:-110,rep:2,msg:{tr:'Pahalı ama garanti. Sınavda sürpriz yoktu.',
                                  en:'Expensive but certain. No surprises in the exam.',
                                  es:'Caro pero seguro. Ninguna sorpresa en el examen.',
                                  pt:'Caro, mas garantido. Nenhuma surpresa na prova.',
                                  de:'Teuer, aber sicher. Keine Überraschungen in der Prüfung.',
                                  fr:"Cher mais sûr. Aucune surprise à l'examen.",
                                  it:"Caro ma sicuro. Nessuna sorpresa all'esame."}})},
  {t:{tr:'Şansını dene',en:'Wing it',es:'Improvisa',pt:'Vá no improviso',de:'Geh unvorbereitet rein',fr:'Improviser',it:'Improvvisa'},
   eff:()=>RF()<0.5?{rep:1,msg:{tr:'Kıl payı geçtin. Kimsenin bilmesine gerek yok.',en:'You scraped through. Nobody needs to know.',es:'Aprobaste por los pelos. Nadie tiene por qué saberlo.',pt:'Você passou raspando. Ninguém precisa saber.',de:'Du bist knapp durchgerutscht. Das muss keiner wissen.',fr:"Tu as réussi de justesse. Personne n'a besoin de le savoir.",it:'Passato per il rotto della cuffia. Nessuno deve saperlo.'}}
                   :{rep:-5,cash:-40,msg:{tr:'Kaldın. Tekrar ücreti ve birkaç ay boyunca kulislerde espri konusu oldun.',
                                          en:'You failed. A re-sit fee, and a running joke in the corridors for months.',
                                          es:'Suspendiste. Tasa de recuperación, y chiste de pasillo durante meses.',
                                          pt:'Você reprovou. Taxa para refazer, e piada de corredor por meses.',
                                          de:'Durchgefallen. Eine Wiederholungsgebühr und monatelang ein Running Gag auf den Fluren.',
                                          fr:"Recalé. Des frais pour repasser l'examen, et une blague de couloir pendant des mois.",
                                          it:"Bocciato. Una tassa per ripeterlo, e una barzelletta nei corridoi per mesi."}}}]},

{id:'journalistTrade',cat:'media',w:6,
 ttl:()=>({tr:'Muhabirle takas',en:'A trade with a journalist',es:'Un trato con un periodista',pt:'Uma troca com um jornalista',de:'Ein Deal mit einem Journalisten',fr:'Un échange avec un journaliste',it:'Uno scambio con un giornalista'}),
 txt:()=>({tr:'Tanınmış bir muhabir sana kulis bilgisi öneriyor. Karşılığında senden düzenli haber bekliyor.',
           en:'A well-connected journalist offers you inside information. In return he expects stories from you.',
           es:'Un periodista bien conectado te ofrece información de dentro. A cambio, espera que le pases historias.',
           pt:'Um jornalista bem relacionado te oferece informação de bastidor. Em troca, ele espera histórias suas.',
           de:'Ein gut vernetzter Journalist bietet dir Insiderinfos an. Im Gegenzug erwartet er Geschichten von dir.',
           fr:"Un journaliste bien introduit te propose des informations de l'intérieur. En échange, il attend des histoires de ta part.",
           it:"Un giornalista ben introdotto ti offre informazioni di prima mano. In cambio si aspetta storie da te."}),
 opts:[
  {t:{tr:'Anlaş',en:'Make the trade',es:'Acepta el trato',pt:'Faça a troca',de:'Lass dich auf den Deal ein',fr:"Accepter l'échange",it:'Accetta lo scambio'},
   eff:()=>RF()<0.65?{cash:60,msg:{tr:'Bilgi işe yaradı, kimse nereden geldiğini sormadı.',en:'The information paid off. Nobody asked where it came from.',es:'La información dio frutos. Nadie preguntó de dónde salió.',pt:'A informação valeu a pena. Ninguém perguntou de onde veio.',de:'Die Info hat sich ausgezahlt. Niemand hat gefragt, woher sie kam.',fr:"L'information a payé. Personne n'a demandé d'où elle venait.",it:"L'informazione ha fruttato. Nessuno ha chiesto da dove venisse."}}
                    :{cash:60,rep:-6,msg:{tr:'Bir haberin kaynağı olarak adın geçti. Kulüpler artık yanında dikkatli konuşuyor.',
                                          en:'You were named as a source. Clubs choose their words around you now.',
                                          es:'Te señalaron como fuente. Ahora los clubes miden sus palabras delante de ti.',
                                          pt:'Você foi apontado como fonte. Agora os clubes medem as palavras perto de você.',
                                          de:'Du wurdest als Quelle genannt. Die Vereine wählen ihre Worte jetzt vorsichtig, wenn du dabei bist.',
                                          fr:'Tu as été cité comme source. Les clubs pèsent leurs mots devant toi désormais.',
                                          it:'Ti hanno indicato come fonte. Ora i club misurano le parole davanti a te.'}}},
  {t:{tr:'Bilgiyi al ama haber verme',en:'Take the tip, give nothing back',es:'Quédate con el soplo y no des nada',pt:'Fique com a dica e não dê nada em troca',de:'Nimm den Tipp und gib nichts zurück',fr:'Prendre le tuyau, ne rien donner',it:'Prendi la soffiata e non dare niente'},
   eff:()=>({cash:60,rep:-3,msg:{tr:'Bir kez işe yaradı. O numara bir daha açılmayacak.',
                                 en:'It worked once. That number won\'t pick up again.',
                                 es:'Funcionó una vez. Ese número no volverá a contestar.',
                                 pt:'Funcionou uma vez. Esse número não vai atender de novo.',
                                 de:'Einmal hat es geklappt. Unter dieser Nummer geht keiner mehr ran.',
                                 fr:'Ça a marché une fois. Ce numéro ne répondra plus.',
                                 it:'Ha funzionato una volta. Quel numero non risponderà più.'}})},
  {t:{tr:'Reddet',en:'Turn him down',es:'Recházalo',pt:'Recuse',de:'Lehn ab',fr:'Refuser',it:'Rifiuta'},
   eff:()=>({rep:1,msg:{tr:'Kapıyı kapattın. Bu tür haberler de dolaşıyor.',en:'You closed the door. Word of that travels too.',es:'Cerraste la puerta. Eso también se sabe.',pt:'Você fechou a porta. Isso também se espalha.',de:'Du hast die Tür zugemacht. Auch das spricht sich herum.',fr:"Tu as fermé la porte. Ça aussi, ça se sait.",it:'Hai chiuso la porta. Anche questo si viene a sapere.'}})}]},

{id:'fanProtest',cat:'crisis',w:6,when:()=>S.rep>=12,
 ttl:()=>({tr:'Tesis önünde pankart',en:'A banner outside the training ground',es:'Una pancarta frente a la ciudad deportiva',pt:'Uma faixa na frente do CT',de:'Ein Banner vor dem Trainingsgelände',fr:"Une banderole devant le centre d'entraînement",it:'Uno striscione davanti al centro sportivo'}),
 txt:()=>({tr:'Yaptığın bir transfer taraftarı kızdırdı. Tesisin önünde adının geçtiği bir pankart asılı.',
           en:'One of your transfers angered the supporters. There\'s a banner outside the training ground with your name on it.',
           es:'Uno de tus traspasos ha enfadado a la afición. Hay una pancarta con tu nombre frente a la ciudad deportiva.',
           pt:'Uma das suas transferências irritou a torcida. Tem uma faixa com o seu nome na frente do CT.',
           de:'Einer deiner Transfers hat die Fans verärgert. Vor dem Trainingsgelände hängt ein Banner mit deinem Namen.',
           fr:"Un de tes transferts a mis les supporters en colère. Il y a une banderole à ton nom devant le centre d'entraînement.",
           it:"Uno dei tuoi trasferimenti ha fatto infuriare i tifosi. Davanti al centro sportivo c'è uno striscione con il tuo nome."}),
 opts:[
  {t:{tr:'Açıklama yap',en:'Make a statement',es:'Haz un comunicado',pt:'Solte uma nota',de:'Gib eine Stellungnahme ab',fr:'Publier un communiqué',it:'Rilascia una dichiarazione'},
   eff:()=>RF()<0.62?{rep:2,msg:{tr:'Sakin, net bir açıklama. Tartışma birkaç günde söndü.',en:'Calm and clear. The argument burned out in days.',es:'Tranquilo y claro. La polémica se apagó en unos días.',pt:'Calmo e claro. A polêmica morreu em poucos dias.',de:'Ruhig und klar. Der Streit war nach ein paar Tagen ausgebrannt.',fr:"Calme et clair. La polémique s'est éteinte en quelques jours.",it:'Pacato e chiaro. La polemica si è spenta in pochi giorni.'}}
                    :{rep:-3,msg:{tr:'Açıklama yeni bir tartışma başlattı. Konuşmasan daha iyiydi.',en:'The statement started a new argument. Silence would have been cheaper.',es:'El comunicado abrió una nueva polémica. Callarse habría salido más barato.',pt:'A nota abriu uma nova polêmica. O silêncio teria saído mais barato.',de:'Die Stellungnahme hat einen neuen Streit ausgelöst. Schweigen wäre billiger gewesen.',fr:"Le communiqué a lancé une nouvelle polémique. Le silence aurait coûté moins cher.",it:'La dichiarazione ha aperto una nuova polemica. Il silenzio sarebbe costato meno.'}}},
  {t:{tr:'Sessiz kal',en:'Say nothing',es:'No digas nada',pt:'Não diga nada',de:'Sag nichts',fr:'Ne rien dire',it:'Non dire niente'},
   eff:()=>({rep:-1,msg:{tr:'Bir süre üstüne gittiler, sonra unuttular. Küçük bir iz kaldı.',
                         en:'They kept at it for a while, then moved on. A small mark stayed.',
                         es:'Siguieron un tiempo y luego pasaron a otra cosa. Quedó una pequeña mancha.',
                         pt:'Insistiram por um tempo e depois seguiram em frente. Ficou uma pequena mancha.',
                         de:'Sie haben eine Weile weitergemacht und sind dann weitergezogen. Ein kleiner Makel blieb.',
                         fr:"Ils ont insisté un moment, puis sont passés à autre chose. Une petite tache est restée.",
                         it:"Hanno insistito per un po', poi sono passati ad altro. È rimasta una piccola macchia."}})},
  {t:{tr:'Güvenlik tut',en:'Hire security',es:'Contrata seguridad',pt:'Contrate segurança',de:'Engagiere Sicherheitsleute',fr:'Engager une protection',it:'Ingaggia la sicurezza'},
   eff:()=>({cash:-45,msg:{tr:'Bir süre gölge gibi peşinde biri oldu. Rahat ama pahalı.',
                           en:'Someone shadowed you for a few weeks. Comfortable, and costly.',
                           es:'Alguien te siguió a todas partes unas semanas. Cómodo, y caro.',
                           pt:'Alguém andou na sua cola por umas semanas. Confortável, e caro.',
                           de:'Ein paar Wochen lang war dir jemand auf den Fersen. Bequem und teuer.',
                           fr:"Quelqu'un t'a suivi comme ton ombre pendant quelques semaines. Confortable, et coûteux.",
                           it:"Qualcuno ti ha fatto da ombra per qualche settimana. Comodo, e costoso."}})}]},

{id:'agencyBuyout',cat:'agency',w:5,when:()=>S.rep>=40,
 ttl:()=>({tr:'Satın alma teklifi',en:'A buyout offer',es:'Una oferta de compra',pt:'Uma proposta de compra',de:'Ein Übernahmeangebot',fr:'Une offre de rachat',it:"Un'offerta di acquisizione"}),
 txt:()=>({tr:'Büyük bir ajans seni bünyesine katmak istiyor. Rakam ciddi — ama masa artık senin masan olmayacak.',
           en:'A major agency wants to absorb you. The number is serious — but the table stops being yours.',
           es:'Una gran agencia quiere absorberte. La cifra es seria, pero la mesa dejaría de ser tuya.',
           pt:'Uma grande agência quer te absorver. O valor é sério — mas a mesa deixa de ser sua.',
           de:'Eine große Agentur will dich übernehmen. Die Summe ist ernst gemeint — aber der Tisch wäre nicht mehr deiner.',
           fr:"Une grande agence veut t'absorber. Le chiffre est sérieux, mais la table ne serait plus la tienne.",
           it:'Una grande agenzia vuole assorbirti. La cifra è seria, ma il tavolo non sarebbe più tuo.'}),
 opts:[
  {t:{tr:'Sat ve onlara katıl',en:'Sell up and join them',es:'Vende y únete a ellos',pt:'Venda e junte-se a eles',de:'Verkauf und schließ dich an',fr:'Vendre et les rejoindre',it:'Vendi e unisciti a loro'},
   eff:()=>({cash:Math.round(600+S.rep*22),ag:{comm:-0.03},
             msg:{tr:'Para bir kerede geldi. Bundan sonra her anlaşmadan onların da payı var.',
                  en:'The money landed at once. From now on they take a slice of every deal.',
                  es:'El dinero llegó de golpe. A partir de ahora se llevan un pellizco de cada operación.',
                  pt:'O dinheiro caiu de uma vez. Daqui pra frente, eles levam uma fatia de cada negócio.',
                  de:'Das Geld kam auf einen Schlag. Ab jetzt bekommen sie von jedem Deal ein Stück.',
                  fr:"L'argent est tombé d'un coup. Désormais, ils prennent une part sur chaque affaire.",
                  it:"I soldi sono arrivati tutti insieme. D'ora in poi si prendono una fetta di ogni affare."}})},
  {t:{tr:'Ortak ol, bağımsız kal',en:'Partner up, stay independent',es:'Asóciate, pero sigue siendo independiente',pt:'Vire sócio, mas continue independente',de:'Werde Partner, bleib unabhängig',fr:"S'associer, rester indépendant",it:'Diventa socio, resta indipendente'},
   eff:()=>({cash:Math.round(220+S.rep*8),ag:{cap:1,cost:0.15},
             msg:{tr:'Sermayeleri, senin adın. Daha fazla oyuncu taşıyabilirsin — ofis de büyüdü.',
                  en:'Their capital, your name. You can carry more players — and the office got bigger.',
                  es:'Su capital, tu nombre. Puedes llevar a más jugadores, y la oficina ha crecido.',
                  pt:'O capital deles, o seu nome. Você pode cuidar de mais jogadores — e o escritório cresceu.',
                  de:'Ihr Kapital, dein Name. Du kannst mehr Spieler betreuen — und das Büro ist gewachsen.',
                  fr:"Leur capital, ton nom. Tu peux gérer plus de joueurs, et le bureau s'est agrandi.",
                  it:"Il loro capitale, il tuo nome. Puoi seguire più giocatori, e l'ufficio è cresciuto."}})},
  {t:{tr:'Reddet',en:'Decline',es:'Recházala',pt:'Recuse',de:'Lehn ab',fr:'Refuser',it:'Rifiuta'},
   eff:()=>({rep:3,msg:{tr:'Hayır dedin ve bu duyuldu. Tek başına ayakta durabilen bir isimsin.',
                        en:'You said no, and it was noticed. You\'re a name that stands on its own.',
                        es:'Dijiste que no, y se notó. Eres un nombre que se sostiene solo.',
                        pt:'Você disse não, e isso foi notado. Você é um nome que se sustenta sozinho.',
                        de:'Du hast Nein gesagt, und das wurde bemerkt. Dein Name steht für sich.',
                        fr:"Tu as dit non, et ça s'est remarqué. Ton nom tient debout tout seul.",
                        it:"Hai detto di no, e si è notato. Il tuo è un nome che si regge da solo."}})}]},

{id:'officeMove',cat:'agency',w:8,sz:'s',when:()=>S.rep>=20,
 ttl:()=>({tr:'Yeni ofis',en:'A bigger office',es:'Una oficina más grande',pt:'Um escritório maior',de:'Ein größeres Büro',fr:'Un plus grand bureau',it:'Un ufficio più grande'}),
 txt:()=>({tr:'İş büyüdü, ekip sığmıyor. Şehrin daha görünür bir yerinde bir yer tutabilirsin.',
           en:'The work has grown and the team doesn\'t fit. You could take a place somewhere more visible.',
           es:'El trabajo ha crecido y el equipo ya no cabe. Podrías mudarte a un sitio más visible.',
           pt:'O trabalho cresceu e a equipe não cabe mais. Dá para ir para um lugar mais visível.',
           de:'Die Arbeit ist gewachsen, und das Team passt nicht mehr rein. Du könntest etwas Repräsentativeres beziehen.',
           fr:"Le travail a grandi et l'équipe ne tient plus. Tu pourrais t'installer dans un endroit plus en vue.",
           it:"Il lavoro è cresciuto e la squadra non ci sta più. Potresti trasferirti in un posto più in vista."}),
 opts:[
  {t:{tr:'Taşın',en:'Move',es:'Múdate',pt:'Mude',de:'Zieh um',fr:'Déménager',it:'Trasferisciti'},
   eff:()=>({cash:-130,ag:{cap:1,cost:0.25},
             msg:{tr:'Artık insanları ağırlayabileceğin bir yerin var. Kirası da öyle.',
                  en:'You have somewhere to receive people now. The rent reflects it.',
                  es:'Ahora tienes dónde recibir a la gente. El alquiler lo refleja.',
                  pt:'Agora você tem onde receber as pessoas. O aluguel mostra isso.',
                  de:'Jetzt hast du einen Ort, um Leute zu empfangen. Die Miete sieht man.',
                  fr:"Tu as maintenant un endroit pour recevoir. Le loyer s'en ressent.",
                  it:"Ora hai un posto dove ricevere la gente. L'affitto si fa sentire."}})},
  {t:{tr:'Ekip uzaktan çalışsın',en:'Let the team work remotely',es:'Que el equipo trabaje en remoto',pt:'Deixe a equipe trabalhar de casa',de:'Lass das Team remote arbeiten',fr:"Passer l'équipe en télétravail",it:'Fai lavorare la squadra da remoto'},
   eff:()=>({ag:{cost:-0.10},msg:{tr:'Kimse ofise gelmiyor, kimse de şikâyet etmiyor. Gider düştü.',
                                  en:'Nobody comes in, nobody complains. Overheads dropped.',
                                  es:'Nadie viene, nadie se queja. Los gastos fijos bajaron.',
                                  pt:'Ninguém vem, ninguém reclama. O custo fixo caiu.',
                                  de:'Keiner kommt rein, keiner beschwert sich. Die Fixkosten sind gesunken.',
                                  fr:'Personne ne vient, personne ne se plaint. Les frais fixes ont baissé.',
                                  it:'Nessuno viene, nessuno si lamenta. I costi fissi sono calati.'}})},
  {t:{tr:'Şimdilik burası yeter',en:'This will do for now',es:'Esto vale por ahora',pt:'Por enquanto, isso serve',de:'Das reicht fürs Erste',fr:'Ça ira pour le moment',it:'Per ora va bene così'},
   eff:()=>({msg:{tr:'Ertelendi. Kutular hâlâ koridorda.',en:'Postponed. The boxes are still in the corridor.',es:'Aplazado. Las cajas siguen en el pasillo.',pt:'Adiado. As caixas continuam no corredor.',de:'Verschoben. Die Kisten stehen noch im Flur.',fr:'Reporté. Les cartons sont toujours dans le couloir.',it:'Rimandato. Gli scatoloni sono ancora nel corridoio.'}})}]},

{id:'youngAgent',cat:'agency',w:5,
 ttl:()=>({tr:'Yanına biri isteniyor',en:'Someone wants to learn from you',es:'Alguien quiere aprender de ti',pt:'Alguém quer aprender com você',de:'Jemand will von dir lernen',fr:"Quelqu'un veut apprendre de toi",it:'Qualcuno vuole imparare da te'}),
 txt:()=>({tr:'Genç bir menajer adayı yanında çalışmak istiyor. Maaş beklemiyor ama zamanını alacak.',
           en:'A young would-be agent wants to work under you. No salary expected, but he\'ll take up your time.',
           es:'Un joven aspirante a agente quiere trabajar a tus órdenes. No pide sueldo, pero te quitará tiempo.',
           pt:'Um jovem aspirante a empresário quer trabalhar com você. Não quer salário, mas vai tomar seu tempo.',
           de:'Ein junger angehender Berater will bei dir arbeiten. Er will kein Gehalt, aber er kostet dich Zeit.',
           fr:"Un jeune apprenti agent veut travailler à tes côtés. Il ne demande pas de salaire, mais il va te prendre du temps.",
           it:'Un giovane aspirante procuratore vuole lavorare con te. Non chiede stipendio, ma ti ruberà tempo.'}),
 opts:[
  {t:{tr:'Yanına al',en:'Take him on',es:'Acéptalo',pt:'Aceite',de:'Nimm ihn auf',fr:'Le prendre sous ton aile',it:'Prendilo con te'},
   eff:()=>({cash:-50,rep:3,msg:{tr:'Öğretmek zaman aldı ama ağın genişledi.',en:'Teaching cost you time, but your network widened.',es:'Enseñar te costó tiempo, pero tu red se amplió.',pt:'Ensinar custou tempo, mas sua rede cresceu.',de:'Das Lehren hat dich Zeit gekostet, aber dein Netzwerk ist gewachsen.',fr:"Transmettre t'a coûté du temps, mais ton réseau s'est élargi.",it:'Insegnare ti è costato tempo, ma la tua rete si è allargata.'}})},
  {t:{tr:'Şimdi sırası değil',en:'Not the right time',es:'No es el momento',pt:'Não é a hora',de:'Nicht der richtige Zeitpunkt',fr:"Ce n'est pas le moment",it:'Non è il momento'},
   eff:()=>({msg:{tr:'Kibarca reddettin. İşine odaklandın.',en:'You declined politely and got back to work.',es:'Lo rechazaste con educación y volviste al trabajo.',pt:'Você recusou com educação e voltou ao trabalho.',de:'Du hast höflich abgelehnt und dich wieder an die Arbeit gemacht.',fr:'Tu as poliment décliné et tu t’es remis au travail.',it:'Hai rifiutato con garbo e sei tornato al lavoro.'}})}]}
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
/* Kategori okumanın tek yolu. Eski bir olay kaydı kategorisiz kalırsa ekran
   boş rozetle çizilmesin diye 'agency'ye düşüyor — rivalOf()'un isimsiz
   rakip menajere düşmesiyle aynı desen. */
function evCat(ev){return ev&&EV_CATS.indexOf(ev.cat)>=0?ev.cat:'agency';}
/* Sonuç ekranına yazılan fark: istenen değil, uygulanan.
   İtibar kazancı repFactor() ile sönümleniyor, moral/güven/form stat() ile
   sıkışıyor ve beceri bonusları araya giriyor — ham isteği çipe basmak ekranı
   yalancı yapıyordu ("+3 itibar" yazıp 1.6 uygulamak gibi). Bu yüzden fark
   mutasyonun kendisinden ölçülüyor; huniler ve sıraları hiç değişmiyor.
   Sıfıra yuvarlanan etki listeye girmiyor: olmayan bir değişikliğin çipi de
   olmaz, ayrıca -0 ve tavana dayanmış bir kazancın sonucu iyi göstermesi böyle
   engelleniyor. Sonlu olmayan fark (bozuk eski kayıt) da yazılmıyor. */
function effPush(out,k,before,after,dp){
  const m=dp===3?1000:10,d=Math.round((after-before)*m)/m;
  if(!isFinite(d)||d===0)return;
  out.push({k,v:d});
}
/* ===== olay maliyetinin ölçeği =====
   Olayların nakit bedelleri sabit yazılmış (−95K, −120K, −140K...) ve kariyerin
   her anında aynı. Geç oyunda bu yuvarlama hatası; başlangıçta ise 250K'lık
   kasanın yarısı. Ölçüldü: iki müşterili menajerde olayların altı sezonluk net
   etkisi −300K ile −655K arasında, yani sabit giderin tamamı kadar — ve borca
   düşen kariyerleri düşmeyenlerden ayıran en büyük oynaklık kaynağı buydu.

   Küçük ajansa küçük fatura: bedel itibarla birlikte büyür ve EV_COST.full
   itibarda yazıldığı tutara ulaşır. İtibar okunuyor, kasa değil — kasaya bağlı
   bir indirim, olaydan önce parayı harcayarak satın alınabilirdi.

   Yalnız BEDELLER ölçeklenir. Kazançlar yazıldığı gibi kalır; kalıcı ajans
   değişikliği (r.ag) taşıyan sonuç ise bir yatırımdır — kapasite ya da gider
   satın alıyorsun — ve fiyatı indirilmez.

   Tek çağrı yeri evChoose() (js/ui.js). applyEff() bilerek dokunulmadan
   bırakıldı: ayartma masası da oradan geçiyor ve onun bedeli zaten müşterinin
   maaşına endeksli. */
const EV_COST={lo:0.35, full:40};
function evCostScale(){return clamp(EV_COST.lo+(1-EV_COST.lo)*((S&&S.rep)||0)/EV_COST.full,EV_COST.lo,1);}
/* İtibar KAYBI da aynı ölçekten geçiyor. Adı duyulmamış menajerin skandalı haber
   değildir: −3'lük bir olay itibar 7'deki menajerin elindekinin %40'ını,
   itibar 90'dakinin %3'ünü götürüyordu. Ölçüldü: iki müşterili menajerde işten
   gelen itibar sezonda ~2 puan, olay kaybı ise −2,9 — sıradan oynayan kariyer
   altı tohumun beşinde on iki sezon boyunca iki müşteride kaldı, aynı kariyer
   yalnız olay seçimini değiştirerek itibar 77-90'a çıkıyordu. Kötü seçim hâlâ
   kayıp; ama kariyeri kilitleyen şey olmaktan çıkıyor.
   Kazançlar burada da yazıldığı gibi kalır. Kayıp, r.ag olsa da ölçeklenir:
   yatırım istisnası fiyat içindir, itibar için değil. */
function evScaled(r){
  if(!r)return r;
  const k=evCostScale();
  if(k>=1)return r;
  const cost=r.cash<0&&!r.ag, loss=r.rep<0;
  if(!cost&&!loss)return r;
  /* Kopya dönüyor: eff() her çağrıda taze nesne üretiyor ama buna güvenmek
     gerekmiyor. Alt sınırlar (1K, 0,1 itibar) sıfıra yuvarlanmayı önlüyor —
     sıfırlanan bedel "bedelsiz seçenek" olurdu. */
  const o=Object.assign({},r);
  if(cost)o.cash=Math.min(-1,Math.round(r.cash*k));
  if(loss)o.rep=Math.min(-0.1,Math.round(r.rep*k*10)/10);
  return o;
}
/* Tek uygulayıcı: bütün olaylar aynı kaldıraçlardan geçer. */
function applyEff(r,c){
  const out=[];
  if(r.cash){const b=S.cash;S.cash=Math.round((S.cash+r.cash)*10)/10;effPush(out,'cash',b,S.cash);}
  if(r.rep){const b=S.rep;repEvent(r.rep);effPush(out,'rep',b,S.rep);}
  if(c.p){
    /* Başlangıç değeri hunilerin kendi okuduğu yerden alınıyor — güven trustOf()
       (tanımsızsa 55), moral ve form doğrudan alandan; ölçmek için state'e
       önceden hiçbir şey yazılmıyor. */
    if(r.morale){const b=c.p.morale;moraleEvent(c.p,r.morale);effPush(out,'morale',b,c.p.morale);}
    if(r.trust){const b=trustOf(c.p);trustEvent(c.p,r.trust);effPush(out,'trust',b,c.p.trust);}
    if(r.form){const b=c.p.form;c.p.form=stat(c.p.form+r.form,5);effPush(out,'form',b,c.p.form);}
    /* oyuncuya iliştirilen kalıcı bayrak (şimdilik: geleceği bir fona satıldı) */
    if(r.flag)c.p[r.flag]=1;
  }
  /* Ajansın kalıcı değiştiricileri: komisyon oranı, müşteri kapasitesi, gider katsayısı.
     Kalıcı oldukları için ekranda ayrıca gösterilir (bkz. evChoose). */
  if(r.ag){S.ag=S.ag||{};
    Object.keys(r.ag).forEach(k=>{const b=S.ag[k]||0;
      S.ag[k]=+(b+r.ag[k]).toFixed(3);effPush(out,'ag_'+k,b,S.ag[k],3);});}
  return out;
}
