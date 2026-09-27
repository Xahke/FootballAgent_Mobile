package com.android.billingclient.api;

public class BillingResult {

    private int responseCode;
    private String debugMessage = "";

    public int getResponseCode() {
        return responseCode;
    }

    public String getDebugMessage() {
        return debugMessage;
    }

    public static Builder newBuilder() {
        return new Builder();
    }

    public static BillingResult of(int code) {
        return newBuilder().setResponseCode(code).build();
    }

    @Override
    public String toString() {
        return "BillingResult{code=" + responseCode + "}";
    }

    public static final class Builder {

        private final BillingResult r = new BillingResult();

        public Builder setResponseCode(int code) {
            r.responseCode = code;
            return this;
        }

        public Builder setDebugMessage(String msg) {
            r.debugMessage = msg == null ? "" : msg;
            return this;
        }

        public BillingResult build() {
            return r;
        }
    }
}
