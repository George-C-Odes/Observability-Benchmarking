package io.github.georgecodes.benchmarking.orchestrator.application;

import io.github.georgecodes.benchmarking.orchestrator.application.health.HealthAggregate;
import io.github.georgecodes.benchmarking.orchestrator.application.health.HealthEndpoint;
import io.github.georgecodes.benchmarking.orchestrator.application.health.HealthProbeClient;
import io.github.georgecodes.benchmarking.orchestrator.application.health.ServiceHealth;
import io.smallrye.mutiny.Multi;
import io.smallrye.mutiny.Uni;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Aggregates health/readiness checks for the docker-compose stack. This belongs in the orchestrator
 * (backend), so browser/mobile clients don't need to know internal docker DNS names.
 */
@ApplicationScoped
public class ServiceHealthService {

  /** Special base-url value meaning this service is intentionally disabled for health checks. */
  private static final String DISABLED_BASE_URL = "false";

  /**
   * Health-check configuration loaded from application config under {@code orchestrator.health.*}.
   *
   * <p>This drives which services are probed (service name -> base URL and health path).
   */
  private final ServiceHealthConfig config;

  /** Probe client port used to perform individual endpoint checks. */
  private final HealthProbeClient probeClient;

  /**
   * @param config health-check configuration describing target services and timeouts
   * @param probeClient client port for probing one health endpoint
   */
  @Inject
  public ServiceHealthService(ServiceHealthConfig config, HealthProbeClient probeClient) {
    this.config = config;
    this.probeClient = probeClient;
  }

  /**
   * Builds the list of configured service endpoints that should be health-checked.
   *
   * @return the enabled endpoint definitions derived from configuration
   */
  private List<HealthEndpoint> endpoints() {
    Map<String, ServiceHealthConfig.Service> cfgs = config.services();
    if (cfgs == null || cfgs.isEmpty()) {
      return List.of();
    }

    List<HealthEndpoint> result = new ArrayList<>(cfgs.size());
    for (Map.Entry<String, ServiceHealthConfig.Service> e : cfgs.entrySet()) {
      String name = e.getKey();
      ServiceHealthConfig.Service cfg = e.getValue();
      if (cfg == null) {
        continue;
      }

      String baseUrl = cfg.baseUrl().orElse(null);
      if (baseUrl == null || baseUrl.isBlank()) {
        continue;
      }
      if (DISABLED_BASE_URL.equalsIgnoreCase(baseUrl.trim())) {
        continue;
      }

      result.add(new HealthEndpoint(name, baseUrl, cfg.healthPath()));
    }

    return result;
  }

  /**
   * Checks all configured services, optionally filtering to a single named service.
   *
   * @param onlyService optional service name filter; when blank, all services are checked
   * @return an asynchronous aggregate response containing the health result set
   */
  public Uni<HealthAggregate> checkAll(String onlyService) {
    final List<HealthEndpoint> selected =
        (onlyService != null && !onlyService.isBlank())
            ? endpoints().stream().filter(e -> e.name().equals(onlyService)).toList()
            : endpoints();

    int batchSize = Math.max(1, config.concurrency());

    return Multi.createFrom()
        .iterable(selected)
        .group()
        .intoLists()
        .of(batchSize)
        .onItem()
        .transformToUniAndMerge(
            batch ->
                Multi.createFrom()
                    .iterable(batch)
                    .onItem()
                    .transformToUniAndMerge(this::checkOne)
                    .collect()
                    .asList())
        .collect()
        .asList()
        .map(
            batches -> {
              List<ServiceHealth> all = batches.stream().flatMap(List::stream).toList();
              return new HealthAggregate(all);
            });
  }

  /**
   * Checks a single configured endpoint and converts the result into a response model.
   *
   * @param endpoint the endpoint definition to probe
   * @return the asynchronous health result for the endpoint
   */
  private Uni<ServiceHealth> checkOne(HealthEndpoint endpoint) {
    long timeoutMs = config.timeoutMs() > 0 ? config.timeoutMs() : 10000;
    return probeClient.probe(endpoint, timeoutMs);
  }
}
