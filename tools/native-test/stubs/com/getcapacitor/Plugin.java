package com.getcapacitor;

import android.app.Activity;
import android.content.Context;

public class Plugin {

    private final Activity activity = new Activity();

    public void load() {}

    protected void handleOnDestroy() {}

    public Context getContext() {
        return activity;
    }

    public Activity getActivity() {
        return activity;
    }
}
