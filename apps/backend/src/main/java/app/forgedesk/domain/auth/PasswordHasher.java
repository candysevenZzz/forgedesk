package app.forgedesk.domain.auth;

public interface PasswordHasher {

  String hash(String password, String salt);

  boolean matches(String password, String salt, String expectedHash);
}
