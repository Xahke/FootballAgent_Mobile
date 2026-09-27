package com.android.billingclient.api;

import java.util.ArrayList;
import java.util.List;

public class ProductDetails {

    private String productId = "p";
    private String name = "n";
    private String description = "d";
    private OneTimePurchaseOfferDetails oneTime;
    private List<OneTimePurchaseOfferDetails> oneTimeList;
    private List<SubscriptionOfferDetails> subs;

    public String getProductId() {
        return productId;
    }

    public String getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }

    public String getTitle() {
        return name;
    }

    public OneTimePurchaseOfferDetails getOneTimePurchaseOfferDetails() {
        return oneTime;
    }

    public List<OneTimePurchaseOfferDetails> getOneTimePurchaseOfferDetailsList() {
        return oneTimeList == null ? new ArrayList<>() : oneTimeList;
    }

    public List<SubscriptionOfferDetails> getSubscriptionOfferDetails() {
        return subs;
    }

    public static class OneTimePurchaseOfferDetails {

        public String getFormattedPrice() {
            return "0,00 TL";
        }

        public long getPriceAmountMicros() {
            return 0L;
        }

        public String getPriceCurrencyCode() {
            return "TRY";
        }

        public String getOfferToken() {
            return null;
        }

        public String getOfferId() {
            return null;
        }

        public String getPurchaseOptionId() {
            return null;
        }

        public Long getFullPriceMicros() {
            return null;
        }

        public PricingPhases getPricingPhases() {
            return null;
        }

        public DiscountDisplayInfo getDiscountDisplayInfo() {
            return null;
        }

        public static class DiscountDisplayInfo {

            public Integer getPercentageDiscount() {
                return null;
            }

            public DiscountAmount getDiscountAmount() {
                return null;
            }

            public static class DiscountAmount {

                public long getDiscountAmountMicros() {
                    return 0L;
                }
            }
        }
    }

    public static class SubscriptionOfferDetails {

        public String getOfferToken() {
            return "";
        }

        public String getBasePlanId() {
            return "";
        }

        public String getOfferId() {
            return null;
        }

        public PricingPhases getPricingPhases() {
            return null;
        }
    }

    public static class PricingPhases {

        public List<PricingPhase> getPricingPhaseList() {
            return new ArrayList<>();
        }
    }

    public static class PricingPhase {

        public String getFormattedPrice() {
            return "0,00 TL";
        }

        public long getPriceAmountMicros() {
            return 0L;
        }

        public String getPriceCurrencyCode() {
            return "TRY";
        }

        public String getBillingPeriod() {
            return "P1M";
        }

        public int getRecurrenceMode() {
            return 1;
        }

        public int getBillingCycleCount() {
            return 0;
        }
    }
}
