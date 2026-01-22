package io.github.georgecodes.benchmarking.orchestrator.application.job;

import jakarta.enterprise.context.ApplicationScoped;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Default admission policy allowing only one job at a time.
 */
@ApplicationScoped
public class SingleFlightJobAdmissionPolicy implements JobAdmissionPolicy {

  /**
   * Tracks whether a job is currently running.
   */
  private final AtomicBoolean busy = new AtomicBoolean(false);

  @Override
  public Admission acquire() {
    if (!busy.compareAndSet(false, true)) {
      throw new jakarta.ws.rs.ServiceUnavailableException("Orchestrator is busy running another job");
    }
    return () -> busy.set(false);
  }
}
