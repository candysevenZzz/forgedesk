package app.forgedesk.domain.chat;

public record ChatDeviceKey(
    String deviceId, String userId, String publicKeyJwk, String updatedAt) {}
