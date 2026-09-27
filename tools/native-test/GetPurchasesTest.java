/* tools/native-test/GetPurchasesTest.java

   NativePurchasesPlugin.getPurchases()'ın GERÇEK Java gövdesini koşturur.

   Neden JS mock'u yetmiyor: JS tarafındaki mock'a "reject" yazmak yalnızca
   JS'in bir reject'i doğru işlediğini gösterir — native yolun o reject'i
   ÜRETİP ÜRETMEDİĞİNİ göstermez. Düzeltilen hata tam olarak orada: native
   taraf başarısız bir sorguyu `resolve({purchases: []})` ile kapatıyordu, yani
   JS hiçbir zaman bir reject görmüyordu. Bu yüzden ölçüm noktası burada:
   node_modules altındaki YAMALI .java dosyası derlenir ve çalıştırılır,
   `PluginCall`'a düşen sonuç sayılır.

   Ölçülen sözleşme:
     (1) Sorgu OK dönmezse                       -> reject, tam olarak bir sonuç
     (2) Gerçekten başarılı boş liste            -> resolve, boş dizi
     (3) Başarılı dolu liste                     -> resolve, dönüşüm bozulmamış
     (4) İki tür sorulup biri düşerse            -> KISMİ BAŞARI YOK, reject
     (5) Dönüşüm sırasında istisna               -> reject, aşama 'convert'
     (6) OK ama liste yok                        -> reject, aşama 'nolist'
     (7) Ters callback sırası                    -> tek doğru sonuç
     (8) Aynı callback iki kez                   -> tek sonuç, tek endConnection
     (9) Sonuçtan SONRA gelen callback           -> ikinci sonuç yok, bağlantı
                                                    ikinci kez kapatılmaz
    (10) Sorgu hiç gönderilemezse (fırlatma)     -> tek sonuç ve BAŞARI DEĞİL
    (11) Başarısız yolda log redaksiyonu         -> token/orderId/debugMessage yok
    (12) A beklerken B bağlantı sahibi olursa    -> A'nın bitişi B'nin çağrısını
                                                    sonuçlandırmaz, bağlantısını
                                                    kapatmaz; A kendi bağlantısını kapatır
    (13) inapp iki kez cevaplanır, subs bekler   -> erken/kısmi resolve YOK; subs
                                                    sonradan hata verirse reject

   `stubs/` ağacı Android'i ya da Play Billing'i taklit etmez; yalnız derleyip
   koşturmaya yeter. Gerekçesi ve gerçek sınıflardan bilinçli iki ayrılığı
   tools/native-test/README.md anlatıyor. */

import android.util.Log;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesResponseListener;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import ee.forgr.nativepurchases.NativePurchasesPlugin;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.json.JSONArray;

public final class GetPurchasesTest {

    private static int passed = 0;
    private static final List<String> failures = new ArrayList<>();

    /* ---------------------------------------------------------------- yardım */

    /** Test sürücüsü istemci: sorguları BİRİKTİRİR, cevabı senaryo verir. */
    static final class FakeClient extends BillingClient {

        final List<Pending> pending = new ArrayList<>();
        final AtomicInteger ends = new AtomicInteger(0);
        /** Bu ürün türü sorulduğunda queryPurchasesAsync fırlatır. */
        String throwOnType = null;

        static final class Pending {

            final String type;
            final PurchasesResponseListener listener;

            Pending(String type, PurchasesResponseListener listener) {
                this.type = type;
                this.listener = listener;
            }
        }

        @Override
        public void queryPurchasesAsync(QueryPurchasesParams params, PurchasesResponseListener listener) {
            String type = params.getProductType();
            if (type.equals(throwOnType)) {
                throw new IllegalStateException("query could not be dispatched");
            }
            pending.add(new Pending(type, listener));
        }

        @Override
        public void endConnection() {
            ends.incrementAndGet();
            super.endConnection();
        }

        Pending get(String type) {
            for (Pending p : pending) {
                if (p.type.equals(type)) {
                    return p;
                }
            }
            throw new IllegalStateException("sorgu gonderilmedi: " + type);
        }
    }

    /** getPurchases'ı çağırır ve sorgular gönderilene kadar bekler. */
    static FakeClient start(NativePurchasesPlugin plugin, PluginCall call, int expectQueries) {
        FakeClient fake = new FakeClient();
        BillingClient.factory = l -> fake;
        plugin.getPurchases(call);
        long until = System.currentTimeMillis() + 5000;
        while (fake.pending.size() < expectQueries && call.outcomes().isEmpty() && System.currentTimeMillis() < until) {
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

    static PluginCall callFor(String productType) {
        JSObject data = new JSObject();
        if (productType != null) {
            data.put("productType", productType);
        }
        return new PluginCall(data);
    }

    static NativePurchasesPlugin plugin() {
        Log.reset();
        return new NativePurchasesPlugin();
    }

    static BillingResult res(int code, String debug) {
        return BillingResult.newBuilder().setResponseCode(code).setDebugMessage(debug).build();
    }

    static Purchase purchase(String token) {
        return new Purchase().token(token).product("sku_test").state(Purchase.PurchaseState.PURCHASED).orderId("GPA.0000-1111");
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

    static int arrayLen(JSObject data) {
        Object v = data == null ? null : data.opt("purchases");
        return v instanceof JSONArray ? ((JSONArray) v).length() : -1;
    }

    /* ---------------------------------------------------------------- senaryolar */

    /* (1) Sorgu OK donmedi -> reject. Eski kodda burasi resolve({purchases:[]}) idi. */
    static void s1_queryFailureRejects() {
        System.out.println("(1) sorgu OK donmedi -> reject");
        NativePurchasesPlugin p = plugin();
        PluginCall call = callFor("inapp");
        FakeClient fake = start(p, call, 1);
        fake.get("inapp").listener.onQueryPurchasesResponse(res(BillingClient.BillingResponseCode.SERVICE_UNAVAILABLE, "svc down"), null);
        settle(call);
        one("(1)", call);
        PluginCall.Outcome o = only(call);
        check("(1): resolve DEGIL", o != null && !o.resolved, "sonuc=" + o);
        check("(1): kod npx:query:2:", o != null && "npx:query:2:".equals(o.code), "kod=" + (o == null ? null : o.code));
        check("(1): baglanti bir kez kapatildi", fake.ends.get() == 1, "ends=" + fake.ends.get());
    }

    /* (2) GERCEKTEN basarili bos liste -> normal basari. */
    static void s2_emptySuccessResolves() {
        System.out.println("(2) basarili bos liste -> resolve");
        NativePurchasesPlugin p = plugin();
        PluginCall call = callFor("inapp");
        FakeClient fake = start(p, call, 1);
        fake.get("inapp").listener.onQueryPurchasesResponse(res(BillingClient.BillingResponseCode.OK, ""), new ArrayList<>());
        settle(call);
        one("(2)", call);
        PluginCall.Outcome o = only(call);
        check("(2): resolve", o != null && o.resolved, "sonuc=" + o);
        check("(2): bos dizi", o != null && arrayLen(o.data) == 0, "uzunluk=" + (o == null ? -1 : arrayLen(o.data)));
    }

    /* (3) Basarili dolu liste -> resolve ve donusum bozulmamis. */
    static void s3_nonEmptySuccessResolves() {
        System.out.println("(3) basarili dolu liste -> resolve");
        NativePurchasesPlugin p = plugin();
        PluginCall call = callFor("inapp");
        FakeClient fake = start(p, call, 1);
        List<Purchase> list = new ArrayList<>();
        list.add(purchase("tok_a"));
        list.add(purchase("tok_b"));
        fake.get("inapp").listener.onQueryPurchasesResponse(res(BillingClient.BillingResponseCode.OK, ""), list);
        settle(call);
        one("(3)", call);
        PluginCall.Outcome o = only(call);
        check("(3): resolve", o != null && o.resolved, "sonuc=" + o);
        check("(3): iki kayit", o != null && arrayLen(o.data) == 2, "uzunluk=" + (o == null ? -1 : arrayLen(o.data)));
    }

    /* (4) Iki tur sorulup biri duserse KISMI BASARI YOK. */
    static void s4_partialFailureRejects() {
        System.out.println("(4) biri basarili biri basarisiz -> kismi basari yok");
        NativePurchasesPlugin p = plugin();
        PluginCall call = callFor(null); // iki tur de sorulur
        FakeClient fake = start(p, call, 2);
        List<Purchase> list = new ArrayList<>();
        list.add(purchase("tok_ok"));
        fake.get("inapp").listener.onQueryPurchasesResponse(res(BillingClient.BillingResponseCode.OK, ""), list);
        check("(4): ilk sorgudan sonra sonuc yok", call.outcomes().isEmpty(), "sonuc=" + call.outcomes());
        fake.get("subs").listener.onQueryPurchasesResponse(res(BillingClient.BillingResponseCode.NETWORK_ERROR, "net"), null);
        settle(call);
        one("(4)", call);
        PluginCall.Outcome o = only(call);
        check("(4): resolve DEGIL", o != null && !o.resolved, "sonuc=" + o);
        check("(4): kod npx:query:12:", o != null && "npx:query:12:".equals(o.code), "kod=" + (o == null ? null : o.code));
        check("(4): basarili yarim liste sizmadi", o != null && o.data == null, "veri=" + (o == null ? null : o.data));
    }

    /* (5) Donusturme sirasinda istisna -> reject, asama 'convert'. */
    static void s5_conversionErrorRejects() {
        System.out.println("(5) donusturme istisnasi -> reject");
        NativePurchasesPlugin p = plugin();
        PluginCall call = callFor("inapp");
        FakeClient fake = start(p, call, 1);
        List<Purchase> list = new ArrayList<>();
        list.add(purchase("tok_ok"));
        list.add(
            new Purchase() {
                @Override
                public List<String> getProducts() {
                    throw new IllegalStateException("bozuk kayit");
                }
            }
        );
        fake.get("inapp").listener.onQueryPurchasesResponse(res(BillingClient.BillingResponseCode.OK, ""), list);
        settle(call);
        one("(5)", call);
        PluginCall.Outcome o = only(call);
        check("(5): resolve DEGIL", o != null && !o.resolved, "sonuc=" + o);
        check("(5): kod npx:convert:0:", o != null && "npx:convert:0:".equals(o.code), "kod=" + (o == null ? null : o.code));
    }

    /* (6) OK dondu ama liste yok -> reject, asama 'nolist'. */
    static void s6_okWithoutListRejects() {
        System.out.println("(6) OK ama liste yok -> reject");
        NativePurchasesPlugin p = plugin();
        PluginCall call = callFor("inapp");
        FakeClient fake = start(p, call, 1);
        fake.get("inapp").listener.onQueryPurchasesResponse(res(BillingClient.BillingResponseCode.OK, ""), null);
        settle(call);
        one("(6)", call);
        PluginCall.Outcome o = only(call);
        check("(6): resolve DEGIL", o != null && !o.resolved, "sonuc=" + o);
        check("(6): kod npx:nolist:0:", o != null && "npx:nolist:0:".equals(o.code), "kod=" + (o == null ? null : o.code));
    }

    /* (7) Ters callback sirasi: once subs (basarisiz), sonra inapp (basarili). */
    static void s7_reverseOrder() {
        System.out.println("(7) ters callback sirasi -> tek dogru sonuc");
        NativePurchasesPlugin p = plugin();
        PluginCall call = callFor(null);
        FakeClient fake = start(p, call, 2);
        fake.get("subs").listener.onQueryPurchasesResponse(res(BillingClient.BillingResponseCode.ITEM_UNAVAILABLE, "x"), null);
        check("(7): ilk callback sonuc uretmedi", call.outcomes().isEmpty(), "sonuc=" + call.outcomes());
        List<Purchase> list = new ArrayList<>();
        list.add(purchase("tok_ok"));
        fake.get("inapp").listener.onQueryPurchasesResponse(res(BillingClient.BillingResponseCode.OK, ""), list);
        settle(call);
        one("(7)", call);
        PluginCall.Outcome o = only(call);
        check("(7): resolve DEGIL", o != null && !o.resolved, "sonuc=" + o);
        check("(7): kod npx:query:4:", o != null && "npx:query:4:".equals(o.code), "kod=" + (o == null ? null : o.code));
        check("(7): baglanti bir kez kapatildi", fake.ends.get() == 1, "ends=" + fake.ends.get());
    }

    /* (8) Ayni callback iki kez -> tek sonuc, tek endConnection. */
    static void s8_duplicateCallback() {
        System.out.println("(8) ayni callback iki kez -> tek sonuc");
        NativePurchasesPlugin p = plugin();
        PluginCall call = callFor("inapp");
        FakeClient fake = start(p, call, 1);
        PurchasesResponseListener l = fake.get("inapp").listener;
        l.onQueryPurchasesResponse(res(BillingClient.BillingResponseCode.OK, ""), new ArrayList<>());
        settle(call);
        l.onQueryPurchasesResponse(res(BillingClient.BillingResponseCode.SERVICE_UNAVAILABLE, "y"), null);
        one("(8)", call);
        PluginCall.Outcome o = only(call);
        check("(8): ilk sonuc korundu (resolve)", o != null && o.resolved, "sonuc=" + o);
        check("(8): baglanti bir kez kapatildi", fake.ends.get() == 1, "ends=" + fake.ends.get());
    }

    /* (9) Sonuc verildikten SONRA gelen gec callback: ikinci sonuc yok ve
           baglanti ikinci kez kapatilmaz. */
    static void s9_lateCallbackAfterResult() {
        System.out.println("(9) gec callback -> ikinci sonuc yok");
        NativePurchasesPlugin p = plugin();
        PluginCall call = callFor(null);
        FakeClient fake = start(p, call, 2);
        fake.get("inapp").listener.onQueryPurchasesResponse(res(BillingClient.BillingResponseCode.ERROR, "e"), null);
        fake.get("subs").listener.onQueryPurchasesResponse(res(BillingClient.BillingResponseCode.OK, ""), new ArrayList<>());
        settle(call);
        int endsAfter = fake.ends.get();
        // Ayni iki callback bir kez daha: gecikmis bir SDK tekrari.
        fake.get("inapp").listener.onQueryPurchasesResponse(res(BillingClient.BillingResponseCode.OK, ""), new ArrayList<>());
        fake.get("subs").listener.onQueryPurchasesResponse(res(BillingClient.BillingResponseCode.OK, ""), new ArrayList<>());
        one("(9)", call);
        PluginCall.Outcome o = only(call);
        check("(9): resolve DEGIL", o != null && !o.resolved, "sonuc=" + o);
        check("(9): kod npx:query:6:", o != null && "npx:query:6:".equals(o.code), "kod=" + (o == null ? null : o.code));
        check("(9): baglanti ikinci kez kapatilmadi", fake.ends.get() == endsAfter && endsAfter == 1, "ends=" + fake.ends.get());
    }

    /* (10) Sorgu hic gonderilemedi (queryPurchasesAsync firlatti): tek sonuc ve
           BASARI DEGIL.
           Bu senaryo yazilirken bulundu: yamasiz 8.7.0'da cagri HIC
           sonuclanmiyordu. withBillingClient bir RuntimeException'i yalniz
           logluyor, reddetmiyor — cunku initBillingClient kendi retini zaten
           yaziyor — ve gorev govdesinden gelen firlatma o retten yararlanamiyor.
           JS tarafinda bu, asla settle etmeyen bir promise ve hic serbest
           kalmayan bir kilit demek. Yama gonderimi de birlesme noktasindan
           geciriyor. */
    static void s10_dispatchFailure() {
        System.out.println("(10) sorgu gonderilemedi -> basari degil");
        NativePurchasesPlugin p = plugin();
        PluginCall call = callFor(null);
        FakeClient fake = new FakeClient();
        fake.throwOnType = BillingClient.ProductType.SUBS;
        BillingClient.factory = l -> fake;
        p.getPurchases(call);
        settle(call);
        // inapp gonderilmis olabilir; callback'i gec gelirse de sonuc degismemeli
        if (!fake.pending.isEmpty()) {
            fake.get("inapp").listener.onQueryPurchasesResponse(res(BillingClient.BillingResponseCode.OK, ""), new ArrayList<>());
        }
        one("(10)", call);
        PluginCall.Outcome o = only(call);
        check("(10): resolve DEGIL", o != null && !o.resolved, "sonuc=" + o);
        check("(10): kod npx:dispatch:0:", o != null && "npx:dispatch:0:".equals(o.code), "kod=" + (o == null ? null : o.code));
    }

    /* (11) Basarisiz yolda log redaksiyonu: token, orderId ve SDK'nin serbest
           metni (debugMessage / istisna metni) loga yazilmaz. */
    static void s11_logRedaction() {
        System.out.println("(11) basarisiz yolda log redaksiyonu");
        NativePurchasesPlugin p = plugin();
        PluginCall call = callFor("inapp");
        FakeClient fake = start(p, call, 1);
        List<Purchase> list = new ArrayList<>();
        list.add(purchase("SECRET_TOKEN_123"));
        list.add(
            new Purchase() {
                @Override
                public List<String> getProducts() {
                    throw new IllegalStateException("SECRET_EXCEPTION_TEXT");
                }
            }
        );
        fake.get("inapp").listener.onQueryPurchasesResponse(res(BillingClient.BillingResponseCode.OK, "SECRET_DEBUG_MSG"), list);
        settle(call);
        String logs = String.join("\n", Log.lines());
        check("(11): token loglanmadi", !logs.contains("SECRET_TOKEN_123"), "log icinde token var");
        check("(11): orderId loglanmadi", !logs.contains("GPA.0000-1111"), "log icinde orderId var");
        check("(11): istisna metni loglanmadi", !logs.contains("SECRET_EXCEPTION_TEXT"), "log icinde istisna metni var");
        check("(11): hata kodu loglanmadi", !logs.contains("npx:"), "log icinde npx kodu var");

        // Ayrica: OK olmayan sorguda debugMessage loglanmiyor, kod logluyor.
        NativePurchasesPlugin p2 = plugin();
        PluginCall c2 = callFor("inapp");
        FakeClient f2 = start(p2, c2, 1);
        f2.get("inapp").listener.onQueryPurchasesResponse(res(BillingClient.BillingResponseCode.BILLING_UNAVAILABLE, "SECRET_DEBUG_MSG"), null);
        settle(c2);
        String logs2 = String.join("\n", Log.lines());
        check("(11): debugMessage loglanmadi", !logs2.contains("SECRET_DEBUG_MSG"), "log icinde debugMessage var");
        check("(11): sonuc kodu loglandi", logs2.contains("query failed, code: 3"), "kodlu satir yok");
    }

    /* (12) BAGLANTI SAHIPLIGI — GERCEK MEKANIZMA UZERINDEN.
           Es zamanlilik VARSAYILMIYOR, kaynaktan okunuyor:
             - billingExecutor TEK is parcacikli, yani iki withBillingClient
               govdesi ic ice kosmuyor;
             - ama getPurchases'in govdesi sorgulari gonderip HEMEN donuyor, yani
               A'nin sorgulari ucustayken B'nin govdesi baslayabiliyor;
             - initBillingClient her cagrida connectBillingClient'i cagiriyor ve o
               HER ZAMAN yeni bir BillingClient kurup `billingClient` alanini
               eziyor (yeniden kullanim yok, bkz. connectBillingClient);
             - closeBillingClient() ise o ANDAKI alani kapatiyor.
           Dolayisiyla A'nin gec gelen callback'i, B'nin baglantisini
           kapatabilecek konumda. Olculen tam olarak bu. */
    static void s12_connectionOwnership() {
        System.out.println("(12) baglanti sahipligi: A'nin bitisi B'yi kapatmiyor");
        NativePurchasesPlugin p = plugin();
        final List<FakeClient> built = new ArrayList<>();
        BillingClient.factory = l -> {
            FakeClient c = new FakeClient();
            synchronized (built) {
                built.add(c);
            }
            return c;
        };

        /* A: sorgu gonderildi, cevap YOK. */
        PluginCall callA = callFor("inapp");
        p.getPurchases(callA);
        waitClients(built, 1);
        FakeClient a = built.get(0);
        waitPending(a, 1);

        /* B: ayni eklenti ornegi, YENI istemci, `billingClient` alani artik B'nin. */
        PluginCall callB = callFor("inapp");
        p.getPurchases(callB);
        waitClients(built, 2);
        FakeClient b = built.get(1);
        waitPending(b, 1);
        check("(12): B ayri bir istemci kurdu", a != b, "ayni ornek");
        check("(12): B baslarken kapatilmadi", b.ends.get() == 0, "B ends=" + b.ends.get());

        /* A'nin GEC gelen callback'i. */
        a.get("inapp").listener.onQueryPurchasesResponse(res(BillingClient.BillingResponseCode.OK, ""), new ArrayList<>());
        settle(callA);
        check("(12): A sonuclandi", callA.outcomes().size() == 1, "A=" + callA.outcomes());
        check("(12): A'nin bitisi B'nin cagrisini sonuclandirmadi", callB.outcomes().isEmpty(), "B=" + callB.outcomes());
        check("(12): A'nin bitisi B'nin BAGLANTISINI kapatmadi", b.ends.get() == 0, "B ends=" + b.ends.get());
        /* Sizinti da yok, ama kapatan A DEGIL: initBillingClient() ilk isi olarak
           closeBillingClientLocked() cagiriyor, yani B devralirken A'nin
           baglantisini zaten kapatti. A'nin bitisi bu yuzden HICBIR SEY
           kapatmamali - ikinci bir endConnection sizintiyi degil ayni baglantiyi
           kapatirdi. (Bu, olcumun ilk turunda gercekten olustu.) */
        check("(12): A'nin baglantisi tam bir kez kapatildi (devralan kapatti)",
            a.ends.get() == 1, "A ends=" + a.ends.get());

        /* B kendi cevabini alinca normal bitiyor. */
        b.get("inapp").listener.onQueryPurchasesResponse(res(BillingClient.BillingResponseCode.OK, ""), new ArrayList<>());
        settle(callB);
        one("(12) B", callB);
        PluginCall.Outcome ob = only(callB);
        check("(12): B resolve", ob != null && ob.resolved, "B=" + ob);
        check("(12): B kendi baglantisini bir kez kapatti", b.ends.get() == 1, "B ends=" + b.ends.get());
    }

    /* (13) AYNI TURUN IKINCI CALLBACK'I, DONMEMIS DIGER TURUN YERINE SAYILMAZ.
           pendingQueries duz bir sayac oldugu icin inapp'in iki kez cevaplanmasi
           sayaci sifira indirip subs hala ucustayken BASARILI VE KISMI bir resolve
           uretebilir; ardindan gelen subs hatasi da 'finished' yuzunden hic
           gorunmez. (8) yalnizca TEK tur soruldugunda ikinci callback'i olcuyor,
           bu bosluk oradan gorunmuyor. */
    static void s13_duplicateDoesNotStandInForPending() {
        System.out.println("(13) ayni turun ikinci callback'i, bekleyen turun yerine gecmiyor");
        NativePurchasesPlugin p = plugin();
        PluginCall call = callFor(null);
        FakeClient fake = start(p, call, 2);
        PurchasesResponseListener inapp = fake.get("inapp").listener;
        List<Purchase> list = new ArrayList<>();
        list.add(purchase("tok_inapp"));
        inapp.onQueryPurchasesResponse(res(BillingClient.BillingResponseCode.OK, ""), list);
        check("(13): ilk inapp cevabi sonuc uretmedi", call.outcomes().isEmpty(), "sonuc=" + call.outcomes());
        /* AYNI sorgunun ikinci cevabi. subs hala ucusta. */
        inapp.onQueryPurchasesResponse(res(BillingClient.BillingResponseCode.OK, ""), list);
        check("(13): ikinci inapp cevabi da sonuc uretmedi (subs bekliyor)",
            call.outcomes().isEmpty(), "sonuc=" + call.outcomes());
        check("(13): erken/kismi resolve olusmadi",
            call.outcomes().stream().noneMatch(o -> o.resolved), "sonuc=" + call.outcomes());
        /* subs SONRADAN hata veriyor: sonuc reject olmali. */
        fake.get("subs").listener.onQueryPurchasesResponse(res(BillingClient.BillingResponseCode.SERVICE_UNAVAILABLE, "x"), null);
        settle(call);
        one("(13)", call);
        PluginCall.Outcome o = only(call);
        check("(13): resolve DEGIL", o != null && !o.resolved, "sonuc=" + o);
        check("(13): kod npx:query:2:", o != null && "npx:query:2:".equals(o.code), "kod=" + (o == null ? null : o.code));
        check("(13): baglanti bir kez kapatildi", fake.ends.get() == 1, "ends=" + fake.ends.get());
    }

    static void waitClients(List<FakeClient> built, int n) {
        long until = System.currentTimeMillis() + 5000;
        while (System.currentTimeMillis() < until) {
            synchronized (built) {
                if (built.size() >= n) return;
            }
            Thread.onSpinWait();
        }
    }

    static void waitPending(FakeClient c, int n) {
        long until = System.currentTimeMillis() + 5000;
        while (c.pending.size() < n && System.currentTimeMillis() < until) {
            Thread.onSpinWait();
        }
    }

    /* ---------------------------------------------------------------- main */

    public static void main(String[] args) {
        System.out.println("native getPurchases sozlesmesi");
        System.out.println("");
        s1_queryFailureRejects();
        s2_emptySuccessResolves();
        s3_nonEmptySuccessResolves();
        s4_partialFailureRejects();
        s5_conversionErrorRejects();
        s6_okWithoutListRejects();
        s7_reverseOrder();
        s8_duplicateCallback();
        s9_lateCallbackAfterResult();
        s10_dispatchFailure();
        s11_logRedaction();
        s12_connectionOwnership();
        s13_duplicateDoesNotStandInForPending();
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
