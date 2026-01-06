package com.benchmarking.api;

import java.util.UUID;

public class RunResponse {
  public UUID jobId;

  public RunResponse(UUID jobId) { this.jobId = jobId; }
}
