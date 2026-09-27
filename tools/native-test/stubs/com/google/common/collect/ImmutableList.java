package com.google.common.collect;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/** Guava'nın yalnız kullanılan yüzü: of(...) ve List sözleşmesi. */
public final class ImmutableList<E> extends ArrayList<E> {

    private ImmutableList(List<E> src) {
        super(src);
    }

    @SafeVarargs
    public static <E> ImmutableList<E> of(E... items) {
        return new ImmutableList<>(Arrays.asList(items));
    }

    public static <E> ImmutableList<E> copyOf(List<E> src) {
        return new ImmutableList<>(src);
    }
}
