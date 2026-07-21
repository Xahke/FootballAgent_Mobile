# FootballAgent Mobile (Menajer)

Futbolcu menajerliği simülasyonu — text tabanlı, mobil öncelikli, TR/EN.

## Çalıştırma
`index.html`i tarayıcıda aç (veya `npx serve .`).

## Tek dosya çıktısı
```
node build.js   # → dist/menajer.html
```

## Dosya yapısı
| Dosya | İçerik |
|---|---|
| js/i18n.js | Çeviriler, haber şablonları, haber-içi linkler |
| js/data.js | İsim havuzları, ligler, takımlar, kupa tanımları |
| js/core.js | Oyun durumu, fikstür/kupa kurulum, keşif ağı, ekonomi |
| js/sim.js | Haftalık simülasyon, sezon sonu, gelişim, küme, Dünya Kupası |
| js/actions.js | Pazarlık, transfer, temsilcilik görüşmesi, keşif satın alma |
| js/ui.js | Görünümler, render, navigasyon |
| js/main.js | Kayıt/yükleme, başlatma |

Script sırası önemlidir (index.html'deki sırayla yüklenir). Modül/build sistemi yok — Capacitor'a doğrudan taşınabilir.
