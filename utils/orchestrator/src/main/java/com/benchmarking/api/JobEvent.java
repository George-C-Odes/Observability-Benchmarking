package com.benchmarking.api;

import java.time.Instant;

public class JobEvent {
  public String type;      // log | status
  public String stream;    // stdout | stderr | system
  public Instant ts;
  public String message;

  public JobEvent() {}

  public static JobEvent log(String stream, String message) {
    JobEvent e = new JobEvent();
    e.type = "log";
    e.stream = stream;
    e.ts = Instant.now();
    e.message = message;
    return e;
  }

  public static JobEvent status(String message) {
    JobEvent e = new JobEvent();
    e.type = "status";
    e.stream = "system";
    e.ts = Instant.now();
    e.message = message;
    return e;
  }
}
