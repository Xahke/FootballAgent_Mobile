package com.getcapacitor;

import org.json.JSONObject;

public class JSObject extends JSONObject {

    /** Capacitor JSObject okuyuculari JSONException FIRLATMAZ (org.json firlatir):
     *  eksik anahtar null doner. Eklenti kodu bu sozlesmeye dayaniyor. */
    @Override
    public String getString(String key) {
        Object v = opt(key);
        return v == null ? null : String.valueOf(v);
    }

    /** Capacitor JSObject varsayilanli okuyucular sunar; org.json sunmaz. */
    public String getString(String key, String def) {
        Object v = opt(key);
        return v == null ? def : String.valueOf(v);
    }

    public Boolean getBool(String key, Boolean def) {
        Object v = opt(key);
        return v instanceof Boolean ? (Boolean) v : def;
    }

    public Integer getInteger(String key, Integer def) {
        Object v = opt(key);
        return v instanceof Number ? Integer.valueOf(((Number) v).intValue()) : def;
    }


    @Override
    public JSObject put(String key, Object value) {
        super.put(key, value);
        return this;
    }

    @Override
    public JSObject put(String key, boolean value) {
        super.put(key, value);
        return this;
    }

    @Override
    public JSObject put(String key, int value) {
        super.put(key, value);
        return this;
    }

    @Override
    public JSObject put(String key, long value) {
        super.put(key, value);
        return this;
    }

    @Override
    public JSObject put(String key, double value) {
        super.put(key, value);
        return this;
    }
}
