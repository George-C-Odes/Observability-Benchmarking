package io.opentelemetry.api.internal;

import io.opentelemetry.context.Context;

/**
 * Compatibility bridge for libraries that still reference the pre-1.63.0 package name.
 */
public final class InstrumentationUtil {

    private InstrumentationUtil() {
    }

    public static void suppressInstrumentation(Runnable runnable) {
        io.opentelemetry.api.impl.InstrumentationUtil.suppressInstrumentation(runnable);
    }

    public static boolean shouldSuppressInstrumentation(Context context) {
        return io.opentelemetry.api.impl.InstrumentationUtil.shouldSuppressInstrumentation(context);
    }
}

