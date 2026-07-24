package app.forgedesk.application.auth;

import app.forgedesk.domain.auth.AuthenticationException;
import app.forgedesk.domain.auth.AvatarStore;
import app.forgedesk.domain.auth.PasswordHasher;
import app.forgedesk.domain.auth.SecureTokenService;
import app.forgedesk.domain.auth.UserAccount;
import app.forgedesk.domain.auth.UserAccountRepository;
import app.forgedesk.domain.auth.UserSession;
import app.forgedesk.domain.auth.UserSessionRepository;
import app.forgedesk.domain.auth.UserSummary;
import app.forgedesk.domain.time.PlatformClock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AuthApplicationService {

  private static final Duration SESSION_LIFETIME = Duration.ofDays(30);

  private final UserAccountRepository accounts;

  private final UserSessionRepository sessions;

  private final PasswordHasher passwordHasher;

  private final SecureTokenService tokens;

  private final AvatarStore avatars;

  private final PlatformClock clock;

  private final String adminBootstrapToken =
      System.getenv().getOrDefault("FORGEDESK_ADMIN_BOOTSTRAP_TOKEN", "");

  private final String bindAddress =
      System.getenv().getOrDefault("FORGEDESK_BIND_ADDRESS", "127.0.0.1");

  public synchronized AuthResult register(
      String username, String displayName, String password, String bootstrapToken) {
    String normalizedUsername = normalizeUsername(username);
    validatePassword(password);
    if (accounts.findByUsername(normalizedUsername).isPresent()) {
      throw conflict("该用户名已被注册");
    }
    String salt = tokens.nextToken(16);
    String now = clock.now();
    UserAccount account =
        new UserAccount(
            UUID.randomUUID().toString(),
            normalizedUsername,
            normalizeDisplayName(displayName, normalizedUsername),
            shouldCreateAdmin(accounts.count() + 1, bootstrapToken) ? "ADMIN" : "USER",
            passwordHasher.hash(password, salt),
            salt,
            now,
            "");
    accounts.save(account);
    return createSession(account);
  }

  public synchronized AuthResult login(String username, String password) {
    String normalizedUsername = normalizeUsername(username);
    if (password == null || password.isEmpty()) {
      throw invalidRequest("请输入密码");
    }
    UserAccount account =
        accounts.findByUsername(normalizedUsername).orElseThrow(this::invalidCredentials);
    if (!passwordHasher.matches(password, account.salt(), account.passwordHash())) {
      throw invalidCredentials();
    }
    return createSession(account);
  }

  public UserIdentity requireUser(String token) {
    if (token == null || token.isBlank()) {
      throw unauthorized();
    }
    String fingerprint = tokens.fingerprint(token);
    UserSession session =
        sessions
            .findByTokenHash(fingerprint)
            .filter(item -> isActive(item, clock.instant()))
            .orElseThrow(this::unauthorized);
    UserAccount account = accounts.findById(session.userId()).orElseThrow(this::unauthorized);
    return identity(account);
  }

  public UserIdentity requireAdmin(String token) {
    UserIdentity user = requireUser(token);
    if (!"ADMIN".equals(user.role())) {
      throw forbidden("需要管理员权限");
    }
    return user;
  }

  public void logout(String token) {
    if (token == null || token.isBlank()) {
      return;
    }
    String fingerprint = tokens.fingerprint(token);
    sessions.remove(fingerprint);
  }

  public List<UserSummary> usersForAdmin() {
    return accounts.listSummaries();
  }

  public int activeSessionCount() {
    return sessions.activeCount();
  }

  public synchronized UserIdentity updateProfile(String userId, String displayName) {
    UserAccount account = accounts.findById(userId).orElseThrow(this::unauthorized);
    UserAccount updated =
        new UserAccount(
            account.id(),
            account.username(),
            normalizeDisplayName(displayName, account.username()),
            account.role(),
            account.passwordHash(),
            account.salt(),
            account.createdAt(),
            account.avatarVersion());
    accounts.save(updated);
    return identity(updated);
  }

  public synchronized UserIdentity updatePassword(
      String userId, String currentPassword, String newPassword) {
    UserAccount account = accounts.findById(userId).orElseThrow(this::unauthorized);
    if (!passwordHasher.matches(
        currentPassword == null ? "" : currentPassword, account.salt(), account.passwordHash())) {
      throw invalidCredentials();
    }
    validatePassword(newPassword);
    String salt = tokens.nextToken(16);
    UserAccount updated =
        new UserAccount(
            account.id(),
            account.username(),
            account.displayName(),
            account.role(),
            passwordHasher.hash(newPassword, salt),
            salt,
            account.createdAt(),
            account.avatarVersion());
    accounts.save(updated);
    return identity(updated);
  }

  public synchronized UserIdentity updateAvatar(String userId, String dataUrl) {
    UserAccount account = accounts.findById(userId).orElseThrow(this::unauthorized);
    String version = avatars.save(userId, dataUrl);
    UserAccount updated =
        new UserAccount(
            account.id(),
            account.username(),
            account.displayName(),
            account.role(),
            account.passwordHash(),
            account.salt(),
            account.createdAt(),
            version);
    accounts.save(updated);
    return identity(updated);
  }

  public java.util.Optional<AvatarStore.Avatar> avatar(String userId) {
    return avatars.find(userId);
  }

  private AuthResult createSession(UserAccount account) {
    String token = tokens.nextToken(32);
    Instant now = clock.instant();
    sessions.save(
        new UserSession(
            tokens.fingerprint(token),
            account.id(),
            clock.format(now),
            clock.format(now.plus(SESSION_LIFETIME))));
    return new AuthResult(token, identity(account));
  }

  private boolean shouldCreateAdmin(long userCount, String bootstrapToken) {
    if (userCount != 1) {
      return false;
    }
    if (isLocalOnly() && adminBootstrapToken.isBlank()) {
      return true;
    }
    if (adminBootstrapToken.isBlank()) {
      throw invalidRequest("远端服务首次初始化管理员时，必须设置 FORGEDESK_ADMIN_BOOTSTRAP_TOKEN");
    }
    if (!tokens.equals(adminBootstrapToken, bootstrapToken == null ? "" : bootstrapToken)) {
      throw unauthenticated("管理员初始化口令不正确");
    }
    return true;
  }

  private boolean isActive(UserSession session, Instant now) {
    try {
      return Instant.parse(session.expiresAt()).isAfter(now);
    } catch (Exception ignored) {
      return false;
    }
  }

  private String normalizeUsername(String value) {
    String username = value == null ? "" : value.trim().toLowerCase();
    if (!username.matches("[a-z0-9][a-z0-9_.-]{2,31}")) {
      throw invalidRequest("用户名需为 3-32 位小写字母、数字、点、下划线或连字符");
    }
    return username;
  }

  private String normalizeDisplayName(String value, String fallback) {
    String displayName = value == null ? "" : value.trim();
    if (displayName.isEmpty()) {
      return fallback;
    }
    if (displayName.length() > 48) {
      throw invalidRequest("显示名称不能超过 48 个字符");
    }
    return displayName;
  }

  private void validatePassword(String password) {
    if (password == null || password.length() < 10) {
      throw invalidRequest("密码至少需要 10 位");
    }
  }

  private UserIdentity identity(UserAccount account) {
    return new UserIdentity(
        account.id(),
        account.username(),
        account.displayName(),
        account.role(),
        account.createdAt(),
        account.avatarVersion().isBlank()
            ? ""
            : "/api/auth/avatars/" + account.id() + "?v=" + account.avatarVersion());
  }

  private AuthenticationException invalidCredentials() {
    return unauthenticated("用户名或密码不正确");
  }

  private AuthenticationException unauthorized() {
    return unauthenticated("登录状态无效或已过期");
  }

  private AuthenticationException invalidRequest(String message) {
    return new AuthenticationException(AuthenticationException.Reason.INVALID_REQUEST, message);
  }

  private AuthenticationException conflict(String message) {
    return new AuthenticationException(AuthenticationException.Reason.CONFLICT, message);
  }

  private AuthenticationException unauthenticated(String message) {
    return new AuthenticationException(AuthenticationException.Reason.UNAUTHENTICATED, message);
  }

  private AuthenticationException forbidden(String message) {
    return new AuthenticationException(AuthenticationException.Reason.FORBIDDEN, message);
  }

  private boolean isLocalOnly() {
    return bindAddress.equals("127.0.0.1")
        || bindAddress.equals("localhost")
        || bindAddress.equals("::1");
  }

  public record UserIdentity(
      String id,
      String username,
      String displayName,
      String role,
      String createdAt,
      String avatarUrl) {}

  public record AuthResult(String token, UserIdentity user) {}
}
