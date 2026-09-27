package com.android.billingclient.api;

public interface ProductDetailsResponseListener {
    void onProductDetailsResponse(BillingResult billingResult, QueryProductDetailsResult result);
}
