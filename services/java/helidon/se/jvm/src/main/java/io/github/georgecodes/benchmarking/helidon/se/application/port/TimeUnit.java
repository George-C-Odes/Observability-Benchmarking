package io.github.georgecodes.benchmarking.helidon.se.application.port;

/**
 * Minimal time units used by {@link SleepPort}.
 * <p>
 * Each constant knows how to convert a duration to milliseconds,
 * so adapters never need a {@code switch} — adding a new unit
 * doesn't force changes in existing implementations (OCP).
 */
public enum TimeUnit {
    /** Milliseconds unit. */
    MILLISECONDS {
        @Override
        public long toMillis(long duration) {
            return duration;
        }
    },
    /** Seconds unit. */
    SECONDS {
        @Override
        public long toMillis(long duration) {
            return duration * 1_000L;
        }
    };

    /**
     * Converts the given duration in this unit to milliseconds.
     *
     * @param duration the duration value
     * @return equivalent duration in milliseconds
     */
    public abstract long toMillis(long duration);
}