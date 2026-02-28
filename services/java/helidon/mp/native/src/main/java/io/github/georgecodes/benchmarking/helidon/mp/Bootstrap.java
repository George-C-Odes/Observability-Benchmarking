package io.github.georgecodes.benchmarking.helidon.mp;

// Force-link Helidon mapper SPI into the native image (prevents ServiceRegistry CNFE)
import io.helidon.common.mapper.spi.MapperProvider;
import io.helidon.common.mapper.Mappers;

/**
 * Native entrypoint that sets Weld's SingletonProvider property before CDI boot.
 * <p>
 * We can't rely on passing -D... as a command-line argument to a native image binary
 * because, unlike the JVM, native-image executables don't interpret -D as a system
 * property. We must set properties programmatically before the framework initializes.
 */
public final class Bootstrap {

    /** Weld implementation used as the default SingletonProvider when booting in a native image. */
    private static final String WELD_SINGLETON_PROVIDER = "org.jboss.weld.bootstrap.api.helpers.Singletons";

    /** System property key for Weld's helpers-level SingletonProvider selection. */
    private static final String PROP_WELD_HELPERS_SINGLETON_PROVIDER =
            "org.jboss.weld.bootstrap.api.helpers.SingletonProvider";

    /** System property key for Weld's API-level SingletonProvider selection. */
    private static final String PROP_WELD_API_SINGLETON_PROVIDER =
            "org.jboss.weld.bootstrap.api.SingletonProvider";

    /**
     * System property key that controls Weld preloading for {@code ProcessInjectionTarget}.
     * Disabled to avoid a native-image-only NPE during boot.
     */
    private static final String PROP_WELD_PRELOAD_PROCESS_INJECTION_TARGET =
            "org.jboss.weld.bootstrap.events.ContainerLifecycleEvents.PRELOAD_PROCESS_INJECTION_TARGET";

    private Bootstrap() {
    }

    /**
     * Force-link critical Helidon service classes into the native image.
     * <p>
     * These constants ensure the classes are reachable during GraalVM analysis.
     * Without them, native-image may prune the entire mapper module, causing
     * ClassNotFoundException at runtime when CoreServiceDiscovery tries to
     * resolve "io.helidon.common.mapper.spi.MapperProvider" from descriptors.
     */
    @SuppressWarnings("unused")
    private static final Class<?>[] FORCE_LINK = {
            MapperProvider.class,
            Mappers.class,
    };

    /**
     * Secondary force-link via getName() — GraalVM cannot eliminate this as dead code
     * because it has an observable side-effect (the string value may be used).
     */
    @SuppressWarnings("unused")
    private static final String FORCE_LINK_MAPPER = MapperProvider.class.getName();

    static void main(String[] args) {
        String provider = WELD_SINGLETON_PROVIDER;

        System.setProperty(PROP_WELD_HELPERS_SINGLETON_PROVIDER, provider);
        System.setProperty(PROP_WELD_API_SINGLETON_PROVIDER, provider);

        // Weld native-image workaround: disable ProcessInjectionTarget preloading which can NPE in native.
        System.setProperty(PROP_WELD_PRELOAD_PROCESS_INJECTION_TARGET, "false");

        // Diagnostics (native boot troubleshooting): prove properties are set before CDI init.
        System.err.println("[bootstrap] weld key helpers.SingletonProvider="
                           + System.getProperty(PROP_WELD_HELPERS_SINGLETON_PROVIDER));
        System.err.println("[bootstrap] weld key api.SingletonProvider="
                           + System.getProperty(PROP_WELD_API_SINGLETON_PROVIDER));
        System.err.println("[bootstrap] weld key events.PRELOAD_PROCESS_INJECTION_TARGET="
                           + System.getProperty(PROP_WELD_PRELOAD_PROCESS_INJECTION_TARGET));

        // Invoke Helidon Main.main() via reflection to prevent GraalVM analysis from
        // eagerly initializing Main.<clinit> → ContainerInstanceHolder → BuildTimeInitializer
        // during the analysis phase, which would deadlock on ForkJoinPool.
        try {
            Class<?> mainClass = Class.forName("io.helidon.microprofile.cdi.Main");
            var mainMethod = mainClass.getMethod("main", String[].class);
            mainMethod.invoke(null, (Object) args);
        } catch (ReflectiveOperationException e) {
            throw new RuntimeException("Failed to invoke Helidon Main.main()", e);
        }
    }
}