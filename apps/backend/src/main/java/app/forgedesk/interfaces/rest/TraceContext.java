package app.forgedesk.interfaces.rest;

import org.slf4j.MDC;

public final class TraceContext {

  public static final String HEADER = "X-Trace-Id";

  public static final String MDC_KEY = "traceId";

  private TraceContext() {}

  public static String currentId() {
    return MDC.get(MDC_KEY) == null ? "" : MDC.get(MDC_KEY);
  }
}
