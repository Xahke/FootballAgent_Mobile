# Geliştirici Notları

[← README'ye dön](../README.md)

Bu dosya projenin teknik tarafını anlatır: derleme, mimari, tema hattı, olay
yazımı, isimlendirme politikası ve Play Store adımları.

## Çalıştırma
`index.html`i tarayıcıda aç (veya `npx serve .`).

## Telefonda test

### 1. En hızlı yol — tek dosya
`node build.js` ile üretilen `dist/menajer.html`'i telefona gönder (Drive, WhatsApp,
USB) ve aç. Kurulum yok, internet yok, anında çalışır. Sadece PWA kurulumu ve
service worker devre dışı kalır (`file://` güvenli bağlam sayılmıyor).

### 2. Aynı ağdan — geliştirme sırasında
```
npm run serve          # http://<bilgisayarının-IP'si>:5173
```
Telefonu aynı Wi-Fi'ye bağla, tarayıcıya o adresi yaz. Kod değiştikçe sayfayı
yenilemen yeterli. Not: düz HTTP olduğu için service worker yine kaydolmaz.

### 3. GitHub Pages — gerçek PWA testi
Depoyu push et → Settings → Pages → Source: `main` / root. Birkaç dakika sonra
`https://<kullanıcı>.github.io/<depo>/` adresinden açılır. HTTPS olduğu için
**kurulabilir ve çevrimdışı çalışır** — Chrome'da "Ana ekrana ekle" çıkar.
Mağazaya çıkmadan önceki asıl test ortamı burasıdır.

## Play Store

Uygulama tamamen istemci tarafında çalıştığı için **Capacitor** ile paketleniyor:
varlıklar uygulamanın içine gömülüyor, sunucuya ve alan adına gerek kalmıyor.
(TWA/Bubblewrap alternatifi daha küçük paket üretir ama HTTPS'te yayınlanmış bir
site ve `assetlinks.json` doğrulaması ister — bu oyun için gereksiz bağımlılık.)

### Native proje depoda
`android/` klasörü **kaynak denetiminde**. Yani onu üretmek diye bir adım yok;
klonladığında zaten elinde. Akış tek yönlü:

```
npm run www  →  npx cap sync android  →  Gradle
```

`cap sync` yalnız iki şeye dokunur: `www/` içeriğini
`android/app/src/main/assets/public` altına kopyalar ve üretilen dosyaları
(`capacitor.config.json`, `capacitor.plugins.json`, `res/xml/config.xml`,
`capacitor-cordova-android-plugins/`) tazeler. Bunların hepsi `android/.gitignore`
içinde — depoya girmezler, her senkronizasyonda yeniden üretilirler. Gradle
yapılandırmasına, manifeste, kaynaklara **dokunmaz**; oralar artık senin dosyaların.

> **`npx cap add android` çalıştırma.** Projeyi şablondan yeniden üretir ve
> native tarafa yazılmış her şeyi (ileride: imza yapılandırması, `versionCode`,
> manifest meta-data'sı, ikonlar) siler. Bu yüzden `android:add` scripti de
> kaldırıldı. Klasör bir şekilde bozulursa çözüm yeniden üretmek değil,
> `git checkout -- android` ile geri almaktır.

### Seçenek A — GitHub Actions (bilgisayarına hiçbir şey kurmadan)
Android Studio kurmak istemiyorsan APK'yı GitHub derlesin:

1. Depoyu GitHub'a push et.
2. Depoda **Actions** sekmesi → soldan **Android build** → sağdan **Run workflow**.
3. Birkaç dakika sonra iş biter; sayfanın altındaki **Artifacts** bölümünden
   `menajer-apk` dosyasını indir (zip içinde `app-debug.apk` çıkar).
4. APK'yı telefona gönder, dokun, kur.

Her `main` push'unda da otomatik çalışır. Tanım: `.github/workflows/android.yml`

### Seçenek B — kendi bilgisayarında
Gereken: [Android Studio](https://developer.android.com/studio) (Android SDK ve
Java'yı da o kurar).
```
npm ci                     # kilit dosyasından birebir kurulum
```

#### APK — telefonda test için
```
npm run android:apk
```
→ `android/app/build/outputs/apk/debug/app-debug.apk`

Bu dosyayı telefona gönder ve dokun. Telefonda **"bilinmeyen kaynaklardan kurulum"**
izni gerekir. Hata ayıklama anahtarıyla imzalıdır, mağazaya yüklenemez ama
kurulup çalışır — asıl test yöntemi budur.

USB ile bağlıysan tek komutla da kurabilirsin:
```
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

#### AAB — Play Store için
Play Console 2021'den beri APK kabul etmiyor, **AAB** istiyor.
```
npm run android:aab
```
→ `android/app/build/outputs/bundle/release/app-release.aab`

Bu dosyanın **imzalanması** gerekir. En kolayı Android Studio:
**Build → Generate Signed App Bundle** → yeni bir keystore oluştur.

> İmza anahtarını (`.jks`) ve parolasını kaybetme. Kaybedersen aynı uygulamayı
> bir daha güncelleyemezsin — yeni bir uygulama olarak yayınlamak zorunda kalırsın.

#### Kod değiştikçe
```
npm run android:sync       # www'yi tazeler ve Android projesine kopyalar
```
`android:apk` ve `android:aab` bunu zaten kendi içinde çalıştırıyor.

### Uygulama kimliği
`capacitor.config.json` kimliğin **tek kaynağı**:

| | Değer |
|---|---|
| `appId` (package / namespace) | `com.xahke.profootballagent` |
| `appName` (launcher etiketi, mağaza adı) | `Pro Football Agent` |

Gradle'daki `applicationId` ve `namespace`, `MainActivity`'nin package bildirimi ve
`strings.xml` bu iki değeri tekrar ediyor. CI ikisini derlenmiş APK'dan geri okuyup
config ile karşılaştırıyor (`dogrula-5-paket-ve-etiket`), yani biri değiştirilip
diğeri unutulursa derleme düşer — sessizce yanlış paket çıkmaz.

`appId` **yayınlandıktan sonra değiştirilemez**; Play'deki kalıcı kimlik odur.

> **Oyunun adı hâlâ "Menajer".** `manifest.json`, `index.html` ve oyun içindeki
> bütün Türkçe metinler değişmedi ve değişmeyecek — oyun o kelimeyle yazıldı.
> `Pro Football Agent` yalnızca Android launcher etiketi ve mağaza adı. Bu farkı
> toplu değiştirmeyle "düzeltmeye" çalışma.

### Bilmen gerekenler
- **Geliştirici hesabı** tek seferlik 25 USD.
- **Yeni kişisel hesaplarda kapalı test zorunlu:** en az **12 testçi**, **14 gün**
  kesintisiz. 14 günlük sayaç 12. testçi katıldığında başlar. Yani yayına
  çıkmadan önce iki haftalık bir süreç var, buna göre planla.
- Gerekli materyaller: uygulama ikonu (512×512), öne çıkan görsel (1024×500),
  en az 2 ekran görüntüsü, kısa/uzun açıklama, içerik derecelendirme anketi,
  **gizlilik politikası URL'si**.
- Bu oyun hiçbir veri toplamıyor, ağa çıkmıyor; kayıt yalnızca cihazdaki
  `localStorage`'da. Gizlilik politikasında bunu belirtmek yeterli.

## Temalar
Dört görünüm var: **dosya** (varsayılan), **gazete**, **terminal**, **saha**.
Oyun içinde başlıktaki dişli → Ayarlar → Görünüm'den değiştirilir; seçim kayda yazılır.

Her tema `css/themes/*.css` altında bağımsız bir stylesheet. Bunları düzenledikten sonra:
```
node tools/build-themes.js   # → css/style.css (üretilen dosya, elle düzenleme)
```
Bu adım her temanın seçicilerini `html[data-theme="ad"]` altına kapsamlar ve tek
bir stylesheet'te birleştirir. Yeni tema eklemek için dosyayı `css/themes/` içine
koy, `THEMES` dizisine (`js/ui.js`) bir kayıt ekle, betiği yeniden çalıştır.

## Tek dosya çıktısı
```
node tools/build-themes.js && node build.js   # → dist/menajer.html
```

## Dosya yapısı
| Dosya | İçerik |
|---|---|
| js/i18n.js | Çeviriler, haber şablonları, haber-içi linkler |
| js/data.js | İsim havuzları, ligler, takımlar, kupa tanımları (tamamı özgün) |
| js/core.js | Oyun durumu, fikstür/kupa kurulum, keşif ağı, ekonomi |
| js/sim.js | Haftalık simülasyon, sezon sonu, gelişim, kariyer sonu, küme, milli turnuva |
| js/market.js | Yapay zekâ transfer piyasası, kulüp bütçeleri, sezon sonu kadro dengesi |
| js/events.js | Olaylar: tanımlar, ağırlıklı seçim, sonuç uygulayıcı |
| js/sfx.js | Arayüz sesleri (Web Audio ile sentezlenir, ses dosyası yok) |
| js/actions.js | Pazarlık, transfer, temsilcilik görüşmesi, keşif satın alma |
| js/ui.js | Görünümler, render, navigasyon, temalar, ayarlar |
| css/themes/ | Dört tema; her biri style.css'in tam karşılığı |
| tools/build-themes.js | Temaları kapsamlayıp css/style.css'i üretir |
| tools/build-www.js | Capacitor'ın paketleyeceği www/ klasörünü hazırlar |
| tools/android.js | APK/AAB üretir, dosyanın yerini yazar |
| .github/workflows/android.yml | APK'yı GitHub'da derler, indirilebilir çıktı bırakır |
| android/ | Native Android projesi — kaynak denetiminde. `cap sync` tazeler, `cap add` yeniden üretir (kullanma) |
| capacitor.config.json | Android paketleme ayarları (appId, uygulama adı) |
| manifest.json, sw.js, icons/ | PWA: kurulabilirlik ve çevrimdışı çalışma |
| js/main.js | Kayıt/yükleme, başlatma |

Script sırası önemlidir (index.html'deki sırayla yüklenir). Modül/build sistemi yok — Capacitor'a doğrudan taşınabilir.

## Olay eklemek
`js/events.js` içindeki `EVENTS` dizisine bir kayıt eklemek yeterli:

```js
{id:'benzersizAd', w:8, need:'client',        // need yoksa menajerle ilgili olaydır
 when:c=>c.p.age>=32,                          // isteğe bağlı ek koşul
 ttl:c=>({tr:'Başlık',en:'Title'}),
 txt:c=>({tr:'Metin…',en:'Text…'}),
 opts:[{t:{tr:'Seçenek',en:'Option'},
        eff:c=>({cash:-50,trust:8,morale:4,msg:{tr:'Sonuç…',en:'Outcome…'}})}]}
```

Sonuçlar tek bir uygulayıcıdan (`applyEff`) geçer; kullanılabilir kaldıraçlar
`cash`, `rep`, `morale`, `trust`, `form`. Rastgele dallanma için `eff` içinde
`RF()` kullanılabilir. Sıklık `EV_CHANCE` ve `EV_GAP` ile ayarlanır.

## İsimlendirme ve telif
Oyundaki hiçbir lig, kulüp, kupa veya turnuva adı gerçek bir markaya ait değildir.

- **Ligler** ad olarak veride tutulmaz; `lgName()` bunları ülke adı + kademeden üretir
  ("Türkiye Üst Lig" / "Türkiye Top Flight"). Yeni lig eklerken `ctry` ve `tier`
  vermek yeterli, ad kendiliğinden iki dilli çıkar.
- **Kulüpler** "şehir + nötr sıfat" kalıbıyla adlandırılmıştır: İstanbul Sentinels,
  Manchester Ironworks, Madrid Pioneers, Milano Northwind.

  **Şehirler gerçek kulüplerin şehirleriyle birebir eşleşir** — böylece oyuncu
  hangi kulübün karşılığı olduğunu anlar. İstanbul'da altı, Londra'da yedi,
  Buenos Aires'te yedi kulüp vardır; ayrımı sıfat sağlar.

  Sıfat seçerken kaçınılanlar:
  1. **Kulüp adının çevirisi:** Royals (Real), United, City, Athletic, Sporting,
     Inter. "Madrid Royals" aslında Real Madrid'in çevirisidir.
  2. **Kulübün lakabı:** Lions (Galatasaray), Eagles (Beşiktaş), Canaries
     (Fenerbahçe), Red Devils, Gunners, Magpies, Blues.
  3. **Kulüp adı olan sıfatlar:** Rangers, Rovers, Wanderers, Albion, Forest,
     Palace, Hotspur.

  Sıfatlar iki havuzdan seçilir: ligin en güçlü %30'u ağırlıklı sıfatlar alır
  (Sentinels, Citadels, Vanguard), kalanı yerel/zanaat tonundakileri (Millers,
  Vintners, Colliers). Aksi halde büyük kulüplere "Otters" gibi adlar düşüyordu.

  Her takımın üç harfli kısaltması vardır (`ab` alanı); rozetlerde bu görünür,
  çünkü aynı şehirden birden fazla kulüp olunca adın ilk üç harfi ayırt etmiyor.

- **Kupalar** özgündür: Kıta / Birlik / Bölge Kupası ve Milletler Kupası.
- **Oyuncu adları** ülke bazlı ad-soyad havuzlarından rastgele üretilir.

Kulüp renkleri görsel çeşitlilik içindir ve bir kulübü temsil etmez. Yeni ad
eklerken gerçek kulüp adlarından ve kısaltmalarından kaçının.
