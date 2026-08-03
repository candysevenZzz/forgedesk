package app.forgedesk.domain.chat;

/** 中心化聊天的加密边界：客户端和服务端之间使用临时 X25519 会话密钥，服务端持久化时再加密一次。 */
public interface ChatMessageCipher {

  String transportPublicKey();

  String decryptTransport(
      String ciphertext, String nonce, String clientPublicKey, String conversationId);

  ChatCiphertext encryptTransport(String plaintext, String clientPublicKey, String conversationId);

  ChatCiphertext encryptForStorage(String plaintext);

  String decryptFromStorage(String ciphertext, String nonce);
}
