# Prosedürel Takım Arması — Prototip

[← Geliştirici Notları](DEVELOPMENT.md)

Modüler ve deterministik takım arması sistemi. Bu belge üç turu birlikte anlatır:
geometri çıkarımı, semantik eşleme ve **üretim entegrasyonu**.

**Sistem artık çalışma zamanında.** `tmBadge(tm, size)` imzası değişmedi; 31 satırdaki
32 çağrının hiçbirine dokunulmadı, değişen yalnız fonksiyonun içeride ne ürettiği.

| | |
|---|---|
| **Üretim motoru** | `js/badges.js` — geometri, semantik eşleme, descriptor, çizim |
| `tmBadge()` sarmalayıcı ve harfli yedek | `js/core.js` |
| Laboratuvar | `tools/badge-lab.html` — tarayıcıda doğrudan aç |
| Laboratuvara özel yardımcılar | `tools/badge-lab-legacy.js`, `tools/badge-lab.js`, `tools/badge-lab.css` |
| Kabul testleri | `tools/badge-selftest.js` — `node tools/badge-selftest.js` |
| Ad havuzu analizi | `tools/badge-names.js` — `node tools/badge-names.js` |
| Vektörleştirme ayarları | `tools/badge-vectorize.js` |

## Tek kaynak

Geometri, semantik eşleme ve descriptor mantığı **yalnız `js/badges.js`'te** tanımlı.
Laboratuvar bu dosyayı `<script src="../js/badges.js">` ile doğrudan yükler; `tools/`
altında ikinci bir kopya yoktur, dolayısıyla senkron kaçağı yapısal olarak imkânsız.
Eski `tools/badge-lab-data.js` bu yüzden silindi. Laboratuvarın ölçüm bölümü yine de
motorun gerçekten yüklendiğini ve çizimin `js/badges.js`'ten geldiğini denetler.

## Yükleme zinciri

`js/badges.js` üç yerde de aynı konumda: `index.html`, `build.js`'in `order` dizisi ve
`sw.js`'in `SHELL` listesi. Konum `data.js`'ten **sonra** (arma bir takım nesnesi okur)
ve `core.js`'ten **önce** (`tmBadge()` orada). `i18n` ilk, `main` son kuralı korundu.
Çalışma zamanı JS değiştiği için service worker önbelleği `menajer-v30 → menajer-v31`
yükseltildi.

## Kaynaklar

Üç PNG tabaka yalnız çalışma girdisi olarak kullanıldı; repoya, `assets/`, `www/`,
`dist/` veya Android çıktısına kopyalanmadı ve çalışma zamanında referans verilmiyor.

| Tabaka | Ölçü | Düzen | Kullanılan |
|---|---|---|---|
| `team-emblems-source.png` | 2048×2048 | 4×4 | 12 hücre |
| `team-frames-source.png` | 2544×1904 | 5 sütun × 4 satır | 10 hücre (alt satır kadrajı kesik) |
| `team-emblems-supplement.png` | 2544×1904 | 4 sütun × 3 satır | 12 hücre |

Hücre sınırları varsayılmadı, ölçüldü: mürekkep sütun/satır toplamlarındaki boş
bantların orta noktaları kesme çizgisi olarak alındı. Ek tabakada her hücrede tek özne
var ve en dar kenar boşluğu 33 px — komşu sembol sızıntısı yok.

## Amblemler (24)

Siyah zemin atıldı, beyaz siluet eşiklendi, gürültü elendi, konturlar takip edildi ve
Douglas–Peucker ile sadeleştirildi. Sonuç **gerçek path verisi**; SVG içinde `<image>`,
`data:` URI veya harici yol yok. Yöntem ve tüm ayarlar `tools/badge-vectorize.js`'te.

Toplam **1 670 nokta**, mikro sürümlerde **937**.

### Ek 12 amblem

| amblem | hücre | bbox (x0, y0, x1, y1) | kutu merkezi sapması | path | mikro | mürekkep %d → mikro |
|---|---|---|---|---|---|---|
| `anvil` | 1×1 | 6.45, 17.58, 56.18, 48.18 | −0.68, +0.88 | 36 n / 1 | 25 n / 1 | 19.9 → 20.6 |
| `crossed-hammers` | 1×2 | 7.17, 8.07, 57.17, 56.49 | +0.17, +0.28 | 58 n / 6 | 40 n / 6 | 20.8 → 23.0 |
| `industrial-cog` | 1×3 | 6.98, 7.70, 56.98, 56.35 | −0.02, +0.02 | 116 n / 8 | 86 n / 8 | 30.2 → 33.0 |
| `ocean-wave` | 1×4 | 8.47, 6.29, 57.02, 56.29 | +0.75, −0.71 | 97 n / 3 | 55 n / 3 | 31.1 → 35.3 |
| `lighthouse` | 2×1 | 6.86, 4.55, 56.86, 51.44 | −0.14, **−4.01** | 86 n / 11 | 32 n / 1 | 13.4 → 17.9 |
| `compass` | 2×2 | 7.10, 7.06, 56.89, 57.06 | 0.00, +0.06 | 87 n / 6 | 59 n / 2 | 8.8 → 15.5 |
| `stone-bridge` | 2×3 | 6.04, 19.31, 56.04, 45.60 | −0.96, +0.45 | 65 n / 5 | 21 n / 1 | 15.9 → 19.0 |
| `fortified-gate` | 2×4 | 6.86, 9.74, 56.86, 54.54 | −0.14, +0.14 | 123 n / 6 | 53 n / 2 | 34.3 → 37.5 |
| `sailor-knot` | 3×1 | 6.95, 16.56, 56.95, 48.46 | −0.05, +0.51 | 73 n / 4 | 42 n / 4 | 18.1 → 19.2 |
| `gemstone` | 3×2 | 6.98, 14.66, 56.98, 53.57 | −0.02, **+2.12** | 39 n / 9 | 17 n / 5 | 16.2 → 20.7 |
| `spear-shield` | 3×3 | 5.58, 9.60, 55.58, 56.62 | −1.42, +1.11 | 47 n / 4 | 26 n / 3 | 24.6 → 29.4 |
| `mill-wheel` | 3×4 | 7.00, 8.03, 57.00, 56.04 | 0.00, +0.03 | 118 n / 10 | 74 n / 10 | 24.4 → 26.9 |

24 amblemin **18'inde** optik merkez sapması ±2 birimin içinde. Kalan altısında
(`bull`, `mountain`, `anchor`, `lightning`, `lighthouse`, `gemstone`) değil ve bu bir
ayar hatası değil: `|kutu sapması| + |alan sapması|` şeklin kendi özelliğidir ve
sabittir. En büyüğü `lighthouse` (8.02 birim) — geniş dalga tabanı alan merkezini
aşağı çekerken ince kule kutuyu yukarı uzatıyor. Harman 0.50 ikisini de mümkün olan
en küçük değerde tutar; birini ±2'ye çekmek diğerini o kadar dışarı atar.

En dar viewBox payı 3.84 birim; hiçbir amblem `0 0 64 64` dışına taşmıyor.

### Pusula — harf ayıklama

Kaynak pusulada W/E/S/E harfleri var. Harfler ayrı bağlı bileşenler ve hem alanları
hem merkezden uzaklıkları ışınlardan ayrı bir bantta:

| | alan | merkezden uzaklık |
|---|---|---|
| ana gövde (halka + yıldız + merkez) | 19 547 px | r ≈ 9 |
| dört çapraz ışın | 3 940 – 4 083 px | r ≈ 120 – 134 |
| **dört harf** | **864 – 1 076 px** | r ≈ 201 – 216 |

Işın ile harf arasında ~3.6× alan farkı olduğu için eşik belirsiz değil: en büyük
bileşenin %10'undan küçükler atılıyor ve üretim betiği **tam dört** bileşenin
atıldığını, atılanların hepsinin harf bandında olduğunu doğruluyor. Sonuç pusulada
6 alt yol var: dış halka, dört ana ok, dört ara ışın ve merkez noktası. Harf yok.

### Mikro sürümler

Mikro sürüm aynı hattan geçer; farkı daha yüksek bulanıklık, morfolojik **CLOSE**
(küçük boşlukları birleştirir), **DILATE** (çizgileri kalınlaştırır), daha yüksek
bileşen/delik eşiği ve daha yüksek DP toleransı. Bulanıklaştırma **değil** — sonuç yine
keskin path, sadece daha az noktalı ve daha kalın gövdeli.

1. turdan iyileştirilenler, 18 px'te kaybolmaya en yakın dördü:

| amblem | mikro | mürekkep %d → mikro |
|---|---|---|
| `anchor` | 36 n / 1 yol | 15.9 → 21.0 |
| `oak` | 33 n / 1 yol | 25.4 → 28.5 |
| `torch-spear` | 29 n / 1 yol | 9.3 → 14.2 |
| `mountain` | 45 n / 6 yol | 18.2 → 22.8 |

`industrial-cog` ve `mill-wheel` bir ara tamamen düz diske dönüşmüştü (CLOSE 20 px
bütün dişleri eritiyordu). CLOSE 9 px'e indirilip delik eşiği düşürülünce dişler
yuvarlanarak korunuyor ve göbek deliği duruyor.

## Çerçeveler (10)

Çerçeveler iz sürülmedi, **parametrik yeniden çizildi**. Kenar iç içe inset path yerine
**clip'lenmiş stroke**: bir stroke tanımı gereği her yerde aynı genişlikte, oysa sivri
uçlu bir armada elle tutturulan inset çarpanı hedef 2.0 birimlik kenarı alt uçta
**4.14 birime** çıkarıyordu.

### Amblem kutusu bir oran merdiveni

Tek sabit kutu, oranı kareden uzak amblemleri gereksiz küçültüyordu: taş köprü
(en/boy 1.9) baklava içinde 18 px'te **3.19 px**'e, şimşek (0.57) **3.44 px**'e
düşüyordu. Artık her çerçeve sekiz oran için ayrı kutu taşıyor
(`FIT_ASPECTS = [0.55, 0.7, 0.85, 1.0, 1.2, 1.45, 1.75, 2.1]`) ve amblemin kendi
oranına logaritmik olarak en yakın satır seçiliyor. Oran hiç bozulmuyor.

Ölçülen etki (240 çerçeve × amblem çifti, 18 px):

| | tek kutu | oran merdiveni |
|---|---|---|
| en dar kısa kenar | 3.19 px | **3.98 px** |
| kısa kenarı 6 px altında olan çift | 54 / 240 | **31 / 240** |
| uzun kenarı 6 px altında olan çift | — | **0 / 240** |
| medyan kısa kenar | — | 8.23 px |

Değerler raster üzerinde arandı: alan `EMB_CLEAR` kadar aşındırılıp o oranda içine
sığan en büyük dikdörtgen bulundu. Elle tahmin yok.

### 18 px çizim politikası (nano)

`NANO_AT = 20`. Bu boyutun altında:

- amblem mikro geometriye geçer (`MICRO_AT = 26` zaten 26 px'te devrede),
- **tek dış çerçeve** çizilir, iç accent keyline yok,
- accent taban çubuğu çizilmez,
- desen sadeleşmiş karşılığına düşer (5 dikey bant → orta şerit, 4 yatay bant → yatay
  yarım; blok hâlindeki altı desen olduğu gibi kalır),
- amblem konturu 1.7 → 1.2 birime iner,
- amblem daha geniş `fitAS` kutusuna oturur.

Kenar payı 5.6 → 4.0 birime indiği için amblem çerçeve başına **%1 – %15** büyüyor
(en çok dar armalarda: `ornate-shield` +%14.6, `diamond` +%10.8; `round` ve
`compact-shield` zaten kendi tavanındaydı, +%1).

Baklava havuzun en dar çerçevesi ve geometrik tavanı düşük: içine sığan en büyük kare
nano'da 21.6 birim, yani 18 px'te **6.08 px**. Kabul eşiği tam orada.

## Gerçek takım adı analizi

`node tools/badge-names.js` — `js/data.js`'i okur, değiştirmez.

| soru | cevap |
|---|---|
| Adlar sabit veri mi, havuzdan mı üretiliyor? | **Sabit.** `TEAMS[lig][takım] = [ad, ab, c1, c2, güç]`, `js/data.js:202` |
| Şehir ve kimlik kelimesi nasıl birleşiyor? | Boşlukla; kimlik kelimesi **her zaman son kelime** (401 ad iki, 34 ad üç, 1 ad dört kelime) |
| Kaç farklı kimlik kelimesi var? | **68** |
| Adlar dile göre değişiyor mu? | **Hayır.** `js/i18n.js` ve `js/ui.js`'te tek bir takım adı geçmiyor; `tm.n` doğrudan basılıyor |
| Kanonik kimlik anahtarı var mı? | **Var:** `tm.n`. 436/436 benzersiz ve dilden bağımsız |

**`tm.ab` tek başına yetmez:** 436 takımda yalnız 383 farklı kısaltma var — 46 çakışma
(ör. `İSP` hem *İstanbul Spires* hem *İstanbul Pastures*). Bu yüzden anahtar
`ad + '|' + kısaltma`.

**Tohuma girmeyenler ve sebebi:**

- `tm.lg` — küme düşen takımın ligi değişir, arması değişmemeli.
- Takımın listedeki sırası — puan durumu her hafta sıralamayı değiştirir.
- `tm.id` — kariyer içinde sabit ama `TEAMS` bir gün düzenlenirse kayar; ad daha dayanıklı.

En sık kimlik kelimeleri: Ironworks 11, Corsairs / Foundry / Lagoons / Masons /
Willows 10, Coopers / Coves / Heralds / Highlands / Kestrels / Quarry / Sentinels /
Weavers 9.

## Semantik kategoriler

Tablo brief'in başlangıç listesinden **değil**, gerçek havuzdan çıkarıldı. Başlangıç
listesindeki *tideway, marina, port, halyard, granite, ridge, peak, grove, forest,
fortress, signal, storm, thunder, volt, royal, king, sovereign* kelimelerinin hiçbiri
gerçek havuzda yok; buna karşılık *corsairs, masons, weavers, amphora, aqueduct, looms,
tanners, northwind, herons* var ve tablo onlara göre kuruldu.

| kategori | kelime | takım | amblemler |
|---|---|---|---|
| Denizcilik | 9 | 64 | anchor, ocean-wave, sailor-knot, lighthouse |
| Yön bulma | 6 | 33 | compass, star, lighthouse |
| Sanayi | 8 | 52 | anvil, crossed-hammers, industrial-cog, torch-spear |
| Zanaat | 6 | 49 | crossed-hammers, industrial-cog, mill-wheel |
| Tarım | 7 | 49 | oak, mill-wheel |
| Coğrafya | 6 | 43 | mountain, gemstone |
| Gök ve hava | 4 | 26 | lightning, star |
| Savunma | 8 | 49 | castle, fortified-gate, spear-shield |
| Şehir yapıları | 4 | 16 | stone-bridge, fortified-gate |
| Işık | 2 | 6 | lighthouse, torch-spear |
| Armacılık ve asalet | 2 | 12 | crown, lion, star |
| Hayvanlar | 4 | 25 | eagle, bull |
| Değerli eşya | 1 | 7 | gemstone |
| — (yedek) | 1 | 5 | 24 amblemlik havuzdan hash |

**Kapsama: 67 / 68 kimlik kelimesi = %98.5**, takım bazında **431 / 436 = %98.9**.
Kapsanmayan tek kelime: **otters** (5 takım). Havuzda su samuru karşılığı bir amblem
yok ve kurt/aslan gövdesine bağlamak uydurma olurdu; bu beş takım yedek hash kullanıyor.

Kelimesi birebir bir amblem olan takımlarda (`compass`, `lighthouse`, `anchors`,
`bridges`) o amblem tercih ediliyor — ama **kilit değil**: ayrı bir tuzla yazı-tura
atılıyor, yarısı birebir amblemi alıyor, yarısı kategorinin geri kalanını. Böylece aynı
kelimeye sahip takımlar tek tip olmuyor.

**Yaklaşık üç eşleşme** ayrıca `SEM_LOOSE` içinde işaretli, ki rapor "her şey oturdu"
demesin: `stags` → boğa (boynuzlu dört ayaklı, görsel aile), `amphora` → değerli taş
(havuzda kap yok), `frost` → yıldız (kristal biçimi).

**Kurt hiçbir kategoride yok.** Oyunun adlandırma politikası kulüp lakabı hayvanları
(Lions, Eagles, Magpies…) yasakladığı için gerçek havuzda aslan/kurt/boğa karşılığı
neredeyse hiç yok. Aslan `heralds`/`dominion` üzerinden heraldik gerekçeyle giriyor,
boğa `stags` üzerinden; kurt yalnız yedek hashle 5 *Otters* takımına düşebiliyor.

## Renk seçimi

Renkler **takımın kendi verisinden** geliyor ve değiştirilmiyor. Yeni renk alanı
eklenmedi, kayıt şemasına dokunulmadı.

| descriptor alanı | kaynak |
|---|---|
| `primary` | `tm.c1` — `tmBadge()`'in zemin olarak kullandığı alan |
| `secondary` | `tm.c2` — `tmBadge()`'in köşe şeridi |
| `ink` | `mix(primary, #0A0C10, 0.78)` — her zaman koyu, takımın tonunu taşır |
| `accent` | `TONES` merdiveninden, `primary` ve `secondary` ile **en yüksek asgari kontrastı** veren aday |

436 takımda `primary === tm.c1` ve `secondary === tm.c2` olduğu programatik olarak
doğrulanıyor. `tm.c1`/`tm.c2` yoksa deterministik yedek renk kullanılır (veride her
zaman dolu, yine de kırılmaz).

`ink`'in her zaman koyu olması bilinçli: dış çerçevenin hem koyu saha zemininde hem
açık zeminde silueti tutması buna bağlı. `accent` tek sabit beyaz olsaydı beyaz formalı
takımlarda amblem alanın yarısında kaybolurdu; nötr merdivenden en iyi asgari kontrastı
seçmek bunu çözüyor, kalanını amblemin `ink` konturu tamamlıyor.

## Descriptor

```js
badgeDescriptor(team) → {
  frame, pattern, emblem,
  primary, secondary, accent, ink,
  semanticKey, semanticCategory, usedFallback, salt, key, combo, shape
}
```

Saf fonksiyon. Kayda veya çalışma zamanına hiçbir şey yazmaz.

```
emblem  = semantik kategori varsa kategori içinden, yoksa 24'lük havuzdan hash
frame   = hash(key + '|frame')   % FRAMES.length
pattern = hash(key + '|pattern') % PATTERNS.length
key     = tm.n + '|' + tm.ab
```

Her katman **ayrı tuzla** hash'leniyor; tek bir hash'in alt bitlerini üçe birden
dağıtmak katmanları birbirine kilitler. `Math.random` hiçbir yerde yok.

**Çakışma çözümü sıradan bağımsız.** Aynı ligde iki takımın tam kombinasyonu
(çerçeve + desen + amblem + iki kimlik rengi) çakışırsa tuz turlanıyor. Çözüm giriş
sırasına bağlı olsaydı puan sıralaması değiştiğinde armalar değişirdi; bu yüzden liste
önce kanonik anahtara göre sıralanıyor. 436 takımda **1 yeniden tuzlama** gerekti.
Yalnız biçimi (renk hariç) çakışan 11 çift var — onları takımın kendi renkleri ayırıyor.

## Ölçüm sonuçları

Laboratuvarın **7. bölümü** kabul testlerini sayfa içinde çalıştırıp yazdırıyor.
Son durumda **17/17** geçiyor:

| kontrol | sonuç |
|---|---|
| 24/24 amblem geçerli path | 1 670 nokta · mikro 937 |
| 24/24 amblemde raster yok | yalnız M/L/Z komutları |
| pusulada harf/metin path'i yok | 6 alt yol: halka + 4 ana ok + 4 ara ışın + merkez |
| 10/10 çerçeve kapalı clip alanı | 670 karakter path |
| 30/30 gerçek takım çiziliyor | 22 farklı lig |
| 30 takımın descriptor'ı iki render'da aynı | ✓ |
| TR/EN geçişinde descriptor aynı | adlar hiçbir dilde çevrilmiyor |
| takım sıralaması değişince descriptor aynı | liste ters çevrilip karşılaştırıldı |
| aynı ligde tam kombinasyon çakışması yok | 1 yeniden tuzlama · 11 biçim çakışması renkle ayrılıyor |
| gerçek renkler `tmBadge()` ile aynı alanlardan | 436 takımda doğrulandı |
| semantik eşleşen takım yedek kullanmıyor | 431/436 (%98.9) |
| eşleşmeyen takım güvenli yedek kullanıyor | 5 takım (*otters*) |
| 18 px'te hiçbir amblem kaybolmuyor | 240 çiftin en kısa uzun-kenarı 6.08 px |
| viewBox taşması ve kırpma yok | en dar pay 3.84 birim |
| yatay taşma yok | 1240 px / 1240 px |
| `Math.random` yok | descriptor, çizim ve çakışma çözümü saf |
| raster / `data:` URI / harici yol yok | ✓ |

## Laboratuvarı çalıştırma

`tools/badge-lab.html` doğrudan açılabilir. Yedi bölüm:

1. **Toplam bileşen havuzu** — 24 amblem, 10 çerçeve, 10 desen, 13 semantik kategori
2. **Gerçek takım eşlemesi** — 22 ligden 30 takım; her kartta ad, arma, semantik token,
   kategori, seçilen amblem, çerçeve, desen, gerçek `c1`/`c2` ve yedek kullanıldıysa işaret
3. **Önce / sonra** — aynı 12 takım, solda 1. turun saf hash + laboratuvar paleti,
   sağda semantik + gerçek renk
4. **Ölçek testi** — 12 farklı kategoriden takım, 64 / 34 / 26 / 18 px, gerçek
   `width`/`height` ile (hiçbir yerde `transform: scale` yok)
5. **Lig tablosu** — gerçek takım adları, 26 px arma
6. **Nano testi** — 18 px'te en çok zorlanan dokuz amblem ve baklava çerçeve, koyu ve
   açık zeminde yan yana
7. **Ölçüm** — kabul testleri, kapsama oranı ve kategori dağılımı

Sağ üstteki düğme TR/EN arasında geçiş yapar.

## Üretim entegrasyonundan önce çözülmesi gerekenler

1. **Yassı ve ince uzun amblemler küçük ölçekte hâlâ dar.** Oran merdiveni sonrası
   240 çiftin 31'inde kısa kenar 18 px'te 6 px'in altında (en dar 3.98 px,
   `diamond` + `stone-bridge`). Uzun kenar hepsinde ≥ 6.08 px, yani amblem hiç
   kaybolmuyor — ama baklava çerçeveyi yassı amblemlerle eşleştirmemek ya da baklavayı
   26 px altında kullanmamak düşünülebilir.
2. **Kurt semantik olarak erişilemez.** Adlandırma politikası hayvan lakaplarını
   yasakladığı için 24 amblemin biri pratikte yalnız 5 *Otters* takımına düşebiliyor.
   Ya *otters* için bir amblem eklenmeli ya da kurt havuzdan çıkarılmalı.
3. **Amblem her zaman açık ton.** `TONES` merdiveni açık nötrlerden oluşuyor, çünkü
   `ink` her zaman koyu. Küçük ölçekte bütün armalar "renkli alan üzerinde açık leke"
   siluetine yakınsıyor; ayrım desen ve çerçeveden geliyor. Koyu formalı takımlarda
   ters kombinasyona izin vermek çeşitliliği artırır ama zemin testini tekrar
   gerektirir.
4. **`compass` gibi birebir kelimelerde yazı-tura oranı küçük örneklemde sapıyor.**
   Dört *Compass* takımının yalnız biri pusula aldı. Oran %50 ama takım sayısı az;
   birebir eşleşmeyi %75'e çıkarmak veya kategoriden çıkarmak değerlendirilebilir.
5. **Beş armanın silueti birbirine yakın.** `classic-point`, `ornate-shield`,
   `narrow-shield`, `angular-shield` ve `compact-shield` 26 px'te ancak genişlik
   farkıyla ayrılıyor.
6. **`tmBadge()` çağrı yerleri ve nano eşiği.** Entegrasyonda **33 çağrı yeri** var
   (`js/ui.js` 30, `js/actions.js` 3) ve boyutlar 16–62 px. Dağılım:
   16, 18, 20 (×8), 22, 24 (×2), 26 (×2), 30 (×2), 32, 34 (×4), 36 (×2), 42 (×3),
   44, 46, 48, 62. `NANO_AT = 20` bunların **10'unu** kapsıyor; 22 ve 24 px çağrıları
   eşiğin hemen üstünde kalıyor ve iç keyline'ı 0.6 px olarak çiziyor. Eşiği 24'e
   çekmek 13 çağrıyı kapsar — entegrasyondan önce bu iki boyut ekranda görülmeli.
7. **Kaynak PNG'ler repoda değil.** Geometri yeniden üretilmek istenirse üç tabaka
   tekrar gerekir. `tools/badge-vectorize.js` ayarları ve yöntemi kayıt altına alıyor,
   ama path verisi bugün tek doğru kaynak.
8. **Descriptor kayda yazılmamalı.** Bugünkü hâli saf ve türetilmiş; entegrasyonda da
   öyle kalmalı — `S.known` ve `p.ra` ile aynı mantık.
