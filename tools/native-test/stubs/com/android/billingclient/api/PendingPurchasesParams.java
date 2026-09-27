package com.android.billingclient.api;

public class PendingPurchasesParams {

    public static Builder newBuilder() {
        return new Builder();
    }

    public static final class Builder {

        public Builder enableOneTimeProducts() {
            return this;
        }

        public Builder enablePrepaidPlans() {
            return this;
        }

        public PendingPurchasesParams build() {
            return new PendingPurchasesParams();
        }
    }
}
