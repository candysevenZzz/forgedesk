package app.forgedesk.domain.landlord;

import java.util.List;

/** Publishes a lightweight room-change event. Clients fetch their own redacted view afterwards. */
public interface LandlordRealtimeNotifier {

  void roomChanged(List<String> userIds, String roomId);
}
