# Prosedürel Takım Arması — Prototip

[← Geliştirici Notları](DEVELOPMENT.md)

Modüler ve deterministik bir takım arması sisteminin **görsel prototipi**. Bu tur
yalnız bir laboratuvar üretir; oyun entegrasyonu onaydan sonra yapılır.

**Bu prototip onaylanmadan `tmBadge()` veya oyun ekranları değiştirilmeyecek.**

| | |
|---|---|
| Laboratuvar | `tools/badge-lab.html` — tarayıcıda doğrudan aç |
| Veri | `tools/badge-lab-data.js` |
| Çizim ve ölçüm | `tools/badge-lab.js` |
| Stil | `tools/badge-lab.css` |

Hiçbiri `index.html`'e, `build.js`'in `order` dizisine veya `sw.js`'in `SHELL`
listesine eklenmedi — üç yerin de dokunulmamış olması, laboratuvarın çalışma
zamanına sızmadığının kanıtı.

## Kaynaklar

İki PNG tabaka yalnız çalışma girdisi olarak kullanıldı; repoya, `assets/`,
`www/`, `dist/` veya Android çıktısına kopyalanmadı ve çalışma zamanında
referans verilmiyor.

| Tabaka | Ölçü | Düzen | Kullanılan |
|---|---|---|---|
| `team-emblems-source.png` | 2048×2048 | 4×4 | 12 hücre |
| `team-frames-source.png` | 2544×1904 | 5 sütun × 4 satır | 10 hücre (alt satır kadrajı kesik, alınmadı) |

Hücre sınırları varsayılmadı, ölçüldü: mürekkep sütun/satır toplamlarındaki boş
bantların orta noktaları kesme çizgisi olarak alındı. Her amblem hücresinde tek
özne var ve en dar kenar boşluğu 46 px — komşu sembol sızıntısı yok.

## Amblemler (12)

Siyah zemin atıldı, beyaz siluet eşiklendi, gürültü parçaları elendi, konturlar
takip edildi ve Douglas–Peucker ile sadeleştirildi. Sonuç **gerçek path
verisi**; SVG içinde `<image>`, `data:` URI veya harici yol yok.

Yöntem, sırayla:

1. Hücreyi gri tonlamada kırp.
2. Gauss bulanıklığıyla piksel merdivenlerini yumuşat (σ 2.5–3.0).
3. 128'de eşikle.
4. En büyük parçanın %2'sinden küçük bağlı bileşenleri at.
5. `RETR_CCOMP` ile dış konturları ve delikleri ayrı ayrı çıkar; toplam alanın
   binde 6–12'sinden küçük delikleri at — göz ve burun kalır, gereksiz iç negatif
   alanlar kalmaz.
6. Geometriyi `0 0 64 64` içine, dört tarafta pay bırakacak şekilde **oranı
   bozmadan** ölçekle (içerik kutusu 50×50).
7. Optik merkezle: kutu merkezi ile alan ağırlık merkezinin tam ortası (32, 32)'ye
   oturtulur.
8. Normalize birimlerde DP toleransıyla (0.30–0.42) sadeleştir.

**Mikro sürüm.** Aslan, kartal, kurt ve boğa 18 px'te fazla ayrıntılıydı. Her
amblemin ikinci bir geometrisi var (`dm`): daha yüksek DP toleransı, daha yüksek
delik eşiği, daha az bileşen. Bulanıklaştırma değil, **path noktası azaltma** —
toplam 725 noktadan 410'a. `badge-lab.js` içindeki `MICRO_AT = 26`, 26 px ve
altında bu sürüme geçer.

| amblem | hücre | bbox (x0, y0, x1, y1) | kutu merkezi sapması | path | mikro |
|---|---|---|---|---|---|
| `lion` | 1×1 | 8.20, 7.93, 55.78, 57.78 | −0.01, +0.86 | 84 n / 4 yol | 39 n / 2 yol |
| `eagle` | 1×2 | 5.15, 7.88, 55.15, 55.96 | −1.85, −0.08 | 54 n / 3 yol | 24 n / 1 yol |
| `wolf` | 1×3 | 10.98, 8.32, 53.06, 58.32 | +0.02, +1.32 | 83 n / 7 yol | 38 n / 2 yol |
| `bull` | 1×4 | 7.20, 10.16, 56.78, 60.16 | −0.01, **+3.16** | 88 n / 4 yol | 46 n / 3 yol |
| `crown` | 2×1 | 7.01, 12.71, 57.01, 48.14 | +0.01, −1.57 | 69 n / 5 yol | 46 n / 5 yol |
| `star` | 2×2 | 7.00, 6.83, 57.00, 54.72 | 0.00, −1.23 | 15 n / 1 yol | 12 n / 1 yol |
| `castle` | 2×3 | 7.14, 7.78, 56.97, 53.93 | +0.05, −1.14 | 74 n / 1 yol | 47 n / 1 yol |
| `mountain` | 2×4 | 6.99, 7.50, 56.86, 50.87 | −0.07, **−2.82** | 46 n / 6 yol | 34 n / 6 yol |
| `anchor` | 3×1 | 8.95, 4.56, 55.05, 54.56 | 0.00, **−2.44** | 67 n / 2 yol | 46 n / 2 yol |
| `torch-spear` | 3×3 | 11.52, 8.41, 52.44, 58.41 | −0.02, +1.41 | 65 n / 7 yol | 31 n / 6 yol |
| `lightning` | 4×3 | 17.82, 9.82, 46.14, 59.82 | −0.02, **+2.82** | 13 n / 1 yol | 12 n / 1 yol |
| `oak` | 4×4 | 11.51, 8.19, 51.98, 58.03 | −0.26, +1.11 | 67 n / 2 yol | 35 n / 2 yol |

Alan ağırlık merkezinin sapması, harman 0.50 olduğu için kutu merkezi sapmasının
tam tersidir. **Sekizinde sapma ±2 birimin içinde.** Kalan dördünde
(`bull`, `mountain`, `anchor`, `lightning`) değil ve bu bir ayar hatası değil:
`|kutu sapması| + |alan sapması|` şeklin kendi özelliği ve sabittir, bu dört
siluette 4.9–6.3 birim. Biri ±2'ye çekilirse diğeri o kadar dışarı çıkar; 0.50
harmanı ikisini de mümkün olan en küçük değerde tutar.

**Kullanılmayan hücreler:** 3×2 (ikinci çapa), 3×4 (yatay/çapraz kompozisyon),
4×1 (harfli pusula), 4×2 (ayrıntılı miğfer).

## Çerçeveler (10)

Çerçeveler iz sürülmedi, **parametrik olarak yeniden çizildi**: aynı merkez,
simetrik geometri, `0 0 64 64` içinde 60 birim yükseklik. Kaynaktan alınan şey
oran (en/boy 0.67–0.99) ve karakter; kalınlık ve simetri yeniden kuruldu.

Her çerçeve tek bir **kapalı** dış path (`d()`) veriyor ve o path üç iş yapıyor:
desenin clip alanı, accent keyline stroke'u, ink kenar stroke'u. Tek kaynak
olduğu için üçü birbirinden kaçamaz.

**Kenar neden stroke?** Önce iç içe inset path'ler denendi. Sivri uçlu bir armada
inset çarpanını elle tutturmak gerekiyor ve tutmuyordu: hedef 2.0 birimlik kenar
armanın alt ucunda **4.14 birime** çıkıyordu. Clip'lenmiş stroke tanımı gereği her
yerde aynı genişlikte. Dıştan içe: `EDGE_KEY` (3.5) accent, üstüne `EDGE_INK`
(2.3) ink.

| çerçeve | hücre | amblem kutusu (g × y @ merkez y) | taban çubuğu y |
|---|---|---|---|
| `classic-point` | 1×1 | 26.5 × 31.2 @ 26.0 | 50 |
| `ornate-shield` | 1×2 | 25.3 × 29.8 @ 26.0 | 50 |
| `modern-double` | 1×3 | 32.8 × 38.6 @ 27.0 | 51 |
| `angular-shield` | 1×4 | 26.6 × 31.3 @ 26.0 | 50 |
| `narrow-shield` | 1×5 | 28.2 × 33.2 @ 26.0 | 50 |
| `round` | 2×1 | 34.3 × 32.7 @ 31.8 | 50 |
| `compact-shield` | 2×3 | 34.7 × 36.5 @ 26.0 | 51 |
| `oval` | 2×5 | 29.9 × 31.5 @ 32.0 | 50 |
| `diamond` | 3×1 | 18.0 × 21.2 @ 32.0 | 52 |
| `hexagon` | 3×4 | 36.4 × 25.1 @ 32.0 | 51 |

Baklavanın kaynak oranı 0.67 ile çok dardı; içine sığan en büyük dikdörtgen
amblemi 18 px'te lekeye çeviriyordu. 0.82'ye genişletildi. Çerçeveler yeniden
çizildiği için bu serbest — **amblemlerde oran bozmak serbest değil.**

Banner, kurdele ve alt sıradaki kesik çerçeveler bu prototipe alınmadı.

## Amblem kutuları ölçümle bulundu

`fit` değerleri tahmin değil. Her çerçevenin alanı rasterlenip `EMB_CLEAR` = 5.6
birim aşındırıldı, sonra içine sığan en büyük dikdörtgen arandı (merkez y 26–34
bandında, sekiz farklı en/boy oranında). 5.6 = kenar (3.5) + boşluk (1.25) +
amblem konturunun yarısı (0.85).

Ölçülen sonuç: fit dikdörtgeni alan sınırından **5.49–5.65 birim** içeride. Kenar
3.5 birim yer kapladığına göre amblem kutusu görünür kenardan en az **1.99 birim**
uzakta; konturun 0.85'i düşülünce net boşluk **≥1.14 birim**. Amblem hiçbir
kombinasyonda çerçeveye değmiyor.

## Desenler (10)

`solid`, `vertical-halves`, `horizontal-halves`, `vertical-stripes`,
`horizontal-hoops`, `center-stripe`, `diagonal-split`, `diagonal-sash`,
`quarters`, `chevron`.

Desenler yalnız `primary` + `secondary` kullanıyor; `accent` ambleme ve kenar
keyline'ına ayrıldı. İki renkle sınırlamak, 18 px'te alanların birbirine
karışmasını engelleyen asıl şey. Şerit sayısı da düşük tutuldu: 5 dikey / 4 yatay
bant, yani 18 px'te bant başına ≈3.6 px.

## Paletler (16)

Her palette `primary`, `secondary`, `accent`, `ink` var. Gerçek kulüplerin
bilinen arma kombinasyonları birebir taklit edilmedi; neon tonlar kısıtlı ve
doygunlukları düşürüldü.

**Amblem neden hep `accent` + `ink` kontur?** Üç renkli bir palette, alanın iki
rengi de açıksa hiçbir tek renk ikisinden birden ayrılamıyor — "sarı / siyah /
beyaz" ailesinde tek renk amblem `vertical-halves` deseninin yarısında kayboluyor.
Kontur bunu tek ve tutarlı bir tasarım aracıyla çözüyor. Ölçülen en düşük
amblem/kontur kontrastı **8.21:1**.

## Deterministik eşleme

```js
frame   = hash(seed + '|frame')   % FRAMES.length
palette = hash(seed + '|palette') % PALETTES.length
pattern = hash(seed + '|pattern') % PATTERNS.length
emblem  = hash(seed + '|emblem')  % EMBLEMS.length
```

`hash` FNV-1a 32-bit. Her katman **ayrı tuzla** hash'leniyor: tek bir hash'in alt
bitlerini dörde birden dağıtmak katmanları birbirine kilitler, o zaman da çerçeve
değişince palet de değişir ve gerçek çeşitlilik çıkmaz.

`Math.random` hiçbir yerde yok. Aynı tohum her render'da aynı descriptor'ı ve
aynı SVG dizesini üretiyor; sayfa yenilendiğinde hiçbir arma değişmiyor.

**Tekrar kontrolü.** Dört katmanın aynısına sahip iki arma olmamalı. Çakışma
düşerse tuz turlanıyor (`'frame#1'`, `'frame#2'`, …) — deterministik açık
adresleme. 30 örnekte 30 benzersiz dörtlü çıktı; **1 tanesi yeniden tuzlandı.**
Toplam kombinasyon uzayı 10 × 16 × 10 × 12 = 19 200.

## Arma bileşimi

Katmanlar, çizim sırasıyla:

1. Desen — çerçevenin kapalı path'ine clip'li
2. Accent taban çubuğu — tek ve sınırlı vurgu detayı; sınırlardan **önce**
   çiziliyor ki sınır onu alan kenarında kessin
3. Accent keyline stroke'u (iç sınır)
4. Ink stroke'u (dış sınır)
5. Ortalanmış amblem — `accent` dolgu, `ink` kontur, `paint-order="stroke"`

Metin, harf, sayı veya yıldız yok. Kimlik yalnız amblem, siluet, desen ve
paletten çıkıyor.

Çerçeve clip'leri sayfada tek kez tanımlanıyor (`bclip-<frame>`); her armaya
kopyalansaydı aynı id defalarca tekrar ederdi, artan sayaçla üretilseydi de
"aynı tohum → aynı SVG" bozulurdu.

## Ölçüm sonuçları

Laboratuvarın **F bölümü** kabul testlerini sayfa içinde çalıştırıp yazdırıyor.
Son durumda 14/14 geçiyor:

| kontrol | sonuç |
|---|---|
| 12/12 amblem geçerli SVG geometrisi | 725 nokta |
| 10/10 çerçeve kapalı clip alanı | 670 karakter path |
| 30/30 logo çiziliyor | 30 SVG |
| tam kombinasyon tekrarı yok | 30/30 benzersiz, 1 yeniden tuzlama |
| aynı tohum → aynı descriptor ve SVG | iki bağımsız render karşılaştırıldı |
| raster `<image>` yok · `data:` URI yok · harici yol yok | ✓ |
| `Math.random` yok | ✓ |
| logo viewBox `0 0 64 64` | 184 SVG |
| amblem viewBox dışına taşmıyor | en dar pay 3.84 birim |
| amblem fit kutusunu aşmıyor | ✓ |
| amblem ile alan arasında görünür ayrım | en düşük kontrast 8.21:1 |
| yatay taşma yok | 1240 px / 1240 px |

Ayrıca 30 arma dört ölçekte tek tek rasterlenip ölçüldü (gerçek CSS pikseli,
`device_scale_factor = 1`):

| ölçek | ayırt edilebilir renk (en düşük–en yüksek) | accent piksel oranı |
|---|---|---|
| 18 px | 43 – 90 | %0.6 – %11.7 |
| 26 px | 53 – 112 | %1.0 – %12.0 |
| 34 px | 74 – 132 | %1.4 – %13.0 |
| 64 px | 78 – 140 | %3.4 – %16.0 |

Hiçbir arma hiçbir ölçekte tek renk tanımsız kutuya dönmüyor.

## Üretim entegrasyonundan önce çözülmesi gerekenler

1. **18 px'te ince amblemler zayıf.** `anchor`, `oak` ve `torch-spear`, amblem
   tonu alan tonuna yakın paletlerde 18 px'te accent alanının %0.6–1.5'ine
   düşüyor. Mikro sürüm yardım ediyor ama yetmiyor. Seçenek: 18 px için üçüncü
   bir "nano" kademe, ya da bu üç amblemin gövdesini kalınlaştırmak.
2. **Amblem her zaman `accent`, yani hep açık ton.** Küçük ölçekte bütün armalar
   "renkli alan üzerinde açık leke" siluetine yakınsıyor; ayrım desen ve çerçeve
   siluetinden geliyor. Lig tablosunda kabul edilebilir, ama palet başına amblem
   tonunu değiştirmek çeşitliliği artırır.
3. **Beş armanın silueti birbirine yakın.** `classic-point`, `ornate-shield`,
   `narrow-shield`, `angular-shield` ve `compact-shield` 26 px'te ancak genişlik
   farkıyla ayrılıyor. Kaynakta da öyleler; üretimde beşini birden tutmak yerine
   üçe indirmek düşünülebilir.
4. **Baklava en küçük amblem kutusunu veriyor** (18 × 21). 18 px'te amblem ~3 px
   kalıyor. Ya kutu büyütülmeli ya baklava yalnız büyük ölçeklerde kullanılmalı.
5. **`RIV`/`CLUBS` bağlantısı yok.** Tohum olarak laboratuvarda takım adı
   kullanıldı. Üretimde tohumun kulüp kimliğinden gelmesi ve **kayıt formatına
   yazılmaması** gerekir — arma türetilmiş veri olmalı, `S.known` ve `p.ra`
   ile aynı mantık.
6. **Kaynak PNG'ler repoda değil.** Amblem geometrisi yeniden üretilmek
   istenirse tabakalar tekrar gerekir; üretim adımının `tools/` altında bir
   betiğe dönüştürülmesi (`build-geo.js` gibi) veya path verisinin tek doğru
   kaynak sayılması kararlaştırılmalı.

## Laboratuvarı çalıştırma

`tools/badge-lab.html` doğrudan açılabilir. Sayfada altı bölüm var:

- **A** kaynak bileşenleri (12 amblem, 10 çerçeve, 10 desen, 16 palet)
- **B** 30 takım arması, 64 px, altında dört katmanlı kod
- **C** ölçek testi — 12 arma, 64 / 34 / 26 / 18 px, gerçek `width`/`height` ile
  (hiçbir yerde `transform: scale` yok)
- **D** zemin testi — koyu lacivert saha zemini ve açık gri
- **E** 10 satırlık lig tablosu simülasyonu, 26 px arma
- **F** kabul ölçümleri ve amblem sınır kutuları

Sağ üstteki düğme TR/EN arasında geçiş yapar.
