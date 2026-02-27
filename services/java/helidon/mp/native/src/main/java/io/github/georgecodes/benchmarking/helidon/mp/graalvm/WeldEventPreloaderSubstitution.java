package io.github.georgecodes.benchmarking.helidon.mp.graalvm;

import com.oracle.svm.core.annotate.Substitute;
import com.oracle.svm.core.annotate.TargetClass;

/**
 * Native-image workaround for a Weld 5.1.x crash seen when Helidon MP boots in a native image.
 *
 * <p>Stacktrace shows:
 * <pre>
 * ContainerLifecycleEvents.preloadProcessInjectionTarget
 *   -> ContainerLifecycleEventPreloader.preloadContainerLifecycleEvent
 *   -> NullPointerException
 * </pre>
 *
 * <p>Helidon already provides a substitution for
 * {@code ContainerLifecycleEventPreloader#preloadContainerLifecycleEvent} so we must not
 * substitute that method (it causes a "conflicts with previously registered" error).
 *
 * <p>Instead we disable the caller side for the problematic preload hook.
 */
@TargetClass(className = "org.jboss.weld.bootstrap.events.ContainerLifecycleEvents")
final class WeldContainerLifecycleEventsSubstitution {

    @Substitute
    public void preloadProcessInjectionTarget(Class<?> type) {
        // no-op: prevents Weld's event preloading from running in native images
        // (the service boots fine without this preloading, and it avoids the runtime NPE)
    }

    @Substitute
    public void preloadProcessBeanAttributes(java.lang.reflect.Type type) {
        // no-op: prevents Weld's event preloading from running in native images
        // (the service boots fine without this preloading, and it avoids the runtime NPE)
    }

    @Substitute
    public <T extends jakarta.enterprise.inject.spi.ProcessBean<?>> void preloadProcessBean(
            Class<T> eventRawType,
            java.lang.reflect.Type... typeParameters
    ) {
        // no-op
    }

    @Substitute
    public void preloadProcessProducer(java.lang.reflect.Type... typeParameters) {
        // no-op
    }
}