package android.util;

import java.util.ArrayList;
import java.util.List;

/** Log kayıtları testte okunabilsin diye biriktirilir: "hassas içerik loglanmıyor"
 *  iddiası ancak gerçekten yazılanlara bakarak ölçülebilir. */
public final class Log {

    private static final List<String> LINES = new ArrayList<>();
    public static boolean echo = false;

    private Log() {}

    public static synchronized List<String> lines() {
        return new ArrayList<>(LINES);
    }

    public static synchronized void reset() {
        LINES.clear();
    }

    private static synchronized int add(String level, String tag, String msg) {
        String line = level + "/" + tag + ": " + msg;
        LINES.add(line);
        if (echo) {
            System.out.println("      [log] " + line);
        }
        return line.length();
    }

    public static int d(String tag, String msg) {
        return add("D", tag, msg);
    }

    public static int i(String tag, String msg) {
        return add("I", tag, msg);
    }

    public static int w(String tag, String msg) {
        return add("W", tag, msg);
    }

    public static int e(String tag, String msg) {
        return add("E", tag, msg);
    }

    public static int v(String tag, String msg) {
        return add("V", tag, msg);
    }
}
