package app.forgedesk.domain.auth;

public interface SecureTokenService {

  String nextToken(int byteLength);

  String fingerprint(String token);

  boolean equals(String first, String second);
}
