package io.github.georgecodes.benchmarking.orchestrator.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import io.github.georgecodes.benchmarking.orchestrator.application.BenchmarkTargetsService;
import io.github.georgecodes.benchmarking.orchestrator.application.EnvFileService;
import io.github.georgecodes.benchmarking.orchestrator.application.ServiceException;
import io.github.georgecodes.benchmarking.orchestrator.application.job.JobAdmissionRejectedException;
import io.github.georgecodes.benchmarking.orchestrator.application.job.JobRunConflictException;
import jakarta.ws.rs.core.Response;
import java.time.Instant;
import java.util.UUID;
import org.jboss.logging.MDC;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class ExceptionMapperAndJobEventTest {

  @AfterEach
  void clearMdc() {
    MDC.remove("requestId");
  }

  @Test
  void serviceExceptionMapperMapsEachExceptionTypeToExpectedHttpStatus() {
    ServiceExceptionMapper mapper = new ServiceExceptionMapper();

    try (Response notFound =
            mapper.toResponse(
                new EnvFileService.EnvFileException("missing", ServiceException.Type.NOT_FOUND));
        Response validation =
            mapper.toResponse(
                new BenchmarkTargetsService.BenchmarkTargetsException(
                    "invalid", ServiceException.Type.VALIDATION_ERROR));
        Response io =
            mapper.toResponse(
                new EnvFileService.EnvFileException(
                    "io", ServiceException.Type.IO_ERROR, new IllegalStateException("boom")))) {
      assertEquals(404, notFound.getStatus());
      assertEquals(400, validation.getStatus());
      assertEquals(500, io.getStatus());
    }
  }

  @Test
  void illegalArgumentExceptionMapperCreatesBadRequestResponse() {
    IllegalArgumentExceptionMapper mapper = new IllegalArgumentExceptionMapper();

    try (Response response = mapper.toResponse(new IllegalArgumentException("bad input"))) {
      ErrorResponse error = (ErrorResponse) response.getEntity();

      assertEquals(400, response.getStatus());
      assertEquals("bad_request", error.error());
      assertEquals("bad input", error.message());
    }
  }

  @Test
  void jobExceptionMappersCreateTransportResponsesAtApiBoundary() {
    JobRunConflictExceptionMapper conflictMapper = new JobRunConflictExceptionMapper();
    JobAdmissionRejectedExceptionMapper admissionMapper = new JobAdmissionRejectedExceptionMapper();

    try (Response conflict =
            conflictMapper.toResponse(
                new JobRunConflictException("stale_run", "runId does not match job"));
        Response unavailable =
            admissionMapper.toResponse(new JobAdmissionRejectedException("busy"))) {
      ErrorResponse conflictError = (ErrorResponse) conflict.getEntity();
      ErrorResponse unavailableError = (ErrorResponse) unavailable.getEntity();

      assertEquals(409, conflict.getStatus());
      assertEquals("stale_run", conflictError.error());
      assertEquals(503, unavailable.getStatus());
      assertEquals("orchestrator_busy", unavailableError.error());
    }
  }

  @Test
  void jobEventFactoryMethodsPopulateTypePayloadAndRequestId() {
    MDC.put("requestId", "req-123");
    UUID jobId = UUID.randomUUID();
    Instant createdAt = Instant.parse("2026-01-01T00:00:00Z");
    Instant startedAt = Instant.parse("2026-01-01T00:00:01Z");
    Instant finishedAt = Instant.parse("2026-01-01T00:00:02Z");

    JobEvent log = JobEvent.log("stdout", "hello");
    JobEvent status = JobEvent.status("RUNNING");
    JobEvent summary =
        JobEvent.summary(jobId, "RUNNING", createdAt, startedAt, null, null, "last line");
    JobEvent terminal =
        JobEvent.terminalSummary(jobId, "SUCCEEDED", createdAt, startedAt, finishedAt, 0, "done");

    assertEquals("log", log.type());
    assertEquals("stdout", log.stream());
    assertEquals("hello", log.message());
    assertEquals("req-123", log.requestId());

    assertEquals("status", status.type());
    assertEquals("system", status.stream());
    assertEquals("RUNNING", status.message());

    assertEquals("summary", summary.type());
    assertEquals(jobId, summary.jobId());
    assertEquals("RUNNING", summary.jobStatus());
    assertEquals(createdAt, summary.createdAt());
    assertEquals(startedAt, summary.startedAt());
    assertNull(summary.finishedAt());
    assertEquals("last line", summary.lastLine());

    assertEquals("terminalSummary", terminal.type());
    assertEquals("SUCCEEDED", terminal.jobStatus());
    assertEquals(finishedAt, terminal.finishedAt());
    assertEquals(0, terminal.exitCode());
    assertEquals("done", terminal.lastLine());
    assertEquals("req-123", terminal.requestId());
  }
}
