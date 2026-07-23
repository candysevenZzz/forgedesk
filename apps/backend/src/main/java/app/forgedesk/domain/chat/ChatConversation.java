package app.forgedesk.domain.chat;

import java.util.List;

public record ChatConversation(
    String id,
    String title,
    List<String> participantIds,
    String createdBy,
    String createdAt,
    String updatedAt) {

  public boolean includes(String userId) {
    return participantIds.contains(userId);
  }
}
