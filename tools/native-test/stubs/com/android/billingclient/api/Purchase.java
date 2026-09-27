package com.android.billingclient.api;

import java.util.ArrayList;
import java.util.List;

public class Purchase {

    public static final class PurchaseState {

        public static final int UNSPECIFIED_STATE = 0;
        public static final int PURCHASED = 1;
        public static final int PENDING = 2;

        private PurchaseState() {}
    }

    private String token = "tok";
    private int state = PurchaseState.PURCHASED;
    private boolean acknowledged = false;
    private long time = 0L;
    private int quantity = 1;
    private String orderId = "order";
    private final List<String> products = new ArrayList<>();
    private AccountIdentifiers accountIdentifiers;

    public Purchase token(String v) {
        token = v;
        return this;
    }

    public Purchase state(int v) {
        state = v;
        return this;
    }

    public Purchase acknowledged(boolean v) {
        acknowledged = v;
        return this;
    }

    public Purchase time(long v) {
        time = v;
        return this;
    }

    public Purchase quantity(int v) {
        quantity = v;
        return this;
    }

    public Purchase orderId(String v) {
        orderId = v;
        return this;
    }

    public Purchase product(String v) {
        products.add(v);
        return this;
    }

    public Purchase account(String v) {
        accountIdentifiers = new AccountIdentifiers(v);
        return this;
    }

    public String getPurchaseToken() {
        return token;
    }

    public int getPurchaseState() {
        return state;
    }

    public boolean isAcknowledged() {
        return acknowledged;
    }

    public long getPurchaseTime() {
        return time;
    }

    public int getQuantity() {
        return quantity;
    }

    public String getOrderId() {
        return orderId;
    }

    public List<String> getProducts() {
        return products;
    }

    public AccountIdentifiers getAccountIdentifiers() {
        return accountIdentifiers;
    }

    public String getOriginalJson() {
        return "{}";
    }

    public String getSignature() {
        return "";
    }
}
