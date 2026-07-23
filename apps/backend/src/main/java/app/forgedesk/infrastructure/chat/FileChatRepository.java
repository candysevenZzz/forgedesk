package app.forgedesk.infrastructure.chat;

import app.forgedesk.domain.chat.ChatConversation;
import app.forgedesk.domain.chat.ChatGroupKey;
import app.forgedesk.domain.chat.ChatMessagePage;
import app.forgedesk.domain.chat.ChatRepository;
import app.forgedesk.domain.chat.EncryptedChatMessage;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.Optional;
import java.util.stream.StreamSupport;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class FileChatRepository implements ChatRepository {

  private final ObjectMapper objectMapper;

  private final Path chatDirectory =
      Path.of(System.getProperty("user.home"), ".forgedesk", "server", "chat");

  private final Path conversationsPath = chatDirectory.resolve("conversations.json");

  private final Path groupKeysPath = chatDirectory.resolve("group-keys.json");

  @Override
  public synchronized void saveConversation(ChatConversation conversation) {
    ArrayNode values = readArray(conversationsPath);
    ObjectNode value = values.addObject();
    value.put("id", conversation.id());
    value.put("title", conversation.title());
    value.put("createdBy", conversation.createdBy());
    value.put("createdAt", conversation.createdAt());
    value.put("updatedAt", conversation.updatedAt());
    ArrayNode participants = value.putArray("participantIds");
    conversation.participantIds().forEach(participants::add);
    writeArray(conversationsPath, values);
  }

  @Override
  public synchronized void deleteConversation(String conversationId) {
    ArrayNode values = readArray(conversationsPath);
    boolean removed = false;
    for (int index = values.size() - 1; index >= 0; index--) {
      if (conversationId.equals(values.get(index).path("id").asText())) {
        values.remove(index);
        removed = true;
      }
    }
    if (!removed) {
      return;
    }
    writeArray(conversationsPath, values);
    ArrayNode groupKeys = readArray(groupKeysPath);
    for (int index = groupKeys.size() - 1; index >= 0; index--) {
      if (conversationId.equals(groupKeys.get(index).path("conversationId").asText())) {
        groupKeys.remove(index);
      }
    }
    writeArray(groupKeysPath, groupKeys);
    try {
      Files.deleteIfExists(messagePath(conversationId));
    } catch (IOException exception) {
      throw new IllegalStateException("无法删除聊天密文", exception);
    }
  }

  @Override
  public synchronized void touchConversation(String conversationId, String updatedAt) {
    ArrayNode values = readArray(conversationsPath);
    values(values)
        .filter(item -> conversationId.equals(item.path("id").asText()))
        .findFirst()
        .ifPresent(item -> ((ObjectNode) item).put("updatedAt", updatedAt));
    writeArray(conversationsPath, values);
  }

  @Override
  public Optional<ChatConversation> findConversation(String conversationId) {
    return conversations().stream().filter(item -> item.id().equals(conversationId)).findFirst();
  }

  @Override
  public List<ChatConversation> conversationsFor(String userId) {
    return conversations().stream()
        .filter(item -> item.includes(userId))
        .sorted(java.util.Comparator.comparing(this::updatedAt).reversed())
        .toList();
  }

  @Override
  public synchronized void appendMessage(EncryptedChatMessage message) {
    Path path = messagePath(message.conversationId());
    ArrayNode values = readArray(path);
    ObjectNode value = values.addObject();
    value.put("id", message.id());
    value.put("conversationId", message.conversationId());
    value.put("senderId", message.senderId());
    value.put("ciphertext", message.ciphertext());
    value.put("nonce", message.nonce());
    value.put("keyVersion", message.keyVersion());
    ObjectNode envelopes = value.putObject("keyEnvelopes");
    message.keyEnvelopes().forEach(envelopes::put);
    value.put("createdAt", message.createdAt());
    writeArray(path, values);
  }

  @Override
  public synchronized void mergeMessageKeyEnvelope(
      String conversationId, String messageId, String deviceId, String keyEnvelope) {
    Path path = messagePath(conversationId);
    ArrayNode values = readArray(path);
    values(values)
        .filter(item -> messageId.equals(item.path("id").asText()))
        .findFirst()
        .ifPresent(
            item -> {
              ObjectNode message = (ObjectNode) item;
              ObjectNode envelopes =
                  message.path("keyEnvelopes").isObject()
                      ? (ObjectNode) message.path("keyEnvelopes")
                      : message.putObject("keyEnvelopes");
              envelopes.put(deviceId, keyEnvelope);
            });
    writeArray(path, values);
  }

  @Override
  public Optional<ChatGroupKey> findGroupKey(String conversationId) {
    return groupKeys().stream()
        .filter(item -> item.conversationId().equals(conversationId))
        .findFirst();
  }

  @Override
  public synchronized void saveGroupKey(ChatGroupKey groupKey) {
    ArrayNode values = readArray(groupKeysPath);
    for (int index = values.size() - 1; index >= 0; index--) {
      if (groupKey.conversationId().equals(values.get(index).path("conversationId").asText())) {
        values.remove(index);
      }
    }
    ObjectNode value = values.addObject();
    value.put("conversationId", groupKey.conversationId());
    value.put("keyVersion", groupKey.keyVersion());
    value.put("updatedAt", groupKey.updatedAt());
    ObjectNode envelopes = value.putObject("keyEnvelopes");
    groupKey.keyEnvelopes().forEach(envelopes::put);
    writeArray(groupKeysPath, values);
  }

  @Override
  public synchronized void mergeGroupKeyEnvelope(
      String conversationId, String deviceId, String keyEnvelope) {
    ArrayNode values = readArray(groupKeysPath);
    values(values)
        .filter(item -> conversationId.equals(item.path("conversationId").asText()))
        .findFirst()
        .ifPresent(
            item -> {
              ObjectNode groupKey = (ObjectNode) item;
              ObjectNode envelopes =
                  groupKey.path("keyEnvelopes").isObject()
                      ? (ObjectNode) groupKey.path("keyEnvelopes")
                      : groupKey.putObject("keyEnvelopes");
              envelopes.put(deviceId, keyEnvelope);
            });
    writeArray(groupKeysPath, values);
  }

  @Override
  public List<EncryptedChatMessage> messagesAfter(String conversationId, String after) {
    return messages(messagePath(conversationId)).stream()
        .filter(item -> after.isBlank() || createdAt(item).isAfter(parseTimestamp(after)))
        .toList();
  }

  @Override
  public ChatMessagePage messagePage(
      String conversationId, String after, String before, int limit) {
    List<EncryptedChatMessage> all = messages(messagePath(conversationId));
    int pageSize = Math.max(1, Math.min(limit, 200));
    if (!after.isBlank()) {
      List<EncryptedChatMessage> newer =
          all.stream().filter(item -> createdAt(item).isAfter(parseTimestamp(after))).toList();
      List<EncryptedChatMessage> page = newer.stream().limit(pageSize).toList();
      return new ChatMessagePage(
          page,
          page.isEmpty() ? after : page.getLast().createdAt(),
          "",
          newer.size() > page.size(),
          false);
    }
    if (!before.isBlank()) {
      List<EncryptedChatMessage> older =
          all.stream().filter(item -> createdAt(item).isBefore(parseTimestamp(before))).toList();
      int start = Math.max(0, older.size() - pageSize);
      List<EncryptedChatMessage> page = older.subList(start, older.size());
      return new ChatMessagePage(
          page,
          "",
          page.isEmpty() ? before : page.getFirst().createdAt(),
          false,
          older.size() > page.size());
    }
    int start = Math.max(0, all.size() - pageSize);
    List<EncryptedChatMessage> page = all.subList(start, all.size());
    return new ChatMessagePage(
        page,
        page.isEmpty() ? "" : page.getLast().createdAt(),
        page.isEmpty() ? "" : page.getFirst().createdAt(),
        false,
        all.size() > page.size());
  }

  private List<ChatConversation> conversations() {
    return values(readArray(conversationsPath)).map(this::conversation).toList();
  }

  private List<ChatGroupKey> groupKeys() {
    return values(readArray(groupKeysPath)).map(this::groupKey).toList();
  }

  private List<EncryptedChatMessage> messages(Path path) {
    return values(readArray(path)).map(this::message).toList();
  }

  private java.util.stream.Stream<JsonNode> values(ArrayNode values) {
    return java.util.stream.StreamSupport.stream(values.spliterator(), false)
        .filter(JsonNode::isObject);
  }

  private ChatConversation conversation(JsonNode value) {
    ArrayNode participants =
        value.path("participantIds").isArray()
            ? (ArrayNode) value.path("participantIds")
            : objectMapper.createArrayNode();
    return new ChatConversation(
        value.path("id").asText(),
        value.path("title").asText(),
        StreamSupport.stream(participants.spliterator(), false).map(JsonNode::asText).toList(),
        value.path("createdBy").asText(),
        value.path("createdAt").asText(),
        value.path("updatedAt").asText());
  }

  private EncryptedChatMessage message(JsonNode value) {
    return new EncryptedChatMessage(
        value.path("id").asText(),
        value.path("conversationId").asText(),
        value.path("senderId").asText(),
        value.path("ciphertext").asText(),
        value.path("nonce").asText(),
        value.path("keyVersion").asInt(1),
        envelopes(value.path("keyEnvelopes")),
        value.path("createdAt").asText());
  }

  private ChatGroupKey groupKey(JsonNode value) {
    return new ChatGroupKey(
        value.path("conversationId").asText(),
        Math.max(1, value.path("keyVersion").asInt(1)),
        envelopes(value.path("keyEnvelopes")),
        value.path("updatedAt").asText());
  }

  private java.util.Map<String, String> envelopes(JsonNode value) {
    if (!value.isObject()) {
      return java.util.Map.of();
    }
    java.util.Map<String, String> envelopes = new java.util.LinkedHashMap<>();
    value
        .fields()
        .forEachRemaining(entry -> envelopes.put(entry.getKey(), entry.getValue().asText()));
    return java.util.Map.copyOf(envelopes);
  }

  private ArrayNode readArray(Path path) {
    if (!Files.exists(path)) {
      return objectMapper.createArrayNode();
    }
    try {
      JsonNode value = objectMapper.readTree(path.toFile());
      return value != null && value.isArray() ? (ArrayNode) value : objectMapper.createArrayNode();
    } catch (IOException exception) {
      throw new IllegalStateException("无法读取聊天密文", exception);
    }
  }

  private void writeArray(Path path, ArrayNode values) {
    try {
      Files.createDirectories(path.getParent());
      Path temporary = path.resolveSibling(path.getFileName() + ".tmp");
      objectMapper.writeValue(temporary.toFile(), values);
      try {
        Files.move(
            temporary, path, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
      } catch (AtomicMoveNotSupportedException exception) {
        Files.move(temporary, path, StandardCopyOption.REPLACE_EXISTING);
      }
    } catch (IOException exception) {
      throw new IllegalStateException("无法保存聊天密文", exception);
    }
  }

  private Path messagePath(String conversationId) {
    return chatDirectory.resolve("messages").resolve(conversationId + ".json");
  }

  private java.time.Instant updatedAt(ChatConversation conversation) {
    return parseTimestamp(conversation.updatedAt());
  }

  private java.time.Instant createdAt(EncryptedChatMessage message) {
    return parseTimestamp(message.createdAt());
  }

  private java.time.Instant parseTimestamp(String value) {
    try {
      return java.time.Instant.parse(value);
    } catch (Exception ignored) {
      return java.time.Instant.EPOCH;
    }
  }
}
