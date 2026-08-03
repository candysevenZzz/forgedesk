package app.forgedesk.domain.chat;

/** AES-GCM 密文与随机数。两项均使用 Base64 表示，便于安全地放入 JSON 与数据库字段。 */
public record ChatCiphertext(String ciphertext, String nonce) {}
