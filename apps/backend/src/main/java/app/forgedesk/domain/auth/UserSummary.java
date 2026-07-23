package app.forgedesk.domain.auth;

public record UserSummary(
    String id, String username, String displayName, String role, String createdAt) {}
