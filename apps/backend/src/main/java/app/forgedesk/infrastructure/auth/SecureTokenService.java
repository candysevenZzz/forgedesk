package app.forgedesk.infrastructure.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import org.springframework.stereotype.Component;

@Component
public class SecureTokenService implements app.forgedesk.domain.auth.SecureTokenService {

  private final SecureRandom random = new SecureRandom();

  @Override
  public String nextToken(int byteLength) {
    byte[] value = new byte[byteLength];
    random.nextBytes(value);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
  }

  @Override
  public String fingerprint(String token) {
    try {
      return Base64.getUrlEncoder()
          .withoutPadding()
          .encodeToString(
              MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
    } catch (Exception exception) {
      throw new IllegalStateException("无法处理会话令牌", exception);
    }
  }

  @Override
  public boolean equals(String first, String second) {
    return MessageDigest.isEqual(
        first.getBytes(StandardCharsets.UTF_8), second.getBytes(StandardCharsets.UTF_8));
  }
}
