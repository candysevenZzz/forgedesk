package app.forgedesk.infrastructure.landlord;

import app.forgedesk.domain.landlord.LandlordRoomRepository;
import app.forgedesk.domain.landlord.LandlordRoomState;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class CachedLandlordRoomRepository implements LandlordRoomRepository {

  private static final String ROOM_PREFIX = "forgedesk:landlord:room:v2:";
  private static final String LEGACY_ROOM_PREFIX = "forgedesk:landlord:room:";
  // Kept only to migrate rooms created before MySQL became the source of truth.
  private static final String WAITING_SET = "forgedesk:landlord:waiting";
  private static final Duration CACHE_LIFETIME = Duration.ofHours(2);

  private final JdbcTemplate jdbc;
  private final StringRedisTemplate redis;
  private final ObjectMapper objectMapper;

  @Override
  public Optional<LandlordRoomState> find(String roomId) {
    Optional<LandlordRoomState> cached = cached(roomId);
    if (cached.isPresent()) {
      return cached;
    }
    Optional<LandlordRoomState> persisted =
        jdbc
            .query(
                "SELECT state FROM landlord_rooms WHERE id = ?",
                (resultSet, rowNum) -> deserialize(resultSet.getString("state")),
                roomId)
            .stream()
            .findFirst();
    if (persisted.isPresent()) {
      cache(persisted.get());
      return persisted;
    }
    return legacy(roomId);
  }

  @Override
  public List<LandlordRoomState> findWaitingRooms() {
    Map<String, LandlordRoomState> rooms = new LinkedHashMap<>();
    jdbc.query(
            "SELECT state FROM landlord_rooms WHERE status = 'WAITING' ORDER BY updated_at DESC",
            (resultSet, rowNum) -> deserialize(resultSet.getString("state")))
        .forEach(room -> rooms.put(room.getId(), room));
    java.util.Set<String> legacyIds = redis.opsForSet().members(WAITING_SET);
    if (legacyIds != null) {
      legacyIds.forEach(
          roomId ->
              legacy(roomId)
                  .filter(room -> "WAITING".equals(room.getStatus()))
                  .ifPresent(room -> rooms.putIfAbsent(room.getId(), room)));
    }
    return List.copyOf(rooms.values());
  }

  @Override
  public void save(LandlordRoomState room) {
    try {
      String serialized = objectMapper.writeValueAsString(room);
      jdbc.update(
          "INSERT INTO landlord_rooms (id, owner_id, status, state, updated_at) "
              + "VALUES (?, ?, ?, CAST(? AS JSON), ?) "
              + "ON DUPLICATE KEY UPDATE owner_id = VALUES(owner_id), status = VALUES(status), "
              + "state = VALUES(state), updated_at = VALUES(updated_at)",
          room.getId(),
          room.getOwnerId(),
          room.getStatus(),
          serialized,
          room.getUpdatedAt());
      cache(room, serialized);
      redis.opsForSet().remove(WAITING_SET, room.getId());
    } catch (Exception exception) {
      throw new IllegalStateException("无法保存斗地主房间", exception);
    }
  }

  private Optional<LandlordRoomState> cached(String roomId) {
    String serialized = redis.opsForValue().get(key(roomId));
    if (serialized == null || serialized.isBlank()) {
      return Optional.empty();
    }
    try {
      return Optional.of(deserialize(serialized));
    } catch (Exception exception) {
      redis.delete(key(roomId));
      return Optional.empty();
    }
  }

  private Optional<LandlordRoomState> legacy(String roomId) {
    String serialized = redis.opsForValue().get(legacyKey(roomId));
    if (serialized == null || serialized.isBlank()) {
      return Optional.empty();
    }
    try {
      LandlordRoomState room = deserialize(serialized);
      save(room);
      return Optional.of(room);
    } catch (Exception exception) {
      redis.delete(legacyKey(roomId));
      redis.opsForSet().remove(WAITING_SET, roomId);
      return Optional.empty();
    }
  }

  private LandlordRoomState deserialize(String serialized) {
    try {
      return objectMapper.readValue(serialized, LandlordRoomState.class);
    } catch (Exception exception) {
      throw new IllegalStateException("斗地主房间数据无效", exception);
    }
  }

  private void cache(LandlordRoomState room) {
    try {
      cache(room, objectMapper.writeValueAsString(room));
    } catch (Exception exception) {
      throw new IllegalStateException("无法缓存斗地主房间", exception);
    }
  }

  private void cache(LandlordRoomState room, String serialized) {
    redis.opsForValue().set(key(room.getId()), serialized, CACHE_LIFETIME);
  }

  private String key(String roomId) {
    return ROOM_PREFIX + roomId;
  }

  private String legacyKey(String roomId) {
    return LEGACY_ROOM_PREFIX + roomId;
  }
}
