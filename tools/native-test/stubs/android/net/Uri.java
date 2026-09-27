package android.net;

public class Uri {

    private final String raw;

    private Uri(String raw) {
        this.raw = raw;
    }

    public static Uri parse(String s) {
        return new Uri(s);
    }

    @Override
    public String toString() {
        return raw;
    }
}
