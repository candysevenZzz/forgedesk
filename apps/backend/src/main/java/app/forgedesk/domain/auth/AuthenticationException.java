package app.forgedesk.domain.auth;

public class AuthenticationException extends RuntimeException {

  private final Reason reason;

  public AuthenticationException(Reason reason, String message) {
    super(message);
    this.reason = reason;
  }

  public Reason reason() {
    return reason;
  }

  public enum Reason {
    INVALID_REQUEST,
    CONFLICT,
    UNAUTHENTICATED,
    FORBIDDEN
  }
}
