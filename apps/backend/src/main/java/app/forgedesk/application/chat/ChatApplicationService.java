package app.forgedesk.application.chat;

import app.forgedesk.domain.auth.UserAccountRepository;
import app.forgedesk.domain.chat.ChatCiphertext;
import app.forgedesk.domain.chat.ChatConversation;
import app.forgedesk.domain.chat.ChatException;
import app.forgedesk.domain.chat.ChatMessageCipher;
import app.forgedesk.domain.chat.ChatMessagePage;
import app.forgedesk.domain.chat.ChatRealtimeNotifier;
import app.forgedesk.domain.chat.ChatRepository;
import app.forgedesk.domain.chat.ChatUser;
import app.forgedesk.domain.chat.EncryptedChatMessage;
import app.forgedesk.domain.time.PlatformClock;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * Centralized chat orchestration. The server distributes messages but only stores encrypted bodies.
 */
@Service
@RequiredArgsConstructor
public class ChatApplicationService {

  private static final int MESSAGE_PAGE_SIZE = 100;
  private static final int CENTRALIZED_MESSAGE_VERSION = 2;

  private final ChatRepository repository;
  private final UserAccountRepository accounts;
  private final ChatRealtimeNotifier notifier;
  private final ChatMessageCipher messageCipher;
  private final PlatformClock clock;

  public ChatConversation create(String ownerId, String title, List<String> participants) {
    LinkedHashSet<String> members = new LinkedHashSet<>();
    members.add(ownerId);
    if (participants != null) {
      members.addAll(participants);
    }
    if (members.size() < 2) {
      throw new ChatException("聊天至少需要两位成员");
    }
    if (members.size() > 100) {
      throw new ChatException("单个群聊最多 100 位成员");
    }
    members.forEach(this::requireUserId);
    members.forEach(this::requireKnownUser);
    String now = clock.now();
    ChatConversation conversation =
        new ChatConversation(
            UUID.randomUUID().toString(),
            normalizedTitle(title),
            "",
            List.copyOf(members),
            ownerId,
            now,
            now);
    repository.saveConversation(conversation);
    notifier.conversationChanged(
        conversation.participantIds(), conversation.id(), conversation.createdAt());
    return conversation;
  }

  /** Permanently deletes a shared conversation. Only its creator has this permission. */
  public ChatConversation delete(String userId, String conversationId) {
    ChatConversation conversation = requireMember(userId, conversationId);
    if (!conversation.createdBy().equals(userId)) {
      throw new ChatException("仅会话创建者可以删除会话");
    }
    repository.deleteConversation(conversation.id());
    notifier.conversationDeleted(conversation.participantIds(), conversation.id(), clock.now());
    return conversation;
  }

  public List<ChatConversation> conversations(String userId) {
    return repository.conversationsFor(userId);
  }

  /**
   * Only the group owner may update group metadata. Membership changes are not part of this
   * endpoint.
   */
  public ChatConversation updateGroupProfile(
      String userId, String conversationId, String title, String announcement) {
    ChatConversation conversation = requireGroup(requireMember(userId, conversationId));
    if (!conversation.createdBy().equals(userId)) {
      throw new ChatException("仅群主可以修改群资料");
    }
    String now = clock.now();
    ChatConversation updated =
        new ChatConversation(
            conversation.id(),
            normalizedTitle(title),
            normalizedAnnouncement(announcement),
            conversation.participantIds(),
            conversation.createdBy(),
            conversation.createdAt(),
            now);
    repository.updateConversationProfile(
        updated.id(), updated.title(), updated.announcement(), now);
    notifier.conversationChanged(updated.participantIds(), updated.id(), updated.updatedAt());
    return updated;
  }

  /** Counts only centralized-mode messages after a client's local read cursor. */
  public Map<String, Integer> unreadCounts(String userId, Map<String, String> cursors) {
    if (cursors == null || cursors.isEmpty()) {
      return Map.of();
    }
    Map<String, Integer> counts = new java.util.LinkedHashMap<>();
    for (ChatConversation conversation : repository.conversationsFor(userId)) {
      String after = cursors.getOrDefault(conversation.id(), "");
      if (after.isBlank()) {
        continue;
      }
      int count =
          (int)
              repository.messagesAfter(conversation.id(), after).stream()
                  .filter(message -> message.keyVersion() == CENTRALIZED_MESSAGE_VERSION)
                  .filter(message -> !userId.equals(message.senderId()))
                  .count();
      if (count > 0) {
        counts.put(conversation.id(), count);
      }
    }
    return Map.copyOf(counts);
  }

  /**
   * Decrypts one client transport envelope, encrypts it for server storage, and only broadcasts
   * metadata. No recipient or device-specific encryption work is performed here.
   */
  public EncryptedChatMessage send(
      String userId, String conversationId, EncryptedMessageCommand command) {
    ChatConversation conversation = requireMember(userId, conversationId);
    if (command == null
        || blank(command.ciphertext())
        || blank(command.nonce())
        || blank(command.clientPublicKey())) {
      throw new ChatException("消息传输密文、随机数或公钥不能为空");
    }
    if (command.ciphertext().length() > 1_500_000) {
      throw new ChatException("单条加密消息不能超过 1 MB");
    }
    String plaintext =
        messageCipher.decryptTransport(
            command.ciphertext(), command.nonce(), command.clientPublicKey(), conversation.id());
    if (plaintext.length() > 1_000_000) {
      throw new ChatException("单条聊天消息不能超过 1 MB");
    }
    ChatCiphertext storedCiphertext = messageCipher.encryptForStorage(plaintext);
    EncryptedChatMessage storedMessage =
        new EncryptedChatMessage(
            UUID.randomUUID().toString(),
            conversation.id(),
            userId,
            storedCiphertext.ciphertext(),
            storedCiphertext.nonce(),
            CENTRALIZED_MESSAGE_VERSION,
            clock.now());
    repository.appendMessage(storedMessage);
    repository.touchConversation(conversation.id(), storedMessage.createdAt());
    notifier.messageCreated(
        conversation.participantIds(), conversation.id(), userId, storedMessage.createdAt());
    return transportMessage(storedMessage, command.clientPublicKey());
  }

  /** Returns a bounded, transport-encrypted message page for the requesting browser session. */
  public ChatMessagePage messages(
      String userId, String conversationId, String after, String before, String clientPublicKey) {
    requireMember(userId, conversationId);
    if (blank(clientPublicKey)) {
      throw new ChatException("聊天传输公钥不能为空");
    }
    String afterCursor = after == null ? "" : after;
    String beforeCursor = before == null ? "" : before;
    if (!afterCursor.isBlank() && !beforeCursor.isBlank()) {
      throw new ChatException("消息游标不能同时指定 after 和 before");
    }
    ChatMessagePage page =
        repository.messagePage(conversationId, afterCursor, beforeCursor, MESSAGE_PAGE_SIZE);
    List<EncryptedChatMessage> messages =
        page.messages().stream()
            .filter(message -> message.keyVersion() == CENTRALIZED_MESSAGE_VERSION)
            .map(message -> transportMessage(message, clientPublicKey))
            .toList();
    return new ChatMessagePage(
        messages,
        page.nextAfter(),
        page.previousBefore(),
        page.hasMoreAfter(),
        page.hasMoreBefore());
  }

  public String transportPublicKey(String userId) {
    requireKnownUser(userId);
    return messageCipher.transportPublicKey();
  }

  public List<ChatUser> users(String requesterId) {
    requireKnownUser(requesterId);
    Set<String> onlineUserIds = notifier.onlineUserIds();
    return accounts.listSummaries().stream()
        .filter(item -> !item.id().equals(requesterId))
        .map(
            item ->
                new ChatUser(
                    item.id(),
                    item.username(),
                    item.displayName(),
                    item.role(),
                    item.createdAt(),
                    avatarUrl(item),
                    onlineUserIds.contains(item.id())))
        .toList();
  }

  private EncryptedChatMessage transportMessage(
      EncryptedChatMessage storedMessage, String clientPublicKey) {
    ChatCiphertext transportCiphertext =
        messageCipher.encryptTransport(
            messageCipher.decryptFromStorage(storedMessage.ciphertext(), storedMessage.nonce()),
            clientPublicKey,
            storedMessage.conversationId());
    return new EncryptedChatMessage(
        storedMessage.id(),
        storedMessage.conversationId(),
        storedMessage.senderId(),
        transportCiphertext.ciphertext(),
        transportCiphertext.nonce(),
        CENTRALIZED_MESSAGE_VERSION,
        storedMessage.createdAt());
  }

  private String avatarUrl(app.forgedesk.domain.auth.UserSummary user) {
    if (blank(user.avatarVersion())) {
      return "";
    }
    return "/api/auth/avatars/" + user.id() + "?v=" + user.avatarVersion();
  }

  private ChatConversation requireMember(String userId, String conversationId) {
    ChatConversation conversation =
        repository.findConversation(conversationId).orElseThrow(() -> new ChatException("聊天不存在"));
    if (!conversation.includes(userId)) {
      throw new ChatException("你不是该聊天的成员");
    }
    return conversation;
  }

  private ChatConversation requireGroup(ChatConversation conversation) {
    if (conversation.participantIds().size() <= 2) {
      throw new ChatException("一对一会话没有群资料");
    }
    return conversation;
  }

  private String normalizedTitle(String title) {
    String value = title == null ? "" : title.trim();
    return value.isEmpty() ? "加密群聊" : value.length() <= 64 ? value : value.substring(0, 64);
  }

  private String normalizedAnnouncement(String announcement) {
    String value = announcement == null ? "" : announcement.trim();
    return value.length() <= 280 ? value : value.substring(0, 280);
  }

  private void requireUserId(String userId) {
    if (userId == null || !userId.matches("[0-9a-f-]{36}")) {
      throw new ChatException("聊天成员身份无效");
    }
  }

  private void requireKnownUser(String userId) {
    if (accounts.findById(userId).isEmpty()) {
      throw new ChatException("聊天成员不存在");
    }
  }

  private boolean blank(String value) {
    return value == null || value.isBlank();
  }

  public record EncryptedMessageCommand(String ciphertext, String nonce, String clientPublicKey) {}
}
