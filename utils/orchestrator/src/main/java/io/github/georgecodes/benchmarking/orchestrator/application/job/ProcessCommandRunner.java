package io.github.georgecodes.benchmarking.orchestrator.application.job;

import io.github.georgecodes.benchmarking.orchestrator.api.JobEvent;
import jakarta.enterprise.context.ApplicationScoped;
import lombok.extern.jbosslog.JBossLog;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
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

  /** Seconds to wait for stream-reader threads to finish after {@code shutdownNow()}. */
  private static final int STREAM_DRAIN_TIMEOUT_SECONDS = 5;

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
    pb.directory(new File(workspace));
    pb.redirectErrorStream(false);
    EventSink serialSink = serializing(sink);

    Map<String, String> env = pb.environment();
    for (var e : envOverrides.entrySet()) {
      env.putIfAbsent(e.getKey(), e.getValue());
    }

    log.infof("Executing: %s", String.join(" ", argv));
    serialSink.emit(JobEvent.status("EXEC " + String.join(" ", argv)));

    Process p = pb.start();

    try (var streams = new InterruptingExecutor(Executors.newFixedThreadPool(2, r -> {
      Thread t = new Thread(r, "orchestrator-streams");
      t.setDaemon(true);
      return t;
    }))) {
      Future<?> outF = streams.submit(() -> streamLines(p.getInputStream(), "stdout", serialSink));
      Future<?> errF = streams.submit(() -> streamLines(p.getErrorStream(), "stderr", serialSink));

      int exit = p.waitFor();
      outF.get(10, TimeUnit.SECONDS);
      errF.get(10, TimeUnit.SECONDS);

      return new ExecutionResult(exit, Instant.now());
    } catch (Exception ex) {
      p.destroyForcibly();
      throw ex;
    }
  }

  private static void streamLines(InputStream in, String stream, EventSink sink) {
    try (BufferedReader br = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
      String line;
      while ((line = br.readLine()) != null) {
        sink.emit(JobEvent.log(stream, line));
        // Also log to orchestrator stdout so Alloy can scrape
        log.infof("[%s] %s", stream, line);
      }
    } catch (Exception ex) {
      log.tracef("Stream %s closed: %s", stream, ex.getMessage());
    }
  }

  private static EventSink serializing(EventSink sink) {
    Object monitor = new Object();
    return event -> {
      synchronized (monitor) {
        sink.emit(event);
      }
    };
  }

  /**
   * {@link AutoCloseable} wrapper around an {@link ExecutorService} that calls
   * {@link ExecutorService#shutdownNow()} (immediate interruption) on close,
   * rather than the graceful {@link ExecutorService#shutdown()} that
   * {@link ExecutorService#close()} uses.
   *
   * <p>This ensures stream-reader tasks are interrupted on all exit paths
   * (success, timeout, or exception) when used with try-with-resources.
   *
   * @param delegate the wrapped executor whose lifecycle is managed by this record
   */
  private record InterruptingExecutor(ExecutorService delegate) implements AutoCloseable {

    Future<?> submit(Runnable task) {
      return delegate.submit(task);
    }

    @Override
    public void close() {
      delegate.shutdownNow();
      try {
        if (!delegate.awaitTermination(STREAM_DRAIN_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
          log.warnf("Stream reader threads did not terminate within %d s", STREAM_DRAIN_TIMEOUT_SECONDS);
        }
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
      }
    }
  }
}