package app.forgedesk.domain.chat;

public record ChatUser(
    String id,
    String username,
    String displayName,
    String role,
    String createdAt,
    String avatarUrl,
    boolean online) {}
