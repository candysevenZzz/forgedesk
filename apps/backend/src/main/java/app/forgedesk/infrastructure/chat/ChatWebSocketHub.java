package app.forgedesk.infrastructure.chat;

import app.forgedesk.application.chat.ChatSocketTicketApplicationService;
import app.forgedesk.domain.chat.ChatRealtimeNotifier;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

@Component
@RequiredArgsConstructor
public class ChatWebSocketHub extends TextWebSocketHandler implements ChatRealtimeNotifier {

  private final ChatSocketTicketApplicationService socketTickets;

  private final ObjectMapper objectMapper;

  private final Map<String, List<WebSocketSession>> sessionsByUser = new ConcurrentHashMap<>();

  @Override
  public void afterConnectionEstablished(WebSocketSession session) throws Exception {
    String userId = socketTickets.consume(queryTicket(session.getUri()));
    session.getAttributes().put("userId", userId);
    List<WebSocketSession> sessions =
        sessionsByUser.computeIfAbsent(userId, ignored -> new CopyOnWriteArrayList<>());
    boolean wasOffline = sessions.isEmpty();
    sessions.add(session);
    send(session, Map.of("type", "ready", "onlineUserIds", onlineUserIds()));
    if (wasOffline) {
      broadcastPresenceChanged(userId, true);
    }
  }

  @Override
  protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
    JsonNode value = objectMapper.readTree(message.getPayload());
    if (!"signal".equals(value.path("type").asText())) {
      return;
    }
    String targetUserId = value.path("targetUserId").asText();
    if (!targetUserId.matches("[0-9a-f-]{36}")) {
      return;
    }
    String senderId = (String) session.getAttributes().get("userId");
    notify(
        targetUserId,
        Map.of("type", "signal", "fromUserId", senderId, "payload", value.path("payload")));
  }

  @Override
  public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
    Object userId = session.getAttributes().get("userId");
    if (userId instanceof String id) {
      boolean isOffline =
          sessionsByUser.computeIfPresent(
                  id,
                  (ignored, sessions) -> {
                    sessions.remove(session);
                    return sessions.isEmpty() ? null : sessions;
                  })
              == null;
      if (isOffline) {
        broadcastPresenceChanged(id, false);
      }
    }
  }

  @Override
  public void conversationChanged(List<String> userIds, String conversationId, String createdAt) {
    userIds.forEach(
        userId ->
            notify(
                userId,
                Map.of(
                    "type",
                    "conversation-changed",
                    "conversationId",
                    conversationId,
                    "createdAt",
                    createdAt)));
  }

  @Override
  public void conversationDeleted(List<String> userIds, String conversationId, String deletedAt) {
    userIds.forEach(
        userId ->
            notify(
                userId,
                Map.of(
                    "type",
                    "conversation-deleted",
                    "conversationId",
                    conversationId,
                    "deletedAt",
                    deletedAt)));
  }

  @Override
  public void messageCreated(
      List<String> userIds, String conversationId, String senderId, String createdAt) {
    userIds.forEach(
        userId ->
            notify(
                userId,
                Map.of(
                    "type",
                    "message-created",
                    "conversationId",
                    conversationId,
                    "senderId",
                    senderId,
                    "createdAt",
                    createdAt)));
  }

  @Override
  public Set<String> onlineUserIds() {
    return Set.copyOf(sessionsByUser.keySet());
  }

  private void broadcastPresenceChanged(String userId, boolean online) {
    onlineUserIds()
        .forEach(
            recipientId ->
                notify(
                    recipientId,
                    Map.of("type", "presence-changed", "userId", userId, "online", online)));
  }

  private void notify(String userId, Map<String, ?> event) {
    sessionsByUser
        .getOrDefault(userId, List.of())
        .forEach(
            session -> {
              try {
                send(session, event);
              } catch (Exception ignored) {
              }
            });
  }

  private void send(WebSocketSession session, Object event) throws Exception {
    if (session.isOpen()) {
      synchronized (session) {
        session.sendMessage(new TextMessage(objectMapper.writeValueAsString(event)));
      }
    }
  }

  private String queryTicket(URI uri) {
    if (uri == null || uri.getQuery() == null) {
      return "";
    }
    for (String item : uri.getQuery().split("&")) {
      if (item.startsWith("ticket=")) {
        return java.net.URLDecoder.decode(
            item.substring(7), java.nio.charset.StandardCharsets.UTF_8);
      }
    }
    return "";
  }
}
