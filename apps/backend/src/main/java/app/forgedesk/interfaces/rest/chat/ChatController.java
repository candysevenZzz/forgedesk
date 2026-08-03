package app.forgedesk.interfaces.rest.chat;

import app.forgedesk.application.chat.ChatApplicationService;
import app.forgedesk.application.chat.ChatSocketTicketApplicationService;
import app.forgedesk.domain.chat.ChatConversation;
import app.forgedesk.domain.chat.ChatMessagePage;
import app.forgedesk.domain.chat.ChatUser;
import app.forgedesk.domain.chat.EncryptedChatMessage;
import app.forgedesk.interfaces.security.RequestIdentity;
import app.forgedesk.interfaces.security.RequireLogin;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/chat")
@RequireLogin
@RequiredArgsConstructor
public class ChatController {

  private final ChatApplicationService chatService;

  private final ChatSocketTicketApplicationService socketTickets;

  @PostMapping("/socket-ticket")
  SocketTicket ticket() {
    return new SocketTicket(socketTickets.issue(RequestIdentity.current().id()));
  }

  @GetMapping("/conversations")
  List<ChatConversation> conversations() {
    return chatService.conversations(RequestIdentity.current().id());
  }

  @PostMapping("/conversations/unread-counts")
  Map<String, Integer> unreadCounts(@RequestBody UnreadCountsRequest request) {
    return chatService.unreadCounts(RequestIdentity.current().id(), request.cursors());
  }

  @GetMapping("/users")
  List<ChatUser> users() {
    return chatService.users(RequestIdentity.current().id());
  }

  @PostMapping("/conversations")
  ChatConversation create(@RequestBody ConversationRequest request) {
    return chatService.create(
        RequestIdentity.current().id(), request.title(), request.participantIds());
  }

  /** 更新群名称和公告。仅群主有权限，成员调整不会通过此接口完成。 */
  @PutMapping("/conversations/{conversationId}/profile")
  ChatConversation updateProfile(
      @PathVariable String conversationId, @RequestBody ConversationProfileRequest request) {
    return chatService.updateGroupProfile(
        RequestIdentity.current().id(), conversationId, request.title(), request.announcement());
  }

  /** 永久删除会话及密文消息，仅会话创建者可调用。响应会由统一 Result 包装。 */
  @DeleteMapping("/conversations/{conversationId}")
  ChatConversation delete(@PathVariable String conversationId) {
    return chatService.delete(RequestIdentity.current().id(), conversationId);
  }

  /** Returns the server X25519 transport public key; it is not a secret. */
  @GetMapping("/transport-key")
  TransportKey transportKey() {
    return new TransportKey(chatService.transportPublicKey(RequestIdentity.current().id()));
  }

  @GetMapping("/conversations/{conversationId}/messages")
  ChatMessagePage messages(
      @PathVariable String conversationId,
      @RequestParam(defaultValue = "") String after,
      @RequestParam(defaultValue = "") String before,
      @RequestParam(defaultValue = "") String clientPublicKey) {
    return chatService.messages(
        RequestIdentity.current().id(), conversationId, after, before, clientPublicKey);
  }

  @PostMapping("/conversations/{conversationId}/messages")
  EncryptedChatMessage send(
      @PathVariable String conversationId, @RequestBody MessageRequest request) {
    return chatService.send(
        RequestIdentity.current().id(),
        conversationId,
        new ChatApplicationService.EncryptedMessageCommand(
            request.ciphertext(), request.nonce(), request.clientPublicKey()));
  }

  record ConversationRequest(String title, List<String> participantIds) {}

  record ConversationProfileRequest(String title, String announcement) {}

  record UnreadCountsRequest(Map<String, String> cursors) {}

  record SocketTicket(String ticket) {}

  record TransportKey(String publicKey) {}

  record MessageRequest(String ciphertext, String nonce, String clientPublicKey) {}
}
