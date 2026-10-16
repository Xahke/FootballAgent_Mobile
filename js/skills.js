'use strict';
/* js/skills.js — yetenek ağacı (merkezden dört yöne açılan düğüm ağı).

   Ağaç bir ızgara üzerinde duruyor: merkezde ajansın kendisi (hub), ondan dört
   yöne birer dal. Her dal ilk düğümden sonra ikiye ayrılıyor, iki kol üçüncü
   halkada ilerliyor ve dördüncü halkada tek bir taçta birleşiyor. Bir düğüm,
   ona bağlı düğümlerden en az biri açılmadan alınamaz — yani ağaçta yürümek
   zorundasın, istediğin yeri seçemezsin.

   Neden koordinat yerine (dal, halka, yan) tutuluyor:
   dalın yönü SK_BRANCH'te yazıyor; düğüm yalnızca "kaçıncı halka" ve "hangi kol"
   olduğunu biliyor. Yeni bir dal eklemek için SK_BRANCH'e bir yön yazmak yeterli,
   hiçbir koordinatı elle hesaplamak gerekmiyor (bkz. skPos).

   Yeni düğüm eklerken:
     id   : benzersiz kısa ad
     br   : dal ('tb' | 'fd' | 'ag' | 'nw')
     d    : halka — merkezden uzaklık (1..4)
     s    : yan — dalın ekseninden sapma (-1 sol kol, 0 orta, +1 sağ kol)
     cost : kaç puan
     req  : önkoşul id'leri — biri açıksa düğüm açılabilir
     eff  : {anahtar: değer} — skillBonus(anahtar) bunları toplar

   Etki anahtarları SK_KEY'de tanımlı; her anahtarın oyunda tam olarak bir okuma
   yeri var (bkz. CLAUDE.md). Yeni anahtar eklemek = SK_KEY'e satır + tek okuma yeri. */

/* ===== seviye eğrisi =====
   Puan artık doğrudan itibardan değil seviyeden geliyor. İlk seviyeler hızlı
   gelsin ki ağaç daha ilk sezonda hareket etsin; sonrakiler açılsın ki uzun bir
   kariyer bile dört dalı birden bitiremesin. Bir seviye = 1 puan, her dördüncü
   seviye bir puan daha. Dört dalın tamamı 32 puan tutuyor: kimse hepsini alamaz,
   herkes seçmek zorunda. */
const LV={a:3.2, b:0.62, max:30, bonus:4};
function repForLevel(l){const k=Math.max(0,l-1);return Math.round(LV.a*k+LV.b*k*k);}
/* Seviye ulaşılan en yüksek itibardan sayılır: bir kez hak ettiğin seviye,
   sonradan itibar kaybetsen de elinden alınmaz. */
function repTotal(){return S?Math.max(S.rep||0,S.repMax||0):0;}
function agentLevel(st){
  const r=st===undefined?repTotal():st;
  let l=1;
  while(l<LV.max&&r>=repForLevel(l+1))l++;
  return l;
}
function levelPoints(l){return (l-1)+Math.floor(l/LV.bonus);}
/* Bir sonraki seviyeye kalan yol — arayüzdeki halka bunu gösteriyor. */
function levelProgress(){
  const l=agentLevel(),r=repTotal();
  if(l>=LV.max)return {lv:l,cur:0,need:0,pct:1};
  const lo=repForLevel(l),hi=repForLevel(l+1);
  return {lv:l,cur:r-lo,need:hi-lo,pct:Math.max(0,Math.min(1,(r-lo)/(hi-lo)))};
}

/* ===== etki anahtarları ===== */
/* f: nasıl yazılacağı — pct yüzde artış, pctD yüzde düşüş, pp puan, wk hafta, flat sayı */
const SK_KEY={
  neg  :{f:'pct', n:{tr:'Kabul şansı',       en:'Acceptance',es:'Aceptación',pt:'Aceitação',de:'Annahme',fr:'Acceptation',it:'Accettazione'}},
  wage :{f:'pct', n:{tr:'Maaş tavanı',       en:'Wage ceiling',es:'Techo salarial',pt:'Teto salarial',de:'Gehaltsobergrenze',fr:'Plafond salarial',it:"Tetto d'ingaggio"}},
  trust:{f:'pct', n:{tr:'Güven kazancı',     en:'Trust gained',es:'Confianza ganada',pt:'Confiança ganha',de:'Vertrauensgewinn',fr:'Confiance gagnée',it:'Fiducia guadagnata'}},
  comm :{f:'pp',  n:{tr:'Komisyon oranı',    en:'Commission rate',es:'Porcentaje de comisión',pt:'Taxa de comissão',de:'Provisionssatz',fr:'Taux de commission',it:'Percentuale di commissione'}},
  scout:{f:'pctD',n:{tr:'Keşif bedeli',      en:'Scouting cost',es:'Coste de ojeo',pt:'Custo de observação',de:'Scoutingkosten',fr:'Coût du recrutement',it:'Costo degli osservatori'}},
  net  :{f:'wk',  n:{tr:'Ağ kurulum süresi', en:'Network setup',es:'Montaje de la red',pt:'Montagem da rede',de:'Netzwerkaufbau',fr:'Mise en place du réseau',it:'Allestimento della rete'}},
  dev  :{f:'pct', n:{tr:'Gelişim şansı',     en:'Development',es:'Progresión',pt:'Evolução',de:'Entwicklung',fr:'Progression',it:'Crescita'}},
  val  :{f:'pct', n:{tr:'Piyasa değeri',     en:'Market value',es:'Valor de mercado',pt:'Valor de mercado',de:'Marktwert',fr:'Valeur marchande',it:'Valore di mercato'}},
  pitch:{f:'pct', n:{tr:'İmza şansı',        en:'Signing chance',es:'Prob. de firma',pt:'Chance de assinar',de:'Zusagechance',fr:'Chances de signer',it:'Prob. di firma'}},
  cost :{f:'pctD',n:{tr:'Haftalık gider',    en:'Weekly overhead',es:'Gastos fijos semanales',pt:'Custo fixo semanal',de:'Wöchentliche Fixkosten',fr:'Frais fixes hebdo',it:'Costi fissi settimanali'}},
  cap  :{f:'flat',n:{tr:'Müşteri kapasitesi',en:'Client slots',es:'Huecos de clientes',pt:'Vagas de clientes',de:'Klientenplätze',fr:'Places de clients',it:'Posti per assistiti'}},
  repg :{f:'pct', n:{tr:'İtibar kazancı',    en:'Reputation gain',es:'Fama ganada',pt:'Fama ganha',de:'Rufgewinn',fr:'Réputation gagnée',it:'Fama guadagnata'}},
  fee  :{f:'pct', n:{tr:'Transfer komisyonu',en:'Transfer cut',es:'Comisión de traspaso',pt:'Comissão de transferência',de:'Transferprovision',fr:'Commission de transfert',it:'Commissione sul trasferimento'}},
  bid  :{f:'pct', n:{tr:'Teklif kabulü',     en:'Bid acceptance',es:'Aceptación de ofertas',pt:'Aceitação de propostas',de:'Annahme von Geboten',fr:'Acceptation des offres',it:'Accettazione delle offerte'}},
  mor  :{f:'pctD',n:{tr:'Moral kaybı',       en:'Morale losses',es:'Pérdidas de moral',pt:'Perdas de moral',de:'Moralverluste',fr:'Pertes de moral',it:'Perdite di morale'}},
  loy  :{f:'pctD',n:{tr:'Ayartma riski',     en:'Poaching risk',es:'Riesgo de robo de clientes',pt:'Risco de aliciamento',de:'Abwerberisiko',fr:'Risque de débauchage',it:'Rischio di scippo'}}
};
function skEffLabel(k,v){
  const m=SK_KEY[k];
  if(!m)return '';
  const n=tx(m.n);
  if(m.f==='flat')return n+' +'+v;
  if(m.f==='wk')return n+' −'+v+' '+t('wk');
  if(m.f==='pp')return n+' +'+Math.round(v*100)+' '+t('skPp');
  const pct=Math.round(v*100);
  const sign=m.f==='pctD'?'−':'+';
  return n+' '+sign+pctFmt(pct);
}

/* ===== dallar =====
   dir: ızgaradaki yön vektörü. Yan kollar bu vektörün dikine açılır, yani yeni
   bir dalı çapraz bir yöne koymak da mümkün — hiçbir yerde yön varsayılmıyor. */
const SK_HUB='hub';
const SK_BRANCH=[
 {id:'tb',dir:[0,-1],
  n:{tr:'Masa',  en:'The Table',es:'La Mesa',pt:'A Mesa',de:'Der Tisch',fr:'La Table',it:'Il Tavolo'},
  d:{tr:'Sözleşme, pazarlık ve oyuncuyla aranızdaki güven.',
     en:'Contracts, negotiation and the trust between you and your client.',
     es:'Contratos, negociación y la confianza entre tu cliente y tú.',
     pt:'Contratos, negociação e a confiança entre você e seu cliente.',
     de:'Verträge, Verhandlungen und das Vertrauen zwischen dir und deinem Klienten.',
     fr:'Contrats, négociation et confiance entre ton client et toi.',
     it:'Contratti, trattative e la fiducia tra te e il tuo assistito.'}},
 {id:'fd',dir:[1,0],
  n:{tr:'Saha',  en:'The Field',es:'El Campo',pt:'O Campo',de:'Der Platz',fr:'Le Terrain',it:'Il Campo'},
  d:{tr:'Keşif ağı, yetenek bulma ve oyuncunun gelişimi.',
     en:'Scouting networks, spotting talent and developing it.',
     es:'Redes de ojeadores, encontrar talento y hacerlo crecer.',
     pt:'Redes de olheiros, descobrir talentos e fazê-los evoluir.',
     de:'Scouting-Netzwerke, Talente erkennen und entwickeln.',
     fr:'Réseaux de recrutement, repérer les talents et les faire progresser.',
     it:'Reti di osservatori, scovare talenti e farli crescere.'}},
 {id:'ag',dir:[0,1],
  n:{tr:'Ajans', en:'The Agency',es:'La Agencia',pt:'A Agência',de:'Die Agentur',fr:"L'Agence",it:"L'Agenzia"},
  d:{tr:'Para, gider, kapasite ve adının duyulması.',
     en:'Money, overheads, capacity and getting your name out.',
     es:'Dinero, gastos, capacidad y hacerte un nombre.',
     pt:'Dinheiro, despesas, capacidade e fazer seu nome.',
     de:'Geld, Kosten, Kapazität und dir einen Namen machen.',
     fr:'Argent, frais, capacité et se faire un nom.',
     it:'Soldi, spese, capienza e farsi un nome.'}},
 {id:'nw',dir:[-1,0],
  n:{tr:'Ağ',    en:'The Network',es:'La Red',pt:'A Rede',de:'Das Netzwerk',fr:'Le Réseau',it:'La Rete'},
  d:{tr:'Kulüp ilişkileri, transfer masası ve müşterini elde tutmak.',
     en:'Club relations, the transfer table and keeping your clients.',
     es:'Relaciones con los clubes, la mesa de traspasos y conservar a tus clientes.',
     pt:'Relação com os clubes, a mesa de transferências e segurar seus clientes.',
     de:'Kontakte zu Vereinen, der Transfertisch und deine Klienten halten.',
     fr:'Relations avec les clubs, table des transferts et fidélité de tes clients.',
     it:'Rapporti con i club, il tavolo dei trasferimenti e tenersi gli assistiti.'}}
];
/* ===== düğümler ===== */
const SKILLS=[
/* --- merkez --- */
{id:SK_HUB,br:null,d:0,s:0,cost:0,req:[],eff:{},
 n:{tr:'Ajans',en:'The Agency',es:'La Agencia',pt:'A Agência',de:'Die Agentur',fr:"L'Agence",it:"L'Agenzia"},
 dsc:{tr:'Her şey burada başlıyor. Dört yöne giden yollardan birini seç — hepsini birden yürüyemezsin.',
      en:'Everything starts here. Pick one of the four roads out — you cannot walk them all.',
      es:'Todo empieza aquí. Elige uno de los cuatro caminos: no puedes recorrerlos todos.',
      pt:'Tudo começa aqui. Escolha um dos quatro caminhos: não dá para percorrer todos.',
      de:'Hier beginnt alles. Wähl einen der vier Wege — alle kannst du nicht gehen.',
      fr:'Tout commence ici. Choisis une des quatre routes : tu ne peux pas toutes les suivre.',
      it:'Tutto parte da qui. Scegli una delle quattro strade: non puoi percorrerle tutte.'}},

/* --- MASA (yukarı) --- */
{id:'tb1',br:'tb',d:1,s:0,cost:1,req:[SK_HUB],eff:{neg:0.05},
 n:{tr:'Hazırlıklı Git',en:'Come Prepared',es:'Ven preparado',pt:'Chegue preparado',de:'Gut vorbereitet',fr:'Arriver préparé',it:'Arriva preparato'},
 dsc:{tr:'Masaya rakamlarla oturuyorsun; kulüp itiraz edecek yer bulamıyor.',
      en:'You sit down with the numbers in hand. The club has nowhere to push back.',
      es:'Te sientas con los números en la mano. El club no tiene por dónde replicar.',
      pt:'Você senta com os números na mão. O clube não tem como contestar.',
      de:'Du setzt dich mit den Zahlen in der Hand hin. Der Verein hat nichts entgegenzusetzen.',
      fr:"Tu t'assieds avec les chiffres en main. Le club n'a rien à redire.",
      it:'Ti siedi con i numeri in mano. Il club non ha appigli per ribattere.'}},
{id:'tb2',br:'tb',d:2,s:-1,cost:1,req:['tb1'],eff:{wage:0.05},
 n:{tr:'Rakamları Bil',en:'Know the Numbers',es:'Conoce las cifras',pt:'Conheça os números',de:'Kenn die Zahlen',fr:'Connaître les chiffres',it:'Conosci i numeri'},
 dsc:{tr:'Kulübün bütçesinde gerçekte ne kadar yer olduğunu biliyorsun — tavan yükseliyor.',
      en:'You know what is really left in the club\'s budget. The ceiling moves up.',
      es:'Sabes lo que de verdad le queda al club en el presupuesto. El techo sube.',
      pt:'Você sabe o que realmente sobra no orçamento do clube. O teto sobe.',
      de:'Du weißt, was im Budget des Vereins wirklich noch drin ist. Die Obergrenze steigt.',
      fr:'Tu sais ce qui reste vraiment dans le budget du club. Le plafond monte.',
      it:'Sai cosa resta davvero nel budget del club. Il tetto si alza.'}},
{id:'tb3',br:'tb',d:2,s:1,cost:1,req:['tb1'],eff:{trust:0.25},
 n:{tr:'Sözünü Tutan Adam',en:'A Man of His Word',es:'Palabra cumplida',pt:'Palavra empenhada',de:'Wort gehalten',fr:'Parole tenue',it:'Parola data'},
 dsc:{tr:'Verdiğin sözü tutuyorsun; oyuncular sana daha çabuk ısınıyor.',
      en:'You keep your promises, and players warm to you faster.',
      es:'Cumples lo que prometes, y los jugadores te cogen confianza antes.',
      pt:'Você cumpre o que promete, e os jogadores pegam confiança mais rápido.',
      de:'Du hältst, was du versprichst, und die Spieler fassen schneller Vertrauen.',
      fr:'Tu tiens tes promesses, et les joueurs te font confiance plus vite.',
      it:'Mantieni le promesse, e i giocatori si fidano di te più in fretta.'}},
{id:'tb4',br:'tb',d:3,s:-1,cost:1,req:['tb2'],eff:{neg:0.05,wage:0.04},
 n:{tr:'Uzun Anlaşma',en:'The Long Deal',es:'El contrato largo',pt:'O contrato longo',de:'Der lange Vertrag',fr:'Le contrat long',it:'Il contratto lungo'},
 dsc:{tr:'Kulübe bugünü değil beş yılı anlatıyorsun. Kalem daha kolay hareket ediyor.',
      en:'You sell them five years, not one. The pen moves more easily.',
      es:'Les vendes cinco años, no uno. El bolígrafo se mueve más fácil.',
      pt:'Você vende cinco anos para eles, não um. A caneta corre mais fácil.',
      de:'Du verkaufst ihnen fünf Jahre, nicht eins. Der Stift bewegt sich leichter.',
      fr:"Tu leur vends cinq ans, pas un. Le stylo glisse plus facilement.",
      it:'Gli vendi cinque anni, non uno. La penna scorre più facilmente.'}},
{id:'tb5',br:'tb',d:3,s:1,cost:2,req:['tb3'],eff:{trust:0.30,mor:0.15},
 n:{tr:'Telefonu Aç',en:'Always Pick Up',es:'Coge siempre el teléfono',pt:'Sempre atenda',de:'Immer erreichbar',fr:'Toujours décrocher',it:'Rispondi sempre'},
 dsc:{tr:'Kötü haftalarda da telefondasın. Müşterin sarsıldığında daha az düşüyor.',
      en:'You answer in the bad weeks too. When a client is shaken, he falls less far.',
      es:'También contestas en las semanas malas. Cuando un cliente se tambalea, cae menos.',
      pt:'Você atende também nas semanas ruins. Quando um cliente balança, ele cai menos.',
      de:'Du gehst auch in schlechten Wochen ran. Wenn ein Klient wackelt, fällt er weniger tief.',
      fr:'Tu réponds aussi dans les mauvaises semaines. Quand un client vacille, il tombe moins bas.',
      it:'Rispondi anche nelle settimane storte. Quando un assistito vacilla, cade meno in basso.'}},
{id:'tb6',br:'tb',d:4,s:0,cost:2,req:['tb4','tb5'],eff:{neg:0.07,comm:0.015},
 n:{tr:'Odadaki En İyi',en:'Best in the Room',es:'El mejor de la sala',pt:'O melhor da sala',de:'Der Beste im Raum',fr:'Le meilleur de la salle',it:'Il migliore nella stanza'},
 dsc:{tr:'Masada kimse seni geçemiyor — ve kimse oranını da tartışmıyor.',
      en:'Nobody out-negotiates you. Nobody argues about your rate, either.',
      es:'Nadie te gana negociando. Y nadie discute tu porcentaje.',
      pt:'Ninguém negocia melhor que você. E ninguém discute sua taxa.',
      de:'Niemand verhandelt besser als du. Und niemand diskutiert über deinen Satz.',
      fr:"Personne ne négocie mieux que toi. Et personne ne discute ton taux.",
      it:'Nessuno tratta meglio di te. E nessuno discute la tua percentuale.'}},

/* --- SAHA (sağ) --- */
{id:'fd1',br:'fd',d:1,s:0,cost:1,req:[SK_HUB],eff:{scout:0.15},
 n:{tr:'Tanıdık Ağı',en:'People Who Owe You',es:'Gente que te debe favores',pt:'Gente que te deve favores',de:'Leute, die dir was schulden',fr:'Des gens qui te doivent',it:'Gente che ti deve un favore'},
 dsc:{tr:'Her ligde sana borcu olan biri var. Keşif ağı kurmak ucuzluyor.',
      en:'In every league somebody owes you a favour. Networks cost less to build.',
      es:'En cada liga hay alguien que te debe un favor. Montar redes sale más barato.',
      pt:'Em toda liga tem alguém que te deve um favor. Montar redes sai mais barato.',
      de:'In jeder Liga schuldet dir jemand einen Gefallen. Netzwerke aufzubauen wird billiger.',
      fr:"Dans chaque ligue, quelqu'un te doit un service. Monter un réseau coûte moins cher.",
      it:"In ogni campionato c'è qualcuno che ti deve un favore. Creare reti costa meno."}},
{id:'fd2',br:'fd',d:2,s:-1,cost:1,req:['fd1'],eff:{net:2},
 n:{tr:'Sahada Adamın Var',en:'Boots on the Ground',es:'Gente sobre el terreno',pt:'Gente no local',de:'Leute vor Ort',fr:'Des gens sur place',it:'Uomini sul posto'},
 dsc:{tr:'Gözcülerin çoktan orada. Yeni bir ağ haftalar önce çalışmaya başlıyor.',
      en:'Your people are already there. A new network comes online weeks earlier.',
      es:'Tu gente ya está allí. Una red nueva arranca semanas antes.',
      pt:'Seu pessoal já está lá. Uma rede nova entra no ar semanas antes.',
      de:'Deine Leute sind schon dort. Ein neues Netzwerk läuft Wochen früher an.',
      fr:'Tes gens sont déjà là-bas. Un nouveau réseau démarre des semaines plus tôt.',
      it:'La tua gente è già lì. Una nuova rete parte settimane prima.'}},
{id:'fd3',br:'fd',d:2,s:1,cost:1,req:['fd1'],eff:{pitch:0.05},
 n:{tr:'Doğru Kapıyı Çal',en:'Knock on the Right Door',es:'Llama a la puerta correcta',pt:'Bata na porta certa',de:'An der richtigen Tür klopfen',fr:'Frapper à la bonne porte',it:'Bussa alla porta giusta'},
 dsc:{tr:'Oyuncuya babası üzerinden mi, arkadaşı üzerinden mi gidileceğini biliyorsun.',
      en:'You know whether to go through the father or the best friend.',
      es:'Sabes si hay que ir a través del padre o del mejor amigo.',
      pt:'Você sabe se tem que chegar pelo pai ou pelo melhor amigo.',
      de:'Du weißt, ob der Weg über den Vater oder den besten Freund führt.',
      fr:'Tu sais s’il faut passer par le père ou par le meilleur ami.',
      it:"Sai se bisogna passare dal padre o dal migliore amico."}},
{id:'fd4',br:'fd',d:3,s:-1,cost:1,req:['fd2'],eff:{scout:0.20},
 n:{tr:'Ucuz Gözler',en:'Cheap Eyes',es:'Ojos baratos',pt:'Olheiros baratos',de:'Günstige Augen',fr:'Des yeux pas chers',it:'Occhi a buon mercato'},
 dsc:{tr:'Maçları senin yerine izleyen gençler var; hiçbiri pahalı değil.',
      en:'Young scouts watch the games for you, and none of them are expensive.',
      es:'Ojeadores jóvenes ven los partidos por ti, y ninguno sale caro.',
      pt:'Olheiros jovens assistem aos jogos por você, e nenhum deles sai caro.',
      de:'Junge Scouts schauen die Spiele für dich, und keiner davon ist teuer.',
      fr:'De jeunes recruteurs regardent les matchs pour toi, et aucun ne coûte cher.',
      it:'Giovani osservatori guardano le partite al posto tuo, e nessuno costa caro.'}},
{id:'fd5',br:'fd',d:3,s:1,cost:2,req:['fd3'],eff:{dev:0.35},
 n:{tr:'Antrenman Planı',en:'The Training Plan',es:'El plan de entrenamiento',pt:'O plano de treino',de:'Der Trainingsplan',fr:"Le plan d'entraînement",it:"Il piano d'allenamento"},
 dsc:{tr:'Müşterine kendi çalışma programını yaptırıyorsun. Sezon sonunda fark görülüyor.',
      en:'Your clients train to your plan. By the end of a season it shows.',
      es:'Tus clientes entrenan con tu plan. Al final de la temporada se nota.',
      pt:'Seus clientes treinam com o seu plano. No fim da temporada, dá para ver.',
      de:'Deine Klienten trainieren nach deinem Plan. Am Saisonende sieht man es.',
      fr:'Tes clients s’entraînent selon ton plan. En fin de saison, ça se voit.',
      it:'I tuoi assistiti si allenano con il tuo piano. A fine stagione si vede.'}},
{id:'fd6',br:'fd',d:4,s:0,cost:2,req:['fd4','fd5'],eff:{val:0.06,dev:0.20},
 n:{tr:'Vitrine Çıkar',en:'Put Him in the Window',es:'Ponlo en el escaparate',pt:'Coloque na vitrine',de:'Ins Schaufenster stellen',fr:'Le mettre en vitrine',it:'Mettilo in vetrina'},
 dsc:{tr:'Müşterini doğru maçlarda, doğru gözlerin önünde oynatıyorsun.',
      en:'You get your client seen in the right games, by the right people.',
      es:'Consigues que vean a tu cliente en los partidos adecuados, ante la gente adecuada.',
      pt:'Você faz seu cliente ser visto nos jogos certos, pelas pessoas certas.',
      de:'Du sorgst dafür, dass dein Klient in den richtigen Spielen von den richtigen Leuten gesehen wird.',
      fr:'Tu fais voir ton client dans les bons matchs, par les bonnes personnes.',
      it:'Fai vedere il tuo assistito nelle partite giuste, dalle persone giuste.'}},

/* --- AJANS (aşağı) --- */
{id:'ag1',br:'ag',d:1,s:0,cost:1,req:[SK_HUB],eff:{cost:0.15},
 n:{tr:'Sıkı Bütçe',en:'Lean Office',es:'Oficina austera',pt:'Escritório enxuto',de:'Schlankes Büro',fr:'Bureau sobre',it:'Ufficio snello'},
 dsc:{tr:'Küçük ofis, az masraf. Haftalık giderin geriliyor.',
      en:'Small office, small bills. Your weekly overhead drops.',
      es:'Oficina pequeña, facturas pequeñas. Tus gastos fijos semanales bajan.',
      pt:'Escritório pequeno, contas pequenas. Seu custo fixo semanal cai.',
      de:'Kleines Büro, kleine Rechnungen. Deine wöchentlichen Fixkosten sinken.',
      fr:'Petit bureau, petites factures. Tes frais fixes hebdo baissent.',
      it:'Ufficio piccolo, bollette piccole. I tuoi costi fissi settimanali calano.'}},
{id:'ag2',br:'ag',d:2,s:-1,cost:1,req:['ag1'],eff:{cap:1},
 n:{tr:'Ortak Al',en:'Take On a Partner',es:'Busca un socio',pt:'Arrume um sócio',de:'Nimm einen Partner auf',fr:'Prendre un associé',it:'Prenditi un socio'},
 dsc:{tr:'Yükü paylaşacak birini buldun. Bir müşteri daha taşıyabilirsin.',
      en:'You found someone to share the load. One more client fits.',
      es:'Has encontrado a alguien con quien repartir la carga. Cabe un cliente más.',
      pt:'Você achou alguém para dividir o peso. Cabe mais um cliente.',
      de:'Du hast jemanden gefunden, der die Last mitträgt. Ein Klient mehr passt rein.',
      fr:"Tu as trouvé quelqu'un pour partager la charge. Un client de plus trouve sa place.",
      it:"Hai trovato qualcuno con cui dividere il carico. C'è posto per un assistito in più."}},
{id:'ag3',br:'ag',d:2,s:1,cost:1,req:['ag1'],eff:{cost:0.15},
 n:{tr:'İyi Bir Muhasebeci',en:'A Good Accountant',es:'Un buen contable',pt:'Um bom contador',de:'Ein guter Buchhalter',fr:'Un bon comptable',it:'Un buon commercialista'},
 dsc:{tr:'Parayı nereye kaçırdığını gösteren biri. Giderin bir kez daha geriliyor.',
      en:'Someone who shows you where the money leaks. Overhead drops again.',
      es:'Alguien que te enseña por dónde se escapa el dinero. Los gastos fijos vuelven a bajar.',
      pt:'Alguém que mostra por onde o dinheiro escorre. O custo fixo cai de novo.',
      de:'Jemand, der dir zeigt, wo das Geld versickert. Die Fixkosten sinken noch einmal.',
      fr:"Quelqu'un qui te montre où l'argent fuit. Les frais fixes baissent encore.",
      it:'Qualcuno che ti mostra dove scappano i soldi. I costi fissi calano ancora.'}},
{id:'ag4',br:'ag',d:3,s:-1,cost:1,req:['ag2'],eff:{cap:1},
 n:{tr:'İkinci Ofis',en:'Second Office',es:'Segunda oficina',pt:'Segundo escritório',de:'Zweites Büro',fr:'Deuxième bureau',it:'Secondo ufficio'},
 dsc:{tr:'Başka bir şehirde bir oda, bir masa, bir telefon. Portföy büyüyor.',
      en:'A room, a desk and a phone in another city. The roster grows.',
      es:'Un despacho, una mesa y un teléfono en otra ciudad. La cartera crece.',
      pt:'Uma sala, uma mesa e um telefone em outra cidade. A carteira cresce.',
      de:'Ein Raum, ein Schreibtisch und ein Telefon in einer anderen Stadt. Das Portfolio wächst.',
      fr:'Une pièce, un bureau et un téléphone dans une autre ville. Le portefeuille grandit.',
      it:"Una stanza, una scrivania e un telefono in un'altra città. La scuderia cresce."}},
{id:'ag5',br:'ag',d:3,s:1,cost:2,req:['ag3'],eff:{repg:0.15},
 n:{tr:'Basınla Ara',en:'Court the Press',es:'Cuida a la prensa',pt:'Cultive a imprensa',de:'Pflege die Presse',fr:'Soigner la presse',it:'Coltiva la stampa'},
 dsc:{tr:'Doğru gazetecilerle yemek yiyorsun. Yaptığın her iş daha çok duyuluyor.',
      en:'You have lunch with the right journalists. Everything you do lands louder.',
      es:'Comes con los periodistas adecuados. Todo lo que haces suena más fuerte.',
      pt:'Você almoça com os jornalistas certos. Tudo o que você faz repercute mais.',
      de:'Du gehst mit den richtigen Journalisten essen. Alles, was du tust, hallt lauter nach.',
      fr:'Tu déjeunes avec les bons journalistes. Tout ce que tu fais résonne plus fort.',
      it:'Pranzi con i giornalisti giusti. Tutto ciò che fai fa più rumore.'}},
{id:'ag6',br:'ag',d:4,s:0,cost:2,req:['ag4','ag5'],eff:{comm:0.02,cost:0.15},
 n:{tr:'Adın Yeter',en:'Your Name Is Enough',es:'Tu nombre basta',pt:'Seu nome basta',de:'Dein Name reicht',fr:'Ton nom suffit',it:'Basta il tuo nome'},
 dsc:{tr:'Artık kapıları adın açıyor; pazarlık ettiğin tek şey kendi oranın.',
      en:'Your name opens the doors now. The only thing you negotiate is your own rate.',
      es:'Ahora las puertas las abre tu nombre. Lo único que negocias es tu propio porcentaje.',
      pt:'Agora é o seu nome que abre as portas. A única coisa que você negocia é a sua própria taxa.',
      de:'Jetzt öffnet dein Name die Türen. Das Einzige, was du verhandelst, ist dein eigener Satz.',
      fr:"C'est ton nom qui ouvre les portes maintenant. La seule chose que tu négocies, c'est ton propre taux.",
      it:"Ora le porte le apre il tuo nome. L'unica cosa che tratti è la tua percentuale."}},

/* --- AĞ (sol) --- */
{id:'nw1',br:'nw',d:1,s:0,cost:1,req:[SK_HUB],eff:{bid:0.05},
 n:{tr:'Telefon Defteri',en:'The Little Black Book',es:'La agenda negra',pt:'A agenda de contatos',de:'Das kleine schwarze Buch',fr:'Le petit carnet noir',it:"L'agendina nera"},
 dsc:{tr:'Her kulüpte doğrudan arayabileceğin bir numara var. Teklifler dikkate alınıyor.',
      en:'At every club there is a number you can call directly. Your bids get read.',
      es:'En cada club hay un número al que puedes llamar directamente. Tus ofertas se leen.',
      pt:'Em cada clube tem um número para o qual você liga direto. Suas propostas são lidas.',
      de:'In jedem Verein gibt es eine Nummer, die du direkt anrufen kannst. Deine Gebote werden gelesen.',
      fr:'Dans chaque club, il y a un numéro que tu peux appeler directement. Tes offres sont lues.',
      it:"In ogni club c'è un numero che puoi chiamare direttamente. Le tue offerte vengono lette."}},
{id:'nw2',br:'nw',d:2,s:-1,cost:1,req:['nw1'],eff:{fee:0.06},
 n:{tr:'Aracının Aracısı',en:'Friends of Friends',es:'Amigos de amigos',pt:'Amigos de amigos',de:'Freunde von Freunden',fr:"Les amis d'amis",it:'Amici degli amici'},
 dsc:{tr:'Anlaşmanın içinde senin payını büyütecek bir kalem hep bulunuyor.',
      en:'There is always a line in the deal that makes your share bigger.',
      es:'Siempre hay una línea del acuerdo que agranda tu parte.',
      pt:'Sempre existe uma linha no acordo que aumenta a sua parte.',
      de:'Im Vertrag gibt es immer eine Zeile, die deinen Anteil größer macht.',
      fr:"Il y a toujours une ligne dans l'accord qui grossit ta part.",
      it:"C'è sempre una riga nell'accordo che fa crescere la tua parte."}},
{id:'nw3',br:'nw',d:2,s:1,cost:1,req:['nw1'],eff:{mor:0.20},
 n:{tr:'Kapıyı Aralık Tut',en:'Keep the Door Open',es:'Deja la puerta abierta',pt:'Deixe a porta aberta',de:'Lass die Tür offen',fr:'Laisser la porte ouverte',it:'Lascia la porta aperta'},
 dsc:{tr:'Kızgın müşteri seni değil, kapıyı buluyor. Moral kayıpları hafifliyor.',
      en:'An angry client finds the door, not you. Morale hits land softer.',
      es:'Un cliente enfadado encuentra la puerta, no a ti. Los golpes a la moral pegan más suave.',
      pt:'Um cliente irritado encontra a porta, não você. Os golpes na moral doem menos.',
      de:'Ein wütender Klient findet die Tür, nicht dich. Moraldämpfer treffen sanfter.',
      fr:'Un client en colère trouve la porte, pas toi. Les coups au moral font moins mal.',
      it:'Un assistito arrabbiato trova la porta, non te. I colpi al morale fanno meno male.'}},
{id:'nw4',br:'nw',d:3,s:-1,cost:1,req:['nw2'],eff:{bid:0.06},
 n:{tr:'Sıcak Hat',en:'The Hotline',es:'Línea directa',pt:'Linha direta',de:'Der heiße Draht',fr:'La ligne directe',it:'La linea diretta'},
 dsc:{tr:'Sportif direktörler telefonunu ilk turda açıyor.',
      en:'Sporting directors pick up on the first ring.',
      es:'Los directores deportivos contestan al primer tono.',
      pt:'Os diretores de futebol atendem no primeiro toque.',
      de:'Sportdirektoren gehen beim ersten Klingeln ran.',
      fr:'Les directeurs sportifs décrochent dès la première sonnerie.',
      it:'I direttori sportivi rispondono al primo squillo.'}},
{id:'nw5',br:'nw',d:3,s:1,cost:2,req:['nw3'],eff:{pitch:0.06,mor:0.15,loy:0.20},
 n:{tr:'Yıldız Muamelesi',en:'Star Treatment',es:'Trato de estrella',pt:'Tratamento de estrela',de:'Star-Behandlung',fr:'Traitement de star',it:'Trattamento da star'},
 dsc:{tr:'Müşterin kendini portföyün en önemli adamı gibi hissediyor — çünkü öyle davranıyorsun. Rakip ajansın telefonu boşuna çalıyor.',
      en:'Your client feels like the most important man on your books, because you treat him that way. Rival agencies call for nothing.',
      es:'Tu cliente se siente el más importante de tu cartera, porque lo tratas así. Las agencias rivales llaman en vano.',
      pt:'Seu cliente se sente o mais importante da sua carteira, porque você o trata assim. As agências rivais ligam à toa.',
      de:'Dein Klient fühlt sich als wichtigster Mann in deinem Portfolio, weil du ihn so behandelst. Rivalisierende Agenturen rufen vergeblich an.',
      fr:"Ton client se sent le plus important de ton portefeuille, parce que tu le traites ainsi. Les agences rivales appellent pour rien.",
      it:'Il tuo assistito si sente il più importante della tua scuderia, perché lo tratti così. Le agenzie rivali chiamano a vuoto.'}},
{id:'nw6',br:'nw',d:4,s:0,cost:2,req:['nw4','nw5'],eff:{fee:0.10,bid:0.04},
 n:{tr:'Büyük Anlaşma',en:'The Big One',es:'El gran golpe',pt:'O grande negócio',de:'Der große Wurf',fr:'Le gros coup',it:'Il colpo grosso'},
 dsc:{tr:'Artık transferi sen kuruyorsun, kulüpler yalnızca imzalıyor.',
      en:'You build the transfer now. The clubs only sign it.',
      es:'Ahora el traspaso lo montas tú. Los clubes solo lo firman.',
      pt:'Agora quem monta a transferência é você. Os clubes só assinam.',
      de:'Jetzt baust du den Transfer. Die Vereine unterschreiben nur noch.',
      fr:"C'est toi qui montes le transfert maintenant. Les clubs ne font que signer.",
      it:'Ora il trasferimento lo costruisci tu. I club si limitano a firmare.'}}
];

/* ===== düğüm simgeleri =====
   Her düğümün kendi simgesi var. Ağaçta simgeye gerek yoktu — düğümü KONUMU
   ayırt ediyordu, o yüzden dört dal glifi (SKICONS) yetiyordu. Kart ızgarasında
   konum yok: bir dalın altı kartı yan yana durunca aynı glif altı kez tekrar
   ederdi. Bu yüzden 24 düğümün her biri kendi çizimini taşıyor.

   Simgeler yetenek kaydının yanında duruyor ki ad, etki ve simge birlikte
   değişsin; arayüz yalnız skIcon() üzerinden okuyor, ikinci bir kopya yok.
   SKICONS'taki beş dal/hub glifi yerinde kalıyor ve artık yalnız dal başlığında
   kullanılıyor — orada tekrar kusur değil, gruplamanın kendisi.

   Biçim: 24x24 kutu, fill="none", stroke="currentColor", 1.8 kalınlık, yuvarlak
   uç ve köşe — uygulamanın geri kalanıyla aynı çizim dili (bkz. ICONS/ui.js).
   Harf, rakam ve raster yok; dolu olan tek şey nokta işaretleri, onlar da
   fill="currentColor" stroke="none" ile kendi kuralını taşıyor. Kaynak taslaklar
   tek tek yeniden çizildi: dolu beyaz alanlar (spot konisi) monoline'a çevrildi,
   sahte rakamlar ve mikro toz parçaları atıldı, 24px'te ayrışmayan çizgiler
   birleştirildi. */
const SK_ICON={
 /* MASA — sözleşme, pazarlık, güven */
 tb1:'<path d="M12 7.4v11.8"/><path d="M12 7.4C10.4 6.1 8.2 5.4 5.4 5.4H3.4v11.8h2c2.8 0 5 .7 6.6 2"/><path d="M12 7.4c1.6-1.3 3.8-2 6.6-2h2v11.8h-2c-2.8 0-5 .7-6.6 2"/><path d="M5.8 9.2h3.4"/><path d="M5.8 12.4h3.4"/><path d="M14.8 9.2h3.4"/><path d="M14.8 12.4h3.4"/>',
 tb2:'<rect x="2.8" y="4" width="8.6" height="16" rx="2"/><path d="M5.1 7.6h4"/><circle cx="5.3" cy="11.8" r=".9" fill="currentColor" stroke="none"/><circle cx="8.9" cy="11.8" r=".9" fill="currentColor" stroke="none"/><circle cx="5.3" cy="15.4" r=".9" fill="currentColor" stroke="none"/><circle cx="8.9" cy="15.4" r=".9" fill="currentColor" stroke="none"/><path d="M13.4 17.8 16.4 13.8l2.4 2.4 2.8-4.6"/><path d="M17.6 11.6h4v4"/>',
 tb3:'<path d="M7.4 13.8V7.6a1.5 1.5 0 0 1 3 0v3.6"/><path d="M10.4 11.2V5.8a1.5 1.5 0 0 1 3 0v5.4"/><path d="M13.4 11.2V6.6a1.5 1.5 0 0 1 3 0v4.6"/><path d="M16.4 11.4V8.8a1.5 1.5 0 0 1 3 0v5.4c0 3.5-2.8 6.4-6.4 6.4h-1.2a6.4 6.4 0 0 1-4.5-1.9l-3.5-3.5a1.6 1.6 0 0 1 2.2-2.2l2.4 2.3"/>',
 tb4:'<path d="M10.1 3H4.6a1.7 1.7 0 0 0-1.7 1.7v14.6A1.7 1.7 0 0 0 4.6 21h6.4a1.7 1.7 0 0 0 1.7-1.7V5.6z"/><path d="M10.1 3v2.6h2.6"/><path d="M5.6 9.6h4.4"/><path d="M5.6 12.8h4.4"/><path d="M5.6 16h2.8"/><rect x="13.8" y="12.2" width="7.6" height="8.8" rx="1.5"/><path d="M13.8 15.2h7.6"/><path d="M16.2 10.8v2.6"/><path d="M19 10.8v2.6"/>',
 tb5:'<path d="M4.6 3.4h2.8a1.6 1.6 0 0 1 1.58 1.34l.54 3.24a1.6 1.6 0 0 1-.86 1.71l-1.36.68a13.4 13.4 0 0 0 6.34 6.34l.68-1.36a1.6 1.6 0 0 1 1.71-.86l3.24.54A1.6 1.6 0 0 1 20.6 16.6v2.8a1.6 1.6 0 0 1-1.76 1.59C10.1 20.03 3.97 13.9 3.01 5.16A1.6 1.6 0 0 1 4.6 3.4z"/>',
 tb6:'<rect x="9" y="2.6" width="6" height="3.6" rx="1.7"/><rect x="8.2" y="7.2" width="7.6" height="6.4" rx="2"/><path d="M4.8 11.2v2.4"/><path d="M19.2 11.2v2.4"/><path d="M4.8 11.6h3.4"/><path d="M15.8 11.6h3.4"/><path d="M2.8 13.6h18.4"/><path d="M4.6 13.6 3.4 20.8"/><path d="M19.4 13.6 20.6 20.8"/><path d="M5.6 17.4h12.8"/>',

 /* SAHA — keşif, yetenek bulma, gelişim */
 fd1:'<path d="M6.8 6.6 16.9 4.1a1.4 1.4 0 0 1 1.7 1l.45 1.9"/><rect x="4.4" y="7.6" width="15.2" height="10" rx="1.8"/><circle cx="9.2" cy="11.4" r="1.9"/><path d="M6.4 15.4a3.3 3.3 0 0 1 5.6 0"/><path d="M14.2 10.6h3.2"/><path d="M14.2 13.6h3.2"/>',
 fd2:'<path d="M3.4 3.8h4.2a1.5 1.5 0 0 1 1.5 1.4l.3 4a2 2 0 0 0 1.4 1.72l6.1 1.8a3.1 3.1 0 0 1 2.3 2.99v.59a1.5 1.5 0 0 1-1.5 1.5H3.4z"/><path d="M3.4 15.2h13.4"/><path d="M5 6.6h2.8"/><path d="M5 9.4h3.2"/><path d="M6.6 17.8v1.7"/><path d="M11 17.8v1.7"/><path d="M15.4 17.8v1.7"/><path d="M2.6 19.9h18.8"/>',
 fd3:'<rect x="3.4" y="3" width="10" height="18" rx="1.2"/><circle cx="10.8" cy="12.4" r="1" fill="currentColor" stroke="none"/><rect x="15.2" y="8.8" width="6.4" height="6.4" rx="2.4"/><path d="M15.2 10.9h6.4"/><path d="M15.2 13.1h6.4"/><path d="M15.2 12.7a1.35 1.35 0 0 1 0-2.7"/><path d="M15 7.2 14.2 5.8"/><path d="M17.6 6.6 17.8 5"/><path d="M20.4 7.4 21.6 6"/>',
 fd4:'<circle cx="6.6" cy="10.6" r="3.3"/><circle cx="13.8" cy="10.6" r="3.3"/><path d="M9.9 9.4h1.2"/><path d="M4.5 7.9 5.1 4.3a1.1 1.1 0 0 1 1.08-.9h.84a1.1 1.1 0 0 1 1.08.9l.5 3.6"/><path d="M15.9 7.9 15.3 4.3a1.1 1.1 0 0 0-1.08-.9h-.84a1.1 1.1 0 0 0-1.08.9l-.5 3.6"/><path d="M14.9 17.7l2.9 2.9a1.1 1.1 0 0 0 1.56 0l1.84-1.84a1.1 1.1 0 0 0 0-1.56l-2.9-2.9a1.1 1.1 0 0 0-.84-.32l-2.02.12a1.1 1.1 0 0 0-1.03 1.03l-.12 2.02a1.1 1.1 0 0 0 .32.84z"/><circle cx="16.35" cy="16.15" r=".8"/>',
 fd5:'<rect x="3.2" y="3.4" width="17.6" height="13.2" rx="1.6"/><path d="M12 3.4v13.2"/><circle cx="12" cy="10" r="2.2"/><path d="M3.2 7.4h2.8v5.2H3.2"/><path d="M20.8 7.4H18v5.2h2.8"/><path d="M5.6 21.4 7.6 17.2l2 4.2z"/><path d="M14.4 21.4 16.4 17.2l2 4.2z"/>',
 fd6:'<path d="M9.8 2.8h4.4l1.4 2.6H8.4z"/><path d="M8.4 5.4 4.4 16.2"/><path d="M15.6 5.4 19.6 16.2"/><circle cx="12" cy="11.8" r="2.5"/><path d="M7.6 21.2v-2a4.4 4.4 0 0 1 8.8 0v2"/>',

 /* AJANS — para, gider, kapasite, ad duyurma */
 ag1:'<path d="M9.2 3.4h2.6l.9 3.8H8.3z"/><path d="M8.3 7.2c-2.5 1.5-4.1 4.1-4.1 6.9 0 3.4 2.6 5.6 6.3 5.6s6.3-2.2 6.3-5.6c0-2.8-1.6-5.4-4.1-6.9"/><circle cx="10.5" cy="13.6" r="2.3"/><path d="M20 8.6v8"/><path d="M17.7 14.3 20 16.6l2.3-2.3"/>',
 ag2:'<circle cx="9.4" cy="7.6" r="3.6"/><path d="M3 20.8v-1.4a6.4 6.4 0 0 1 12.8 0v1.4"/><path d="M19.4 8.6v6"/><path d="M16.4 11.6h6"/>',
 ag3:'<rect x="3" y="3.2" width="10.4" height="17.6" rx="1.6"/><path d="M5.6 7.2h5.2"/><path d="M5.6 10.4h5.2"/><path d="M5.6 13.6h3.4"/><rect x="13.8" y="12.2" width="7.6" height="8.6" rx="1.4"/><path d="M13.8 15.4h7.6"/><path d="M13.8 18.2h7.6"/><circle cx="16" cy="15.4" r=".95" fill="currentColor" stroke="none"/><circle cx="19.2" cy="15.4" r=".95" fill="currentColor" stroke="none"/><circle cx="17.6" cy="18.2" r=".95" fill="currentColor" stroke="none"/><circle cx="20.4" cy="18.2" r=".95" fill="currentColor" stroke="none"/>',
 ag4:'<rect x="3.2" y="9.2" width="7.2" height="11.4" rx="1"/><rect x="12" y="4.8" width="8.8" height="15.8" rx="1"/><path d="M2.4 20.6h19.2"/><path d="M5.6 12.2h1.8"/><path d="M5.6 15.6h1.8"/><path d="M14.4 8h1.8"/><path d="M17.8 8h1.8"/><path d="M14.4 12h1.8"/><path d="M17.8 12h1.8"/>',
 ag5:'<rect x="4.4" y="2.8" width="5.8" height="9.8" rx="2.9"/><path d="M6.1 5.6h2.4"/><path d="M6.1 7.8h2.4"/><path d="M2.6 10.6a4.7 4.7 0 0 0 9.4 0"/><path d="M7.3 15.3v3.2"/><path d="M4.9 18.5h4.8"/><rect x="13.6" y="10.2" width="8" height="6" rx="1.2"/><path d="M17.6 10.2V8.4"/><path d="M15.4 12.4h1.4"/><path d="M15.4 14.2h3.4"/>',
 ag6:'<path d="M3.6 12.4c1.9-4.6 3.7-6.6 4.8-6.1 1.1.5-.2 4.4-1.2 6.9-.7 1.7-.2 2.5.9 2.1 1.3-.5 2.4-2 3.4-3.1.9-1 1.7-.8 1.7.4 0 1.2.6 1.8 1.6 1.3 1-.5 2.4-1.8 3.8-3.2"/><rect x="5" y="17.4" width="14" height="4.2" rx="1.2"/><rect x="7.2" y="18.8" width="9.6" height="1.4" rx=".7"/>',

 /* AĞ — kulüp ilişkileri, transfer masası, müşteriyi tutmak */
 nw1:'<path d="M6.6 3.2h10.4a1.8 1.8 0 0 1 1.8 1.8v14a1.8 1.8 0 0 1-1.8 1.8H6.6z"/><path d="M6.6 3.2a2.2 2.2 0 0 0-2.2 2.2v13.2a2.2 2.2 0 0 0 2.2 2.2"/><path d="M18.8 7.4h2.2"/><path d="M18.8 11.4h2.2"/><path d="M18.8 15.4h2.2"/><path d="M10.4 3.2v5.2l1.9-1.5 1.9 1.5V3.2"/>',
 nw2:'<path d="M10.2 13.8 8.4 15.6a3.6 3.6 0 0 1-5.1-5.1l3.2-3.2a3.6 3.6 0 0 1 5.1 0"/><path d="M13.8 10.2l1.8-1.8a3.6 3.6 0 0 1 5.1 5.1l-3.2 3.2a3.6 3.6 0 0 1-5.1 0"/>',
 nw3:'<rect x="4.4" y="3.2" width="11" height="17.4" rx="1"/><path d="M15.4 5.4 20.6 3.2v17.4l-5.2-2.2z"/><circle cx="17" cy="12" r=".9" fill="currentColor" stroke="none"/><path d="M2.8 20.6h18.4"/>',
 nw4:'<rect x="2.6" y="12.8" width="5.4" height="5" rx="1.8"/><rect x="16" y="12.8" width="5.4" height="5" rx="1.8"/><path d="M5.3 12.8v-1.2a14 8 0 0 1 13.4 0v1.2"/><path d="M8.6 8.2a4.8 4.8 0 0 1 6.8 0"/><path d="M6.2 5.6a8.4 8.4 0 0 1 11.6 0"/>',
 nw5:'<circle cx="8.8" cy="7.6" r="3.4"/><path d="M2.8 20.8v-1.2a6 6 0 0 1 12 0v1.2"/><path d="m18 5 1.24 2.51 2.77.4-2 1.95.47 2.76-2.48-1.3-2.48 1.3.47-2.76-2-1.95 2.77-.4z"/>',
 nw6:'<rect x="2.6" y="8.6" width="18.8" height="12" rx="2"/><path d="M8.6 8.6V6.9a1.8 1.8 0 0 1 1.8-1.8h3.2a1.8 1.8 0 0 1 1.8 1.8v1.7"/><path d="M2.6 12.8h18.8"/><circle cx="12" cy="16.4" r="2.6"/><path d="M12 14.9v3"/><path d="M13 15.6a1.3 1.3 0 0 0-1-.4c-.7 0-1.2.35-1.2.9s.45.75 1.2.9c.75.15 1.2.4 1.2.9s-.5.9-1.2.9c-.4 0-.8-.15-1-.4"/>'
};
/* Simgenin tek okuma noktası. Bilinmeyen bir düğüm için boş dönüyor; çağıran
   taraf dal glifine düşer, böylece simgesiz eklenen bir düğüm boş kutu değil
   dalının işaretini gösterir. */
function skIcon(id){return SK_ICON[id]||'';}
/* ===== dal sekmesi simgeleri (yalnız saha) =====
   SKICONS'taki dört dal glifi ağacın içindi: orada düğümün ne olduğunu KONUM
   söylüyor, glif yalnızca hangi dala ait olduğunu işaretliyor. Saha'nın sekme
   şeridinde ise glif tek başına dalın ADINI anlatmak zorunda ve 19px'te çiziliyor
   (.skTabIc svg). Eski dördü orada zayıf kalıyordu: belge "sözleşme" diyordu ama
   müzakereyi anlatmıyordu, nişangâh sahaya benzemiyordu, dolar ajansı yalnız
   parayla eşliyordu.

   Bu yüzden AYRI bir kaynak: SKICONS olduğu gibi duruyor ve dosya/gazete/terminal
   temalarının ağacı hiç etkilenmiyor. Aşağıdakiler yalnız useSahaSkills() yolundan,
   skBranchIcon() üzerinden okunuyor.

   Dördü de 19px'te rasterize edilip denendi; kalabalık olan her ayrıntı atıldı:
     tb — masanın iki yanında iki taraf, ortada evrak. Tokalaşma denenmedi bile,
          önceki turda 24px'te mobilya gibi okunduğu ölçülmüştü.
     fd — saha sınırı + orta çizgi + orta yuvarlak + iki ceza sahası. Ceza sahaları
          19px'te ayrışıyor ve "futbol sahası" okumasını asıl onlar sağlıyor.
     ag — tek kurumsal merkez: cephe, belirgin kemerli giriş, iki sıra pencere.
          Şehir silueti değil (birden fazla bina jenerik duruyordu), para değil.
     nw — merkez + dört temas noktası. Eski üç düğümlü glif paylaş düğmesine
          benziyordu; dört yön simetrisi onu ağ yapıyor ve optik ağırlığı
          diğer üçüyle eşitliyor. */
const SK_SAHA_BRANCH_ICON={
 tb:'<circle cx="6.6" cy="7.2" r="2.4"/><circle cx="17.4" cy="7.2" r="2.4"/><path d="M2.4 15h19.2"/><path d="M6.6 15v4.2"/><path d="M17.4 15v4.2"/><path d="M9.8 11.6h4.4v3.4H9.8z"/>',
 fd:'<rect x="2.6" y="4.6" width="18.8" height="14.8" rx="1.5"/><path d="M12 4.6v14.8"/><circle cx="12" cy="12" r="2.9"/><path d="M2.6 8.8h2.6v6.4H2.6"/><path d="M21.4 8.8h-2.6v6.4h2.6"/>',
 ag:'<path d="M4.8 20.8V6.2a1.6 1.6 0 0 1 1.6-1.6h11.2a1.6 1.6 0 0 1 1.6 1.6v14.6"/><path d="M2.6 20.8h18.8"/><path d="M10 20.8v-4a2 2 0 0 1 4 0v4"/><path d="M7.4 8.8h2.4"/><path d="M14.2 8.8h2.4"/><path d="M7.4 13h2.4"/><path d="M14.2 13h2.4"/>',
 nw:'<circle cx="12" cy="12" r="2.7"/><circle cx="12" cy="5" r="1.9"/><circle cx="12" cy="19" r="1.9"/><circle cx="5" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/><path d="M12 7.3v2"/><path d="M12 14.7v2"/><path d="M7.3 12h2"/><path d="M14.7 12h2"/>'
};
/* Tek okuma noktası. Bilinmeyen dal için boş dönüyor; çağıran taraf SKICONS'a
   düşer, yani yeni bir dal simgesiz eklense bile sekme boş kalmaz. */
function skBranchIcon(id){return SK_SAHA_BRANCH_ICON[id]||'';}
/* Ağacın tam bedeli: "kaç puanlık ağaç" sorusunun tek kaynağı. Özet karttaki
   ilerleme oranı bunu okuyor — 32 sayısı hiçbir yere elle yazılmıyor. */
function skillTreeCost(){return SKILLS.reduce((s,k)=>s+(k.cost||0),0);}

/* ===== yerleşim =====
   Izgara birimi SK_GEO.unit; merkez (0,0). Dalın yönü (ax,ay) ise yan kollar
   bu vektörün dikine (-ay,ax) açılıyor. Böylece dört yön de tek formülle çiziliyor. */
const SK_GEO={unit:100, r:34, rBig:39, rHub:46, hit:47, pad:66};
function skBranch(id){return SK_BRANCH.find(b=>b.id===id)||null;}
function skPos(sk){
  const b=skBranch(sk.br);
  if(!b)return {x:0,y:0};
  const [ax,ay]=b.dir;
  return {x:(ax*sk.d-ay*sk.s)*SK_GEO.unit, y:(ay*sk.d+ax*sk.s)*SK_GEO.unit};
}
function skById(id){return SKILLS.find(x=>x.id===id)||null;}
function skRadius(sk){return sk.id===SK_HUB?SK_GEO.rHub:sk.d>=4?SK_GEO.rBig:SK_GEO.r;}
/* Ağacın kapladığı alan düğümlerden hesaplanıyor — yeni bir dal eklendiğinde
   görünüm kutusu kendiliğinden büyüsün. */
function skViewBox(){
  let m=0;
  SKILLS.forEach(sk=>{const p=skPos(sk);m=Math.max(m,Math.abs(p.x),Math.abs(p.y));});
  const h=m+SK_GEO.pad;
  return [-h,-h,h*2,h*2].join(' ');
}
/* Çizilecek yollar: her düğüm önkoşullarına bir çizgiyle bağlanır. */
function skEdges(){
  const out=[];
  SKILLS.forEach(sk=>{
    (sk.req||[]).forEach(rid=>{
      const from=skById(rid);
      if(from)out.push({a:from,b:sk});
    });
  });
  return out;
}

/* ===== puan muhasebesi ===== */
/* Eski kayıtlarda dal/kademe düzeninde dokuz yetenek vardı; karşılıkları yeni
   ağaçta duruyor. Kimse ilerlemesini kaybetmesin diye okurken çevriliyor. */
const SK_LEGACY={neg1:'tb1',neg2:'tb3',neg3:'tb6',sco1:'fd1',sco2:'fd3',sco3:'fd6',
                 biz1:'ag1',biz2:'ag2',biz3:'ag6'};
function skillsTaken(){
  const raw=(S&&S.skills)||[];
  const out=[];
  raw.forEach(id=>{
    const n=SK_LEGACY[id]||id;
    if(skById(n)&&out.indexOf(n)<0)out.push(n);
  });
  return out;
}
function hasSkill(id){return id===SK_HUB||skillsTaken().indexOf(id)>=0;}
function skillSpent(){return skillsTaken().reduce((s,id)=>{const k=skById(id);return s+(k?k.cost:0);},0);}
/* Alt sınır harcanan puandır — eğri değişse bile kimse puan borcuna düşmesin. */
function skillEarned(){return S?Math.max(levelPoints(agentLevel()),skillSpent()):0;}
function skillPoints(){return skillEarned()-skillSpent();}
/* Bir düğüm, bağlı olduğu düğümlerden biri açılmadan alınamaz. */
function skillLocked(sk){return (sk.req||[]).some(id=>hasSkill(id))?null:'req';}
/* Düğümün durumu — arayüz de, satın alma da aynı yerden okuyor. */
function skillState(sk){
  if(hasSkill(sk.id))return 'owned';
  if(skillLocked(sk))return 'lock';
  return skillPoints()>=sk.cost?'open':'poor';
}
/* Son açılan düğüm: arayüz bunu bir kez animasyonla çizip unutur. */
let skJustTaken=null;
function skillBuy(id){
  const sk=skById(id);
  if(!sk||hasSkill(id))return;
  if(skillLocked(sk)){toast(t('skLockedT'));return;}
  if(skillPoints()<sk.cost){toast(t('skNoPoints'));return;}
  S.skills=skillsTaken().concat([id]);
  skJustTaken=id;
  toast(t('skUnlocked').replace('{n}',tx(sk.n)));
  closeModal();save();render();
}
/* Etkilerin tek okuma noktası — oyunun geri kalanı buradan geçer. */
function skillBonus(key){
  return skillsTaken().reduce((s,id)=>{
    const k=skById(id);
    return s+((k&&k.eff&&k.eff[key])||0);
  },0);
}
/* Dal ilerlemesi: arayüzdeki "3/6" rozeti. */
function branchTaken(br){return SKILLS.filter(sk=>sk.br===br&&hasSkill(sk.id)).length;}
function branchTotal(br){return SKILLS.filter(sk=>sk.br===br).length;}
