package android.content.pm;

public class PackageInfo {

    public String versionName = "1.0.0";
    public long versionCode = 3L;
    public long firstInstallTime = 0L;
    public long lastUpdateTime = 0L;

    public long getLongVersionCode() {
        return versionCode;
    }
}
