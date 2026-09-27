# tools/native-test — yamalı ödeme Java'sını koşturan test

`node tools/native-test.js` (ya da `npm run native:test`, yama kontrolüyle
birlikte) `node_modules` altındaki **gerçek** `NativePurchasesPlugin.java`'yı
derler ve `getPurchases()`'ı bir JVM'de çalıştırır.

## Neden var

`tools/savetest.js`, `js/iap.js`'i eklentinin bir JS mock'una karşı ölçüyor. O
mock'a `Promise.reject` yazmak, JS'in bir reject'i doğru işlediğini gösterir —
**native tarafın o reject'i üretip üretmediğini göstermez.** Düzeltilen hata tam
orada duruyordu: yayımlanan 8.7.0, başarısız bir Play sorgusunu
`resolve({purchases: []})` ile kapatıyordu, yani JS hiçbir zaman bir reject
görmüyordu ve "sorulamadı" ile "hiç satın alma yok" aynı görünüyordu. Bu iki
olgu zıt kararlar gerektiriyor, dolayısıyla ölçümün native tarafta olması
gerekiyor.

`tools/check-native-patch.js` ayrı bir soruya bakıyor: yama kurulu kaynakta
duruyor mu. **Duruyor olması doğru davrandığı anlamına gelmez** — o yüzden iki
araç var, biri diğerinin yerine geçmiyor.

## Nasıl çalışıyor

| | |
|---|---|
| `GetPurchasesTest.java` | Senaryolar ve iddialar. Ölçüm noktası `PluginCall`'a düşen sonuç: resolve mu reject mi, ve **kaç tane** |
| `stubs/` | Yamalı kaynağı derleyip koşturmaya yeten en küçük yüzey |
| `../native-test.js` | JDK'yı bulur, hepsini derler, koşturur |

Gereken tek şey bir JDK (OpenJDK 17+). Sıra: `JAVA_HOME` → Android Studio'nun
paketlediği JBR → `PATH`. **Android SDK, Gradle ve ağ gerekmez**, koşu saniyeler
sürer; CI'da `Native davranış testi` adımı bu yüzden senkronizasyondan önce.

## stubs/ hakkında bilinmesi gerekenler

Bu ağaç Android'i ya da Play Billing'i **taklit etmiyor**; yalnız derlemeye ve
koşmaya yetiyor.

- **SDK'nın `android.jar`'ı kullanılamaz:** içindeki sınıflar gövdesizdir ve
  çağrılınca `Stub!` atar — derlenir ama koşmaz.
- **Gerçek `billing-8.3.0.aar` de kullanılamaz:** `classes.jar` derlemeye yeter
  ama `BillingClientImpl` bir Android servisine bağlanır, JVM'de çalışmaz.
- Gerçek sınıflardan iki bilinçli ayrılık: `Purchase` burada `final` değil (test
  bir getter'ı fırlatan alt sınıf üretebilsin diye — gerçek `Purchase`
  getter'ları da JSON'u tembel okur ve fırlatabilir), ve `BillingClient` soyut
  değil (`BillingClient.factory` kancasıyla test kendi örneğini verir;
  `newBuilder/setListener/build` zinciri korunur).
- `com.getcapacitor.PluginCall` ikinci bir resolve/reject'te **atmıyor**, gerçeği
  gibi kaydediyor — "tam olarak bir sonuç" iddiası sayarak ölçülüyor.
- `android.util.Log` yazdıklarını biriktiriyor: "hassas içerik loglanmıyor"
  iddiası ancak gerçekten yazılanlara bakarak ölçülebilir.

## Bunun kanıtlamadığı şey

**Gerçek API uyumluluğu.** `javac`'in bu ağaçla geçmesi gövdenin doğru
davrandığını gösterir; yamalı kaynağın gerçek Play Billing / Capacitor / Android
API'leriyle hâlâ uyumlu olduğunu **göstermez** — stub'lar koda göre yazılmıştır.
O ayrı bir kontrol ve projenin kendi araç zinciriyle yapılıyor:

```bash
cd android && ./gradlew :capgo-native-purchases:compileDebugJavaWithJavac
```

Bu görev modülü gerçek `com.android.billingclient:billing:8.3.0`,
`capacitor-android`, Guava ve gerçek `android.jar` karşısında derler. CI'da ayrı
bir adım gerekmiyor: `:app:compileReleaseJavaWithJavac`
`:capgo-native-purchases:compileReleaseJavaWithJavac` olmadan koşamaz
(`gradlew --dry-run` ile doğrulandı).

**Play'in gerçekte ne yanıtladığı.** Ölçülen şey, verilen bir yanıt karşısında Java
gövdesinin davranışı. Gerçek bir satın alma hâlâ yapılmadı; cihaz ölçümü ayrı bir
iştir.
