package android.content;

import android.net.Uri;

public class Intent {

    public static final String ACTION_VIEW = "android.intent.action.VIEW";
    public static final int FLAG_ACTIVITY_NEW_TASK = 0x10000000;

    private Uri data;

    public Intent() {}

    public Intent(String action) {}

    public Intent setData(Uri uri) {
        this.data = uri;
        return this;
    }

    public Uri getData() {
        return data;
    }

    public Intent setFlags(int flags) {
        return this;
    }

    public Intent addFlags(int flags) {
        return this;
    }
}
