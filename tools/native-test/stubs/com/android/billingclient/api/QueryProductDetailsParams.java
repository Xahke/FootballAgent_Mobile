package com.android.billingclient.api;

import java.util.ArrayList;
import java.util.List;

public class QueryProductDetailsParams {

    private List<Product> products = new ArrayList<>();

    public List<Product> getProductList() {
        return products;
    }

    public static Builder newBuilder() {
        return new Builder();
    }

    public static final class Builder {

        private final QueryProductDetailsParams p = new QueryProductDetailsParams();

        public Builder setProductList(List<Product> list) {
            p.products = new ArrayList<>(list);
            return this;
        }

        public QueryProductDetailsParams build() {
            return p;
        }
    }

    public static class Product {

        private String productId;
        private String productType;

        public String getProductId() {
            return productId;
        }

        public String getProductType() {
            return productType;
        }

        public static Builder newBuilder() {
            return new Builder();
        }

        public static final class Builder {

            private final Product p = new Product();

            public Builder setProductId(String id) {
                p.productId = id;
                return this;
            }

            public Builder setProductType(String t) {
                p.productType = t;
                return this;
            }

            public Product build() {
                return p;
            }
        }
    }
}
