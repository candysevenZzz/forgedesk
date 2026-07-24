package app.forgedesk.domain.auth;

public record UserAccount(
    String id,
    String username,
    String displayName,
    String role,
    String passwordHash,
    String salt,
    String createdAt,
    String avatarVersion) {

  public UserSummary summary() {
    return new UserSummary(id, username, displayName, role, createdAt, avatarVersion);
  }
}
