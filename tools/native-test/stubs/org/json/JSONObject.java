package org.json;

import java.util.LinkedHashMap;
import java.util.Map;

/** org.json'un testte gereken kadarı. Android'in kendi org.json'u da bu
 *  sözleşmeyi taşır: put(key, null) anahtarı SİLER, JSONObject.NULL ise
 *  gerçek bir null değeri yazar. ProductPayloadMapper bu ayrımı kullanıyor. */
public class JSONObject {

    public static final Object NULL = new Object() {

        @Override
        public boolean equals(Object o) {
            return o == this || o == null;
        }

        @Override
        public int hashCode() {
            return 0;
        }

        @Override
        public String toString() {
            return "null";
        }
    };

    private final Map<String, Object> map = new LinkedHashMap<>();

    public JSONObject() {}

    public JSONObject put(String key, Object value) {
        if (value == null) {
            map.remove(key);
        } else {
            map.put(key, value);
        }
        return this;
    }

    public JSONObject put(String key, boolean value) {
        map.put(key, Boolean.valueOf(value));
        return this;
    }

    public JSONObject put(String key, int value) {
        map.put(key, Integer.valueOf(value));
        return this;
    }

    public JSONObject put(String key, long value) {
        map.put(key, Long.valueOf(value));
        return this;
    }

    public JSONObject put(String key, double value) {
        map.put(key, Double.valueOf(value));
        return this;
    }

    public Object opt(String key) {
        return map.get(key);
    }

    public boolean has(String key) {
        return map.containsKey(key);
    }

    public int length() {
        return map.size();
    }

    public Object get(String key) throws JSONException {
        if (!map.containsKey(key)) {
            throw new JSONException("no value for " + key);
        }
        return map.get(key);
    }

    public String optString(String key) {
        Object v = map.get(key);
        return v == null ? "" : String.valueOf(v);
    }

    public String getString(String key) throws JSONException {
        return String.valueOf(get(key));
    }

    public int getInt(String key) throws JSONException {
        return ((Number) get(key)).intValue();
    }

    public long getLong(String key) throws JSONException {
        return ((Number) get(key)).longValue();
    }

    public double getDouble(String key) throws JSONException {
        return ((Number) get(key)).doubleValue();
    }

    public boolean getBoolean(String key) throws JSONException {
        return Boolean.TRUE.equals(get(key));
    }

    public JSONArray getJSONArray(String key) throws JSONException {
        return (JSONArray) get(key);
    }

    public JSONObject getJSONObject(String key) throws JSONException {
        return (JSONObject) get(key);
    }

    public double optDouble(String key, double def) {
        Object v = map.get(key);
        return v instanceof Number ? ((Number) v).doubleValue() : def;
    }

    public double optDouble(String key) {
        return optDouble(key, Double.NaN);
    }

    public int optInt(String key, int def) {
        Object v = map.get(key);
        return v instanceof Number ? ((Number) v).intValue() : def;
    }

    public long optLong(String key, long def) {
        Object v = map.get(key);
        return v instanceof Number ? ((Number) v).longValue() : def;
    }

    public boolean optBoolean(String key, boolean def) {
        Object v = map.get(key);
        return v instanceof Boolean ? (Boolean) v : def;
    }

    public Object remove(String key) {
        return map.remove(key);
    }

    public java.util.Iterator<String> keys() {
        return map.keySet().iterator();
    }

    @Override
    public String toString() {
        return map.toString();
    }
}
