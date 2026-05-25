package io.github.georgecodes.benchmarking.orchestrator.application.job;

import jakarta.enterprise.context.ApplicationScoped;
import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import lombok.extern.jbosslog.JBossLog;

/** Default adapter that runs commands via {@link ProcessBuilder}. */
@JBossLog
@ApplicationScoped
public class ProcessCommandRunner implements CommandRunner {

  /** Seconds to wait for a forcibly destroyed child process to terminate. */
  private static final int PROCESS_DESTROY_TIMEOUT_SECONDS = 5;

  /** Seconds to wait for stream-reader threads to finish after {@code shutdownNow()}. */
  private static final int STREAM_DRAIN_TIMEOUT_SECONDS = 5;

  /**
   * Executes the provided command in the configured workspace and streams stdout/stderr events.
   *
   * @param argv the command arguments to execute
   * @param workspace the working directory for the process
   * @param envOverrides environment variables to apply when absent from the process environment
   * @param sink sink that receives status and log events
   * @return the process execution result
   * @throws IOException if the process cannot be started
   * @throws InterruptedException if waiting for the process or streams is interrupted
   * @throws ExecutionException if a stream reader fails while processing process output
   * @throws TimeoutException if process stream readers do not finish promptly
   */
  @Override
  public ExecutionResult run(
      List<String> argv, String workspace, Map<String, String> envOverrides, EventSink sink)
      throws IOException, InterruptedException, ExecutionException, TimeoutException {
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

    Process p = startProcess(pb);

    try (var streams =
        new InterruptingExecutor(
            Executors.newFixedThreadPool(
                2,
                r -> {
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
    } catch (InterruptedException ex) {
      Thread.currentThread().interrupt();
      destroyAndAwaitTermination(p);
      throw ex;
    } catch (ExecutionException | TimeoutException ex) {
      destroyAndAwaitTermination(p);
      throw ex;
    }
  }

  /**
   * Starts the configured process.
   *
   * @param processBuilder builder configured with the desired command and environment
   * @return the started process
   * @throws IOException if the process cannot be started
   */
  Process startProcess(ProcessBuilder processBuilder) throws IOException {
    return processBuilder.start();
  }

  /**
   * Forcibly destroys a child process and waits briefly for it to terminate.
   *
   * @param process the child process to terminate
   */
  private static void destroyAndAwaitTermination(Process process) {
    process.destroyForcibly();
    try {
      if (!process.waitFor(PROCESS_DESTROY_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
        log.warnf(
            "Process did not terminate within %d s after destroyForcibly()",
            PROCESS_DESTROY_TIMEOUT_SECONDS);
      }
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      log.trace("Interrupted while waiting for destroyed process to terminate");
    }
  }

  /**
   * Reads all lines from a process stream and emits them as job log events.
   *
   * @param in the input stream to read
   * @param stream the logical stream name ({@code stdout} or {@code stderr})
   * @param sink the sink that receives log events
   */
  private static void streamLines(InputStream in, String stream, EventSink sink) {
    try (BufferedReader br =
        new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
      String line = br.readLine();
      while (line != null) {
        sink.emit(JobEvent.log(stream, line));
        // Also log to orchestrator stdout so Alloy can scrape
        log.infof("[%s] %s", stream, line);
        line = br.readLine();
      }
    } catch (IOException | RuntimeException ex) { // NOPMD - best-effort stream/log cleanup
      log.tracef("Stream %s closed: %s", stream, ex.getMessage());
    }
  }

  /**
   * Wraps an event sink so emissions are serialized across concurrent stream readers.
   *
   * @param sink the sink to wrap
   * @return a synchronized sink wrapper
   */
  private static EventSink serializing(EventSink sink) {
    Object monitor = new Object();
    return event -> {
      synchronized (monitor) {
        sink.emit(event);
      }
    };
  }

  /**
   * {@link AutoCloseable} wrapper around an {@link ExecutorService} that calls {@link
   * ExecutorService#shutdownNow()} (immediate interruption) on close, rather than the graceful
   * {@link ExecutorService#shutdown()} that {@link ExecutorService#close()} uses.
   *
   * <p>This ensures stream-reader tasks are interrupted on all exit paths (success, timeout, or
   * exception) when used with try-with-resources.
   *
   * @param delegate the wrapped executor whose lifecycle is managed by this record
   */
  private record InterruptingExecutor(ExecutorService delegate) implements AutoCloseable {

    /**
     * Submits a task to the wrapped executor.
     *
     * @param task the task to submit
     * @return the future representing the submitted task
     */
    Future<?> submit(Runnable task) {
      return delegate.submit(task);
    }

    /** Interrupts the wrapped executor and waits briefly for stream tasks to stop. */
    @Override
    public void close() {
      delegate.shutdownNow();
      try {
        if (!delegate.awaitTermination(STREAM_DRAIN_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
          log.warnf(
              "Stream reader threads did not terminate within %d s", STREAM_DRAIN_TIMEOUT_SECONDS);
        }
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
      }
    }
  }
}
