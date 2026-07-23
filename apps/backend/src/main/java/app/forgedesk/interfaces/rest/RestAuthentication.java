package app.forgedesk.interfaces.rest;

import jakarta.servlet.http.HttpServletRequest;

public final class RestAuthentication {

  private RestAuthentication() {}

  public static String bearerToken(HttpServletRequest request) {
    String header = request.getHeader("Authorization");
    return header != null && header.startsWith("Bearer ")
        ? header.substring("Bearer ".length()).trim()
        : "";
  }
}
