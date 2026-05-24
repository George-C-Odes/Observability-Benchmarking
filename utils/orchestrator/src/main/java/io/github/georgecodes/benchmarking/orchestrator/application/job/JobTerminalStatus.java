package io.github.georgecodes.benchmarking.orchestrator.application.job;

import io.github.georgecodes.benchmarking.orchestrator.domain.JobStatus;

/** Helper to map process exit/cancel state to a terminal {@link JobStatus}. */
public final class JobTerminalStatus {
  /** Utility class. */
  private JobTerminalStatus() {}

  /**
   * Resolves the terminal {@link JobStatus} from cancellation and exit-code state.
   *
   * @param canceled whether the job was canceled
   * @param exitCode the process exit code
   * @return the derived terminal job status
   */
  public static JobStatus from(boolean canceled, int exitCode) {
    if (canceled) {
      return JobStatus.CANCELED;
    }
    return exitCode == 0 ? JobStatus.SUCCEEDED : JobStatus.FAILED;
  }
}
