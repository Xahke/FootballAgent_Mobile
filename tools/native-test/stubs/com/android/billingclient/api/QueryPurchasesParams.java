package com.android.billingclient.api;

public class QueryPurchasesParams {

    private String productType = "";

    public String getProductType() {
        return productType;
    }

    public static Builder newBuilder() {
        return new Builder();
    }

    public static final class Builder {

        private final QueryPurchasesParams p = new QueryPurchasesParams();

        public Builder setProductType(String t) {
            p.productType = t;
            return this;
        }

        public QueryPurchasesParams build() {
            return p;
        }
    }
}
