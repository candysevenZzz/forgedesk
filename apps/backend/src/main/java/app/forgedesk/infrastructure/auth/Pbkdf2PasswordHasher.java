package app.forgedesk.infrastructure.auth;

import app.forgedesk.domain.auth.PasswordHasher;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import org.springframework.stereotype.Component;

@Component
public class Pbkdf2PasswordHasher implements PasswordHasher {

  private static final int ITERATIONS = 210_000;

  private static final int KEY_LENGTH = 256;

  @Override
  public String hash(String password, String salt) {
    try {
      PBEKeySpec spec =
          new PBEKeySpec(
              password.toCharArray(), Base64.getUrlDecoder().decode(salt), ITERATIONS, KEY_LENGTH);
      byte[] value =
          SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
      spec.clearPassword();
      return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    } catch (Exception exception) {
      throw new IllegalStateException("无法处理密码", exception);
    }
  }

  @Override
  public boolean matches(String password, String salt, String expectedHash) {
    return MessageDigest.isEqual(
        hash(password, salt).getBytes(StandardCharsets.UTF_8),
        expectedHash.getBytes(StandardCharsets.UTF_8));
  }
}
