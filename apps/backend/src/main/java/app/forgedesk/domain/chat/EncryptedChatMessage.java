package app.forgedesk.domain.chat;

public record EncryptedChatMessage(
    String id,
    String conversationId,
    String senderId,
    String ciphertext,
    String nonce,
    int keyVersion,
    String createdAt) {}
