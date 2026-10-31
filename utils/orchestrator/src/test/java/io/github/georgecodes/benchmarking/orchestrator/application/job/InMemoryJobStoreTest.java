package io.github.georgecodes.benchmarking.orchestrator.application.job;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.smallrye.mutiny.helpers.test.AssertSubscriber;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

class InMemoryJobStoreTest {

  private static final Instant FINISHED_AT = Instant.parse("2026-01-01T00:00:02Z");

  @Test
  void testPreservesLifecycleEventOrderAndSnapshotsForLiveAndLateSubscribers() {
    InMemoryJobStore store = new InMemoryJobStore();
    UUID id = store.create(100, "run-1");
    JobStatusSnapshot queued = store.status(id);
    AssertSubscriber<JobEvent> live = subscribe(store, id);
    Instant startedAt = Instant.parse("2026-01-01T00:00:01Z");
    Instant finishedAt = Instant.parse("2026-01-01T00:00:02Z");

    store.markStarted(id, startedAt);
    store.emit(id, JobEvent.log("stdout", "last line"));
    store.emit(id, JobEvent.log("stderr", null));
    store.markFinished(id, "SUCCEEDED", finishedAt, 0);

    live.awaitCompletion();
    AssertSubscriber<JobEvent> late = subscribe(store, id);
    late.awaitCompletion();
    List<JobEvent> events = live.getItems();
    assertEquals(late.getItems(), events, "live delivery and replay should match");
    assertEquals(
        List.of(
            "status",
            "summary",
            "status",
            "summary",
            "log",
            "log",
            "status",
            "summary",
            "terminalSummary"),
        events.stream().map(JobEvent::type).toList(),
        "lifecycle events should retain their original ordering");
    assertEquals("QUEUED", events.getFirst().message(), "first status should be queued");
    assertEquals("RUNNING", events.get(2).message(), "start status should be running");
    assertEquals("SUCCEEDED", events.get(6).message(), "finish status should be succeeded");
    assertEquals(
        new JobStatusSnapshot(
            id, "SUCCEEDED", queued.createdAt(), startedAt, finishedAt, 0, "last line"),
        store.status(id),
        "final snapshot should contain all lifecycle fields and the last non-null log");
    JobEvent terminal = events.getLast();
    assertEquals(finishedAt, terminal.finishedAt(), "terminal event should contain finish time");
    assertEquals("last line", terminal.lastLine(), "terminal event should contain the last log");
    // Previously returned snapshots must not change as the job progresses.
    assertEquals("QUEUED", queued.status(), "previous snapshots should remain immutable");
    assertNull(queued.startedAt(), "queued snapshot should not acquire the later start time");
  }

  @Test
  void testKeepsMinimumAndRequestedReplayBounds() {
    assertReplayBound(1, 100);
    assertReplayBound(120, 120);
  }

  @Test
  void testCancellationDoesNotAffectOtherOrSubsequentSubscribers() {
    InMemoryJobStore store = new InMemoryJobStore();
    UUID id = store.create(100, null);
    AssertSubscriber<JobEvent> canceled = subscribe(store, id);
    AssertSubscriber<JobEvent> active = subscribe(store, id);
    canceled.cancel();

    store.emit(id, JobEvent.log("stdout", "still active"));
    store.markFinished(id, "FAILED", FINISHED_AT, 1);

    active.awaitCompletion();
    AssertSubscriber<JobEvent> late = subscribe(store, id);
    late.awaitCompletion();
    assertEquals(2, canceled.getItems().size(), "canceled subscriber should receive no new events");
    assertEquals(active.getItems(), late.getItems(), "cancellation should not alter replay");
    assertEquals(
        "still active", store.status(id).lastLine(), "remaining subscriber should see logs");
  }

  @Test
  void testConcurrentPublishersDeliverExactlyTheSameOrderLiveAndOnReplay() throws Exception {
    InMemoryJobStore store = new InMemoryJobStore();
    UUID id = store.create(512, null);
    AssertSubscriber<JobEvent> live = subscribe(store, id);
    CountDownLatch start = new CountDownLatch(1);

    try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
      Future<?> stdout = executor.submit(() -> publishLogs(store, id, "stdout", start));
      Future<?> stderr = executor.submit(() -> publishLogs(store, id, "stderr", start));
      start.countDown();
      stdout.get(5, TimeUnit.SECONDS);
      stderr.get(5, TimeUnit.SECONDS);
    }
    store.markFinished(id, "SUCCEEDED", FINISHED_AT, 0);
    live.awaitCompletion();
    AssertSubscriber<JobEvent> late = subscribe(store, id);
    late.awaitCompletion();
    assertEquals(
        live.getItems(), late.getItems(), "concurrent publication should match replay order");
    List<JobEvent> logs =
        live.getItems().stream().filter(event -> "log".equals(event.type())).toList();
    assertEquals(200, logs.size(), "every published log should be delivered");
    assertEquals(
        200L, logs.stream().map(JobEvent::message).distinct().count(), "logs should not duplicate");
    assertEquals(
        logs.getLast().message(),
        store.status(id).lastLine(),
        "snapshot should track the final log");
  }

  @Test
  void testPublicationAndCompletionDuringReplayDoNotLoseEvents() throws Exception {
    InMemoryJobStore store = new InMemoryJobStore();
    UUID id = store.create(100, null);
    CountDownLatch replayStarted = new CountDownLatch(1);
    CountDownLatch publicationAttempted = new CountDownLatch(1);
    AssertSubscriber<JobEvent> subscriber = AssertSubscriber.create(512);

    try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
      Future<?> subscription =
          executor.submit(() ->
              store
                  .events(id)
                  .onItem()
                  .invoke(event -> {
                    if ("QUEUED".equals(event.message())) {
                      replayStarted.countDown();
                      await(publicationAttempted);
                    }
                  })
                  .subscribe()
                  .withSubscriber(subscriber));
      Future<?> publication =
          executor.submit(() -> {
            await(replayStarted);
            publicationAttempted.countDown();
            store.emit(id, JobEvent.log("stdout", "during replay"));
            store.markFinished(id, "SUCCEEDED", FINISHED_AT, 0);
          });
      subscription.get(5, TimeUnit.SECONDS);
      publication.get(5, TimeUnit.SECONDS);
    }
    subscriber.awaitCompletion();
    AssertSubscriber<JobEvent> late = subscribe(store, id);
    late.awaitCompletion();
    assertEquals(late.getItems(), subscriber.getItems(), "events during replay should not be lost");
    assertEquals(
        6, subscriber.getItems().size(), "subscriber should see replay, log, and terminal events");
  }

  @Test
  void testTerminalStateFieldsArePublishedAsOneSnapshot() throws Exception {
    InMemoryJob job = new InMemoryJob(UUID.randomUUID(), 100);
    Instant succeededAt = Instant.parse("2026-01-01T00:00:01Z");
    Instant failedAt = Instant.parse("2026-01-01T00:00:02Z");
    job.markFinished("SUCCEEDED", succeededAt, 0);
    CountDownLatch start = new CountDownLatch(1);

    try (ExecutorService executor = Executors.newSingleThreadExecutor()) {
      Future<?> writer =
          executor.submit(() -> {
            await(start);
            for (int i = 0; i < 10_000; i++) {
              job.markFinished("FAILED", failedAt, 1);
              job.markFinished("SUCCEEDED", succeededAt, 0);
            }
          });
      start.countDown();
      for (int i = 0; i < 10_000; i++) {
        JobStatusSnapshot snapshot = job.toStatus();
        boolean succeeded = "SUCCEEDED".equals(snapshot.status());
        assertEquals(
            succeeded ? succeededAt : failedAt,
            snapshot.finishedAt(),
            "status and finish time should be consistent");
        assertEquals(
            succeeded ? 0 : 1, snapshot.exitCode(), "status and exit code should be consistent");
      }
      writer.get(5, TimeUnit.SECONDS);
    }
  }

  private static AssertSubscriber<JobEvent> subscribe(InMemoryJobStore store, UUID id) {
    return store.events(id).subscribe().withSubscriber(AssertSubscriber.create(512));
  }

  private static void assertReplayBound(int requested, int expected) {
    InMemoryJobStore store = new InMemoryJobStore();
    UUID id = store.create(requested, null);
    for (int i = 0; i < 130; i++) {
      store.emit(id, JobEvent.log("stdout", "line-" + i));
    }
    List<JobEvent> replay =
        store
            .events(id)
            .select()
            .first(expected)
            .collect()
            .asList()
            .await()
            .atMost(Duration.ofSeconds(5));
    assertEquals(expected, replay.size(), "replay should obey the effective buffer size");
    assertEquals(
        "line-" + (130 - expected),
        replay.getFirst().message(),
        "oldest retained log should match the bound");
    assertEquals("line-129", replay.getLast().message(), "newest log should always be retained");
  }

  private static void publishLogs(
      InMemoryJobStore store, UUID id, String stream, CountDownLatch start) {
    await(start);
    for (int i = 0; i < 100; i++) {
      store.emit(id, JobEvent.log(stream, stream + "-" + i));
    }
  }

  private static void await(CountDownLatch latch) {
    try {
      assertTrue(latch.await(5, TimeUnit.SECONDS), "concurrent operation should start in time");
    } catch (InterruptedException ex) {
      Thread.currentThread().interrupt();
      throw new AssertionError("Interrupted while coordinating concurrent test", ex);
    }
  }
}
