package app.forgedesk.interfaces.rest.auth;

import app.forgedesk.application.auth.AuthApplicationService;
import app.forgedesk.interfaces.rest.RestAuthentication;
import app.forgedesk.interfaces.security.RequestIdentity;
import app.forgedesk.interfaces.security.RequireLogin;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

  private final AuthApplicationService authService;

  @PostMapping("/register")
  AuthApplicationService.AuthResult register(@RequestBody Credentials request) {
    return authService.register(
        request.username(), request.displayName(), request.password(), request.bootstrapToken());
  }

  @PostMapping("/login")
  AuthApplicationService.AuthResult login(@RequestBody Credentials request) {
    return authService.login(request.username(), request.password());
  }

  @PostMapping("/logout")
  @RequireLogin
  void logout(HttpServletRequest request) {
    authService.logout(RestAuthentication.bearerToken(request));
  }

  @GetMapping("/me")
  @RequireLogin
  AuthApplicationService.UserIdentity me() {
    return RequestIdentity.current();
  }

  @PostMapping("/profile")
  @RequireLogin
  AuthApplicationService.UserIdentity profile(@RequestBody ProfileRequest request) {
    return authService.updateProfile(RequestIdentity.current().id(), request.displayName());
  }

  @PostMapping("/password")
  @RequireLogin
  AuthApplicationService.UserIdentity password(@RequestBody PasswordRequest request) {
    return authService.updatePassword(
        RequestIdentity.current().id(), request.currentPassword(), request.newPassword());
  }

  @PostMapping("/avatar")
  @RequireLogin
  AuthApplicationService.UserIdentity avatar(@RequestBody AvatarRequest request) {
    return authService.updateAvatar(RequestIdentity.current().id(), request.dataUrl());
  }

  @GetMapping("/avatars/{userId}")
  ResponseEntity<ByteArrayResource> avatarFile(
      @org.springframework.web.bind.annotation.PathVariable String userId) {
    return authService
        .avatar(userId)
        .map(
            avatar ->
                ResponseEntity.ok()
                    .contentType(MediaType.parseMediaType(avatar.contentType()))
                    .cacheControl(CacheControl.noCache())
                    .body(new ByteArrayResource(avatar.content())))
        .orElseGet(() -> ResponseEntity.notFound().build());
  }

  record Credentials(String username, String displayName, String password, String bootstrapToken) {}

  record ProfileRequest(String displayName) {}

  record PasswordRequest(String currentPassword, String newPassword) {}

  record AvatarRequest(String dataUrl) {}
}
