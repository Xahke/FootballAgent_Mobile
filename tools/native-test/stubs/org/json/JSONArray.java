package org.json;

import java.util.ArrayList;
import java.util.List;

public class JSONArray {

    private final List<Object> items = new ArrayList<>();

    public JSONArray() {}

    public JSONArray put(Object value) {
        items.add(value);
        return this;
    }

    public int length() {
        return items.size();
    }

    public Object get(int i) throws JSONException {
        if (i < 0 || i >= items.size()) {
            throw new JSONException("index " + i);
        }
        return items.get(i);
    }

    public Object opt(int i) {
        return i < 0 || i >= items.size() ? null : items.get(i);
    }

    public String optString(int i, String def) {
        Object v = opt(i);
        return v == null ? def : String.valueOf(v);
    }

    public String optString(int i) {
        return optString(i, "");
    }

    @Override
    public String toString() {
        return items.toString();
    }
}
