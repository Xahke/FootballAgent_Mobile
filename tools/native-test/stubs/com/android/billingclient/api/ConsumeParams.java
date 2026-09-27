package com.android.billingclient.api;

public class ConsumeParams {

    private String purchaseToken;

    public String getPurchaseToken() {
        return purchaseToken;
    }

    public static Builder newBuilder() {
        return new Builder();
    }

    public static final class Builder {

        private final ConsumeParams p = new ConsumeParams();

        public Builder setPurchaseToken(String t) {
            p.purchaseToken = t;
            return this;
        }

        public ConsumeParams build() {
            return p;
        }
    }
}
