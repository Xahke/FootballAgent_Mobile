/* Takım adı havuzu analizi — SADECE geliştirici aracı, oyuna dahil değil.
 *
 * Soru: prosedürel arma sistemi hangi anahtara bağlanmalı? Ekranda görünen ada
 * bağlanırsa dil değişince arma değişebilir; sıraya bağlanırsa küme düşünce
 * değişir. Bu betik js/data.js'i OKUR (değiştirmez) ve kimlik kelimelerinin
 * gerçek dağılımını çıkarır.
 *
 * Kullanım: node tools/badge-names.js [--json]
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js', 'data.js'), 'utf8');
/* data.js global bildirimlerden ibaret; Function ile değerlendirip TEAMS ve
   LEAGUES'i almak, kırılgan bir regex yazmaktan güvenli. */
const { TEAMS, LEAGUES, CTRYS } = new Function(src + ';return {TEAMS,LEAGUES,CTRYS};')();

/* Ad "Şehir Kimlik" biçiminde ama şehirler tek kelime olmak zorunda değil.
   Kimlik kelimesi HER ZAMAN son kelime — bunu doğrulamak için kelime sayısı
   dağılımı da raporlanıyor. */
function identityWord(name) {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1];
}
function cityPart(name) {
  const parts = name.trim().split(/\s+/);
  return parts.slice(0, -1).join(' ');
}

/* Türkçe büyük/küçük harf tuzağı: 'İ'.toLowerCase() bazı ortamlarda 'i̇'
   (birleşik nokta) verir. Aksanları ayırıp birleşen işaretleri atmak, aynı
   kelimenin iki farklı token üretmesini engelliyor. */
function normToken(w) {
  return w.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
}

const teams = [];
TEAMS.forEach((lgTeams, lg) => {
  lgTeams.forEach(([n, ab, c1, c2, str], i) => {
    teams.push({ n, ab, c1, c2, str, lg, idx: i, lgCode: LEAGUES[lg].c, ctry: LEAGUES[lg].ctry });
  });
});
/* id, newGame()'in verdiği sırayla aynı: S.teams.length. Kayıtta bu duruyor. */
teams.forEach((t, i) => { t.id = i; });

const freq = new Map();
teams.forEach(t => {
  const w = normToken(identityWord(t.n));
  if (!freq.has(w)) freq.set(w, { word: identityWord(t.n), n: 0, teams: [] });
  const e = freq.get(w);
  e.n++; e.teams.push(t.n);
});
const words = [...freq.entries()].map(([k, v]) => ({ token: k, ...v })).sort((a, b) => b.n - a.n || a.token.localeCompare(b.token));

const report = {
  leagues: LEAGUES.length,
  teams: teams.length,
  identityWords: words.length,
  wordCounts: [1, 2, 3, 4].map(k => ({ k, n: teams.filter(t => t.n.trim().split(/\s+/).length === k).length })),
  abUnique: new Set(teams.map(t => t.ab)).size,
  nameUnique: new Set(teams.map(t => t.n)).size,
  cityUnique: new Set(teams.map(t => cityPart(t.n))).size,
  words,
  teams,
};

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(report));
} else {
  console.log('lig %d · takım %d · benzersiz ad %d · benzersiz ab %d · benzersiz şehir %d',
    report.leagues, teams.length, report.nameUnique, report.abUnique, report.cityUnique);
  console.log('ad kelime sayısı:', report.wordCounts.map(x => x.k + ' kelime: ' + x.n).join(' · '));
  console.log('farklı kimlik kelimesi: %d', report.identityWords);
  console.log('');
  const pad = 16;
  words.forEach((w, i) => {
    process.stdout.write((w.word + ' ').padEnd(pad) + String(w.n).padStart(3) + '   ');
    if (i % 4 === 3) process.stdout.write('\n');
  });
  console.log('');
}
