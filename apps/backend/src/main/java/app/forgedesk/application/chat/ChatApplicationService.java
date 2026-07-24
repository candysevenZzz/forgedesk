package app.forgedesk.application.chat;

import app.forgedesk.domain.auth.UserAccountRepository;
import app.forgedesk.domain.chat.ChatConversation;
import app.forgedesk.domain.chat.ChatDeviceKey;
import app.forgedesk.domain.chat.ChatDeviceKeyRepository;
import app.forgedesk.domain.chat.ChatException;
import app.forgedesk.domain.chat.ChatGroupKey;
import app.forgedesk.domain.chat.ChatMessagePage;
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

@Service
@RequiredArgsConstructor
public class ChatApplicationService {

  private static final int MESSAGE_PAGE_SIZE = 100;

  private final ChatRepository repository;

  private final ChatDeviceKeyRepository deviceKeys;

  private final UserAccountRepository accounts;

  private final app.forgedesk.domain.chat.ChatRealtimeNotifier notifier;

  private final PlatformClock clock;

  public ChatConversation create(String ownerId, String title, List<String> participants) {
    LinkedHashSet<String> members = new LinkedHashSet<>();
    members.add(ownerId);
    if (participants != null) {
      members.addAll(participants);
    }
    if (members.size() < 2) {
      throw new ChatException("群聊至少需要两位成员");
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
            List.copyOf(members),
            ownerId,
            now,
            now);
    repository.saveConversation(conversation);
    notifier.conversationChanged(
        conversation.participantIds(), conversation.id(), conversation.createdAt());
    return conversation;
  }

  /** 永久删除一个会话及其密文消息。会话为所有成员共享的资源，因此仅创建者可以删除。 */
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

  /** 按客户端本地保存的最后查看游标统计未读数量。服务端不持久化阅读状态。 */
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
                  .filter(message -> !userId.equals(message.senderId()))
                  .count();
      if (count > 0) {
        counts.put(conversation.id(), count);
      }
    }
    return Map.copyOf(counts);
  }

  public EncryptedChatMessage send(
      String userId, String conversationId, EncryptedMessageCommand command) {
    ChatConversation conversation = requireMember(userId, conversationId);
    if (command == null || blank(command.ciphertext()) || blank(command.nonce())) {
      throw new ChatException("消息密文或随机数不能为空");
    }
    if (command.ciphertext().length() > 1_500_000) {
      throw new ChatException("单条加密消息不能超过 1 MB");
    }
    EncryptedChatMessage message =
        new EncryptedChatMessage(
            UUID.randomUUID().toString(),
            conversation.id(),
            userId,
            command.ciphertext(),
            command.nonce(),
            Math.max(1, command.keyVersion()),
            messageEnvelopes(conversation, command),
            clock.now());
    repository.appendMessage(message);
    repository.touchConversation(conversation.id(), message.createdAt());
    notifier.messageCreated(
        conversation.participantIds(), conversation.id(), userId, message.createdAt());
    return message;
  }

  /** 返回受限大小的密文页，避免一个长会话在单次读取中占用过多网络和内存。 */
  public ChatMessagePage messages(
      String userId, String conversationId, String after, String before) {
    requireMember(userId, conversationId);
    String afterCursor = after == null ? "" : after;
    String beforeCursor = before == null ? "" : before;
    if (!afterCursor.isBlank() && !beforeCursor.isBlank()) {
      throw new ChatException("消息游标不能同时指定 after 和 before");
    }
    return repository.messagePage(conversationId, afterCursor, beforeCursor, MESSAGE_PAGE_SIZE);
  }

  public ChatGroupKey groupKey(String userId, String conversationId) {
    requireGroup(requireMember(userId, conversationId));
    return repository
        .findGroupKey(conversationId)
        .orElseThrow(() -> new ChatException("群会话密钥尚未初始化"));
  }

  /** 仅在群密钥不存在时保存初始设备信封。后续普通消息无需再携带全体设备信封。 */
  public synchronized ChatGroupKey initializeGroupKey(
      String userId, String conversationId, int keyVersion, Map<String, String> keyEnvelopes) {
    ChatConversation conversation = requireGroup(requireMember(userId, conversationId));
    return repository
        .findGroupKey(conversationId)
        .orElseGet(
            () -> {
              ChatGroupKey groupKey =
                  new ChatGroupKey(
                      conversationId,
                      Math.max(1, keyVersion),
                      validatedEnvelopes(conversation, keyEnvelopes),
                      clock.now());
              repository.saveGroupKey(groupKey);
              notifier.conversationChanged(
                  conversation.participantIds(), conversation.id(), groupKey.updatedAt());
              return groupKey;
            });
  }

  public ChatGroupKey addGroupKeyEnvelope(
      String userId, String conversationId, String deviceId, String keyEnvelope) {
    ChatConversation conversation = requireGroup(requireMember(userId, conversationId));
    if (keyEnvelope == null || keyEnvelope.isBlank() || keyEnvelope.length() > 8_000) {
      throw new ChatException("群会话密钥信封无效");
    }
    boolean knownConversationDevice =
        deviceKeys.findByUserIds(conversation.participantIds()).stream()
            .anyMatch(key -> key.deviceId().equals(deviceId));
    if (!knownConversationDevice) {
      throw new ChatException("目标设备不属于该聊天成员");
    }
    ChatGroupKey groupKey =
        repository.findGroupKey(conversationId).orElseThrow(() -> new ChatException("群会话密钥尚未初始化"));
    if (!groupKey.keyEnvelopes().containsKey(deviceId)) {
      repository.mergeGroupKeyEnvelope(conversationId, deviceId, keyEnvelope);
    }
    return repository.findGroupKey(conversationId).orElse(groupKey);
  }

  public ChatDeviceKey registerDevice(String userId, String deviceId, String publicKeyJwk) {
    requireUserId(userId);
    if (deviceId == null || !deviceId.matches("[0-9a-f-]{36}")) {
      throw new ChatException("设备标识无效");
    }
    if (publicKeyJwk == null || publicKeyJwk.isBlank() || publicKeyJwk.length() > 12_000) {
      throw new ChatException("设备公钥无效");
    }
    ChatDeviceKey current =
        deviceKeys.findByUserIds(List.of(userId)).stream()
            .filter(item -> item.deviceId().equals(deviceId))
            .findFirst()
            .orElse(null);
    if (current != null && current.publicKeyJwk().equals(publicKeyJwk)) {
      return current;
    }
    ChatDeviceKey key =
        deviceKeys.save(new ChatDeviceKey(deviceId, userId, publicKeyJwk, clock.now()));
    Set<String> recipients = new LinkedHashSet<>();
    recipients.add(userId);
    repository.conversationsFor(userId).forEach(item -> recipients.addAll(item.participantIds()));
    notifier.deviceChanged(List.copyOf(recipients), userId);
    return key;
  }

  public EncryptedChatMessage addKeyEnvelope(
      String userId, String conversationId, String messageId, String deviceId, String keyEnvelope) {
    ChatConversation conversation = requireMember(userId, conversationId);
    if (keyEnvelope == null || keyEnvelope.isBlank() || keyEnvelope.length() > 8_000) {
      throw new ChatException("消息设备密钥信封无效");
    }
    boolean knownConversationDevice =
        deviceKeys.findByUserIds(conversation.participantIds()).stream()
            .anyMatch(key -> key.deviceId().equals(deviceId));
    if (!knownConversationDevice) {
      throw new ChatException("目标设备不属于该聊天成员");
    }
    EncryptedChatMessage message =
        repository
            .findMessage(conversationId, messageId)
            .orElseThrow(() -> new ChatException("聊天消息不存在"));
    if (message.keyEnvelopes().containsKey(deviceId)) {
      return message;
    }
    repository.mergeMessageKeyEnvelope(conversationId, messageId, deviceId, keyEnvelope);
    java.util.Map<String, String> envelopes = new java.util.LinkedHashMap<>(message.keyEnvelopes());
    envelopes.put(deviceId, keyEnvelope);
    EncryptedChatMessage updated =
        new EncryptedChatMessage(
            message.id(),
            message.conversationId(),
            message.senderId(),
            message.ciphertext(),
            message.nonce(),
            message.keyVersion(),
            java.util.Map.copyOf(envelopes),
            message.createdAt());
    notifier.conversationChanged(conversation.participantIds(), conversation.id(), clock.now());
    return updated;
  }

  public List<ChatDeviceKey> deviceKeys(String userId) {
    requireKnownUser(userId);
    return deviceKeys.findByUserIds(List.of(userId));
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

  private Map<String, String> validatedEnvelopes(
      ChatConversation conversation, Map<String, String> envelopes) {
    if (envelopes == null || envelopes.isEmpty()) {
      throw new ChatException("消息缺少设备密钥信封");
    }
    List<ChatDeviceKey> recipients = deviceKeys.findByUserIds(conversation.participantIds());
    if (recipients.isEmpty()) {
      throw new ChatException("会话成员尚未登记聊天设备");
    }
    Set<String> expectedDeviceIds =
        recipients.stream()
            .map(ChatDeviceKey::deviceId)
            .collect(java.util.stream.Collectors.toSet());
    if (!envelopes.keySet().containsAll(expectedDeviceIds)) {
      throw new ChatException("消息未覆盖所有会话成员设备");
    }
    if (envelopes.values().stream()
        .anyMatch(value -> value == null || value.isBlank() || value.length() > 8_000)) {
      throw new ChatException("消息设备密钥信封无效");
    }
    return Map.copyOf(envelopes);
  }

  private Map<String, String> messageEnvelopes(
      ChatConversation conversation, EncryptedMessageCommand command) {
    ChatGroupKey groupKey =
        conversation.participantIds().size() > 2
                && command.keyEnvelopes() != null
                && command.keyEnvelopes().isEmpty()
            ? repository
                .findGroupKey(conversation.id())
                .filter(item -> item.keyVersion() == Math.max(1, command.keyVersion()))
                .orElse(null)
            : null;
    if (groupKey == null) {
      return validatedEnvelopes(conversation, command.keyEnvelopes());
    }
    Set<String> expectedDeviceIds =
        deviceKeys.findByUserIds(conversation.participantIds()).stream()
            .map(ChatDeviceKey::deviceId)
            .collect(java.util.stream.Collectors.toSet());
    if (!groupKey.keyEnvelopes().keySet().containsAll(expectedDeviceIds)) {
      throw new ChatException("群会话密钥尚未覆盖全部成员设备");
    }
    return Map.of();
  }

  private ChatConversation requireGroup(ChatConversation conversation) {
    if (conversation.participantIds().size() <= 2) {
      throw new ChatException("一对一会话不使用群会话密钥");
    }
    return conversation;
  }

  private String normalizedTitle(String title) {
    String value = title == null ? "" : title.trim();
    return value.isEmpty() ? "加密群聊" : value.length() <= 64 ? value : value.substring(0, 64);
  }

  private void requireUserId(String userId) {
    if (userId == null || !userId.matches("[0-9a-f-]{36}")) {
      throw new ChatException("群成员身份无效");
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

  public record EncryptedMessageCommand(
      String ciphertext, String nonce, int keyVersion, Map<String, String> keyEnvelopes) {}
}
