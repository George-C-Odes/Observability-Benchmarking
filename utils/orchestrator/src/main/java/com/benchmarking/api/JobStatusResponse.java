package com.benchmarking.api;

import java.time.Instant;
import java.util.UUID;

public class JobStatusResponse {
  public UUID jobId;
  public String status; // QUEUED, RUNNING, SUCCEEDED, FAILED, CANCELED
  public Instant createdAt;
  public Instant startedAt;
  public Instant finishedAt;
  public Integer exitCode;
  public String lastLine;
}
