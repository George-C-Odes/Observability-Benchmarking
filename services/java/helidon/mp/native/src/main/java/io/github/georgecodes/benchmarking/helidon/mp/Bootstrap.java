package io.github.georgecodes.benchmarking.helidon.mp;

// Force-link Helidon mapper SPI into the native image (prevents ServiceRegistry CNFE)
import io.helidon.common.mapper.spi.MapperProvider;
import io.helidon.common.mapper.Mappers;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Native entrypoint that sets Weld's SingletonProvider property before CDI boot.
 * <p>
 * We can't rely on passing -D... as a command-line argument to a native image binary
 * because, unlike the JVM, native-image executables don't interpret -D as a system
 * property in every deployment mode. We must set properties programmatically before
 * the framework initializes.
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

    /** Prefix for command-line arguments that should become Java system properties. */
    private static final String SYSTEM_PROPERTY_ARGUMENT_PREFIX = "-D";

    /** OpenTelemetry environment prefix used by Docker Compose and the OTel SDK. */
    private static final String OTEL_ENVIRONMENT_PREFIX = "OTEL_";

    /** Environment variables with non-mechanical system-property names. */
    private static final Map<String, String> SPECIAL_OTEL_ENVIRONMENT_PROPERTIES = Map.of(
            "OTEL_SERVICE_NAME", "otel.service.name"
    );

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
        String[] applicationArgs = installSystemPropertiesFromArguments(args);
        promoteOtelEnvironmentToSystemProperties();

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
            mainMethod.invoke(null, (Object) applicationArgs);
        } catch (ReflectiveOperationException e) {
            throw new RuntimeException("Failed to invoke Helidon Main.main()", e);
        }
    }

    private static String[] installSystemPropertiesFromArguments(String[] args) {
        List<String> applicationArgs = new ArrayList<>(args.length);
        for (String arg : args) {
            if (arg.startsWith(SYSTEM_PROPERTY_ARGUMENT_PREFIX)
                    && arg.length() > SYSTEM_PROPERTY_ARGUMENT_PREFIX.length()) {
                installSystemProperty(arg.substring(SYSTEM_PROPERTY_ARGUMENT_PREFIX.length()));
            } else {
                applicationArgs.add(arg);
            }
        }
        return applicationArgs.toArray(String[]::new);
    }

    private static void installSystemProperty(String assignment) {
        int separator = assignment.indexOf('=');
        if (separator > 0) {
            System.setProperty(assignment.substring(0, separator), assignment.substring(separator + 1));
        } else if (!assignment.isBlank()) {
            System.setProperty(assignment, "true");
        }
    }

    private static void promoteOtelEnvironmentToSystemProperties() {
        for (Map.Entry<String, String> entry : System.getenv().entrySet()) {
            String name = entry.getKey();
            if (!name.startsWith(OTEL_ENVIRONMENT_PREFIX)) {
                continue;
            }

            String propertyName = SPECIAL_OTEL_ENVIRONMENT_PROPERTIES.getOrDefault(
                    name,
                    name.toLowerCase(Locale.ROOT).replace('_', '.'));

            System.setProperty(propertyName, System.getProperty(propertyName, entry.getValue()));
        }
    }
}
