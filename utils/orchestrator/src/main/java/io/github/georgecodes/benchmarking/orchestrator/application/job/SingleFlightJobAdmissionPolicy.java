package io.github.georgecodes.benchmarking.orchestrator.application.job;

import jakarta.enterprise.context.ApplicationScoped;
import java.util.concurrent.atomic.AtomicBoolean;

/** Default admission policy allowing only one job at a time. */
@ApplicationScoped
public class SingleFlightJobAdmissionPolicy implements JobAdmissionPolicy {

  /** Tracks whether a job is currently running. */
  private final AtomicBoolean busy = new AtomicBoolean(false);

  /**
   * Attempts to acquire the single available job-execution slot.
   *
   * @return an admission handle that releases the slot when closed
   * @throws JobAdmissionRejectedException when another job is already running
   */
  @Override
  public Admission acquire() {
    if (!busy.compareAndSet(false, true)) {
      throw new JobAdmissionRejectedException("Orchestrator is busy running another job");
    }
    return () -> busy.set(false);
  }
}
