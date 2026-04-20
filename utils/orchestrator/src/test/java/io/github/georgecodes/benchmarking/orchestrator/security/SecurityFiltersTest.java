package io.github.georgecodes.benchmarking.orchestrator.security;

import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.core.Response;
import org.jboss.logging.MDC;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Proxy;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

class SecurityFiltersTest {

  @AfterEach
  void clearMdc() {
    MDC.remove("requestId");
  }

  @Test
  void bearerAuthFilterBypassesWhenApiKeyIsBlank() {
    BearerAuthFilter filter = new BearerAuthFilter();
    filter.apiKey = " ";
    RequestProbe probe = new RequestProbe(Map.of());

    filter.filter(probe.context());

    assertNull(probe.abortedResponse.get());
  }

  @Test
  void bearerAuthFilterRejectsMissingAndWrongTokensAndAllowsCorrectToken() {
    BearerAuthFilter filter = new BearerAuthFilter();
    filter.apiKey = "secret";

    RequestProbe missing = new RequestProbe(Map.of());
    filter.filter(missing.context());
    assertEquals(401, missing.abortedResponse.get().getStatus());

    RequestProbe wrong = new RequestProbe(Map.of("Authorization", "Bearer nope"));
    filter.filter(wrong.context());
    assertEquals(403, wrong.abortedResponse.get().getStatus());

    RequestProbe correct = new RequestProbe(Map.of("Authorization", "Bearer secret"));
    filter.filter(correct.context());
    assertNull(correct.abortedResponse.get());
  }

  @Test
  void requestIdFilterUsesIncomingHeaderWhenPresent() {
    RequestIdFilter filter = new RequestIdFilter();

    filter.filter(new RequestProbe(Map.of("X-Request-Id", "req-123")).context());

    assertEquals("req-123", MDC.get("requestId"));
  }

  @Test
  void requestIdFilterGeneratesUuidWhenHeaderMissing() {
    RequestIdFilter filter = new RequestIdFilter();

    filter.filter(new RequestProbe(Map.of()).context());

    String generated = String.valueOf(MDC.get("requestId"));
    assertDoesNotThrow(() -> UUID.fromString(generated));
  }

  private static final class RequestProbe {
    private final Map<String, String> headers;
    private final AtomicReference<Response> abortedResponse = new AtomicReference<>();

    private RequestProbe(Map<String, String> headers) {
      this.headers = new HashMap<>(headers);
    }

    private ContainerRequestContext context() {
      return (ContainerRequestContext) Proxy.newProxyInstance(
        ContainerRequestContext.class.getClassLoader(),
        new Class<?>[]{ContainerRequestContext.class},
        (proxy, method, args) -> switch (method.getName()) {
          case "getHeaderString" -> {
            assertNotNull(proxy);
            yield headers.get(String.valueOf(args[0]));
          }
          case "abortWith" -> {
            abortedResponse.set((Response) args[0]);
            yield null;
          }
          default -> {
            Class<?> returnType = method.getReturnType();
            if (returnType.equals(boolean.class)) {
              yield false;
            }
            if (returnType.equals(int.class)) {
              yield 0;
            }
            yield null;
          }
        }
      );
    }
  }
}

