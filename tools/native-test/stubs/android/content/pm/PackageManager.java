package android.content.pm;

public class PackageManager {

    public static class NameNotFoundException extends Exception {

        public NameNotFoundException() {
            super("not found");
        }
    }

    public static final class PackageInfoFlags {

        private PackageInfoFlags() {}

        public static PackageInfoFlags of(long value) {
            return new PackageInfoFlags();
        }
    }

    public PackageInfo getPackageInfo(String name, int flags) throws NameNotFoundException {
        return new PackageInfo();
    }

    public PackageInfo getPackageInfo(String name, PackageInfoFlags flags) throws NameNotFoundException {
        return new PackageInfo();
    }
}
