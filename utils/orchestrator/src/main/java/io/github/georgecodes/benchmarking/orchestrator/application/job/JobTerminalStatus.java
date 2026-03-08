package io.github.georgecodes.benchmarking.orchestrator.application.job;

import io.github.georgecodes.benchmarking.orchestrator.domain.JobStatus;

/**
 * Helper to map process exit/cancel state to a terminal {@link JobStatus}.
 */
public final class JobTerminalStatus {
  private JobTerminalStatus() { }

  public static JobStatus from(boolean canceled, int exitCode) {
    if (canceled) {
      return JobStatus.CANCELED;
    }
    return exitCode == 0 ? JobStatus.SUCCEEDED : JobStatus.FAILED;
  }
}