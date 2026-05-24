package io.github.georgecodes.benchmarking.orchestrator.security;

import static org.junit.jupiter.api.Assertions.*;

import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerResponseContext;
import jakarta.ws.rs.core.MultivaluedHashMap;
import jakarta.ws.rs.core.MultivaluedMap;
import jakarta.ws.rs.core.Response;
import java.lang.reflect.Proxy;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.jboss.logging.MDC;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class SecurityFiltersTest {

  @AfterEach
  void clearMdc() {
    MDC.remove("requestId");
  }

  @Test
  void bearerAuthFilterBypassesWhenApiKeyIsBlank() {
    BearerAuthFilter filter = new BearerAuthFilter(" ");
    RequestProbe probe = new RequestProbe(Map.of());

    filter.filter(probe.context());

    assertNull(probe.abortedResponse.get());
  }

  @Test
  void bearerAuthFilterRejectsMissingAndWrongTokensAndAllowsCorrectToken() {
    BearerAuthFilter filter = new BearerAuthFilter("secret");

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
    RequestProbe probe = new RequestProbe(Map.of("X-Request-Id", "req-123"));
    ResponseProbe response = new ResponseProbe();

    filter.filter(probe.context());

    assertEquals("req-123", MDC.get("requestId"));

    filter.filter(probe.context(), response.context());

    assertEquals("req-123", response.headers.getFirst(RequestIdFilter.REQUEST_ID_HEADER));
    assertNull(MDC.get("requestId"));
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
      return (ContainerRequestContext)
          Proxy.newProxyInstance(
              ContainerRequestContext.class.getClassLoader(),
              new Class<?>[] {ContainerRequestContext.class},
              (proxy, method, args) ->
                  switch (method.getName()) {
                    case "getHeaderString" -> {
                      assertNotNull(proxy);
                      yield headers.get(String.valueOf(args[0]));
                    }
                    case "abortWith" -> {
                      abortedResponse.set((Response) args[0]);
                      yield null;
                    }
                    case "setProperty" -> {
                      headers.put("property:" + args[0], String.valueOf(args[1]));
                      yield null;
                    }
                    case "getProperty" -> headers.get("property:" + args[0]);
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
                  });
    }
  }

  private static final class ResponseProbe {
    private final MultivaluedMap<String, Object> headers = new MultivaluedHashMap<>();

    private ContainerResponseContext context() {
      return (ContainerResponseContext)
          Proxy.newProxyInstance(
              ContainerResponseContext.class.getClassLoader(),
              new Class<?>[] {ContainerResponseContext.class},
              (proxy, method, ignored) -> {
                if ("getHeaders".equals(method.getName())) {
                  assertNotNull(proxy);
                  return headers;
                }
                Class<?> returnType = method.getReturnType();
                if (returnType.equals(boolean.class)) {
                  return false;
                }
                if (returnType.equals(int.class)) {
                  return 0;
                }
                return null;
              });
    }
  }
}
