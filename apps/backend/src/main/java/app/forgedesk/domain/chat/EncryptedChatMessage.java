package app.forgedesk.domain.chat;

import java.util.Map;

public record EncryptedChatMessage(
    String id,
    String conversationId,
    String senderId,
    String ciphertext,
    String nonce,
    int keyVersion,
    Map<String, String> keyEnvelopes,
    String createdAt) {}
