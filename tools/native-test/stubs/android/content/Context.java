package android.content;

import android.content.pm.PackageManager;

public class Context {

    public String getPackageName() {
        return "com.xahke.profootballagent";
    }

    public PackageManager getPackageManager() {
        return new PackageManager();
    }

    public void startActivity(Intent intent) {}
}
