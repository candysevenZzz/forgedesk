package app.forgedesk.worknotes;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import org.springframework.stereotype.Service;

@Service
public class WorkNotesSyncService {

    private final ObjectMapper objectMapper;
    private final Path archivePath = Path.of(System.getProperty("user.home"), ".forgedesk", "work-notes-remote.json");

    public WorkNotesSyncService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public synchronized ObjectNode sync(JsonNode clientArchive) {
        ObjectNode merged = merge(readArchive(), normalize(clientArchive));
        writeArchive(merged);
        return merged;
    }

    private ObjectNode readArchive() {
        if (!Files.exists(archivePath)) return emptyArchive();
        try {
            return normalize(objectMapper.readTree(archivePath.toFile()));
        } catch (IOException exception) {
            throw new IllegalStateException("无法读取服务端笔记归档", exception);
        }
    }

    private void writeArchive(ObjectNode archive) {
        try {
            Files.createDirectories(archivePath.getParent());
            Path temporaryPath = archivePath.resolveSibling(archivePath.getFileName() + ".tmp");
            objectMapper.writeValue(temporaryPath.toFile(), archive);
            try {
                Files.move(temporaryPath, archivePath, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            } catch (AtomicMoveNotSupportedException exception) {
                Files.move(temporaryPath, archivePath, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException exception) {
            throw new IllegalStateException("无法保存服务端笔记归档", exception);
        }
    }

    private ObjectNode merge(ObjectNode serverArchive, ObjectNode clientArchive) {
        Map<String, NoteEntry> serverNotes = collectNotes(serverArchive);
        Map<String, NoteEntry> clientNotes = collectNotes(clientArchive);
        Map<String, String> serverTombstones = collectTombstones(serverArchive);
        Map<String, String> clientTombstones = collectTombstones(clientArchive);
        Set<String> ids = new HashSet<>();
        ids.addAll(serverNotes.keySet());
        ids.addAll(clientNotes.keySet());
        ids.addAll(serverTombstones.keySet());
        ids.addAll(clientTombstones.keySet());

        Map<String, ArrayNode> mergedDays = new TreeMap<>();
        Map<String, String> mergedTombstones = new TreeMap<>();
        for (String id : ids) {
            NoteEntry note = newer(serverNotes.get(id), clientNotes.get(id));
            String tombstone = newerTimestamp(serverTombstones.get(id), clientTombstones.get(id));
            if (note == null || (!tombstone.isEmpty() && tombstone.compareTo(note.updatedAt()) >= 0)) {
                if (!tombstone.isEmpty()) mergedTombstones.put(id, tombstone);
                continue;
            }
            mergedDays.computeIfAbsent(note.date(), ignored -> objectMapper.createArrayNode()).add(note.note());
        }

        ObjectNode archive = emptyArchive();
        ObjectNode days = (ObjectNode) archive.get("days");
        mergedDays.forEach(days::set);
        ObjectNode tombstones = (ObjectNode) archive.get("tombstones");
        mergedTombstones.forEach(tombstones::put);
        return archive;
    }

    private Map<String, NoteEntry> collectNotes(ObjectNode archive) {
        Map<String, NoteEntry> notes = new HashMap<>();
        JsonNode days = archive.path("days");
        days.fields().forEachRemaining(day -> {
            if (!day.getValue().isArray()) return;
            for (JsonNode note : day.getValue()) {
                String id = note.path("id").asText();
                if (id.isBlank() || !note.isObject()) continue;
                NoteEntry candidate = new NoteEntry(day.getKey(), note.deepCopy(), note.path("updatedAt").asText(""));
                notes.merge(id, candidate, this::newer);
            }
        });
        return notes;
    }

    private Map<String, String> collectTombstones(ObjectNode archive) {
        Map<String, String> tombstones = new HashMap<>();
        archive.path("tombstones").fields().forEachRemaining(entry -> {
            if (entry.getValue().isTextual()) tombstones.put(entry.getKey(), entry.getValue().asText());
        });
        return tombstones;
    }

    private NoteEntry newer(NoteEntry first, NoteEntry second) {
        if (first == null) return second;
        if (second == null) return first;
        return first.updatedAt().compareTo(second.updatedAt()) >= 0 ? first : second;
    }

    private String newerTimestamp(String first, String second) {
        String left = first == null ? "" : first;
        String right = second == null ? "" : second;
        return left.compareTo(right) >= 0 ? left : right;
    }

    private ObjectNode normalize(JsonNode value) {
        ObjectNode archive = emptyArchive();
        if (value == null || !value.isObject()) return archive;
        JsonNode sourceDays = value.path("days");
        if (sourceDays.isObject()) ((ObjectNode) archive.get("days")).setAll((ObjectNode) sourceDays.deepCopy());
        JsonNode sourceTombstones = value.path("tombstones");
        if (sourceTombstones.isObject()) ((ObjectNode) archive.get("tombstones")).setAll((ObjectNode) sourceTombstones.deepCopy());
        return archive;
    }

    private ObjectNode emptyArchive() {
        ObjectNode archive = objectMapper.createObjectNode();
        archive.put("version", 2);
        archive.set("days", objectMapper.createObjectNode());
        archive.set("tombstones", objectMapper.createObjectNode());
        return archive;
    }

    private record NoteEntry(String date, JsonNode note, String updatedAt) {
    }
}
