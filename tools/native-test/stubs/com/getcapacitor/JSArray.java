package com.getcapacitor;

import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;

public class JSArray extends JSONArray {

    public List<String> toList() {
        List<String> out = new ArrayList<>();
        for (int i = 0; i < length(); i++) {
            Object v = opt(i);
            out.add(v == null ? null : String.valueOf(v));
        }
        return out;
    }
}
