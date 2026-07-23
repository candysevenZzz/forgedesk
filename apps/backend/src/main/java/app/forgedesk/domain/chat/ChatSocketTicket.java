package app.forgedesk.domain.chat;

public record ChatSocketTicket(String tokenHash, String userId, String expiresAt) {}
