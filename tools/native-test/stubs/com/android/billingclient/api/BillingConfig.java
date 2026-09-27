package com.android.billingclient.api;

public class BillingConfig {

    private final String countryCode;

    public BillingConfig(String countryCode) {
        this.countryCode = countryCode;
    }

    public String getCountryCode() {
        return countryCode;
    }
}
