package app.forgedesk.interfaces.rest;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class TraceIdFilter extends OncePerRequestFilter {

  private static final Logger log = LoggerFactory.getLogger(TraceIdFilter.class);

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
      throws ServletException, IOException {
    String traceId = normalize(request.getHeader(TraceContext.HEADER));
    response.setHeader(TraceContext.HEADER, traceId);
    MDC.put(TraceContext.MDC_KEY, traceId);
    try {
      filterChain.doFilter(request, response);
    } finally {
      log.info(
          "request method={} path={} status={}",
          request.getMethod(),
          request.getRequestURI(),
          response.getStatus());
      MDC.remove(TraceContext.MDC_KEY);
    }
  }

  private String normalize(String value) {
    return value != null && value.matches("[A-Za-z0-9_-]{8,80}")
        ? value
        : UUID.randomUUID().toString().replace("-", "");
  }
}
