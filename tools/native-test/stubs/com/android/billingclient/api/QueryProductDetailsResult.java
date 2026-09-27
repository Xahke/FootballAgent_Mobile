package com.android.billingclient.api;

import java.util.ArrayList;
import java.util.List;

public class QueryProductDetailsResult {

    private final List<ProductDetails> list;

    public QueryProductDetailsResult() {
        this(new ArrayList<>());
    }

    public QueryProductDetailsResult(List<ProductDetails> list) {
        this.list = list;
    }

    public List<ProductDetails> getProductDetailsList() {
        return list;
    }

    public List<String> getUnfetchedProductList() {
        return new ArrayList<>();
    }
}
