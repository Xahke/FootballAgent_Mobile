package com.android.billingclient.api;

public class AccountIdentifiers {

    private final String obfuscatedAccountId;

    public AccountIdentifiers(String obfuscatedAccountId) {
        this.obfuscatedAccountId = obfuscatedAccountId;
    }

    public String getObfuscatedAccountId() {
        return obfuscatedAccountId;
    }

    public String getObfuscatedProfileId() {
        return null;
    }
}
