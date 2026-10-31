package io.github.georgecodes.benchmarking.orchestrator.application.job;

import io.smallrye.mutiny.Multi;
import io.smallrye.mutiny.subscription.MultiEmitter;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import lombok.extern.jbosslog.JBossLog;

/**
 * Adapter-private job state and replayable event stream; not a domain entity or application port.
 */
@JBossLog
final class InMemoryJob {

  private final UUID id;

  /** Immutable snapshots make lifecycle fields visible together, rather than independently. */
  private final AtomicReference<JobStatusSnapshot> state;

  /** Guarded by this job's monitor, together with replay/registration and event publication. */
  private final Deque<JobEvent> buffer;

  private final int maxLines;

  /** Concurrent removal allows termination callbacks to run independently of publication. */
  private final Set<MultiEmitter<? super JobEvent>> emitters = ConcurrentHashMap.newKeySet();

  private final AtomicBoolean completed = new AtomicBoolean();

  /**
   * Creates a queued job with the requested replay buffer size.
   *
   * @param id job identifier
   * @param maxLines requested buffer size (at least 100 events are retained)
   */
  InMemoryJob(UUID id, int maxLines) {
    this.id = id;
    this.maxLines = Math.max(100, maxLines);
    this.buffer = new ArrayDeque<>(this.maxLines);
    this.state =
        new AtomicReference<>(
            new JobStatusSnapshot(id, "QUEUED", Instant.now(), null, null, null, null));
  }

  /** Publishes the start status and timestamp as a single state update. */
  void markStarted(Instant startedAt) {
    state.updateAndGet(previous ->
        new JobStatusSnapshot(
            id,
            "RUNNING",
            previous.createdAt(),
            startedAt,
            previous.finishedAt(),
            previous.exitCode(),
            previous.lastLine()));
  }

  /** Publishes terminal lifecycle fields together without losing concurrent log updates. */
  void markFinished(String status, Instant finishedAt, Integer exitCode) {
    state.updateAndGet(previous ->
        new JobStatusSnapshot(
            id,
            status,
            previous.createdAt(),
            previous.startedAt(),
            finishedAt,
            exitCode,
            previous.lastLine()));
  }

  /** Buffers an event and publishes it to the current subscribers in replay order. */
  synchronized void emit(JobEvent event) {
    if ("log".equals(event.type()) && event.message() != null) {
      state.updateAndGet(previous ->
          new JobStatusSnapshot(
              id,
              previous.status(),
              previous.createdAt(),
              previous.startedAt(),
              previous.finishedAt(),
              previous.exitCode(),
              event.message()));
    }
    if (buffer.size() >= maxLines) {
      buffer.removeFirst();
    }
    buffer.addLast(event);

    // Stable membership preserves copy-on-write iteration semantics without copying on churn.
    for (MultiEmitter<? super JobEvent> emitter : List.copyOf(emitters)) {
      try {
        emitter.emit(event);
      } catch (IllegalStateException ex) {
        emitters.remove(emitter);
        log.tracef("Removed dead emitter for job %s: %s", id, ex.getMessage());
      }
    }
  }

  /** Marks the job complete and terminates every active subscriber stream. */
  synchronized void complete() {
    completed.set(true);
    for (MultiEmitter<? super JobEvent> emitter : List.copyOf(emitters)) {
      try {
        emitter.complete();
      } catch (IllegalStateException ex) {
        emitters.remove(emitter);
        log.tracef("Removed dead emitter on complete for job %s: %s", id, ex.getMessage());
      }
    }
  }

  /** Creates a stream that replays the bounded history before receiving live events. */
  Multi<JobEvent> multi() {
    return Multi.createFrom().<JobEvent>emitter(this::subscribe);
  }

  /** Replay and registration share the publication lock so no events fall between them. */
  private synchronized void subscribe(MultiEmitter<? super JobEvent> emitter) {
    for (JobEvent event : List.copyOf(buffer)) {
      emitter.emit(event);
    }
    emitters.add(emitter);
    emitter.onTermination(() -> emitters.remove(emitter));
    if (completed.get()) {
      emitter.complete();
    }
  }

  /** Returns the latest coherent immutable status snapshot. */
  JobStatusSnapshot toStatus() {
    return state.get();
  }
}
