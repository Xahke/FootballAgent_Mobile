/* tools/native-test/PurchaseUpdateTest.java

   NativePurchasesPlugin.purchaseProduct() + onPurchasesUpdated()'in GERÇEK Java
   gövdesini koşturur.

   Neden JS mock'u yetmiyor: js/iap.js'in mock'una `reject(npx:updnone:3:...)`
   yazmak yalnızca JS'in o kodu doğru sınıflandırdığını gösterir — native yolun o
   kodu ÜRETTİĞİNİ göstermez. Düzeltilen kusur tam orada duruyordu: eklenti OK
   olmayan her sonucu tek bir `npx:updated:<kod>` biçimine indiriyor, sonuçla
   BİRLİKTE gelen Purchase listesini hiç okumadan atıyor, OK yolunda da yalnız
   `purchases.get(0)`'ı işleyip gerisini düşürüyordu. "Yanında satın alma geldi"
   ile "bu güncellemede satın alma yok" zıt kararlar gerektiriyor ve köprü ikisini
   aynı şekilde bildiriyordu.

   Ölçülen sözleşme:
     (1) OK değil, liste HİÇ gelmedi      -> reject, aşama 'updnull', tek sonuç
     (2) OK değil, liste geldi ve boştu   -> reject, aşama 'updnone'
     (3) OK değil AMA yanında satın alma  -> reject, aşama 'updtx'; hiçbir şey
                                             bitirilmiyor (consume/ack YOK)
     (4) OK + PENDING                     -> reject, aşama 'state', kod 2
     (5) OK + UNSPECIFIED_STATE           -> reject, aşama 'state', kod 0
     (6) OK ama liste boş                 -> reject 'updnone' (eski kod burada
                                             IndexOutOfBounds fırlatıyordu, yani
                                             çağrı HİÇ sonuçlanmıyordu)
     (7) OK + iki kayıt, ikincisi BİZİM   -> bizim kayıt teslim edilir, sayı JS'e
                                             gider, diğerine DOKUNULMAZ
     (8) Yinelenen / geç callback         -> ikinci sonuç yok
     (9) Akış hiç başlamadı (launch)      -> reject 'launch'; sonradan gelen
                                             güncelleme ikinci sonuç üretmez
    (10) Satın alma açık değilken güncelleme -> başka bir çağrı (getPurchases)
                                             sonuçlandırılmaz
    (11) Bu yollarda log redaksiyonu      -> token / orderId loga yazılmaz

   `stubs/` ağacı Android'i ya da Play Billing'i taklit etmez; yalnız derleyip
   koşturmaya yeter. Ölçülen şey, bir yanıt VERİLDİĞİNDE Java gövdesinin ne
   yaptığıdır — Play'in gerçekte ne yanıtladığı değil. */

import android.util.Log;
import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.AcknowledgePurchaseResponseListener;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ConsumeParams;
import com.android.billingclient.api.ConsumeResponseListener;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.ProductDetailsResponseListener;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesResponseListener;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryProductDetailsResult;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import ee.forgr.nativepurchases.NativePurchasesPlugin;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.json.JSONArray;

public final class PurchaseUpdateTest {

    private static int passed = 0;
    private static final List<String> failures = new ArrayList<>();

    static final String TAG_OURS = "cid1234.aabbccdd";
    static final String SKU = "cap5";

    /* ---------------------------------------------------------------- yardım */

    /** Satın alma akışını sürükleyen istemci: ürün detayını hemen verir,
     *  launchBillingFlow'un sonucunu senaryo belirler, bitirme çağrılarını sayar. */
    static final class PurchaseFake extends BillingClient {

        volatile int launchCode = BillingResponseCode.OK;
        volatile BillingFlowParams launched = null;
        final AtomicInteger launches = new AtomicInteger(0);
        final AtomicInteger consumes = new AtomicInteger(0);
        final AtomicInteger acks = new AtomicInteger(0);
        final AtomicInteger ends = new AtomicInteger(0);
        final List<Pending> queries = new ArrayList<>();

        static final class Pending {

            final String type;
            final PurchasesResponseListener listener;

            Pending(String type, PurchasesResponseListener listener) {
                this.type = type;
                this.listener = listener;
            }
        }

        @Override
        public void queryProductDetailsAsync(QueryProductDetailsParams params, ProductDetailsResponseListener listener) {
            List<ProductDetails> list = new ArrayList<>();
            list.add(new ProductDetails());
            listener.onProductDetailsResponse(BillingResult.of(BillingResponseCode.OK), new QueryProductDetailsResult(list));
        }

        @Override
        public BillingResult launchBillingFlow(android.app.Activity activity, BillingFlowParams params) {
            launched = params;
            launches.incrementAndGet();
            return BillingResult.of(launchCode);
        }

        @Override
        public void queryPurchasesAsync(QueryPurchasesParams params, PurchasesResponseListener listener) {
            queries.add(new Pending(params.getProductType(), listener));
        }

        @Override
        public void consumeAsync(ConsumeParams params, ConsumeResponseListener listener) {
            consumes.incrementAndGet();
            listener.onConsumeResponse(BillingResult.of(BillingResponseCode.OK), params.getPurchaseToken());
        }

        @Override
        public void acknowledgePurchase(AcknowledgePurchaseParams params, AcknowledgePurchaseResponseListener listener) {
            acks.incrementAndGet();
            listener.onAcknowledgePurchaseResponse(BillingResult.of(BillingResponseCode.OK));
        }

        @Override
        public void endConnection() {
            ends.incrementAndGet();
            super.endConnection();
        }

        Pending query(String type) {
            for (Pending p : queries) {
                if (p.type.equals(type)) {
                    return p;
                }
            }
            throw new IllegalStateException("sorgu gonderilmedi: " + type);
        }
    }

    /** js/iap.js'in gerçekte gönderdiği seçenekler: ikisi de false, etiket dolu. */
    static PluginCall buyCall(String tag) {
        JSObject data = new JSObject();
        data.put("productIdentifier", SKU);
        data.put("productType", "inapp");
        data.put("quantity", 1);
        data.put("isConsumable", false);
        data.put("autoAcknowledgePurchases", false);
        if (tag != null) {
            data.put("appAccountToken", tag);
        }
        return new PluginCall(data);
    }

    /** purchaseProduct'ı çağırır ve ödeme ekranı açılana (ya da çağrı
     *  sonuçlanana) kadar bekler. */
    static PurchaseFake startBuy(NativePurchasesPlugin plugin, PluginCall call) {
        PurchaseFake fake = new PurchaseFake();
        BillingClient.factory = l -> fake;
        plugin.purchaseProduct(call);
        long until = System.currentTimeMillis() + 5000;
        while (fake.launches.get() == 0 && call.outcomes().isEmpty() && System.currentTimeMillis() < until) {
            Thread.onSpinWait();
        }
        return fake;
    }

    static PurchaseFake startBuy(NativePurchasesPlugin plugin, PluginCall call, int launchCode) {
        PurchaseFake fake = new PurchaseFake();
        fake.launchCode = launchCode;
        BillingClient.factory = l -> fake;
        plugin.purchaseProduct(call);
        long until = System.currentTimeMillis() + 5000;
        while (fake.launches.get() == 0 && call.outcomes().isEmpty() && System.currentTimeMillis() < until) {
            Thread.onSpinWait();
        }
        return fake;
    }

    static void settle(PluginCall call) {
        long until = System.currentTimeMillis() + 5000;
        while (call.outcomes().isEmpty() && System.currentTimeMillis() < until) {
            Thread.onSpinWait();
        }
    }

    static NativePurchasesPlugin plugin() {
        Log.reset();
        return new NativePurchasesPlugin();
    }

    static BillingResult res(int code) {
        return BillingResult.newBuilder().setResponseCode(code).setDebugMessage("d").build();
    }

    static Purchase purchase(String token, int state, String tag) {
        Purchase p = new Purchase().token(token).product(SKU).state(state).orderId("GPA." + token);
        return tag == null ? p : p.account(tag);
    }

    static List<Purchase> list(Purchase... ps) {
        return new ArrayList<>(Arrays.asList(ps));
    }

    /* ---------------------------------------------------------------- iddia */

    static void check(String name, boolean cond, String detail) {
        if (cond) {
            passed++;
            System.out.println("  ok   " + name);
        } else {
            failures.add(name + " — " + detail);
            System.out.println("  HATA " + name + " — " + detail);
        }
    }

    static void one(String name, PluginCall call) {
        check(name + ": tam olarak bir sonuc", call.outcomes().size() == 1, "sonuc sayisi=" + call.outcomes());
    }

    static PluginCall.Outcome only(PluginCall call) {
        List<PluginCall.Outcome> o = call.outcomes();
        return o.size() == 1 ? o.get(0) : null;
    }

    static void rejectedWith(String name, PluginCall call, String code) {
        one(name, call);
        PluginCall.Outcome o = only(call);
        check(name + ": resolve DEGIL", o != null && !o.resolved, "sonuc=" + o);
        check(name + ": kod " + code, o != null && code.equals(o.code), "kod=" + (o == null ? null : o.code));
    }

    static void nothingFinished(String name, PurchaseFake fake) {
        check(name + ": consume yok", fake.consumes.get() == 0, "consumes=" + fake.consumes.get());
        check(name + ": acknowledge yok", fake.acks.get() == 0, "acks=" + fake.acks.get());
    }

    /* ---------------------------------------------------------------- senaryolar */

    /* (1) OK DEGIL, LISTE HIC GELMEDI. Play'in sozlesmesi purchases icin yalniz
           "List of updated purchases if present" diyor; listenin gelmemesi bu
           guncellemede satin alma olmadigi demektir ve AYRI bir asamayla
           bildirilir. */
    static void s1_nonOkNullList() {
        System.out.println("(1) OK degil, liste yok -> updnull");
        NativePurchasesPlugin p = plugin();
        PluginCall call = buyCall(TAG_OURS);
        PurchaseFake fake = startBuy(p, call);
        check("(1): odeme ekrani acildi", fake.launches.get() == 1, "launches=" + fake.launches.get());
        check("(1): etiket Play'e gitti", TAG_OURS.equals(fake.launched.getObfuscatedAccountId()),
            "id=" + fake.launched.getObfuscatedAccountId());
        check("(1): henuz sonuc yok", call.outcomes().isEmpty(), "sonuc=" + call.outcomes());
        fake.updatedListener().onPurchasesUpdated(res(BillingClient.BillingResponseCode.BILLING_UNAVAILABLE), null);
        settle(call);
        rejectedWith("(1)", call, "npx:updnull:3:" + TAG_OURS);
        nothingFinished("(1)", fake);
    }

    /* (2) OK DEGIL, LISTE GELDI VE BOSTU. (1)'den ayri tutulmasi bilerek: tani
           "liste gelmedi" ile "bos liste geldi"yi karistirmamali. */
    static void s2_nonOkEmptyList() {
        System.out.println("(2) OK degil, bos liste -> updnone");
        NativePurchasesPlugin p = plugin();
        PluginCall call = buyCall(TAG_OURS);
        PurchaseFake fake = startBuy(p, call);
        fake.updatedListener().onPurchasesUpdated(res(BillingClient.BillingResponseCode.BILLING_UNAVAILABLE), new ArrayList<>());
        settle(call);
        rejectedWith("(2)", call, "npx:updnone:3:" + TAG_OURS);
        nothingFinished("(2)", fake);
    }

    /* (3) OK DEGIL AMA YANINDA SATIN ALMA GELDI. Eski kod bu listeyi HIC
           OKUMADAN atiyordu. Boyle bir sonuc kesin basarisiz SAYILAMAZ; ayri
           asama ile bildiriliyor ve kayit BITIRILMEDEN birakiliyor, boylece
           getPurchases() -> teslimat -> consume/acknowledge yolu onu isleyebilir. */
    static void s3_nonOkCarriedPurchase() {
        System.out.println("(3) OK degil ama yaninda satin alma -> updtx");
        NativePurchasesPlugin p = plugin();
        PluginCall call = buyCall(TAG_OURS);
        PurchaseFake fake = startBuy(p, call);
        fake
            .updatedListener()
            .onPurchasesUpdated(
                res(BillingClient.BillingResponseCode.BILLING_UNAVAILABLE),
                list(purchase("tok_carried", Purchase.PurchaseState.PURCHASED, TAG_OURS))
            );
        settle(call);
        rejectedWith("(3)", call, "npx:updtx:3:" + TAG_OURS);
        /* Bitirilmedigi icin token Play'de acik kalir ve sorguda yine gorunur. */
        nothingFinished("(3)", fake);
        /* Ayni sey iptal koduyla da gecerli: iptal BILE yaninda satin alma
           getiriyorsa kesin sayilamaz. */
        NativePurchasesPlugin p2 = plugin();
        PluginCall call2 = buyCall(TAG_OURS);
        PurchaseFake fake2 = startBuy(p2, call2);
        fake2
            .updatedListener()
            .onPurchasesUpdated(
                res(BillingClient.BillingResponseCode.USER_CANCELED),
                list(purchase("tok_c2", Purchase.PurchaseState.PURCHASED, TAG_OURS))
            );
        settle(call2);
        rejectedWith("(3b)", call2, "npx:updtx:1:" + TAG_OURS);
    }

    /* (4) PENDING BASARISIZLIK DEGIL, BILINEN BIR ASAMA. */
    static void s4_pending() {
        System.out.println("(4) OK + PENDING -> state:2");
        NativePurchasesPlugin p = plugin();
        PluginCall call = buyCall(TAG_OURS);
        PurchaseFake fake = startBuy(p, call);
        fake
            .updatedListener()
            .onPurchasesUpdated(
                res(BillingClient.BillingResponseCode.OK),
                list(purchase("tok_pending", Purchase.PurchaseState.PENDING, TAG_OURS))
            );
        settle(call);
        rejectedWith("(4)", call, "npx:state:2:" + TAG_OURS);
        nothingFinished("(4)", fake);
    }

    /* (5) EKSIK VERI: durumu bildirilmeyen kayit PURCHASED SAYILMIYOR ve
           PENDING ile de karistirilmiyor. */
    static void s5_unspecifiedState() {
        System.out.println("(5) OK + UNSPECIFIED_STATE -> state:0");
        NativePurchasesPlugin p = plugin();
        PluginCall call = buyCall(TAG_OURS);
        PurchaseFake fake = startBuy(p, call);
        fake
            .updatedListener()
            .onPurchasesUpdated(
                res(BillingClient.BillingResponseCode.OK),
                list(purchase("tok_unspec", Purchase.PurchaseState.UNSPECIFIED_STATE, TAG_OURS))
            );
        settle(call);
        rejectedWith("(5)", call, "npx:state:0:" + TAG_OURS);
        nothingFinished("(5)", fake);
    }

    /* (6) OK AMA BOS LISTE. Eski kod kosulsuz purchases.get(0) aliyordu:
           IndexOutOfBounds Play callback'i icinde firliyor ve cagri HIC
           sonuclanmiyordu - JS tarafinda sonsuza kadar askida bir promise,
           yani serbest kalmayan bir satin alma kilidi. */
    static void s6_okEmptyList() {
        System.out.println("(6) OK + bos liste -> cagri sonuclaniyor");
        NativePurchasesPlugin p = plugin();
        PluginCall call = buyCall(TAG_OURS);
        PurchaseFake fake = startBuy(p, call);
        fake.updatedListener().onPurchasesUpdated(res(BillingClient.BillingResponseCode.OK), new ArrayList<>());
        settle(call);
        rejectedWith("(6)", call, "npx:updnone:0:" + TAG_OURS);
        nothingFinished("(6)", fake);
    }

    /* (7) OK + IKI KAYIT, IKINCISI BIZIM. Eski kod ilkini isleyip gerisini
           atiyordu. Secim etiketle yapiliyor; secilmeyen kayit BITIRILMIYOR ve
           sayisi JS'e gidiyor ki cagiran taraf bir uzlastirma turu acabilsin
           (Google'in uyarisi: bu dinleyicide bildirilen her satin alma consume
           ya da acknowledge edilmeli, yoksa iade edilir). */
    static void s7_picksOwnPurchase() {
        System.out.println("(7) OK + iki kayit -> bizim kayit teslim edilir, digeri kaybolmaz");
        NativePurchasesPlugin p = plugin();
        PluginCall call = buyCall(TAG_OURS);
        PurchaseFake fake = startBuy(p, call);
        fake
            .updatedListener()
            .onPurchasesUpdated(
                res(BillingClient.BillingResponseCode.OK),
                list(
                    purchase("tok_other", Purchase.PurchaseState.PURCHASED, "BASKA.deneme"),
                    purchase("tok_ours", Purchase.PurchaseState.PURCHASED, TAG_OURS)
                )
            );
        settle(call);
        one("(7)", call);
        PluginCall.Outcome o = only(call);
        check("(7): resolve", o != null && o.resolved, "sonuc=" + o);
        check("(7): BIZIM islem cozuldu", o != null && o.data != null && "tok_ours".equals(o.data.opt("transactionId")),
            "transactionId=" + (o == null || o.data == null ? null : o.data.opt("transactionId")));
        check("(7): etiket geri geldi", o != null && o.data != null && TAG_OURS.equals(o.data.opt("appAccountToken")),
            "appAccountToken=" + (o == null || o.data == null ? null : o.data.opt("appAccountToken")));
        check("(7): guncellemedeki kayit sayisi JS'e gidiyor", o != null && o.data != null && o.data.optInt("updatedPurchaseCount", -1) == 2,
            "updatedPurchaseCount=" + (o == null || o.data == null ? null : o.data.opt("updatedPurchaseCount")));
        /* autoAcknowledgePurchases=false: eklenti hicbir seyi kendiliginden
           bitirmiyor, digeri de acik kaliyor. */
        nothingFinished("(7)", fake);
    }

    /* (8) YINELENEN VE GEC CALLBACK: akis basina tek sonuc. */
    static void s8_duplicateAndLateUpdate() {
        System.out.println("(8) yinelenen / gec callback -> tek sonuc");
        NativePurchasesPlugin p = plugin();
        PluginCall call = buyCall(TAG_OURS);
        PurchaseFake fake = startBuy(p, call);
        PurchasesUpdatedListener l = fake.updatedListener();
        l.onPurchasesUpdated(res(BillingClient.BillingResponseCode.BILLING_UNAVAILABLE), null);
        settle(call);
        int ends = fake.ends.get();
        /* Ayni sonuc yeniden, sonra BASKA bir sonuc: ikisi de yazmamali. */
        l.onPurchasesUpdated(res(BillingClient.BillingResponseCode.BILLING_UNAVAILABLE), null);
        l.onPurchasesUpdated(res(BillingClient.BillingResponseCode.OK), list(purchase("tok_late", Purchase.PurchaseState.PURCHASED, TAG_OURS)));
        one("(8)", call);
        PluginCall.Outcome o = only(call);
        check("(8): ilk sonuc korundu", o != null && !o.resolved && ("npx:updnull:3:" + TAG_OURS).equals(o.code), "sonuc=" + o);
        check("(8): baglanti ikinci kez kapatilmadi", fake.ends.get() == ends, "ends=" + fake.ends.get() + " (once " + ends + ")");
        nothingFinished("(8)", fake);
    }

    /* (9) ODEME EKRANI HIC ACILMADI. 'launch' asamasi kesin bir sonuctur, ama
           sonrasinda gelen bir guncelleme ikinci bir sonuc URETMEMELI. */
    static void s9_launchFailure() {
        System.out.println("(9) akis baslamadi -> launch, sonrasi ikinci sonuc uretmiyor");
        NativePurchasesPlugin p = plugin();
        PluginCall call = buyCall(TAG_OURS);
        PurchaseFake fake = startBuy(p, call, BillingClient.BillingResponseCode.DEVELOPER_ERROR);
        settle(call);
        rejectedWith("(9)", call, "npx:launch:5:" + TAG_OURS);
        fake.updatedListener().onPurchasesUpdated(res(BillingClient.BillingResponseCode.BILLING_UNAVAILABLE), null);
        one("(9) sonrasi", call);
        nothingFinished("(9)", fake);
    }

    /* (10) ACIK SATIN ALMA YOKKEN GELEN GUNCELLEME. Dinleyici ISTEMCI
            seviyesindedir ama eklenti onu istemciyi KURAN cagriya bagliyordu:
            bir getPurchases cagrisi bir Transaction ile resolve edilebiliyordu.
            Guncelleme kaybolmuyor - hicbir sey bitirilmedigi icin sorgu onu yine
            listeler. */
    static void s10_noOpenPurchaseCall() {
        System.out.println("(10) acik satin alma yokken guncelleme -> baska cagri sonuclanmiyor");
        NativePurchasesPlugin p = plugin();
        PluginCall query = new PluginCall(new JSObject().put("productType", "inapp"));
        PurchaseFake fake = new PurchaseFake();
        BillingClient.factory = l -> fake;
        p.getPurchases(query);
        long until = System.currentTimeMillis() + 5000;
        while (fake.queries.isEmpty() && query.outcomes().isEmpty() && System.currentTimeMillis() < until) {
            Thread.onSpinWait();
        }
        check("(10): sorgu gonderildi", !fake.queries.isEmpty(), "sorgular=" + fake.queries.size());
        fake
            .updatedListener()
            .onPurchasesUpdated(
                res(BillingClient.BillingResponseCode.OK),
                list(purchase("tok_outside", Purchase.PurchaseState.PURCHASED, "BASKA.deneme"))
            );
        check("(10): sorgu cagrisi guncellemeyle sonuclanmadi", query.outcomes().isEmpty(), "sonuc=" + query.outcomes());
        nothingFinished("(10)", fake);
        /* Sorgu kendi cevabiyla normal bitiyor. */
        fake.query("inapp").listener.onQueryPurchasesResponse(res(BillingClient.BillingResponseCode.OK), new ArrayList<>());
        settle(query);
        one("(10) sorgu", query);
        PluginCall.Outcome o = only(query);
        check("(10): sorgu resolve", o != null && o.resolved, "sonuc=" + o);
        Object v = o == null || o.data == null ? null : o.data.opt("purchases");
        check("(10): sorgu kendi sonucunu dondu", v instanceof JSONArray && ((JSONArray) v).length() == 0, "purchases=" + v);
    }

    /* (11) LOG REDAKSIYONU bu yollarda da duruyor. */
    static void s11_logRedaction() {
        System.out.println("(11) log redaksiyonu");
        NativePurchasesPlugin p = plugin();
        PluginCall call = buyCall(TAG_OURS);
        PurchaseFake fake = startBuy(p, call);
        fake
            .updatedListener()
            .onPurchasesUpdated(
                res(BillingClient.BillingResponseCode.OK),
                list(purchase("tok_secret", Purchase.PurchaseState.PURCHASED, TAG_OURS))
            );
        settle(call);
        boolean tok = false, order = false, tag = false;
        for (String line : Log.lines()) {
            if (line.contains("tok_secret")) tok = true;
            if (line.contains("GPA.")) order = true;
            if (line.contains(TAG_OURS)) tag = true;
        }
        check("(11): satin alma tokeni loglanmadi", !tok, "token logda");
        check("(11): siparis numarasi loglanmadi", !order, "orderId logda");
        check("(11): etiket loglanmadi", !tag, "appAccountToken logda");
    }

    /* ---------------------------------------------------------------- main */

    public static void main(String[] args) {
        System.out.println("native satin alma guncellemesi sozlesmesi");
        System.out.println("");
        s1_nonOkNullList();
        s2_nonOkEmptyList();
        s3_nonOkCarriedPurchase();
        s4_pending();
        s5_unspecifiedState();
        s6_okEmptyList();
        s7_picksOwnPurchase();
        s8_duplicateAndLateUpdate();
        s9_launchFailure();
        s10_noOpenPurchaseCall();
        s11_logRedaction();
        System.out.println("");
        if (failures.isEmpty()) {
            System.out.println(passed + " gecti");
            System.exit(0);
        }
        System.out.println(passed + " gecti, " + failures.size() + " DUSTU:");
        for (String f : failures) {
            System.out.println("  - " + f);
        }
        System.exit(1);
    }
}
