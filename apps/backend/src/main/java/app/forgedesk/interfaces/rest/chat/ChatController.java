package app.forgedesk.interfaces.rest.chat;

import app.forgedesk.application.chat.ChatApplicationService;
import app.forgedesk.application.chat.ChatSocketTicketApplicationService;
import app.forgedesk.domain.chat.ChatConversation;
import app.forgedesk.domain.chat.ChatDeviceKey;
import app.forgedesk.domain.chat.ChatGroupKey;
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

  @PutMapping("/devices/{deviceId}")
  ChatDeviceKey registerDevice(@PathVariable String deviceId, @RequestBody DeviceRequest request) {
    return chatService.registerDevice(
        RequestIdentity.current().id(), deviceId, request.publicKeyJwk());
  }

  @GetMapping("/users/{userId}/devices")
  List<ChatDeviceKey> deviceKeys(@PathVariable String userId) {
    return chatService.deviceKeys(userId);
  }

  @PostMapping("/conversations")
  ChatConversation create(@RequestBody ConversationRequest request) {
    return chatService.create(
        RequestIdentity.current().id(), request.title(), request.participantIds());
  }

  /** 永久删除会话及密文消息，仅会话创建者可调用。响应会由统一 Result 包装。 */
  @DeleteMapping("/conversations/{conversationId}")
  ChatConversation delete(@PathVariable String conversationId) {
    return chatService.delete(RequestIdentity.current().id(), conversationId);
  }

  @GetMapping("/conversations/{conversationId}/group-key")
  ChatGroupKey groupKey(@PathVariable String conversationId) {
    return chatService.groupKey(RequestIdentity.current().id(), conversationId);
  }

  @PutMapping("/conversations/{conversationId}/group-key")
  ChatGroupKey initializeGroupKey(
      @PathVariable String conversationId, @RequestBody GroupKeyRequest request) {
    return chatService.initializeGroupKey(
        RequestIdentity.current().id(),
        conversationId,
        request.keyVersion(),
        request.keyEnvelopes());
  }

  @PutMapping("/conversations/{conversationId}/group-key/envelopes/{deviceId}")
  ChatGroupKey addGroupKeyEnvelope(
      @PathVariable String conversationId,
      @PathVariable String deviceId,
      @RequestBody KeyEnvelopeRequest request) {
    return chatService.addGroupKeyEnvelope(
        RequestIdentity.current().id(), conversationId, deviceId, request.keyEnvelope());
  }

  @GetMapping("/conversations/{conversationId}/messages")
  ChatMessagePage messages(
      @PathVariable String conversationId,
      @RequestParam(defaultValue = "") String after,
      @RequestParam(defaultValue = "") String before) {
    return chatService.messages(RequestIdentity.current().id(), conversationId, after, before);
  }

  @PostMapping("/conversations/{conversationId}/messages")
  EncryptedChatMessage send(
      @PathVariable String conversationId, @RequestBody MessageRequest request) {
    return chatService.send(
        RequestIdentity.current().id(),
        conversationId,
        new ChatApplicationService.EncryptedMessageCommand(
            request.ciphertext(), request.nonce(), request.keyVersion(), request.keyEnvelopes()));
  }

  @PutMapping("/conversations/{conversationId}/messages/{messageId}/envelopes/{deviceId}")
  EncryptedChatMessage addKeyEnvelope(
      @PathVariable String conversationId,
      @PathVariable String messageId,
      @PathVariable String deviceId,
      @RequestBody KeyEnvelopeRequest request) {
    return chatService.addKeyEnvelope(
        RequestIdentity.current().id(), conversationId, messageId, deviceId, request.keyEnvelope());
  }

  record ConversationRequest(String title, List<String> participantIds) {}

  record UnreadCountsRequest(Map<String, String> cursors) {}

  record DeviceRequest(String publicKeyJwk) {}

  record SocketTicket(String ticket) {}

  record KeyEnvelopeRequest(String keyEnvelope) {}

  record GroupKeyRequest(int keyVersion, Map<String, String> keyEnvelopes) {}

  record MessageRequest(
      String ciphertext, String nonce, int keyVersion, Map<String, String> keyEnvelopes) {}
}
