package io.github.georgecodes.benchmarking.helidon.mp.graalvm;

import org.graalvm.nativeimage.hosted.Feature;
import org.graalvm.nativeimage.hosted.RuntimeClassInitialization;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.Collection;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.locks.LockSupport;

/**
 * GraalVM native-image Feature that ensures <b>all</b> Weld-generated client proxy
 * classes are marked for build-time initialization.
 * <p>
 * During Helidon MP's build-time CDI bootstrap ({@code HelidonMpFeature}), Weld
 * generates client proxy classes dynamically via its {@code ProxyFactory}.  These
 * proxy objects end up in the image heap, but GraalVM 25+ treats dynamically
 * generated classes as <em>run-time initialized by default</em>.
 * <p>
 * The string-based {@code --initialize-at-build-time=&lt;package&gt;} flag does NOT
 * apply to dynamically generated classes (Weld bytecode proxies). This Feature
 * uses {@code RuntimeClassInitialization.initializeAtBuildTime(Class&lt;?&gt;)} with
 * the actual {@code Class<?>} object to register each proxy.
 * <p>
 * Strategy: after CDI bootstrap (in {@code beforeAnalysis}), list all classes
 * loaded in the application classloader hierarchy and register any whose name
 * matches the Weld proxy naming convention ({@code *$_$$_Weld*}).
 *
 * <h3>Architecture note</h3>
 * <p>
 * This class intentionally consolidates three discovery strategies into a single
 * Feature implementation.  While the class is large, splitting it into separate
 * Feature classes would introduce shared-state coordination complexity (the
 * {@code registered} set, CDI bootstrap wait, and proxy pool population must
 * execute in a deterministic order within a single {@code beforeAnalysis} call).
 * GraalVM Features operate in a constrained build-time classloader context where
 * per-strategy state sharing across Feature instances is fragile.
 * <p>
 * Internal structure uses clearly separated regions:
 * <ul>
 *   <li>Strategy 1 — Walk Weld's proxy pools via reflection</li>
 *   <li>Strategy 2 — Enumerate loaded classes from {@code ClassLoader.classes}</li>
 *   <li>Strategy 3 — Brute-force load known proxy names via {@code Class.forName()}</li>
 * </ul>
 */
public class WeldProxyBuildTimeInitFeature implements Feature {

    /** Diagnostics emitted during native-image analysis. */
    private static final System.Logger LOGGER = System.getLogger(WeldProxyBuildTimeInitFeature.class.getName());

    /** Weld bean manager field that holds the client proxy pools. */
    private static final String CLIENT_PROXY_PROVIDER_FIELD = "clientProxyProvider";

    /** Suffix for diagnostics reporting the size of a reflected map. */
    private static final String ENTRIES_SUFFIX = " entries";

    /** Maximum time to wait for Helidon's CDI bootstrap to become observable. */
    private static final long CDI_WAIT_TIMEOUT_NANOS = TimeUnit.SECONDS.toNanos(120);

    /** Delay between CDI readiness checks while native-image bootstrap is still progressing. */
    private static final long CDI_POLL_INTERVAL_NANOS = TimeUnit.MILLISECONDS.toNanos(500);

    /** Track registered class names to avoid duplicates. */
    private final Set<String> registered = new HashSet<>();

    @Override
    public String getDescription() {
        return "Marks Weld client proxy classes for build-time initialization";
    }

    /**
     * Declare dependency on HelidonMpFeature so that our {@code beforeAnalysis}
     * runs <b>after</b> Helidon has bootstrapped CDI and populated
     * {@code BuildTimeInitializer.container}.
     */
    @Override
    public List<Class<? extends Feature>> getRequiredFeatures() {
        try {
            Class<? extends Feature> helidonFeature = Class.forName(
                    "io.helidon.integrations.graal.mp.nativeimage.extension.HelidonMpFeature")
                    .asSubclass(Feature.class);
            return List.of(helidonFeature);
        } catch (ClassNotFoundException e) {
            LOGGER.log(System.Logger.Level.WARNING, "HelidonMpFeature not found – "
                    + "Feature ordering not guaranteed");
            return Collections.emptyList();
        } catch (ClassCastException e) {
            LOGGER.log(System.Logger.Level.WARNING, "HelidonMpFeature does not "
                    + "implement Feature: " + e.getMessage());
            return Collections.emptyList();
        }
    }

    @Override
    public void afterRegistration(AfterRegistrationAccess access) {
        System.setProperty("org.jboss.weld.executor.threadPoolType", "FIXED_TIMEOUT");
        System.setProperty("org.jboss.weld.executor.threadPoolSize", "1");
        LOGGER.log(System.Logger.Level.INFO, "Set Weld executor: FIXED_TIMEOUT/1");
    }

    @Override
    public void beforeAnalysis(BeforeAnalysisAccess access) {
        ClassLoader cl = access.getApplicationClassLoader();

        // HelidonMpFeature.beforeAnalysis() starts CDI bootstrap asynchronously
        // on ForkJoinPool.commonPool(). We must wait for it to complete before
        // the proxy classes exist in the classloader.
        waitForCdiBootstrap(cl);

        // Strategy 1: Walk Weld's proxy pools via reflection to get Class objects directly.
        registerProxiesFromWeldContainer(cl);

        // Strategy 2: Enumerate loaded classes from ClassLoader.classes field.
        registerProxiesViaClassLoaderField(cl);

        // Strategy 3: Brute-force load known proxy names via Class.forName().
        // Weld proxy names follow: {beanClass}$_$$_WeldClientProxy
        // and: {beanClass}$_$$_WeldSubclass
        // After CDI bootstrap, these classes are defined in the classloader.
        registerKnownProxiesByName(cl);

        LOGGER.log(System.Logger.Level.INFO, "beforeAnalysis registered "
                           + registered.size() + " proxy class(es)");
    }

    /**
     * Wait for Helidon's CDI bootstrap to complete.
     * HelidonMpFeature stores the result in BuildTimeInitializer.container (AtomicReference).
     * We poll until it's non-null or timeout after 120 seconds.
     */
    private static void waitForCdiBootstrap(ClassLoader cl) {
        LOGGER.log(System.Logger.Level.INFO, "Waiting for CDI bootstrap...");
        try {
            // HelidonMpFeature stores CDI container in this static field
            Class<?> btiClass = Class.forName(
                    "io.helidon.microprofile.cdi.BuildTimeInitializer", false, cl);
            Field containerField = btiClass.getDeclaredField("container");
            containerField.setAccessible(true);

            long deadlineNanos = System.nanoTime() + CDI_WAIT_TIMEOUT_NANOS;
            while (System.nanoTime() < deadlineNanos) {
                Object ref = containerField.get(null);
                if (ref != null) {
                    // ref is a CompletableFuture or similar — wait for its value
                    // Actually it's a GenericContainer — if non-null, bootstrap is done
                    LOGGER.log(System.Logger.Level.INFO, "CDI bootstrap complete: "
                            + ref.getClass().getSimpleName());
                    return;
                }
                if (wasCdiPollInterrupted(deadlineNanos)) {
                    LOGGER.log(System.Logger.Level.WARNING, "CDI bootstrap wait interrupted");
                    Thread.currentThread().interrupt();
                    return;
                }
            }
            LOGGER.log(System.Logger.Level.WARNING, "CDI bootstrap timeout after 120s");
        } catch (ClassNotFoundException e) {
            LOGGER.log(System.Logger.Level.DEBUG, "BuildTimeInitializer not found, "
                    + "trying CDI.current() fallback");
            waitForCdiViaCurrentApi(cl);
        } catch (NoSuchFieldException e) {
            LOGGER.log(System.Logger.Level.DEBUG, "No 'container' field in "
                    + "BuildTimeInitializer, trying CDI.current() fallback");
            waitForCdiViaCurrentApi(cl);
        } catch (Exception e) {
            LOGGER.log(System.Logger.Level.WARNING, "CDI wait error: "
                    + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    private static void waitForCdiViaCurrentApi(ClassLoader cl) {
        try {
            // CDI.current() blocks until CDI is ready
            Class<?> cdiClass = Class.forName("jakarta.enterprise.inject.spi.CDI", false, cl);
            Method currentMethod = cdiClass.getMethod("current");
            long deadlineNanos = System.nanoTime() + CDI_WAIT_TIMEOUT_NANOS;
            while (System.nanoTime() < deadlineNanos) {
                try {
                    Object cdi = currentMethod.invoke(null);
                    if (cdi != null) {
                        LOGGER.log(System.Logger.Level.INFO, "CDI.current() returned: "
                                + cdi.getClass().getSimpleName());
                        return;
                    }
                } catch (Exception e) {
                    // CDI not ready yet
                }
                if (wasCdiPollInterrupted(deadlineNanos)) {
                    LOGGER.log(System.Logger.Level.WARNING, "CDI.current() wait interrupted");
                    Thread.currentThread().interrupt();
                    return;
                }
            }
            LOGGER.log(System.Logger.Level.WARNING, "CDI.current() timeout after 120s");
        } catch (Exception e) {
            LOGGER.log(System.Logger.Level.WARNING, "CDI.current() path failed: "
                    + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    private static boolean wasCdiPollInterrupted(long deadlineNanos) {
        long remainingNanos = deadlineNanos - System.nanoTime();
        if (remainingNanos <= 0) {
            return false;
        }

        LockSupport.parkNanos(Math.min(CDI_POLL_INTERVAL_NANOS, remainingNanos));
        return Thread.currentThread().isInterrupted();
    }


    // ---- Strategy 1: Walk Weld proxy pools via error-trace path ----

    private void registerProxiesFromWeldContainer(ClassLoader cl) {
        // The error trace shows the path:
        //   HelidonCdiProvider → AtomicReference → HelidonContainerImpl$HelidonCdi
        //   → WeldBootstrap → WeldRuntime → deploymentManager (BeanManagerImpl)
        //   → clientProxyProvider → beanTypeClosureProxyPool
        //
        // Also: WeldRuntime.bdaToBeanManagerMap → values → BeanManagerImpl
        //
        // Let's try BOTH paths.

        int countBefore = registered.size();

        // Path A: HelidonCdiProvider → AtomicReference → HelidonCdi → bootstrap → weldRuntime
        tryPathViaHelidonCdiProvider(cl);

        // Path B: Container singleton → services → BeanManagerImpl
        tryPathViaContainerSingleton(cl);

        // Path C: CDI.current() → BeanManager → clientProxyProvider
        tryPathViaCdiCurrent(cl);

        LOGGER.log(System.Logger.Level.INFO, "Strategy 1 found "
                + (registered.size() - countBefore) + " proxy class(es) total from all paths");
    }

    private void tryPathViaHelidonCdiProvider(ClassLoader cl) {
        try {
            Class<?> providerClass = Class.forName(
                    "io.helidon.microprofile.cdi.HelidonCdiProvider", false, cl);

            // HelidonCdiProvider has a static AtomicReference field holding HelidonCdi.
            for (Field f : providerClass.getDeclaredFields()) {
                f.setAccessible(true);
                if (f.get(null) instanceof AtomicReference<?> ref) {
                    registerFromHelidonCdi(ref.get());
                }
            }
        } catch (Exception e) {
            LOGGER.log(System.Logger.Level.DEBUG, "Path A failed: "
                    + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    private void registerFromHelidonCdi(Object helidonCdi) throws IllegalAccessException {
        if (helidonCdi == null) {
            return;
        }
        LOGGER.log(System.Logger.Level.DEBUG, "Path A: HelidonCdi = " + helidonCdi.getClass().getName());
        Optional<Object> bootstrap = readField(helidonCdi, "bootstrap");
        if (bootstrap.isEmpty()) {
            return;
        }
        Object weldBootstrap = bootstrap.get();
        LOGGER.log(System.Logger.Level.DEBUG, "Path A: WeldBootstrap = " + weldBootstrap.getClass().getName());
        readField(weldBootstrap, "weldRuntime").ifPresent(weldRuntime -> {
            LOGGER.log(System.Logger.Level.DEBUG, "Path A: WeldRuntime = " + weldRuntime.getClass().getName());
            registerFromWeldRuntime(weldRuntime);
        });
    }

    private void registerFromWeldRuntime(Object weldRuntime) {
        String source = "PathA";
        try {
            // Try deploymentManager (single BeanManagerImpl)
            readField(weldRuntime, "deploymentManager").ifPresent(deploymentManager -> {
                LOGGER.log(System.Logger.Level.DEBUG, source
                        + ": deploymentManager = " + deploymentManager.getClass().getName());
                registerProxiesFromBeanManager(deploymentManager, source + "-dm");
            });

            // Try bdaToBeanManagerMap (all BeanManagers)
            if (readField(weldRuntime, "bdaToBeanManagerMap").orElse(null) instanceof Map<?, ?> map) {
                LOGGER.log(System.Logger.Level.DEBUG, source
                        + ": bdaToBeanManagerMap has " + map.size() + ENTRIES_SUFFIX);
                for (Object bm : map.values()) {
                    registerProxiesFromBeanManager(bm, source + "-bdaMap");
                }
            }
        } catch (Exception e) {
            LOGGER.log(System.Logger.Level.DEBUG, source + " runtime walk: "
                    + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    private void tryPathViaContainerSingleton(ClassLoader cl) {
        try {
            Class<?> containerClass = Class.forName("org.jboss.weld.Container", false, cl);
            Field instanceField = containerClass.getDeclaredField("instance");
            instanceField.setAccessible(true);
            Object singleton = instanceField.get(null);
            if (singleton == null) {
                LOGGER.log(System.Logger.Level.DEBUG, "Path B: Container.instance is null");
                return;
            }
            LOGGER.log(System.Logger.Level.DEBUG, "Path B: singleton = "
                    + singleton.getClass().getName());

            // Print all fields for debugging
            for (Field f : singleton.getClass().getDeclaredFields()) {
                f.setAccessible(true);
                Object val = f.get(singleton);
                LOGGER.log(System.Logger.Level.DEBUG, "Path B: singleton."
                        + f.getName() + " = " + (val == null ? "null" : val.getClass().getName()));
            }

            Optional<Object> match = findContainerInSingleton(singleton, containerClass);
            if (match.isEmpty()) {
                LOGGER.log(System.Logger.Level.DEBUG, "Path B: Container not found in store");
                return;
            }
            Object container = match.get();
            LOGGER.log(System.Logger.Level.DEBUG, "Path B: container = "
                    + container.getClass().getName());

            // List all fields of Container for debugging
            for (Field f : container.getClass().getDeclaredFields()) {
                LOGGER.log(System.Logger.Level.DEBUG, "Path B: container."
                        + f.getName() + " (" + f.getType().getSimpleName() + ")");
            }

            // Try beanDeploymentArchives
            if (readField(container, "beanDeploymentArchives").orElse(null) instanceof Map<?, ?> map) {
                LOGGER.log(System.Logger.Level.DEBUG, "Path B: beanDeploymentArchives has "
                        + map.size() + ENTRIES_SUFFIX);
                for (Object bm : map.values()) {
                    registerProxiesFromBeanManager(bm, "PathB");
                }
            }
        } catch (Exception e) {
            LOGGER.log(System.Logger.Level.DEBUG, "Path B: "
                    + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    private static Optional<Object> findContainerInSingleton(Object singleton, Class<?> containerClass)
            throws IllegalAccessException {
        Optional<Object> container = Optional.empty();
        for (String fieldName : List.of("store", "instances", "singletons")) {
            Optional<Field> storeField = findFieldInHierarchy(singleton.getClass(), fieldName);
            if (storeField.isEmpty()) {
                continue;
            }
            Field field = storeField.get();
            field.setAccessible(true);
            Object store = field.get(singleton);
            LOGGER.log(System.Logger.Level.DEBUG, "Path B: " + fieldName
                    + " = " + (store == null ? "null" : store.getClass().getName()));
            if (store instanceof Map<?, ?> map) {
                for (Object value : map.values()) {
                    if (containerClass.isInstance(value)) {
                        container = Optional.of(value);
                        break;
                    }
                }
            }
        }
        return container;
    }

    private void tryPathViaCdiCurrent(ClassLoader cl) {
        try {
            Class<?> cdiClass = Class.forName("jakarta.enterprise.inject.spi.CDI", false, cl);
            Method currentMethod = cdiClass.getMethod("current");
            Object cdi = currentMethod.invoke(null);
            if (cdi == null) {
                LOGGER.log(System.Logger.Level.DEBUG, "Path C: CDI.current() = null");
                return;
            }
            LOGGER.log(System.Logger.Level.DEBUG, "Path C: CDI.current() = "
                    + cdi.getClass().getName());

            // CDI extends BeanManager provider: getBeanManager()
            Method bmMethod = cdi.getClass().getMethod("getBeanManager");
            Object beanManager = bmMethod.invoke(cdi);
            if (beanManager != null) {
                LOGGER.log(System.Logger.Level.DEBUG, "Path C: BeanManager = "
                        + beanManager.getClass().getName());
                registerProxiesFromBeanManager(beanManager, "PathC");
            }
        } catch (Exception e) {
            LOGGER.log(System.Logger.Level.DEBUG, "Path C: "
                    + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    private void registerProxiesFromBeanManager(Object beanManager, String source) {
        if (beanManager == null) {
            return;
        }
        try {
            LOGGER.log(System.Logger.Level.DEBUG, source
                    + ": BM class = " + beanManager.getClass().getName());

            // Pre-populate the lazy proxy pools by requesting proxies for all beans
            prePopulateProxyPool(beanManager, source);

            Optional<Field> proxyProviderField = findFieldInHierarchy(beanManager.getClass(),
                    CLIENT_PROXY_PROVIDER_FIELD);
            if (proxyProviderField.isEmpty()) {
                LOGGER.log(System.Logger.Level.DEBUG, source
                        + ": no clientProxyProvider field");
                return;
            }
            Field cppField = proxyProviderField.get();
            cppField.setAccessible(true);
            Object proxyProvider = cppField.get(beanManager);
            if (proxyProvider == null) {
                LOGGER.log(System.Logger.Level.DEBUG, source
                        + ": clientProxyProvider is null");
                return;
            }
            LOGGER.log(System.Logger.Level.DEBUG, () -> source
                    + ": CPP = " + proxyProvider.getClass().getName() + " → " + proxyProvider);
            scanProxyPool(proxyProvider, "beanTypeClosureProxyPool", source);
            scanProxyPool(proxyProvider, "requestedTypeClosureProxyPool", source);
        } catch (Exception e) {
            LOGGER.log(System.Logger.Level.DEBUG, source + " BM walk: "
                    + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    /**
     * Pre-populate the lazy ClientProxyProvider pool by calling
     * {@code ClientProxyProvider.getClientProxy(bean)} for each normal-scoped bean.
     * The proxy pool is a ComputingCache that creates proxies on-demand.
     */
    private void prePopulateProxyPool(Object beanManager, String source) {
        try {
            // BeanManagerImpl.getBeans() returns all beans
            Method getBeansMethod = beanManager.getClass().getMethod("getBeans");
            Object beansObj = getBeansMethod.invoke(beanManager);
            if (!(beansObj instanceof Iterable<?> beans)) {
                LOGGER.log(System.Logger.Level.DEBUG, source
                        + ": getBeans() did not return Iterable");
                return;
            }

            Optional<Object> provider = readField(beanManager, CLIENT_PROXY_PROVIDER_FIELD);
            if (provider.isEmpty()) {
                return;
            }
            Object proxyProvider = provider.get();

            // ClientProxyProvider.getClientProxy(Bean, Set<Type>)
            // or ClientProxyProvider.getClientProxy(Bean)
            Optional<Method> clientProxyMethod = Arrays.stream(proxyProvider.getClass().getMethods())
                    .filter(method -> method.getName().equals("getClientProxy") && method.getParameterCount() == 1)
                    .findFirst();
            if (clientProxyMethod.isEmpty()) {
                LOGGER.log(System.Logger.Level.DEBUG, source
                        + ": no getClientProxy(Bean) method found");
                return;
            }
            Method getClientProxyMethod = clientProxyMethod.get();
            getClientProxyMethod.setAccessible(true);

            int triggered = 0;
            for (Object bean : beans) {
                try {
                    // Only trigger for normal-scoped beans (which need proxies)
                    Object proxy = getClientProxyMethod.invoke(proxyProvider, bean);
                    if (proxy != null && isWeldProxy(proxy.getClass().getName())) {
                        tryRegisterClass(proxy.getClass(), source + "-prePopulate");
                        triggered++;
                    }
                } catch (Exception e) {
                    // Not all beans are proxyable — skip
                }
            }
            LOGGER.log(System.Logger.Level.DEBUG, source
                    + ": pre-populated " + triggered + " proxy(ies)");
        } catch (NoSuchMethodException e) {
            LOGGER.log(System.Logger.Level.DEBUG, source
                    + ": no getBeans() method");
        } catch (Exception e) {
            LOGGER.log(System.Logger.Level.DEBUG, source
                    + " prePopulate: " + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    private void scanProxyPool(Object proxyProvider, String poolFieldName, String source) {
        try {
            Optional<Field> proxyPoolField = findFieldInHierarchy(proxyProvider.getClass(), poolFieldName);
            if (proxyPoolField.isEmpty()) {
                LOGGER.log(System.Logger.Level.DEBUG, source
                        + ": no " + poolFieldName + " field. Fields: ");
                for (Field f : proxyProvider.getClass().getDeclaredFields()) {
                    LOGGER.log(System.Logger.Level.DEBUG, "  - " + f.getName()
                            + " (" + f.getType().getSimpleName() + ")");
                }
                return;
            }
            Field poolField = proxyPoolField.get();
            poolField.setAccessible(true);
            Object pool = poolField.get(proxyProvider);
            if (pool == null) {
                LOGGER.log(System.Logger.Level.DEBUG, source
                        + ": " + poolFieldName + " is null");
                return;
            }

            LOGGER.log(System.Logger.Level.DEBUG, source
                    + ": " + poolFieldName + " = " + pool.getClass().getName());

            // pool is ReentrantMapBackedComputingCache
            Optional<Field> backingMapField = findFieldInHierarchy(pool.getClass(), "map");
            if (backingMapField.isEmpty()) {
                LOGGER.log(System.Logger.Level.DEBUG, source
                        + ": no 'map' field in " + pool.getClass().getName()
                        + ". Fields:");
                for (Field f : pool.getClass().getDeclaredFields()) {
                    LOGGER.log(System.Logger.Level.DEBUG, "  - " + f.getName()
                            + " (" + f.getType().getSimpleName() + ")");
                }
                return;
            }
            Field mapField = backingMapField.get();
            mapField.setAccessible(true);
            Object map = mapField.get(pool);
            if (!(map instanceof Map<?, ?> chm)) {
                LOGGER.log(System.Logger.Level.DEBUG, source
                        + ": map is not a Map: " + (map == null ? "null" : map.getClass().getName()));
                return;
            }

            LOGGER.log(System.Logger.Level.DEBUG, source
                    + ": " + poolFieldName + ".map has " + chm.size() + ENTRIES_SUFFIX);

            for (Object value : chm.values()) {
                if (value == null) {
                    continue;
                }
                extractAndRegisterProxy(value, source);
            }
        } catch (Exception e) {
            LOGGER.log(System.Logger.Level.DEBUG, source + " pool: "
                    + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    private void extractAndRegisterProxy(Object value, String source) {
        // Value might be a proxy instance directly or a LazyValueHolder wrapping it
        String valClassName = value.getClass().getName();
        if (isWeldProxy(valClassName)) {
            tryRegisterClass(value.getClass(), source + "-direct");
            return;
        }
        // Try LazyValueHolder.value
        try {
            readField(value, "value").ifPresent(inner -> {
                if (isWeldProxy(inner.getClass().getName())) {
                    tryRegisterClass(inner.getClass(), source + "-lazy");
                }
            });
        } catch (Exception e) {
            // skip
        }
    }

    // ---- Strategy 2: ClassLoader.classes field ----

    private void registerProxiesViaClassLoaderField(ClassLoader cl) {
        int countBefore = registered.size();
        ClassLoader current = cl;
        while (current != null) {
            try {
                Optional<Field> loadedClassesField = findFieldInHierarchy(ClassLoader.class, "classes");
                if (loadedClassesField.isEmpty()) {
                    break;
                }
                Field classesField = loadedClassesField.get();
                classesField.setAccessible(true);
                Object value = classesField.get(current);
                if (value instanceof Collection<?> coll) {
                    Object[] snapshot = coll.toArray();
                    for (Object item : snapshot) {
                        if (item instanceof Class<?> c && isWeldProxy(c.getName())) {
                            tryRegisterClass(c, "cl-field");
                        }
                    }
                }
            } catch (Exception e) {
                LOGGER.log(System.Logger.Level.DEBUG, "cl-field: "
                        + e.getClass().getSimpleName() + ": " + e.getMessage());
            }
            current = current.getParent();
        }
        LOGGER.log(System.Logger.Level.INFO, "Strategy 2 found "
                + (registered.size() - countBefore) + " proxy class(es) via ClassLoader.classes");
    }

    // ---- Strategy 3: Known proxy names via Class.forName() ----

    private void registerKnownProxiesByName(ClassLoader cl) {
        int countBefore = registered.size();
        // All @ApplicationScoped (normal-scoped) beans get a WeldClientProxy.
        // Produced interface types also get proxies in beanTypeClosureProxy.
        List<String> beanClassNames = getKnownBeanClassNames();

        // Weld proxy suffixes
        String[] suffixes = {"$_$$_WeldClientProxy", "$_$$_WeldSubclass"};

        for (String beanClassName : beanClassNames) {
            for (String suffix : suffixes) {
                String proxyClassName = beanClassName + suffix;
                try {
                    Class<?> proxyClass = Class.forName(proxyClassName, false, cl);
                    tryRegisterClass(proxyClass, "forName");
                } catch (ClassNotFoundException e) {
                    // expected — not all beans get proxies
                }
            }
        }
        LOGGER.log(System.Logger.Level.INFO, "Strategy 3 found "
                + (registered.size() - countBefore) + " proxy class(es) via Class.forName()");
    }

    private static List<String> getKnownBeanClassNames() {
        return List.of(
                "io.github.georgecodes.benchmarking.helidon.mp.infra.metrics.MicrometerMetricsAdapter",
                "io.github.georgecodes.benchmarking.helidon.mp.infra.metrics.JvmExtrasMetricsConfiguration",
                "io.github.georgecodes.benchmarking.helidon.mp.infra.cache.CaffeineCacheAdapter",
                "io.github.georgecodes.benchmarking.helidon.mp.infra.StartupListener",
                "io.github.georgecodes.benchmarking.helidon.mp.application.HelloService",
                "io.github.georgecodes.benchmarking.helidon.mp.web.HelloResource",
                "io.github.georgecodes.benchmarking.helidon.mp.web.HttpMetricsFilter");
    }

    // ---- Utility methods ----

    private void tryRegisterClass(Class<?> clazz, String source) {
        String name = clazz.getName();
        if (!isWeldProxy(name)) {
            return;
        }
        if (registered.contains(name)) {
            return;
        }

        try {
            RuntimeClassInitialization.initializeAtBuildTime(clazz);
            registered.add(name);
            LOGGER.log(System.Logger.Level.DEBUG, "- build-time init ("
                               + source + "): " + name);
        } catch (Exception e) {
            LOGGER.log(System.Logger.Level.ERROR, "FAILED ("
                               + source + "): " + name + " - " + e);
        }
    }

    private static Optional<Object> readField(Object target, String name) throws IllegalAccessException {
        Optional<Field> field = findFieldInHierarchy(target.getClass(), name);
        if (field.isEmpty()) {
            return Optional.empty();
        }
        Field accessibleField = field.get();
        accessibleField.setAccessible(true);
        return Optional.ofNullable(accessibleField.get(target));
    }

    private static Optional<Field> findFieldInHierarchy(Class<?> clazz, String name) {
        Class<?> current = clazz;
        while (current != null) {
            try {
                return Optional.of(current.getDeclaredField(name));
            } catch (NoSuchFieldException e) {
                current = current.getSuperclass();
            }
        }
        return Optional.empty();
    }

    private static boolean isWeldProxy(String className) {
        return className.contains("_$$_Weld")
               || className.contains("$Proxy$_$$_");
    }
}
