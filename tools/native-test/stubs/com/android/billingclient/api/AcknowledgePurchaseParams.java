package com.android.billingclient.api;

public class AcknowledgePurchaseParams {

    private String purchaseToken;

    public String getPurchaseToken() {
        return purchaseToken;
    }

    public static Builder newBuilder() {
        return new Builder();
    }

    public static final class Builder {

        private final AcknowledgePurchaseParams p = new AcknowledgePurchaseParams();

        public Builder setPurchaseToken(String t) {
            p.purchaseToken = t;
            return this;
        }

        public AcknowledgePurchaseParams build() {
            return p;
        }
    }
}
