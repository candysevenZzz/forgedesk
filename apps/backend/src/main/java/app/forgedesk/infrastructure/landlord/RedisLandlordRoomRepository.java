package app.forgedesk.infrastructure.landlord;

import app.forgedesk.domain.landlord.LandlordRoomRepository;
import app.forgedesk.domain.landlord.LandlordRoomState;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class RedisLandlordRoomRepository implements LandlordRoomRepository {

  private static final String ROOM_PREFIX = "forgedesk:landlord:room:";
  private static final String WAITING_SET = "forgedesk:landlord:waiting";
  private static final Duration ROOM_LIFETIME = Duration.ofHours(24);

  private final StringRedisTemplate redis;
  private final ObjectMapper objectMapper;

  @Override
  public Optional<LandlordRoomState> find(String roomId) {
    String serialized = redis.opsForValue().get(key(roomId));
    if (serialized == null || serialized.isBlank()) {
      return Optional.empty();
    }
    try {
      return Optional.of(objectMapper.readValue(serialized, LandlordRoomState.class));
    } catch (Exception exception) {
      redis.delete(key(roomId));
      redis.opsForSet().remove(WAITING_SET, roomId);
      return Optional.empty();
    }
  }

  @Override
  public List<LandlordRoomState> findWaitingRooms() {
    java.util.Set<String> roomIds = redis.opsForSet().members(WAITING_SET);
    if (roomIds == null || roomIds.isEmpty()) {
      return List.of();
    }
    return roomIds.stream()
        .map(this::find)
        .flatMap(Optional::stream)
        .filter(room -> "WAITING".equals(room.getStatus()))
        .toList();
  }

  @Override
  public void save(LandlordRoomState room) {
    try {
      redis
          .opsForValue()
          .set(key(room.getId()), objectMapper.writeValueAsString(room), ROOM_LIFETIME);
      if ("WAITING".equals(room.getStatus())) {
        redis.opsForSet().add(WAITING_SET, room.getId());
      } else {
        redis.opsForSet().remove(WAITING_SET, room.getId());
      }
    } catch (Exception exception) {
      throw new IllegalStateException("无法保存斗地主房间", exception);
    }
  }

  private String key(String roomId) {
    return ROOM_PREFIX + roomId;
  }
}
