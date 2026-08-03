package app.forgedesk.infrastructure.chat;

import app.forgedesk.domain.chat.ChatCiphertext;
import app.forgedesk.domain.chat.ChatException;
import app.forgedesk.domain.chat.ChatMessageCipher;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.interfaces.XECPublicKey;
import java.security.spec.NamedParameterSpec;
import java.security.spec.XECPublicKeySpec;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;

/**
 * 服务端中心化消息加密实现。
 *
 * <p>每个进程启动时生成一对 X25519 传输密钥。客户端每次登录创建临时公私钥，双方派生 AES-256-GCM 会话密钥。因此 HTTP
 * 请求和响应中的消息正文始终为密文。服务端收到消息后使用独立存储密钥再次加密，数据库不保存明文。
 */
@Component
public class CentralizedChatCipher implements ChatMessageCipher {

  private static final NamedParameterSpec X25519 = NamedParameterSpec.X25519;
  private static final byte[] STORAGE_AAD =
      "forgedesk-chat-storage-v2".getBytes(StandardCharsets.UTF_8);

  private final PrivateKey transportPrivateKey;
  private final String transportPublicKey;
  private final byte[] storageKey;

  public CentralizedChatCipher() {
    try {
      KeyPair pair = KeyPairGenerator.getInstance("X25519").generateKeyPair();
      transportPrivateKey = pair.getPrivate();
      transportPublicKey = encode(rawPublicKey(pair.getPublic()));
      storageKey = sha256(storageKeyMaterial().getBytes(StandardCharsets.UTF_8));
    } catch (Exception exception) {
      throw new IllegalStateException("无法初始化聊天加密服务", exception);
    }
  }

  @Override
  public String transportPublicKey() {
    return transportPublicKey;
  }

  @Override
  public String decryptTransport(
      String ciphertext, String nonce, String clientPublicKey, String conversationId) {
    return decrypt(ciphertext, nonce, transportKey(clientPublicKey), transportAad(conversationId));
  }

  @Override
  public ChatCiphertext encryptTransport(
      String plaintext, String clientPublicKey, String conversationId) {
    return encrypt(plaintext, transportKey(clientPublicKey), transportAad(conversationId));
  }

  @Override
  public ChatCiphertext encryptForStorage(String plaintext) {
    return encrypt(plaintext, storageKey, STORAGE_AAD);
  }

  @Override
  public String decryptFromStorage(String ciphertext, String nonce) {
    return decrypt(ciphertext, nonce, storageKey, STORAGE_AAD);
  }

  private ChatCiphertext encrypt(String plaintext, byte[] key, byte[] aad) {
    try {
      byte[] nonce = new byte[12];
      java.security.SecureRandom.getInstanceStrong().nextBytes(nonce);
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(
          Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, nonce));
      cipher.updateAAD(aad);
      return new ChatCiphertext(
          encode(cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8))), encode(nonce));
    } catch (Exception exception) {
      throw new ChatException("无法加密聊天消息");
    }
  }

  private String decrypt(String ciphertext, String nonce, byte[] key, byte[] aad) {
    try {
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(
          Cipher.DECRYPT_MODE,
          new SecretKeySpec(key, "AES"),
          new GCMParameterSpec(128, decode(nonce)));
      cipher.updateAAD(aad);
      return new String(cipher.doFinal(decode(ciphertext)), StandardCharsets.UTF_8);
    } catch (Exception exception) {
      throw new ChatException("消息传输密文无效");
    }
  }

  private byte[] transportKey(String clientPublicKey) {
    try {
      byte[] rawClientKey = decode(clientPublicKey);
      if (rawClientKey.length != 32) {
        throw new ChatException("聊天传输公钥无效");
      }
      PublicKey clientKey =
          KeyFactory.getInstance("XDH")
              .generatePublic(new XECPublicKeySpec(X25519, littleEndianInteger(rawClientKey)));
      KeyAgreement agreement = KeyAgreement.getInstance("X25519");
      agreement.init(transportPrivateKey);
      agreement.doPhase(clientKey, true);
      return agreement.generateSecret();
    } catch (ChatException exception) {
      throw exception;
    } catch (Exception exception) {
      throw new ChatException("聊天传输公钥无效");
    }
  }

  private byte[] rawPublicKey(PublicKey key) {
    if (!(key instanceof XECPublicKey xecPublicKey)) {
      throw new IllegalStateException("X25519 公钥类型无效");
    }
    return littleEndianBytes(xecPublicKey.getU());
  }

  private BigInteger littleEndianInteger(byte[] value) {
    byte[] copy = Arrays.copyOf(value, value.length);
    reverse(copy);
    return new BigInteger(1, copy);
  }

  private byte[] littleEndianBytes(BigInteger value) {
    byte[] bigEndian = value.toByteArray();
    byte[] output = new byte[32];
    int sourceOffset = Math.max(0, bigEndian.length - output.length);
    int copyLength = Math.min(bigEndian.length, output.length);
    System.arraycopy(bigEndian, sourceOffset, output, output.length - copyLength, copyLength);
    reverse(output);
    return output;
  }

  private void reverse(byte[] value) {
    for (int left = 0, right = value.length - 1; left < right; left += 1, right -= 1) {
      byte next = value[left];
      value[left] = value[right];
      value[right] = next;
    }
  }

  private byte[] sha256(byte[] value) {
    try {
      return MessageDigest.getInstance("SHA-256").digest(value);
    } catch (Exception exception) {
      throw new IllegalStateException("无法初始化聊天存储密钥", exception);
    }
  }

  private String storageKeyMaterial() {
    String configured = System.getenv("FORGEDESK_CHAT_STORAGE_KEY");
    if (configured != null && !configured.isBlank()) {
      return configured;
    }
    String databasePassword = System.getenv("FORGEDESK_DB_PASSWORD");
    if (databasePassword != null && !databasePassword.isBlank()) {
      return databasePassword;
    }
    String bootstrapToken = System.getenv("FORGEDESK_ADMIN_BOOTSTRAP_TOKEN");
    if (bootstrapToken != null && !bootstrapToken.isBlank()) {
      return bootstrapToken;
    }
    return "forgedesk-local-chat-storage-key-v2";
  }

  private byte[] transportAad(String conversationId) {
    return ("forgedesk-chat-transport-v2:" + conversationId).getBytes(StandardCharsets.UTF_8);
  }

  private String encode(byte[] value) {
    return Base64.getEncoder().encodeToString(value);
  }

  private byte[] decode(String value) {
    try {
      return Base64.getDecoder().decode(value == null ? "" : value);
    } catch (IllegalArgumentException exception) {
      throw new ChatException("消息传输格式无效");
    }
  }
}
