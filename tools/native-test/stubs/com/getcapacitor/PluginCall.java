package com.getcapacitor;

import java.util.ArrayList;
import java.util.List;

/** Testin ölçüm noktası. Gerçek PluginCall ikinci bir resolve/reject'i sessizce
 *  köprüye yazar — ATMAZ. Bu yüzden burada da atılmıyor: her sonuç kaydedilir ve
 *  "tam olarak bir sonuç" iddiası sayarak ölçülür. */
public class PluginCall {

    public static final class Outcome {

        public final boolean resolved;
        public final JSObject data;
        public final String message;
        public final String code;

        Outcome(boolean resolved, JSObject data, String message, String code) {
            this.resolved = resolved;
            this.data = data;
            this.message = message;
            this.code = code;
        }

        @Override
        public String toString() {
            return resolved ? ("resolve(" + data + ")") : ("reject(" + message + ", " + code + ")");
        }
    }

    private final JSObject data;
    private final List<Outcome> outcomes = new ArrayList<>();

    public PluginCall() {
        this(new JSObject());
    }

    public PluginCall(JSObject data) {
        this.data = data;
    }

    public JSObject getData() {
        return data;
    }

    public synchronized List<Outcome> outcomes() {
        return new ArrayList<>(outcomes);
    }

    public String getString(String key) {
        return getString(key, null);
    }

    public String getString(String key, String def) {
        Object v = data.opt(key);
        return v == null ? def : String.valueOf(v);
    }

    public Boolean getBoolean(String key) {
        return getBoolean(key, null);
    }

    public Boolean getBoolean(String key, Boolean def) {
        Object v = data.opt(key);
        return v instanceof Boolean ? (Boolean) v : def;
    }

    public Integer getInt(String key) {
        return getInt(key, null);
    }

    public Integer getInt(String key, Integer def) {
        Object v = data.opt(key);
        return v instanceof Number ? Integer.valueOf(((Number) v).intValue()) : def;
    }

    public JSArray getArray(String key) {
        Object v = data.opt(key);
        return v instanceof JSArray ? (JSArray) v : null;
    }

    public JSArray getArray(String key, JSArray def) {
        JSArray a = getArray(key);
        return a == null ? def : a;
    }

    public synchronized void resolve() {
        outcomes.add(new Outcome(true, new JSObject(), null, null));
    }

    public synchronized void resolve(JSObject result) {
        outcomes.add(new Outcome(true, result, null, null));
    }

    public synchronized void reject(String message) {
        outcomes.add(new Outcome(false, null, message, null));
    }

    public synchronized void reject(String message, String code) {
        outcomes.add(new Outcome(false, null, message, code));
    }

    public synchronized void reject(String message, Exception ex) {
        outcomes.add(new Outcome(false, null, message, null));
    }

    public synchronized void reject(String message, String code, Exception ex) {
        outcomes.add(new Outcome(false, null, message, code));
    }

    public void setKeepAlive(Boolean keepAlive) {}
}
