package io.github.georgecodes.benchmarking.dropwizard;

import com.github.benmanes.caffeine.cache.Cache;
import io.dropwizard.configuration.ResourceConfigurationSourceProvider;
import io.dropwizard.core.Application;
import io.dropwizard.core.server.AbstractServerFactory;
import io.dropwizard.core.setup.Bootstrap;
import io.dropwizard.core.setup.Environment;
import io.github.georgecodes.benchmarking.dropwizard.config.DropwizardServiceConfiguration;
import io.github.georgecodes.benchmarking.dropwizard.config.ServiceConfig;
import io.github.georgecodes.benchmarking.dropwizard.domain.HelloService;
import io.github.georgecodes.benchmarking.dropwizard.infra.CacheProvider;
import io.github.georgecodes.benchmarking.dropwizard.infra.MetricsProvider;
import io.github.georgecodes.benchmarking.dropwizard.web.HelloResource;
import io.github.georgecodes.benchmarking.dropwizard.web.ReadyResource;
import io.micrometer.core.instrument.MeterRegistry;
import org.eclipse.jetty.server.Connector;
import org.eclipse.jetty.server.ServerConnector;
import org.jspecify.annotations.NonNull;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.TreeSet;

/**
 * Dropwizard JVM application entry point.
 */
public final class DropwizardApplication extends Application<DropwizardServiceConfiguration> {

    /** Logger for application lifecycle and configuration output. */
    private static final Logger LOG = LoggerFactory.getLogger(DropwizardApplication.class);

    /** Default config file resolved from the classpath. */
    private static final String DEFAULT_CONFIG = "dropwizard-config.yml";

    /** True when launched without CLI args (IDE mode) — config is on the classpath. */
    private boolean classpathConfig;

    static void main(String[] args) throws Exception {
        var app = new DropwizardApplication();
        // When launched without arguments (e.g. from the IDE), default to
        // "server <classpath-config>" so the app starts immediately.
        if (args == null || args.length == 0) {
            app.classpathConfig = true;
            args = new String[]{"server", DEFAULT_CONFIG};
        }
        app.run(args);
    }

    @Override
    public String getName() {
        return "dropwizard-benchmark";
    }

    @Override
    public void initialize(Bootstrap<DropwizardServiceConfiguration> bootstrap) {
        // IDE mode: resolve from classpath (target/classes/).
        // Docker mode (args provided): keep the default FileConfigurationSourceProvider
        // which reads the absolute filesystem path passed in the ENTRYPOINT.
        if (classpathConfig) {
            bootstrap.setConfigurationSourceProvider(new ResourceConfigurationSourceProvider());
        }
    }

    @Override
    public void run(DropwizardServiceConfiguration configuration, Environment environment) {
        ServiceConfig config = ServiceConfig.fromEnvironment();

        LOG.info("Init thread: {}", Thread.currentThread());
        Runtime runtime = Runtime.getRuntime();
        LOG.info("Heap in MB = Max:{}, Total:{}, Free:{}",
            runtime.maxMemory() / 1024 / 1024,
            runtime.totalMemory() / 1024 / 1024,
            runtime.freeMemory() / 1024 / 1024);
        LOG.info("Available Processors:{}", runtime.availableProcessors());
        LOG.info("THREAD_MODE={} SERVICE_PORT={}", config.threadMode(), config.port());

        MeterRegistry meterRegistry = MetricsProvider.bindToGlobal();
        Cache<@NonNull String, String> cache = CacheProvider.create(config.cacheSize());
        HelloService helloService = new HelloService(cache);

        // Configure Jetty thread pool based on thread mode.
        // This modifies the ServerFactory's thread pool BEFORE the Jetty server is created,
        // ensuring all requests use the correct thread model from the start.
        configureJettyThreadPool(configuration, config);

        // Register JAX-RS resources.
        environment.jersey().register(new HelloResource(config, helloService, meterRegistry));
        environment.jersey().register(new ReadyResource());

        // Tune Jetty connectors after the server lifecycle starts.
        environment.lifecycle().addServerLifecycleListener(server -> {
            for (Connector connector : server.getConnectors()) {
                if (connector instanceof ServerConnector sc) {
                    sc.setAcceptQueueSize(config.jettyAcceptQueueSize());
                    sc.setIdleTimeout(config.jettyIdleTimeoutMs());
                    sc.setAcceptedTcpNoDelay(true);
                }
            }
        });

        if (Boolean.parseBoolean(System.getenv("LOG_METERS"))) {
            var meterNames = new TreeSet<String>();
            meterRegistry.getMeters().forEach(m -> meterNames.add(m.getId().getName()));
            LOG.info("Registered meters ({}): {}", meterNames.size(), meterNames);
        }

        LOG.info("Dropwizard service configured for THREAD_MODE={}", config.threadMode());
    }

    private static void configureJettyThreadPool(
        DropwizardServiceConfiguration configuration,
        ServiceConfig config
    ) {
        // Access Dropwizard's ServerFactory to configure the Jetty thread pool
        // BEFORE the server is built. This guarantees the correct thread model
        // from the very first request.
        if (!(configuration.getServerFactory() instanceof AbstractServerFactory serverFactory)) {
            LOG.warn("ServerFactory is not AbstractServerFactory ({}), thread pool tuning skipped",
                configuration.getServerFactory().getClass().getName());
            return;
        }

        if (config.threadMode() == ServiceConfig.ThreadMode.VIRTUAL) {
            // Dropwizard 5.x natively supports virtual threads via setEnableVirtualThreads().
            // Internally, the server factory creates a QueuedThreadPool with a virtual-thread
            // executor, so acceptor/selector threads remain platform threads while every
            // request-handling task runs on a virtual thread.
            serverFactory.setEnableVirtualThreads(true);
            LOG.info("Dropwizard ServerFactory configured with enableVirtualThreads=true");
        } else {
            // Platform mode: configure thread pool sizing for max throughput on limited vCPUs.
            int maxThreads = config.jettyMaxThreads() > 0
                ? config.jettyMaxThreads()
                : Math.max(8, Runtime.getRuntime().availableProcessors() * 8);
            int minThreads = config.jettyMinThreads() > 0
                ? config.jettyMinThreads()
                : Math.max(2, Runtime.getRuntime().availableProcessors());

            serverFactory.setMaxThreads(maxThreads);
            serverFactory.setMinThreads(minThreads);
            LOG.info("Jetty QueuedThreadPool: maxThreads={}, minThreads={}", maxThreads, minThreads);
        }
    }
}