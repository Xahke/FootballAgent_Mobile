/* sw.js — çevrimdışı çalışma.
   Oyun tamamen istemci tarafında; ağ yalnızca dosyaları indirmek için gerekiyor.
   Bu yüzden uygulama kabuğu kuruluşta önbelleğe alınır ve sonrasında ağ hiç beklenmez.
   CACHE sürümünü, önbelleğe alınan dosyalardan biri her değiştiğinde artır. */
const CACHE = 'menajer-v39';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/i18n.js',
  './js/store.js',
  './js/saves.js',
  './js/data.js',
  './js/worldgeo.js',
  './js/atlas.js',
  './js/rivals.js',
  './js/badges.js',
  './js/core.js',
  './js/sim.js',
  './js/market.js',
  './js/events.js',
  './js/skills.js',
  './js/sfx.js',
  './js/actions.js',
  './js/ui.js',
  './js/main.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './assets/ui/player-portrait-02.webp',
  './assets/ui/player-portrait-03.webp',
  './assets/ui/player-portrait-04.webp',
  './assets/ui/player-portrait-05.webp',
  './assets/ui/player-portrait-08.webp',
  './assets/ui/player-portrait-09.webp',
  './assets/ui/player-portrait-10.webp',
  './assets/ui/player-portrait-11.webp',
  './assets/ui/home-stadium-tunnel.webp',
  './assets/ui/agent-silhouette.webp',
  './assets/ui/weekly-riser.webp',
  './assets/ui/home-icon-calendar.webp',
  './assets/ui/home-icon-players.webp',
  './assets/ui/home-icon-transfers.webp',
  './assets/ui/home-icon-inbox.webp',
  './assets/ui/home-icon-scout.webp',
  './assets/ui/home-icon-contract.webp',
  './assets/ui/home-icon-warning.webp',
  './assets/ui/home-icon-trend.webp',
  './assets/ui/home-icon-warning-orange.webp',
  './assets/ui/inbox-transfer.webp',
  './assets/ui/inbox-contract.webp',
  './assets/ui/inbox-finance.webp',
  './assets/ui/inbox-client.webp',
  './assets/ui/inbox-rival.webp',
  './assets/ui/inbox-growth.webp',
  './assets/ui/inbox-status.webp',
  './assets/ui/inbox-trophy.webp',
  './assets/ui/inbox-league.webp',
  './assets/ui/inbox-scout.webp',
  './assets/ui/event-weekly-report.webp',
  './assets/ui/event-media.webp',
  './assets/ui/event-player.webp',
  './assets/ui/event-club.webp',
  './assets/ui/event-agency.webp',
  './assets/ui/event-finance.webp',
  './assets/ui/event-crisis.webp',
  './assets/ui/profile-overview.webp',
  './assets/ui/profile-matches.webp',
  './assets/ui/profile-contract.webp',
  './assets/ui/profile-preagreement.webp',
  './assets/ui/profile-cooldown.webp',
  './assets/ui/profile-release.webp',
  './assets/fonts/barlow-condensed-600-latin.woff2',
  './assets/fonts/barlow-condensed-600-latinext.woff2',
  './assets/fonts/barlow-condensed-700-latin.woff2',
  './assets/fonts/barlow-condensed-700-latinext.woff2',
  './assets/fonts/barlow-condensed-800-latin.woff2',
  './assets/fonts/barlow-condensed-800-latinext.woff2'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      /* tek bir dosya 404 verirse tüm kurulum düşmesin */
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Önce önbellek: uygulama dosyaları sürümlendiği için bayat içerik riski yok,
   buna karşılık uçak modunda ve kötü bağlantıda anında açılır. */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
