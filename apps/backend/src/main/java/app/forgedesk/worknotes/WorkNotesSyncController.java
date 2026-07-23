package app.forgedesk.worknotes;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/work-notes")
public class WorkNotesSyncController {

    private final WorkNotesSyncService syncService;

    public WorkNotesSyncController(WorkNotesSyncService syncService) {
        this.syncService = syncService;
    }

    @PostMapping("/sync")
    SyncResponse sync(@RequestBody SyncRequest request) {
        if (request.archive() == null || !request.archive().isObject()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "笔记归档格式无效");
        }
        return new SyncResponse(syncService.sync(request.archive()), Instant.now().toString());
    }

    record SyncRequest(JsonNode archive) {
    }

    record SyncResponse(JsonNode archive, String syncedAt) {
    }
}
