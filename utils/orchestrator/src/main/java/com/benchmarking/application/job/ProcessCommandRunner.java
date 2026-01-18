package com.benchmarking.application.job;

import com.benchmarking.api.JobEvent;
import jakarta.enterprise.context.ApplicationScoped;
import lombok.extern.jbosslog.JBossLog;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

/**
 * Default adapter that runs commands via {@link ProcessBuilder}.
 */
@JBossLog
@ApplicationScoped
public class ProcessCommandRunner implements CommandRunner {

  @Override
  public ExecutionResult run(
    List<String> argv,
    String workspace,
    Map<String, String> envOverrides,
    EventSink sink
  ) throws Exception {
    Objects.requireNonNull(argv, "argv");
    Objects.requireNonNull(workspace, "workspace");
    Objects.requireNonNull(envOverrides, "envOverrides");
    Objects.requireNonNull(sink, "sink");

    ProcessBuilder pb = new ProcessBuilder(argv);
    pb.directory(new java.io.File(workspace));
    pb.redirectErrorStream(false);

    Map<String, String> env = pb.environment();
    for (var e : envOverrides.entrySet()) {
      env.putIfAbsent(e.getKey(), e.getValue());
    }

    log.infof("Executing: %s", String.join(" ", argv));
    sink.emit(JobEvent.status("EXEC " + String.join(" ", argv)));

    Process p = pb.start();

    ExecutorService streams = Executors.newFixedThreadPool(2, r -> {
      Thread t = new Thread(r, "orchestrator-streams");
      t.setDaemon(true);
      return t;
    });

    try {
      Future<?> outF = streams.submit(() -> streamLines(p.getInputStream(), "stdout", sink));
      Future<?> errF = streams.submit(() -> streamLines(p.getErrorStream(), "stderr", sink));

      int exit = p.waitFor();
      outF.get(10, TimeUnit.SECONDS);
      errF.get(10, TimeUnit.SECONDS);

      return new ExecutionResult(exit, Instant.now());
    } finally {
      streams.shutdownNow();
    }
  }

  private static void streamLines(InputStream in, String stream, EventSink sink) {
    try (BufferedReader br = new BufferedReader(new InputStreamReader(in))) {
      String line;
      while ((line = br.readLine()) != null) {
        sink.emit(JobEvent.log(stream, line));
        // Also log to orchestrator stdout so Alloy can scrape
        log.infof("[%s] %s", stream, line);
      }
    } catch (Exception ignored) {
      // Intentionally ignored
    }
  }
}
