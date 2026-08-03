package app.forgedesk.interfaces.rest.admin;

import app.forgedesk.application.admin.AdminQueryApplicationService;
import app.forgedesk.interfaces.security.RequireLogin;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController {

  private final AdminQueryApplicationService adminService;

  @GetMapping("/overview")
  @RequireLogin(admin = true)
  AdminQueryApplicationService.AdminOverview overview() {
    return adminService.overview();
  }

  @GetMapping("/users")
  @RequireLogin(admin = true)
  List<AdminQueryApplicationService.UserRecord> users() {
    return adminService.users();
  }

  @GetMapping("/records")
  @RequireLogin(admin = true)
  List<AdminQueryApplicationService.StorageRecord> records() {
    return adminService.records();
  }

  @GetMapping("/system")
  @RequireLogin(admin = true)
  AdminQueryApplicationService.SystemStatus system() {
    return adminService.systemStatus();
  }

  @GetMapping("/chat/overview")
  @RequireLogin(admin = true)
  app.forgedesk.domain.admin.ChatMonitor.ChatOverview chatOverview() {
    return adminService.chatOverview();
  }

  @GetMapping("/chat/conversations")
  @RequireLogin(admin = true)
  List<app.forgedesk.domain.admin.ChatMonitor.ConversationRecord> chatConversations() {
    return adminService.chatConversations();
  }

  @GetMapping("/chat/messages")
  @RequireLogin(admin = true)
  List<app.forgedesk.domain.admin.ChatMonitor.MessageRecord> recentChatMessages() {
    return adminService.recentChatMessages();
  }
}
