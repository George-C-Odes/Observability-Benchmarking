package io.github.georgecodes.benchmarking.orchestrator.application.job;

import java.time.Instant;
import java.util.UUID;

/**
 * Application-layer snapshot of an orchestrator job status.
 *
 * @param jobId job identifier
 * @param status current job lifecycle status
 * @param createdAt timestamp when the job was created
 * @param startedAt timestamp when the job started
 * @param finishedAt timestamp when the job finished
 * @param exitCode process exit code when available
 * @param lastLine latest observed log line
 */
public record JobStatusSnapshot(
    UUID jobId,
    String status,
    Instant createdAt,
    Instant startedAt,
    Instant finishedAt,
    Integer exitCode,
    String lastLine) {}
