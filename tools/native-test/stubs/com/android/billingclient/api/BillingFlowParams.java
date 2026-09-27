package com.android.billingclient.api;

import java.util.ArrayList;
import java.util.List;

public class BillingFlowParams {

    private List<ProductDetailsParams> list = new ArrayList<>();
    private String obfuscatedAccountId;

    public List<ProductDetailsParams> getProductDetailsParamsList() {
        return list;
    }

    public String getObfuscatedAccountId() {
        return obfuscatedAccountId;
    }

    public static Builder newBuilder() {
        return new Builder();
    }

    public static final class Builder {

        private final BillingFlowParams p = new BillingFlowParams();

        public Builder setProductDetailsParamsList(List<ProductDetailsParams> l) {
            p.list = new ArrayList<>(l);
            return this;
        }

        public Builder setObfuscatedAccountId(String id) {
            p.obfuscatedAccountId = id;
            return this;
        }

        public Builder setObfuscatedProfileId(String id) {
            return this;
        }

        public Builder setIsOfferPersonalized(boolean v) {
            return this;
        }

        public BillingFlowParams build() {
            return p;
        }
    }

    public static class ProductDetailsParams {

        public static Builder newBuilder() {
            return new Builder();
        }

        public static final class Builder {

            public Builder setProductDetails(ProductDetails d) {
                return this;
            }

            public Builder setOfferToken(String t) {
                return this;
            }

            public ProductDetailsParams build() {
                return new ProductDetailsParams();
            }
        }
    }
}
