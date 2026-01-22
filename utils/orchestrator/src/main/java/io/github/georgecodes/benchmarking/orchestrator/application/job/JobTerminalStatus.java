package io.github.georgecodes.benchmarking.orchestrator.application.job;

import io.github.georgecodes.benchmarking.orchestrator.application.JobManager;

/**
 * Helper to map process exit/cancel state to a terminal {@link JobManager.Status}.
 */
public final class JobTerminalStatus {
  private JobTerminalStatus() { }

  public static JobManager.Status from(boolean canceled, int exitCode) {
    if (canceled) {
      return JobManager.Status.CANCELED;
    }
    return exitCode == 0 ? JobManager.Status.SUCCEEDED : JobManager.Status.FAILED;
  }
}
