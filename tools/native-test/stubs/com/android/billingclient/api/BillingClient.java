package com.android.billingclient.api;

import android.app.Activity;
import android.content.Context;
import java.util.List;
import java.util.function.Function;

/** Testin sürücüsü. `BillingClient.factory` verilmişse newBuilder(...).build()
 *  o örneği döner; verilmemişse hiçbir şey yapmayan varsayılan. Böylece
 *  queryPurchasesAsync'in ne zaman, hangi BillingResult ile ve hangi iş
 *  parçacığında geri çağırdığına senaryo karar verir. */
public class BillingClient {

    public static final class BillingResponseCode {

        public static final int SERVICE_TIMEOUT = -3;
        public static final int FEATURE_NOT_SUPPORTED = -2;
        public static final int SERVICE_DISCONNECTED = -1;
        public static final int OK = 0;
        public static final int USER_CANCELED = 1;
        public static final int SERVICE_UNAVAILABLE = 2;
        public static final int BILLING_UNAVAILABLE = 3;
        public static final int ITEM_UNAVAILABLE = 4;
        public static final int DEVELOPER_ERROR = 5;
        public static final int ERROR = 6;
        public static final int ITEM_ALREADY_OWNED = 7;
        public static final int ITEM_NOT_OWNED = 8;
        public static final int NETWORK_ERROR = 12;

        private BillingResponseCode() {}
    }

    public static final class ProductType {

        public static final String INAPP = "inapp";
        public static final String SUBS = "subs";

        private ProductType() {}
    }

    /** Test kancası: her build() çağrısında çağrılır. */
    public static volatile Function<PurchasesUpdatedListener, BillingClient> factory = null;

    protected PurchasesUpdatedListener updatedListener;
    private volatile boolean ready = false;
    private volatile boolean ended = false;

    public static Builder newBuilder(Context context) {
        return new Builder();
    }

    public PurchasesUpdatedListener updatedListener() {
        return updatedListener;
    }

    public boolean isEnded() {
        return ended;
    }

    public void startConnection(BillingClientStateListener listener) {
        ready = true;
        listener.onBillingSetupFinished(BillingResult.of(BillingResponseCode.OK));
    }

    public void endConnection() {
        ended = true;
        ready = false;
    }

    public boolean isReady() {
        return ready;
    }

    public void queryPurchasesAsync(QueryPurchasesParams params, PurchasesResponseListener listener) {
        listener.onQueryPurchasesResponse(BillingResult.of(BillingResponseCode.OK), List.of());
    }

    public void queryProductDetailsAsync(QueryProductDetailsParams params, ProductDetailsResponseListener listener) {
        listener.onProductDetailsResponse(BillingResult.of(BillingResponseCode.OK), new QueryProductDetailsResult());
    }

    public BillingResult launchBillingFlow(Activity activity, BillingFlowParams params) {
        return BillingResult.of(BillingResponseCode.OK);
    }

    public void consumeAsync(ConsumeParams params, ConsumeResponseListener listener) {
        listener.onConsumeResponse(BillingResult.of(BillingResponseCode.OK), params.getPurchaseToken());
    }

    public void acknowledgePurchase(AcknowledgePurchaseParams params, AcknowledgePurchaseResponseListener listener) {
        listener.onAcknowledgePurchaseResponse(BillingResult.of(BillingResponseCode.OK));
    }

    public void getBillingConfigAsync(GetBillingConfigParams params, BillingConfigResponseListener listener) {
        listener.onBillingConfigResponse(BillingResult.of(BillingResponseCode.OK), new BillingConfig("TR"));
    }

    public static final class Builder {

        private PurchasesUpdatedListener listener;

        public Builder setListener(PurchasesUpdatedListener l) {
            listener = l;
            return this;
        }

        public Builder enablePendingPurchases(PendingPurchasesParams params) {
            return this;
        }

        public Builder enablePendingPurchases() {
            return this;
        }

        public Builder enableAutoServiceReconnection() {
            return this;
        }

        public BillingClient build() {
            Function<PurchasesUpdatedListener, BillingClient> f = factory;
            BillingClient c = f != null ? f.apply(listener) : new BillingClient();
            c.updatedListener = listener;
            return c;
        }
    }
}
