package io.github.georgecodes.benchmarking.helidon.mp.graalvm;

import org.graalvm.nativeimage.hosted.Feature;
import org.graalvm.nativeimage.hosted.RuntimeClassInitialization;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

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
 * Strategy: after CDI bootstrap (in {@code beforeAnalysis}), enumerate all classes
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
    @SuppressWarnings("unchecked")
    public List<Class<? extends Feature>> getRequiredFeatures() {
        try {
            Class<?> helidonFeature = Class.forName(
                    "io.helidon.integrations.graal.mp.nativeimage.extension.HelidonMpFeature");
            return List.of((Class<? extends Feature>) helidonFeature);
        } catch (ClassNotFoundException e) {
            System.out.println("[WeldProxyBuildTimeInitFeature] HelidonMpFeature not found – "
                    + "Feature ordering not guaranteed");
            return Collections.emptyList();
        }
    }

    @Override
    public void afterRegistration(AfterRegistrationAccess access) {
        System.setProperty("org.jboss.weld.executor.threadPoolType", "FIXED_TIMEOUT");
        System.setProperty("org.jboss.weld.executor.threadPoolSize", "1");
        System.out.println("[WeldProxyBuildTimeInitFeature] Set Weld executor: FIXED_TIMEOUT/1");

        // Package-level build-time init for all application classes.
        // NOTE: This covers regular classes but NOT dynamically generated Weld proxies.
        RuntimeClassInitialization.initializeAtBuildTime(
                "io.github.georgecodes.benchmarking"
        );
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

        System.out.println("[WeldProxyBuildTimeInitFeature] beforeAnalysis registered "
                           + registered.size() + " proxy class(es)");
    }

    /**
     * Wait for Helidon's CDI bootstrap to complete.
     * HelidonMpFeature stores the result in BuildTimeInitializer.container (AtomicReference).
     * We poll until it's non-null or timeout after 120 seconds.
     */
    private void waitForCdiBootstrap(ClassLoader cl) {
        System.out.println("[WeldProxyBuildTimeInitFeature] Waiting for CDI bootstrap...");
        try {
            // HelidonMpFeature stores CDI container in this static field
            Class<?> btiClass = Class.forName(
                    "io.helidon.microprofile.cdi.BuildTimeInitializer", false, cl);
            Field containerField = btiClass.getDeclaredField("container");
            containerField.setAccessible(true);

            long deadline = System.currentTimeMillis() + 120_000;
            while (System.currentTimeMillis() < deadline) {
                Object ref = containerField.get(null);
                if (ref != null) {
                    // ref is a CompletableFuture or similar — wait for its value
                    // Actually it's a GenericContainer — if non-null, bootstrap is done
                    System.out.println("[WeldProxyBuildTimeInitFeature] CDI bootstrap complete: "
                            + ref.getClass().getSimpleName());
                    return;
                }
                Thread.sleep(500);
            }
            System.out.println("[WeldProxyBuildTimeInitFeature] CDI bootstrap timeout after 120s");
        } catch (ClassNotFoundException e) {
            System.out.println("[WeldProxyBuildTimeInitFeature] BuildTimeInitializer not found, "
                    + "trying CDI.current() fallback");
            waitForCdiViaCurrentApi(cl);
        } catch (NoSuchFieldException e) {
            System.out.println("[WeldProxyBuildTimeInitFeature] No 'container' field in "
                    + "BuildTimeInitializer, trying CDI.current() fallback");
            waitForCdiViaCurrentApi(cl);
        } catch (Exception e) {
            System.out.println("[WeldProxyBuildTimeInitFeature] CDI wait error: "
                    + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    private void waitForCdiViaCurrentApi(ClassLoader cl) {
        try {
            // CDI.current() blocks until CDI is ready
            Class<?> cdiClass = Class.forName("jakarta.enterprise.inject.spi.CDI", false, cl);
            java.lang.reflect.Method currentMethod = cdiClass.getMethod("current");
            long deadline = System.currentTimeMillis() + 120_000;
            while (System.currentTimeMillis() < deadline) {
                try {
                    Object cdi = currentMethod.invoke(null);
                    if (cdi != null) {
                        System.out.println("[WeldProxyBuildTimeInitFeature] CDI.current() returned: "
                                + cdi.getClass().getSimpleName());
                        return;
                    }
                } catch (Exception e) {
                    // CDI not ready yet
                }
                Thread.sleep(500);
            }
            System.out.println("[WeldProxyBuildTimeInitFeature] CDI.current() timeout after 120s");
        } catch (Exception e) {
            System.out.println("[WeldProxyBuildTimeInitFeature] CDI.current() path failed: "
                    + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
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

        System.out.println("[WeldProxyBuildTimeInitFeature] Strategy 1 found "
                + (registered.size() - countBefore) + " proxy class(es) total from all paths");
    }

    private void tryPathViaHelidonCdiProvider(ClassLoader cl) {
        try {
            Class<?> providerClass = Class.forName(
                    "io.helidon.microprofile.cdi.HelidonCdiProvider", false, cl);

            // HelidonCdiProvider has a static AtomicReference field holding HelidonCdi
            for (Field f : providerClass.getDeclaredFields()) {
                f.setAccessible(true);
                Object fieldValue = f.get(null); // static fields
                if (fieldValue instanceof java.util.concurrent.atomic.AtomicReference<?> ref) {
                    Object helidonCdi = ref.get();
                    if (helidonCdi != null) {
                        System.out.println("[WeldProxyBuildTimeInitFeature] Path A: HelidonCdi = "
                                + helidonCdi.getClass().getName());
                        // HelidonCdi has 'bootstrap' field (WeldBootstrap)
                        Field bootstrapField = findFieldInHierarchy(helidonCdi.getClass(), "bootstrap");
                        if (bootstrapField != null) {
                            bootstrapField.setAccessible(true);
                            Object weldBootstrap = bootstrapField.get(helidonCdi);
                            if (weldBootstrap != null) {
                                System.out.println("[WeldProxyBuildTimeInitFeature] Path A: WeldBootstrap = "
                                        + weldBootstrap.getClass().getName());
                                Field runtimeField = findFieldInHierarchy(weldBootstrap.getClass(), "weldRuntime");
                                if (runtimeField != null) {
                                    runtimeField.setAccessible(true);
                                    Object weldRuntime = runtimeField.get(weldBootstrap);
                                    if (weldRuntime != null) {
                                        System.out.println("[WeldProxyBuildTimeInitFeature] Path A: WeldRuntime = "
                                                + weldRuntime.getClass().getName());
                                        // WeldRuntime has deploymentManager
                                        registerFromWeldRuntime(weldRuntime, "PathA");
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } catch (Exception e) {
            System.out.println("[WeldProxyBuildTimeInitFeature] Path A failed: "
                    + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    private void registerFromWeldRuntime(Object weldRuntime, String source) {
        try {
            // Try deploymentManager (single BeanManagerImpl)
            Field dmField = findFieldInHierarchy(weldRuntime.getClass(), "deploymentManager");
            if (dmField != null) {
                dmField.setAccessible(true);
                Object deploymentManager = dmField.get(weldRuntime);
                if (deploymentManager != null) {
                    System.out.println("[WeldProxyBuildTimeInitFeature] " + source
                            + ": deploymentManager = " + deploymentManager.getClass().getName());
                    registerProxiesFromBeanManager(deploymentManager, source + "-dm");
                }
            }

            // Try bdaToBeanManagerMap (all BeanManagers)
            Field bdaMapField = findFieldInHierarchy(weldRuntime.getClass(), "bdaToBeanManagerMap");
            if (bdaMapField != null) {
                bdaMapField.setAccessible(true);
                Object bdaMap = bdaMapField.get(weldRuntime);
                if (bdaMap instanceof java.util.Map<?, ?> map) {
                    System.out.println("[WeldProxyBuildTimeInitFeature] " + source
                            + ": bdaToBeanManagerMap has " + map.size() + " entries");
                    for (Object bm : map.values()) {
                        registerProxiesFromBeanManager(bm, source + "-bdaMap");
                    }
                }
            }
        } catch (Exception e) {
            System.out.println("[WeldProxyBuildTimeInitFeature] " + source + " runtime walk: "
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
                System.out.println("[WeldProxyBuildTimeInitFeature] Path B: Container.instance is null");
                return;
            }
            System.out.println("[WeldProxyBuildTimeInitFeature] Path B: singleton = "
                    + singleton.getClass().getName());

            // Print all fields for debugging
            for (Field f : singleton.getClass().getDeclaredFields()) {
                f.setAccessible(true);
                Object val = f.get(singleton);
                System.out.println("[WeldProxyBuildTimeInitFeature] Path B: singleton."
                        + f.getName() + " = " + (val == null ? "null" : val.getClass().getName()));
            }

            // Try 'store' or 'instances' or 'singletons' field
            Object container = null;
            for (String fieldName : new String[]{"store", "instances", "singletons"}) {
                Field storeField = findFieldInHierarchy(singleton.getClass(), fieldName);
                if (storeField != null) {
                    storeField.setAccessible(true);
                    Object store = storeField.get(singleton);
                    System.out.println("[WeldProxyBuildTimeInitFeature] Path B: " + fieldName
                            + " = " + (store == null ? "null" : store.getClass().getName()));
                    if (store instanceof java.util.Map<?, ?> map) {
                        for (Object val : map.values()) {
                            if (val != null && val.getClass().getName().equals("org.jboss.weld.Container")) {
                                container = val;
                                break;
                            }
                        }
                    }
                }
            }
            if (container == null) {
                System.out.println("[WeldProxyBuildTimeInitFeature] Path B: Container not found in store");
                return;
            }
            System.out.println("[WeldProxyBuildTimeInitFeature] Path B: container = "
                    + container.getClass().getName());

            // List all fields of Container for debugging
            for (Field f : container.getClass().getDeclaredFields()) {
                System.out.println("[WeldProxyBuildTimeInitFeature] Path B: container."
                        + f.getName() + " (" + f.getType().getSimpleName() + ")");
            }

            // Try beanDeploymentArchives
            Field bdaField = findFieldInHierarchy(container.getClass(), "beanDeploymentArchives");
            if (bdaField != null) {
                bdaField.setAccessible(true);
                Object bdaMap = bdaField.get(container);
                if (bdaMap instanceof java.util.Map<?, ?> map) {
                    System.out.println("[WeldProxyBuildTimeInitFeature] Path B: beanDeploymentArchives has "
                            + map.size() + " entries");
                    for (Object bm : map.values()) {
                        registerProxiesFromBeanManager(bm, "PathB");
                    }
                }
            }
        } catch (Exception e) {
            System.out.println("[WeldProxyBuildTimeInitFeature] Path B: "
                    + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    private void tryPathViaCdiCurrent(ClassLoader cl) {
        try {
            Class<?> cdiClass = Class.forName("jakarta.enterprise.inject.spi.CDI", false, cl);
            java.lang.reflect.Method currentMethod = cdiClass.getMethod("current");
            Object cdi = currentMethod.invoke(null);
            if (cdi == null) {
                System.out.println("[WeldProxyBuildTimeInitFeature] Path C: CDI.current() = null");
                return;
            }
            System.out.println("[WeldProxyBuildTimeInitFeature] Path C: CDI.current() = "
                    + cdi.getClass().getName());

            // CDI extends BeanManager provider: getBeanManager()
            java.lang.reflect.Method bmMethod = cdi.getClass().getMethod("getBeanManager");
            Object bm = bmMethod.invoke(cdi);
            if (bm != null) {
                System.out.println("[WeldProxyBuildTimeInitFeature] Path C: BeanManager = "
                        + bm.getClass().getName());
                registerProxiesFromBeanManager(bm, "PathC");

                // Also try to get the WeldRuntime from the BeanManager
                // BeanManagerImpl has methods to access internals
                if (bm.getClass().getName().contains("BeanManagerImpl")) {
                    for (Field f : bm.getClass().getDeclaredFields()) {
                        if (f.getName().equals("clientProxyProvider")) {
                            f.setAccessible(true);
                            Object cpp = f.get(bm);
                            if (cpp != null) {
                                System.out.println("[WeldProxyBuildTimeInitFeature] Path C: CPP = "
                                        + cpp.getClass().getName() + " → " + cpp);
                            }
                        }
                    }
                }
            }
        } catch (Exception e) {
            System.out.println("[WeldProxyBuildTimeInitFeature] Path C: "
                    + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    private void registerProxiesFromBeanManager(Object beanManager, String source) {
        if (beanManager == null) {
            return;
        }
        try {
            System.out.println("[WeldProxyBuildTimeInitFeature] " + source
                    + ": BM class = " + beanManager.getClass().getName());

            // Pre-populate the lazy proxy pools by requesting proxies for all beans
            prePopulateProxyPool(beanManager, source);

            Field cppField = findFieldInHierarchy(beanManager.getClass(), "clientProxyProvider");
            if (cppField == null) {
                System.out.println("[WeldProxyBuildTimeInitFeature] " + source
                        + ": no clientProxyProvider field");
                return;
            }
            cppField.setAccessible(true);
            Object proxyProvider = cppField.get(beanManager);
            if (proxyProvider == null) {
                System.out.println("[WeldProxyBuildTimeInitFeature] " + source
                        + ": clientProxyProvider is null");
                return;
            }
            System.out.println("[WeldProxyBuildTimeInitFeature] " + source
                    + ": CPP = " + proxyProvider.getClass().getName()
                    + " → " + proxyProvider);
            scanProxyPool(proxyProvider, "beanTypeClosureProxyPool", source);
            scanProxyPool(proxyProvider, "requestedTypeClosureProxyPool", source);
        } catch (Exception e) {
            System.out.println("[WeldProxyBuildTimeInitFeature] " + source + " BM walk: "
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
            java.lang.reflect.Method getBeansMethod = beanManager.getClass().getMethod("getBeans");
            Object beansObj = getBeansMethod.invoke(beanManager);
            if (!(beansObj instanceof Iterable<?> beans)) {
                System.out.println("[WeldProxyBuildTimeInitFeature] " + source
                        + ": getBeans() did not return Iterable");
                return;
            }

            Field cppField = findFieldInHierarchy(beanManager.getClass(), "clientProxyProvider");
            if (cppField == null) {
                return;
            }
            cppField.setAccessible(true);
            Object proxyProvider = cppField.get(beanManager);
            if (proxyProvider == null) {
                return;
            }

            // ClientProxyProvider.getClientProxy(Bean, Set<Type>)
            // or ClientProxyProvider.getClientProxy(Bean)
            java.lang.reflect.Method getClientProxyMethod = null;
            for (java.lang.reflect.Method m : proxyProvider.getClass().getMethods()) {
                if (m.getName().equals("getClientProxy") && m.getParameterCount() == 1) {
                    getClientProxyMethod = m;
                    break;
                }
            }
            if (getClientProxyMethod == null) {
                System.out.println("[WeldProxyBuildTimeInitFeature] " + source
                        + ": no getClientProxy(Bean) method found");
                return;
            }
            getClientProxyMethod.setAccessible(true);

            int triggered = 0;
            for (Object bean : beans) {
                try {
                    // Only trigger for normal-scoped beans (which need proxies)
                    String beanStr = bean.toString();
                    Object proxy = getClientProxyMethod.invoke(proxyProvider, bean);
                    if (proxy != null && isWeldProxy(proxy.getClass().getName())) {
                        tryRegisterClass(proxy.getClass(), source + "-prePopulate");
                        triggered++;
                    }
                } catch (Exception e) {
                    // Not all beans are proxyable — skip
                }
            }
            System.out.println("[WeldProxyBuildTimeInitFeature] " + source
                    + ": pre-populated " + triggered + " proxy(ies)");
        } catch (NoSuchMethodException e) {
            System.out.println("[WeldProxyBuildTimeInitFeature] " + source
                    + ": no getBeans() method");
        } catch (Exception e) {
            System.out.println("[WeldProxyBuildTimeInitFeature] " + source
                    + " prePopulate: " + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    private void scanProxyPool(Object proxyProvider, String poolFieldName, String source) {
        try {
            Field poolField = findFieldInHierarchy(proxyProvider.getClass(), poolFieldName);
            if (poolField == null) {
                System.out.println("[WeldProxyBuildTimeInitFeature] " + source
                        + ": no " + poolFieldName + " field. Fields: ");
                for (Field f : proxyProvider.getClass().getDeclaredFields()) {
                    System.out.println("[WeldProxyBuildTimeInitFeature]   - " + f.getName()
                            + " (" + f.getType().getSimpleName() + ")");
                }
                return;
            }
            poolField.setAccessible(true);
            Object pool = poolField.get(proxyProvider);
            if (pool == null) {
                System.out.println("[WeldProxyBuildTimeInitFeature] " + source
                        + ": " + poolFieldName + " is null");
                return;
            }

            System.out.println("[WeldProxyBuildTimeInitFeature] " + source
                    + ": " + poolFieldName + " = " + pool.getClass().getName());

            // pool is ReentrantMapBackedComputingCache
            Field mapField = findFieldInHierarchy(pool.getClass(), "map");
            if (mapField == null) {
                System.out.println("[WeldProxyBuildTimeInitFeature] " + source
                        + ": no 'map' field in " + pool.getClass().getName()
                        + ". Fields:");
                for (Field f : pool.getClass().getDeclaredFields()) {
                    System.out.println("[WeldProxyBuildTimeInitFeature]   - " + f.getName()
                            + " (" + f.getType().getSimpleName() + ")");
                }
                return;
            }
            mapField.setAccessible(true);
            Object map = mapField.get(pool);
            if (!(map instanceof java.util.Map<?, ?> chm)) {
                System.out.println("[WeldProxyBuildTimeInitFeature] " + source
                        + ": map is not a Map: " + (map == null ? "null" : map.getClass().getName()));
                return;
            }

            System.out.println("[WeldProxyBuildTimeInitFeature] " + source
                    + ": " + poolFieldName + ".map has " + chm.size() + " entries");

            for (Object value : chm.values()) {
                if (value == null) {
                    continue;
                }
                extractAndRegisterProxy(value, source);
            }
        } catch (Exception e) {
            System.out.println("[WeldProxyBuildTimeInitFeature] " + source + " pool: "
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
            Field valueField = findFieldInHierarchy(value.getClass(), "value");
            if (valueField != null) {
                valueField.setAccessible(true);
                Object inner = valueField.get(value);
                if (inner != null) {
                    String innerName = inner.getClass().getName();
                    if (isWeldProxy(innerName)) {
                        tryRegisterClass(inner.getClass(), source + "-lazy");
                    }
                }
            }
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
                Field classesField = findFieldInHierarchy(ClassLoader.class, "classes");
                if (classesField == null) {
                    break;
                }
                classesField.setAccessible(true);
                Object value = classesField.get(current);
                if (value instanceof java.util.Collection<?> coll) {
                    Object[] snapshot = coll.toArray();
                    for (Object item : snapshot) {
                        if (item instanceof Class<?> c && isWeldProxy(c.getName())) {
                            tryRegisterClass(c, "cl-field");
                        }
                    }
                }
            } catch (Exception e) {
                System.out.println("[WeldProxyBuildTimeInitFeature] cl-field: "
                        + e.getClass().getSimpleName() + ": " + e.getMessage());
            }
            current = current.getParent();
        }
        System.out.println("[WeldProxyBuildTimeInitFeature] Strategy 2 found "
                + (registered.size() - countBefore) + " proxy class(es) via ClassLoader.classes");
    }

    // ---- Strategy 3: Known proxy names via Class.forName() ----

    private void registerKnownProxiesByName(ClassLoader cl) {
        int countBefore = registered.size();
        // All @ApplicationScoped (normal-scoped) beans get a WeldClientProxy.
        // Produced interface types also get proxies in beanTypeClosureProxy.
        List<String> beanClassNames = new ArrayList<>();

        // Application beans
        beanClassNames.add("io.github.georgecodes.benchmarking.helidon.mp.infra.metrics.OtelConfig");
        beanClassNames.add("io.github.georgecodes.benchmarking.helidon.mp.infra.metrics.OpenTelemetry");
        beanClassNames.add("io.github.georgecodes.benchmarking.helidon.mp.infra.metrics.MicrometerMetricsAdapter");
        beanClassNames.add("io.github.georgecodes.benchmarking.helidon.mp.infra.metrics.JvmExtrasMetricsConfiguration");
        beanClassNames.add("io.github.georgecodes.benchmarking.helidon.mp.infra.cache.CaffeineCacheAdapter");
        beanClassNames.add("io.github.georgecodes.benchmarking.helidon.mp.infra.StartupListener");
        beanClassNames.add("io.github.georgecodes.benchmarking.helidon.mp.application.HelloService");
        beanClassNames.add("io.github.georgecodes.benchmarking.helidon.mp.web.HelloResource");
        beanClassNames.add("io.github.georgecodes.benchmarking.helidon.mp.web.HttpMetricsFilter");

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
        System.out.println("[WeldProxyBuildTimeInitFeature] Strategy 3 found "
                + (registered.size() - countBefore) + " proxy class(es) via Class.forName()");
    }

    // ---- Utility methods ----

    private boolean tryRegisterClass(Class<?> clazz, String source) {
        String name = clazz.getName();
        if (!isWeldProxy(name)) {
            return false;
        }
        if (registered.contains(name)) {
            return false;
        }

        try {
            RuntimeClassInitialization.initializeAtBuildTime(clazz);
            registered.add(name);
            System.out.println("[WeldProxyBuildTimeInitFeature] - build-time init ("
                               + source + "): " + name);
            return true;
        } catch (Exception e) {
            System.err.println("[WeldProxyBuildTimeInitFeature] FAILED ("
                               + source + "): " + name + " - " + e);
            return false;
        }
    }

    private Field findFieldInHierarchy(Class<?> clazz, String name) {
        Class<?> current = clazz;
        while (current != null) {
            try {
                return current.getDeclaredField(name);
            } catch (NoSuchFieldException e) {
                current = current.getSuperclass();
            }
        }
        return null;
    }

    private static boolean isWeldProxy(String className) {
        return className.contains("_$$_Weld")
               || className.contains("$Proxy$_$$_");
    }
}