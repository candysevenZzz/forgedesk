package app.forgedesk.domain.landlord;

import java.util.List;
import java.util.Optional;

public interface LandlordRoomRepository {

  Optional<LandlordRoomState> find(String roomId);

  List<LandlordRoomState> findWaitingRooms();

  void save(LandlordRoomState room);
}
