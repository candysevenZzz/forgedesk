package app.forgedesk.domain.auth;

public record UserSession(String tokenHash, String userId, String createdAt, String expiresAt) {}
