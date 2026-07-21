'use strict';
/* js/data.js — statik veri: isim havuzları, kıtalar, ülkeler, ligler, takımlar, kupalar */
/* ================= NAME POOLS ================= */
const NATS={
tr:{c:'TUR',f:['Emre','Burak','Kerem','Arda','Mert','Yusuf','Kaan','Berat','Umut','Onur','Cenk','Halil','Ozan','Tolga','Serkan','Volkan','Barış','Efe','Doruk','Çağlar','İsmail','Salih','Furkan','Enes','Oğuz','Hakan','Semih','Taha','Alper','Metin','Deniz','Görkem','Batuhan','Yiğit','Emirhan','Ferdi'],
 l:['Yılmaz','Kaya','Demir','Şahin','Çelik','Aydın','Arslan','Doğan','Kılıç','Koç','Kurt','Özkan','Şimşek','Polat','Erdoğan','Aksoy','Güler','Bulut','Duman','Tekin','Yıldırım','Karaca','Öztürk','Ateş','Toprak','Bozkurt','Sönmez','Turan','Avcı','Keskin','Sarı','Uçar','Baran','Acar','Tuna','Korkmaz']},
en:{c:'ENG',f:['Jack','Harry','Oliver','George','Charlie','Jacob','Thomas','Oscar','William','James','Henry','Leo','Joshua','Freddie','Archie','Logan','Alex','Mason','Callum','Kyle','Reece','Jayden','Ethan','Lewis','Connor','Ben','Sam','Dan'],
 l:['Smith','Jones','Taylor','Brown','Wilson','Davies','Evans','Walker','Wright','Robinson','Thompson','White','Hughes','Edwards','Green','Hall','Wood','Harris','Clarke','Baker','Ward','Turner','Carter','Shaw','Palmer','Mills','Barnes','Gray']},
es:{c:'ESP',f:['Sergio','Carlos','Pablo','Álvaro','Diego','Javier','Iker','Mikel','Ander','Unai','Dani','Adrián','Hugo','Nacho','Raúl','Pedro','Iago','César','Rubén','Marcos','Víctor','Alejandro','Jorge','Aitor','Borja','Isco','Rodri','Gerard'],
 l:['García','Fernández','López','Martínez','Sánchez','Pérez','Gómez','Díaz','Torres','Ramos','Navarro','Moreno','Alonso','Gutiérrez','Vázquez','Molina','Ortiz','Castro','Rubio','Iglesias','Serrano','Herrera','Cano','Vidal','Campos','Rey','Soler','Costa']},
de:{c:'GER',f:['Lukas','Leon','Finn','Jonas','Niklas','Tim','Felix','Maximilian','Jan','Nico','Florian','Marcel','Kevin','Timo','Julian','Pascal','Tobias','Moritz','Emil','Lennart','Fabian','David','Simon','Erik','Jannik','Marius','Paul','Til'],
 l:['Müller','Schmidt','Schneider','Fischer','Weber','Wagner','Becker','Hoffmann','Schulz','Koch','Richter','Klein','Wolf','Neumann','Schwarz','Zimmermann','Braun','Krüger','Hofmann','Lange','Werner','Krause','Meier','Lehmann','Vogel','Frank','Berger','Roth'],},
it:{c:'ITA',f:['Marco','Alessandro','Lorenzo','Matteo','Federico','Davide','Andrea','Simone','Luca','Gabriele','Riccardo','Tommaso','Nicolò','Antonio','Giovanni','Francesco','Pietro','Salvatore','Emanuele','Cristian','Alessio','Domenico','Giacomo','Filippo','Mattia','Stefano','Enrico','Dario'],
 l:['Rossi','Russo','Ferrari','Esposito','Bianchi','Romano','Colombo','Ricci','Marino','Greco','Bruno','Gallo','Conti','De Luca','Costa','Giordano','Mancini','Rizzo','Lombardi','Moretti','Barbieri','Fontana','Santoro','Caruso','Ferri','Villa','Serra','Longo']},
fr:{c:'FRA',f:['Antoine','Hugo','Lucas','Théo','Adrien','Jules','Léo','Mathis','Nathan','Enzo','Clément','Maxime','Alexandre','Romain','Florian','Bastien','Corentin','Quentin','Yanis','Amine','Karim','Rayan','Moussa','Ibrahim','Sofiane','Mehdi','Axel','Loïc'],
 l:['Martin','Bernard','Dubois','Moreau','Laurent','Simon','Michel','Lefebvre','Leroy','Roux','Fournier','Girard','Bonnet','Dupont','Lambert','Rousseau','Vincent','Faure','André','Mercier','Blanc','Guérin','Chevalier','Perrin','Diallo','Traoré','Ndiaye','Keita']},
br:{c:'BRA',f:['Gabriel','Lucas','Matheus','Pedro','Vinícius','Rafael','Bruno','Thiago','João','Felipe','Gustavo','Rodrigo','Caio','Renan','Igor','Diego','Eduardo','Wesley','Éverton','Douglas','Anderson','Leandro','Márcio','Paulo','Alex','Denílson','Wallace','Maurício'],
 l:['Silva','Santos','Oliveira','Souza','Costa','Pereira','Almeida','Ferreira','Rodrigues','Gomes','Martins','Araújo','Ribeiro','Carvalho','Lima','Barbosa','Rocha','Dias','Moura','Cardoso','Teixeira','Correia','Cavalcanti','Freitas','Ramos','Farias','Pinto','Moraes']},
ar:{c:'ARG',f:['Julián','Lautaro','Nicolás','Emiliano','Rodrigo','Gonzalo','Ezequiel','Matías','Franco','Facundo','Agustín','Santiago','Joaquín','Ignacio','Tomás','Lucas','Federico','Maximiliano','Bruno','Thiago','Valentín','Ramiro','Lisandro','Marcos','Ángel','Cristian','Diego','Gastón'],
 l:['González','Rodríguez','Fernández','López','Martínez','Álvarez','Romero','Suárez','Benítez','Acosta','Medina','Herrera','Aguirre','Giménez','Molina','Castro','Rojas','Ortiz','Núñez','Cabrera','Vega','Sosa','Ledesma','Villalba','Paredes','Correa','Ponce','Ríos']},
nl:{c:'NED',f:['Daan','Sem','Luuk','Jesse','Thijs','Lars','Milan','Ruben','Bram','Timo','Joost','Sven','Niels','Stijn','Wout','Teun','Jurriën','Mees','Gijs','Koen','Bas','Rick','Tygo','Julian'],
 l:['de Jong','de Vries','van den Berg','Bakker','Janssen','Visser','Smit','Meijer','Mulder','Bos','Vos','Peters','Hendriks','van Leeuwen','Dekker','Brouwer','Dijkstra','Smits','Kuipers','Veldman','Willems','Post','Kok','van Dam']},
ng:{c:'NGA',f:['Chukwu','Emeka','Ikenna','Obinna','Chinedu','Kelechi','Segun','Tunde','Femi','Ade','Samuel','Victor','Peter','Sunday','Godwin','Musa','Ibrahim','Aliyu','Uche','Efe','Osaze','Nonso'],
 l:['Okafor','Okoye','Eze','Nwachukwu','Obi','Adeyemi','Adebayo','Okonkwo','Balogun','Lawal','Abubakar','Ogunleye','Nwosu','Igwe','Onyeka','Udo','Anyanwu','Olawale','Ekong','Sani']},
sn:{c:'SEN',f:['Mamadou','Ousmane','Ibrahima','Cheikh','Moussa','Abdoulaye','Pape','Serigne','Modou','Alioune','Babacar','Amadou','Idrissa','Sekou','Lamine','Omar','Demba','Malick','Boubacar','Assane'],
 l:['Diallo','Ndiaye','Sow','Diop','Gueye','Cissé','Faye','Sarr','Ba','Kane','Sy','Seck','Mbaye','Niang','Diouf','Thiam','Camara','Badji','Konaté','Touré']},
gh:{c:'GHA',f:['Kwame','Kofi','Kwesi','Yaw','Kojo','Kwabena','Michael','Daniel','Joseph','Emmanuel','Isaac','Prince','Felix','Richard','Stephen','Eric','Bernard','Solomon','Gideon','Enoch'],
 l:['Mensah','Boateng','Owusu','Appiah','Asante','Osei','Agyemang','Annan','Tetteh','Quaye','Addo','Frimpong','Acheampong','Darko','Amoah','Ofori','Sarpong','Adjei','Opoku','Yeboah']},
cm:{c:'CMR',f:['Samuel','André','Vincent','Joël','Serge','Patrick','Alain','Christian','Éric','Franck','Georges','Thierry','Cédric','Yannick','Bertrand','Rodrigue','Landry','Arnaud','Blaise','Hervé'],
 l:['Abanda','Bekono','Elong','Manga','Ndip','Ngu','Oyongo','Tabi','Zoa','Ekani','Mbah','Nfor','Ashu','Tanyi','Ayuk','Enow','Fouda','Ondoa','Bilé','Essome']},
pt:{c:'POR',f:['João','Tiago','Diogo','Gonçalo','Rúben','André','Bruno','Nuno','Pedro','Ricardo','Miguel','Fábio','Hélder','Renato','Sérgio','Vasco','Duarte','Afonso','Henrique','Leandro'],
 l:['Silva','Santos','Ferreira','Pereira','Oliveira','Costa','Rodrigues','Martins','Sousa','Fernandes','Gonçalves','Gomes','Lopes','Marques','Alves','Almeida','Ribeiro','Pinto','Carvalho','Teixeira']},
us:{c:'USA',f:['Tyler','Brandon','Jordan','Austin','Caleb','Landon','Zack','Cody','Chase','Bryce','Devin','Trevor','Dylan','Hunter','Colton','Gavin','Brayden','Weston','Reed','Cole'],
 l:['Johnson','Miller','Davis','Garcia','Martinez','Anderson','Jackson','Moore','Lee','Perez','Thompson','Harris','Sanchez','Clark','Lewis','Walker','Young','Allen','King','Scott']},
mx:{c:'MEX',f:['Alejandro','Luis','José','Juan','Diego','Fernando','Ricardo','Eduardo','Roberto','Miguel','Andrés','Emilio','Raúl','Óscar','Uriel','Édgar','Rodolfo','Gerardo','Israel','Marco'],
 l:['Hernández','García','Martínez','López','González','Rodríguez','Sánchez','Ramírez','Cruz','Flores','Gómez','Vargas','Reyes','Jiménez','Torres','Aguilar','Mendoza','Rojas','Ortega','Castillo']},
sa:{c:'KSA',f:['Mohammed','Abdullah','Salem','Fahad','Khalid','Saud','Faisal','Nawaf','Turki','Sultan','Bandar','Majed','Yasser','Hassan','Omar','Ali','Ahmed','Saad','Rakan','Ziyad'],
 l:['Al-Qahtani','Al-Ghamdi','Al-Otaibi','Al-Harbi','Al-Shehri','Al-Zahrani','Al-Dossari','Al-Mutairi','Al-Anazi','Al-Subaie','Al-Amri','Al-Malki','Al-Juhani','Al-Salem','Al-Rashid','Al-Bishi','Al-Asmari','Al-Yami','Al-Shamrani','Al-Hamdan']},
jp:{c:'JPN',f:['Takumi','Kaito','Yuto','Sota','Riku','Haruto','Daiki','Kenta','Shota','Ren','Yuma','Kosuke','Ryota','Tatsuya','Keisuke','Naoki','Hayato','Tsubasa','Itsuki','Sho'],
 l:['Sato','Suzuki','Takahashi','Tanaka','Watanabe','Ito','Yamamoto','Nakamura','Kobayashi','Kato','Yoshida','Yamada','Sasaki','Matsumoto','Inoue','Kimura','Hayashi','Shimizu','Mori','Abe']},
eg:{c:'EGY',f:['Ahmed','Mohamed','Mahmoud','Mostafa','Omar','Karim','Tarek','Hossam','Amr','Khaled','Youssef','Ramy','Sherif','Hany','Waleed','Islam','Sami','Adel','Fathi','Nabil'],
 l:['Hassan','Ibrahim','Abdelrahman','El-Sayed','Farouk','El-Masry','Ezzat','Shawky','Sobhi','Kamel','Fathy','Ghaly','Ashour','Zaki','Hamdy','Selim','Mansour','Awad','Taha','Ramadan']},
ma:{c:'MAR',f:['Youssef','Mehdi','Amine','Anass','Ayoub','Bilal','Hamza','Ilias','Ismail','Karim','Nabil','Omar','Rachid','Reda','Said','Soufiane','Tarik','Walid','Yassine','Zakaria'],
 l:['Alaoui','Benali','Bennani','Bouzid','Chafik','Cherkaoui','El-Amrani','El-Fassi','Hajji','Idrissi','Kabbaj','Lahlou','Mansouri','Naciri','Ouali','Raji','Sabri','Tahiri','Zerouali','Berrada']}
};
const NATKEYS=Object.keys(NATS);
const AFR=['ng','sn','gh','cm'];
const NAF=['eg','ma'];
/* agent nationality → home country (league network) */
const NAT2CTRY={tr:'TR',en:'EN',es:'ES',de:'DE',it:'IT',fr:'FR',nl:'NL',pt:'PT',br:'BR',ar:'AR',
 us:'US',mx:'MX',sa:'SA',jp:'JP',ng:'WAF',sn:'WAF',gh:'WAF',cm:'WAF',eg:'NAF',ma:'NAF'};
const NATNAME={
 tr:{tr:'Türkiye',en:'Türkiye'},en:{tr:'İngiltere',en:'England'},es:{tr:'İspanya',en:'Spain'},
 de:{tr:'Almanya',en:'Germany'},it:{tr:'İtalya',en:'Italy'},fr:{tr:'Fransa',en:'France'},
 br:{tr:'Brezilya',en:'Brazil'},ar:{tr:'Arjantin',en:'Argentina'},nl:{tr:'Hollanda',en:'Netherlands'},
 pt:{tr:'Portekiz',en:'Portugal'},us:{tr:'ABD',en:'USA'},mx:{tr:'Meksika',en:'Mexico'},
 sa:{tr:'S. Arabistan',en:'Saudi Arabia'},jp:{tr:'Japonya',en:'Japan'},
 ng:{tr:'Nijerya',en:'Nigeria'},sn:{tr:'Senegal',en:'Senegal'},gh:{tr:'Gana',en:'Ghana'},
 cm:{tr:'Kamerun',en:'Cameroon'},eg:{tr:'Mısır',en:'Egypt'},ma:{tr:'Fas',en:'Morocco'}};
/* ================= LEAGUES / TEAMS ================= */
const CONTS=[
 ['eu', {tr:'Avrupa',en:'Europe'}],
 ['sam',{tr:'G. Amerika',en:'S. America'}],
 ['nam',{tr:'K. Amerika',en:'N. America'}],
 ['as', {tr:'Asya',en:'Asia'}],
 ['af', {tr:'Afrika',en:'Africa'}],
 ['cup',{tr:'Kupalar',en:'Cups'}]];
const CUPS=[
 {c:'UCL', n:{tr:'Şampiyonlar Ligi',en:'Champions League'}},
 {c:'UEL', n:{tr:'Avrupa Ligi',en:'Europa League'}},
 {c:'UECL',n:{tr:'Konferans Ligi',en:'Conference League'}}];
const CUPWKS=[8,14,24,32]; // R16, QF, SF, Final
const TIERS=[['SL','1L'],['PL','CH'],['LL','LL2'],['BL','BL2'],['SA','SB'],['L1','L2']];
const CTRYS={
 TR:{tr:'Türkiye',en:'Türkiye'},EN:{tr:'İngiltere',en:'England'},ES:{tr:'İspanya',en:'Spain'},
 DE:{tr:'Almanya',en:'Germany'},IT:{tr:'İtalya',en:'Italy'},FR:{tr:'Fransa',en:'France'},
 NL:{tr:'Hollanda',en:'Netherlands'},PT:{tr:'Portekiz',en:'Portugal'},
 BR:{tr:'Brezilya',en:'Brazil'},AR:{tr:'Arjantin',en:'Argentina'},
 US:{tr:'ABD',en:'USA'},MX:{tr:'Meksika',en:'Mexico'},
 SA:{tr:'S. Arabistan',en:'Saudi Arabia'},JP:{tr:'Japonya',en:'Japan'},
 NAF:{tr:'Kuzey Afrika',en:'North Africa'},WAF:{tr:'Batı Afrika',en:'West Africa'}};
const LEAGUES=[
 {n:'Süper Lig',     c:'SL', nat:'tr', con:'eu', ctry:'TR'},
 {n:'Premier Lig',   c:'PL', nat:'en', con:'eu', ctry:'EN'},
 {n:'La Liga',       c:'LL', nat:'es', con:'eu', ctry:'ES'},
 {n:'Bundesliga',    c:'BL', nat:'de', con:'eu', ctry:'DE'},
 {n:'Serie A',       c:'SA', nat:'it', con:'eu', ctry:'IT'},
 {n:'Ligue 1',       c:'L1', nat:'fr', con:'eu', ctry:'FR'},
 {n:'Eredivisie',    c:'ED', nat:'nl', con:'eu', ctry:'NL'},
 {n:'Liga Portekiz', c:'LP', nat:'pt', con:'eu', ctry:'PT'},
 {n:'1. Lig',        c:'1L', nat:'tr', con:'eu', ctry:'TR'},
 {n:'Brasileirão',   c:'BR', nat:'br', con:'sam',ctry:'BR'},
 {n:'Arjantin Ligi', c:'AR', nat:'ar', con:'sam',ctry:'AR', grp:2, gl:[['A Bölgesi','Zone A'],['B Bölgesi','Zone B']]},
 {n:'MLS',           c:'MLS',nat:'us', con:'nam',ctry:'US', grp:2, gl:[['Doğu','Eastern'],['Batı','Western']]},
 {n:'Liga MX',       c:'MX', nat:'mx', con:'nam',ctry:'MX'},
 {n:'Suudi Ligi',    c:'SPL',nat:'sa', con:'as', ctry:'SA'},
 {n:'J Ligi',        c:'J1', nat:'jp', con:'as', ctry:'JP'},
 {n:'K. Afrika Ligi',c:'KAF',nat:'afN',con:'af', ctry:'NAF'},
 {n:'B. Afrika Ligi',c:'BAF',nat:'af', con:'af', ctry:'WAF'},
 {n:'Championship',  c:'CH', nat:'en', con:'eu', ctry:'EN'},
 {n:'La Liga 2',     c:'LL2',nat:'es', con:'eu', ctry:'ES'},
 {n:'2. Bundesliga', c:'BL2',nat:'de', con:'eu', ctry:'DE'},
 {n:'Serie B',       c:'SB', nat:'it', con:'eu', ctry:'IT'},
 {n:'Ligue 2',       c:'L2', nat:'fr', con:'eu', ctry:'FR'}];
/* palette generator for lower divisions */
const PAL=[['#DC2626','#f0f0f0'],['#0057B8','#f0f0f0'],['#0A8F42','#f0f0f0'],['#FCD405','#141414'],
 ['#141414','#f0f0f0'],['#F26522','#141414'],['#2A5CAA','#FCD405'],['#7A1024','#f0f0f0'],
 ['#653D84','#f0f0f0'],['#00A0C6','#141414'],['#8B1B24','#FCD405'],['#1D9053','#141414']];
function mkT(names,hi,lo){return names.map((n,i)=>[n,PAL[i%PAL.length][0],PAL[i%PAL.length][1],
  Math.round(hi-(hi-lo)*i/(names.length-1))]);}
const TEAMS=[
/* Süper Lig */
[['GALATA','#FDB912','#A90432',77],['FENER','#FFED00','#163962',77],['BEŞİK','#e8e8e8','#141414',75],
 ['TRABZON','#841434','#41B6E6',73],['BAŞAK','#FF6A13','#14295C',72],['BURSA','#0D954A','#e8e8e8',67],
 ['ANKARA','#FFD200','#16265C',66],['KONYA','#0A8F42','#f0f0f0',66],['ANTALYA','#E30613','#f0f0f0',65],
 ['SİVAS','#D71920','#e8e8e8',65],['KAYSERİ','#E30613','#FFD500',64],['RİZE','#0072BC','#00953B',64],
 ['ALANYA','#F97F28','#0C8242',63],['SAMSUN','#D40000','#f0f0f0',62],
 ['GAZİANTEP','#DC2626','#141414',64],['KASIMPAŞA','#0057B8','#f0f0f0',63],
 ['EYÜP','#653D84','#FCD405',63],['HATAY','#7A1024','#f0f0f0',62]],
/* Premier Lig */
[['MANC','#6CABDD','#1C2C5B',85],['ARSENAL','#EF0107','#f0f0f0',84],['LIVER','#C8102E','#F6EB61',84],
 ['MANU','#DA291C','#FBE122',82],['CHELSEA','#034694','#f0f0f0',81],['TOTTEN','#f0f0f0','#132257',80],
 ['NEWCAS','#241F20','#f0f0f0',79],['VILLA','#95BFE5','#670E36',78],['WESTHAM','#7A263A','#1BB1E7',75],
 ['BRIGHTON','#0057B8','#f0f0f0',75],['EVERTON','#003399','#f0f0f0',74],['WOLVES','#FDB913','#231F20',73],
 ['FULHAM','#f0f0f0','#000000',72],['LEEDS','#f0f0f0','#1D428A',71],
 ['BRENTFORD','#DC2626','#f0f0f0',75],['BOURNEMTH','#DC2626','#141414',75],
 ['PALACE','#1B458F','#DC2626',74],['FOREST','#DC2626','#f0f0f0',74],
 ['BURNLEY','#6C1D45','#8AC3EE',71],['SHEFFIELD','#DC2626','#f0f0f0',71]],
/* La Liga */
[['REALM','#f0f0f0','#FEBE10',86],['BARCA','#A50044','#004D98',85],['ATLETI','#CB3524','#f0f0f0',82],
 ['SEVILLA','#f0f0f0','#D8091F',77],['SOCIEDAD','#0067B1','#f0f0f0',77],['BETIS','#00954C','#f0f0f0',76],
 ['VILLARR','#FFE667','#005187',76],['BILBAO','#EE2523','#f0f0f0',76],['VALENCIA','#f0f0f0','#F18E00',74],
 ['GIRONA','#CD2534','#f0f0f0',72],['CELTA','#8AC3EE','#f0f0f0',72],['OSASUNA','#D91A21','#0A346F',71],
 ['GETAFE','#005999','#f0f0f0',70],['MALLORCA','#E20613','#141414',70],
 ['RAYO','#f0f0f0','#DC2626',72],['ALAVES','#0057B8','#f0f0f0',71],
 ['ESPANYOL','#0057B8','#f0f0f0',71],['LASPALMAS','#FCD405','#0057B8',70],
 ['LEVANTE','#0A346F','#DC2626',69],['ELCHE','#0A8F42','#f0f0f0',69]],
/* Bundesliga */
[['BAYERN','#DC052D','#f0f0f0',85],['LEVERKUS','#E32221','#141414',81],['DORTMUND','#FDE100','#141414',81],
 ['LEIPZIG','#DD0741','#f0f0f0',80],['FRANKFURT','#E1000F','#141414',76],['STUTTGART','#f0f0f0','#E32219',75],
 ['FREIBURG','#E2001A','#141414',74],['WOLFSBURG','#65B32E','#f0f0f0',73],['GLADBACH','#f0f0f0','#141414',72],
 ['HOFFENH','#1961B5','#f0f0f0',72],['MAINZ','#C3141E','#f0f0f0',70],['BREMEN','#1D9053','#f0f0f0',70],
 ['KÖLN','#ED1C24','#f0f0f0',68],['AUGSBURG','#BA3733','#46714D',68],
 ['UNION','#DC2626','#FCD405',70],['STPAULI','#5C3A2E','#f0f0f0',69],
 ['HEIDENHEIM','#DC2626','#0057B8',68],['BOCHUM','#0057B8','#f0f0f0',67]],
/* Serie A */
[['INTER','#0068A8','#141414',84],['JUVE','#f0f0f0','#141414',82],['MILAN','#FB090B','#141414',82],
 ['NAPOLI','#12A0D7','#f0f0f0',82],['ROMA','#8E1F2F','#F0BC42',79],['ATALANTA','#1E71B8','#141414',79],
 ['LAZIO','#87D8F7','#f0f0f0',78],['FIORENT','#482E92','#f0f0f0',76],['BOLOGNA','#1A2F48','#D4172B',74],
 ['TORINO','#8B1B24','#f0f0f0',73],['SASSUOLO','#00A752','#141414',70],['UDINESE','#f0f0f0','#141414',70],
 ['SAMPDOR','#0071BC','#f0f0f0',68],['GENOA','#C8102E','#00205B',68],
 ['MONZA','#DC2626','#f0f0f0',72],['PARMA','#FCD405','#0057B8',72],
 ['CAGLIARI','#8B1B24','#0A346F',71],['VERONA','#FCD405','#0A346F',70],
 ['LECCE','#FCD405','#DC2626',70],['EMPOLI','#0057B8','#f0f0f0',69]],
/* Ligue 1 */
[['PARIS','#004170','#DA291C',85],['MONACO','#E63031','#f0f0f0',78],['MARSILYA','#2FAEE0','#f0f0f0',78],
 ['LILLE','#E01E13','#120E0D',76],['LYON','#f0f0f0','#DA001A',75],['RENNES','#E13327','#141414',74],
 ['NICE','#ED1C24','#141414',74],['LENS','#FFD700','#EC1C24',73],['REIMS','#EE2223','#f0f0f0',69],
 ['TOULOUSE','#653D84','#f0f0f0',68],['STRASBG','#009FE3','#f0f0f0',68],['MONTPEL','#FF6F00','#003087',67],
 ['NANTES','#FCD405','#008550',66],['BORDEAUX','#001A57','#f0f0f0',65],
 ['BREST','#DC2626','#f0f0f0',68],['AUXERRE','#f0f0f0','#0057B8',67],
 ['ANGERS','#141414','#f0f0f0',66],['HAVRE','#8AC3EE','#0A346F',65]],
/* Eredivisie */
[['AJAX','#f0f0f0','#D2122E',74],['PSV','#ED1C24','#f0f0f0',74],['FEYENOORD','#E62E2D','#141414',72],
 ['AZ','#DD1E3E','#f0f0f0',68],['TWENTE','#ED1C24','#f0f0f0',66],['UTRECHT','#f0f0f0','#ED1C24',63],
 ['VITESSE','#FCD405','#141414',61],['HEERENVEEN','#0057B8','#f0f0f0',60],['GRONINGEN','#0A8F42','#f0f0f0',60],
 ['NIJMEGEN','#ED1C24','#141414',59],['ZWOLLE','#2A5CAA','#f0f0f0',58],['HERACLES','#141414','#f0f0f0',57],
 ['CAMBUUR','#FCD405','#2A5CAA',56],['VOLENDAM','#F26522','#141414',55],
 ['SPARTA','#DC2626','#f0f0f0',58],['GOAHEAD','#FCD405','#DC2626',57],
 ['FORTUNA','#FCD405','#0A8F42',56],['ALMERE','#141414','#DC2626',55]],
/* Liga Portekiz */
[['BENFICA','#ED1C24','#f0f0f0',78],['PORTO','#0057B8','#f0f0f0',78],['SPORTING','#0A8F42','#f0f0f0',77],
 ['BRAGA','#DC2626','#f0f0f0',70],['GUIMARAES','#f0f0f0','#141414',66],['BOAVISTA','#141414','#f0f0f0',62],
 ['FAMALICAO','#2A5CAA','#f0f0f0',61],['ESTORIL','#FCD405','#2A5CAA',60],['RIOAVE','#0A8F42','#f0f0f0',60],
 ['AROUCA','#FCD405','#141414',59],['GILVICENTE','#DC2626','#f0f0f0',58],['CHAVES','#2A5CAA','#DC2626',58],
 ['PORTIMAO','#141414','#FCD405',57],['MOREIRA','#0A8F42','#FCD405',56],
 ['SANTACLARA','#DC2626','#f0f0f0',58],['NACIONAL','#141414','#f0f0f0',57],
 ['CASAPIA','#141414','#FCD405',56],['FARENSE','#f0f0f0','#141414',55]],
/* 1. Lig */
[['SAKARYA','#0C8242','#141414',58],['KOCAELİ','#0A6B4F','#FCD405',57],['ADANA','#0072BC','#F26522',57],
 ['ESKİŞEH','#DC2626','#141414',56],['ALTAY','#141414','#f0f0f0',56],['GÖZTEPE','#FCD405','#DC2626',56],
 ['MANİSA','#141414','#DC2626',55],['DENİZLİ','#0A8F42','#141414',54],['BANDIRMA','#DC2626','#f0f0f0',54],
 ['ERZURUM','#2A5CAA','#f0f0f0',53],['GİRESUN','#0A8F42','#f0f0f0',53],['BOLU','#DC2626','#f0f0f0',52],
 ['IĞDIR','#0072BC','#0A8F42',51],['TUZLA','#00A0C6','#141414',50],
 ['GENÇLER','#DC2626','#141414',56],['PENDİK','#DC2626','#f0f0f0',53],
 ['ÜMRANİYE','#DC2626','#f0f0f0',52],['KEÇİÖREN','#653D84','#f0f0f0',52],
 ['ÇORUM','#DC2626','#141414',51],['VAN','#DC2626','#8AC3EE',50]],
/* Brasileirão */
[['FLAMENGO','#DC2626','#141414',76],['PALMEIRAS','#0A8F42','#f0f0f0',76],['SAOPAULO','#f0f0f0','#DC2626',73],
 ['CORINTH','#141414','#f0f0f0',73],['MINEIRO','#141414','#f0f0f0',72],['GREMIO','#0072BC','#141414',71],
 ['INTERNAC','#DC2626','#f0f0f0',71],['FLUMIN','#7A1F3D','#0A8F42',70],['SANTOS','#f0f0f0','#141414',69],
 ['BOTAFOGO','#141414','#f0f0f0',68],['CRUZEIRO','#2A5CAA','#f0f0f0',67],['VASCO','#141414','#DC2626',66],
 ['BAHIA','#0057B8','#DC2626',64],['FORTALEZA','#DC2626','#2A5CAA',63],
 ['BRAGANT','#f0f0f0','#DC2626',66],['RECIFE','#DC2626','#141414',64],
 ['CURITIBA','#0A8F42','#f0f0f0',64],['JUVENTUDE','#0A8F42','#DC2626',63],
 ['VITORIA','#DC2626','#141414',63],['CEARA','#141414','#f0f0f0',62]],
/* Arjantin Ligi */
[['RIVER','#f0f0f0','#DC2626',74],['BOCA','#14295C','#FCD405',74],['RACING','#8AC3EE','#f0f0f0',70],
 ['INDEPEND','#DC2626','#f0f0f0',68],['SANLOR','#14295C','#DC2626',67],['VELEZ','#f0f0f0','#2A5CAA',66],
 ['ESTUDIAN','#DC2626','#f0f0f0',65],['NEWELLS','#DC2626','#141414',64],['ROSARIO','#14295C','#FCD405',63],
 ['LANUS','#7A1024','#f0f0f0',62],['TALLERES','#2A5CAA','#f0f0f0',61],['BANFIELD','#0A8F42','#f0f0f0',60],
 ['HURACAN','#f0f0f0','#DC2626',59],['GODOY','#2A5CAA','#141414',58],
 ['ARGENTINOS','#DC2626','#f0f0f0',64],['DEFENSA','#0A8F42','#FCD405',63],
 ['TUCUMAN','#8AC3EE','#f0f0f0',62],['PLATENSE','#5C3A2E','#f0f0f0',61],
 ['BARRACAS','#DC2626','#f0f0f0',61],['TIGRE','#0057B8','#DC2626',60],
 ['UNION SF','#DC2626','#f0f0f0',60],['GIMNASIA','#f0f0f0','#0A346F',60],
 ['INSTITUTO','#DC2626','#f0f0f0',59],['RIESTRA','#141414','#f0f0f0',59],
 ['RIVADAVIA','#7A1024','#f0f0f0',58],['SARMIENTO','#0A8F42','#f0f0f0',58],
 ['ALDOSIVI','#FCD405','#0A8F42',57],['SANMARTIN','#0A8F42','#141414',57],
 ['BELGRANO','#8AC3EE','#141414',60],['C.CORDOBA','#141414','#8AC3EE',58]],
/* MLS */
[['MIAMI','#F7B5CD','#141414',68],['LAFC','#141414','#C39E6D',67],['LAGALAXY','#f0f0f0','#14295C',66],
 ['ATLANTA','#7A1024','#141414',65],['SEATTLE','#0A8F42','#2A5CAA',64],['COLUMBUS','#FCD405','#141414',63],
 ['CINCINN','#F26522','#2A5CAA',62],['AUSTIN','#65B32E','#141414',61],['DALLAS','#DC2626','#2A5CAA',60],
 ['CHICAGO','#DC2626','#14295C',59],['ORLANDO','#653D84','#FCD405',59],['PORTLAND','#0A6B4F','#FCD405',58],
 ['NASHVILLE','#FCD405','#14295C',57],['DENVER','#7A1024','#8AC3EE',56],
 ['SANDIEGO','#00A0C6','#F7B5CD',65],['STLOUIS','#DC2626','#0057B8',63],
 ['CHARLOTTE','#00A0C6','#141414',62],['SANJOSE','#0057B8','#141414',61],
 ['HOUSTON','#F26522','#141414',61],['KANSAS','#8AC3EE','#0A346F',61],
 ['MINNESOTA','#8AC3EE','#141414',60],['SALTLAKE','#7A1024','#FCD405',60],
 ['VANCOUVER','#f0f0f0','#0A346F',60],['TORONTO','#DC2626','#f0f0f0',59],
 ['MONTREAL','#0057B8','#141414',59],['NEWYORK','#DC2626','#f0f0f0',59],
 ['NYCITY','#8AC3EE','#F26522',58],['PHILLY','#0A346F','#FCD405',58],
 ['DCUNITED','#141414','#DC2626',57],['NEWENGLAND','#0A346F','#DC2626',57]],
/* Liga MX */
[['AMERICA','#FCD405','#14295C',70],['MONTERREY','#14295C','#f0f0f0',69],['TIGRES','#FCD405','#2A5CAA',69],
 ['CHIVAS','#DC2626','#f0f0f0',67],['CRUZAZUL','#0057B8','#f0f0f0',66],['PUMAS','#14295C','#C39E6D',65],
 ['TOLUCA','#DC2626','#f0f0f0',64],['LEON','#0A8F42','#FCD405',63],['PACHUCA','#14295C','#f0f0f0',62],
 ['LAGUNA','#0A8F42','#f0f0f0',61],['ATLAS','#DC2626','#141414',60],['PUEBLA','#f0f0f0','#2A5CAA',59],
 ['TIJUANA','#DC2626','#141414',58],['QUERETARO','#141414','#2A5CAA',57],
 ['JUAREZ','#0A8F42','#DC2626',59],['NECAXA','#DC2626','#f0f0f0',59],
 ['SANLUIS','#DC2626','#0A346F',58],['MAZATLAN','#653D84','#FCD405',57]],
/* Suudi Ligi */
[['ALHILAL','#0057B8','#f0f0f0',76],['ALNASSR','#FCD405','#2A5CAA',75],['ALITTIHAD','#FCD405','#141414',73],
 ['ALAHLI','#0A8F42','#f0f0f0',71],['ALSHABAB','#f0f0f0','#141414',65],['ALTAAWON','#FCD405','#0057B8',61],
 ['ALFATEH','#0A8F42','#f0f0f0',60],['DAMAC','#DC2626','#2A5CAA',59],['ALRAED','#0057B8','#FCD405',58],
 ['ALWEHDA','#DC2626','#f0f0f0',58],['ALFAISALY','#2A5CAA','#FCD405',57],['ALKHALEEJ','#0A8F42','#141414',56],
 ['ABHA','#8AC3EE','#f0f0f0',55],['ALHAZEM','#DC2626','#FCD405',54],
 ['ALQADSIAH','#FCD405','#141414',66],['ALRIYADH','#0057B8','#FCD405',57],
 ['ALORUBAH','#0A8F42','#f0f0f0',56],['ALOKHDOOD','#F26522','#141414',55]],
/* J Ligi */
[['KAWASAKI','#8AC3EE','#141414',66],['YOKOHAMA','#0057B8','#DC2626',65],['URAWA','#DC2626','#141414',64],
 ['KASHIMA','#7A1024','#141414',64],['TOKYO','#0057B8','#DC2626',62],['OSAKA','#0057B8','#141414',62],
 ['KOBE','#7A1024','#f0f0f0',61],['NAGOYA','#DC2626','#FCD405',60],['HIROSHIMA','#653D84','#f0f0f0',59],
 ['FUKUOKA','#14295C','#f0f0f0',58],['SAPPORO','#DC2626','#141414',57],['KYOTO','#653D84','#FCD405',56],
 ['SHONAN','#65B32E','#8AC3EE',55],['SENDAI','#FCD405','#14295C',55],
 ['MACHIDA','#0A346F','#FCD405',64],['KASHIWA','#FCD405','#141414',62],
 ['CEREZO','#F7B5CD','#653D84',61],['SHIMIZU','#F26522','#141414',60],
 ['NIIGATA','#F26522','#0057B8',58],['OKAYAMA','#8B1B24','#FCD405',57]],
/* K. Afrika Ligi */
[['AHLY','#DC2626','#f0f0f0',58],['ZAMALEK','#f0f0f0','#DC2626',57],['ESPERANCE','#FCD405','#DC2626',56],
 ['WYDAD','#DC2626','#141414',55],['RAJA','#0A8F42','#f0f0f0',55],['SFAXIEN','#f0f0f0','#141414',52],
 ['SETIF','#141414','#f0f0f0',51],['KABYLIE','#FCD405','#0A8F42',50],['BELOUIZDAD','#DC2626','#f0f0f0',49],
 ['İSMAILIA','#FCD405','#2A5CAA',48],['TETOUAN','#653D84','#f0f0f0',47],['BIZERTE','#141414','#FCD405',46],
 ['ORAN','#DC2626','#f0f0f0',45],['TRIPOLI','#0A8F42','#DC2626',45]],
/* B. Afrika Ligi */
[['LAGOS','#0A8F42','#f0f0f0',50],['DAKAR','#0C8242','#FCD405',49],['ACCRA','#DC2626','#FCD405',48],
 ['ABIDJAN','#F26522','#0A8F42',47],['KUMASI','#FCD405','#141414',46],['CONAKRY','#DC2626','#FCD405',46],
 ['NAIROBI','#DC2626','#0A8F42',45],['YAOUNDE','#0A8F42','#DC2626',45],['BAMAKO','#FCD405','#0A8F42',44],
 ['LOME','#0A8F42','#FCD405',44],['LUANDA','#DC2626','#141414',43],['COTONOU','#0A8F42','#DC2626',43],
 ['FREETOWN','#0072BC','#0A8F42',42],['KINSHASA','#2A5CAA','#FCD405',42]],
/* Championship (24) */
mkT(['NORWICH','WATFORD','MIDDLESB','COVENTRY','PRESTON','HULL','STOKE','SWANSEA','CARDIFF','BRISTOL','MILLWALL','QPR','BLACKBURN','BIRMING','DERBY','PORTSMTH','LUTON','IPSWICH','WESTBROM','PLYMOUTH','OXFORD','WREXHAM','CHARLTON','READING'],67,56),
/* La Liga 2 (22) */
mkT(['ZARAGOZA','DEPORTIVO','GIJON','SANTANDER','OVIEDO','CADIZ','GRANADA','ALMERIA','TENERIFE','BURGOS','EIBAR','HUESCA','ALBACETE','MIRANDES','CARTAGENA','FERROL','LEGANES','VALLADOL','CASTELLON','ELDENSE','ANDORRA','CORDOBA'],64,54),
/* 2. Bundesliga (18) */
mkT(['HAMBURG','HERTHA','SCHALKE','DUSSELDF','HANNOVER','KAISERSL','NURNBERG','KARLSRUHE','PADERBORN','MAGDEBURG','DARMSTADT','FURTH','BRAUNSCH','ULM','REGENSBG','MUNSTER','ELVERSBG','DRESDEN'],65,55),
/* Serie B (20) */
mkT(['PALERMO','BARI','BRESCIA','SPEZIA','CREMONESE','PISA','MODENA','REGGIANA','CATANZARO','VENEZIA','FROSINONE','SALERNIT','CESENA','SUDTIROL','COSENZA','MANTOVA','STABIA','CARRARESE','TERNANA','PERUGIA'],63,53),
/* Ligue 2 (18) */
mkT(['METZ','CAEN','GUINGAMP','LORIENT','GRENOBLE','AMIENS','ANNECY','PAU','LAVAL','RODEZ','BASTIA','AJACCIO','TROYES','DUNKERQUE','CLERMONT','VALENCIEN','SOCHAUX','NANCY'],62,52)];
const POS=['KL','DF','OS','FV'];
const POSL={tr:{KL:'KL',DF:'DF',OS:'OS',FV:'FV'},en:{KL:'GK',DF:'DF',OS:'MF',FV:'FW'}};
const POSFULL={tr:{KL:'Kaleci',DF:'Defans',OS:'Orta Saha',FV:'Forvet'},en:{KL:'Goalkeeper',DF:'Defender',OS:'Midfielder',FV:'Forward'}};
