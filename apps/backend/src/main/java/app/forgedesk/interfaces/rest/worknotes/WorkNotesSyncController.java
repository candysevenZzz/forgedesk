package app.forgedesk.interfaces.rest.worknotes;

import app.forgedesk.application.worknotes.WorkNotesSyncApplicationService;
import app.forgedesk.domain.time.PlatformClock;
import app.forgedesk.interfaces.security.RequestIdentity;
import app.forgedesk.interfaces.security.RequireLogin;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/work-notes")
@RequiredArgsConstructor
public class WorkNotesSyncController {

  private final WorkNotesSyncApplicationService syncService;

  private final PlatformClock clock;

  @PostMapping("/sync")
  @RequireLogin
  SyncResponse sync(@RequestBody SyncRequest request) {
    if (request.archive() == null || !request.archive().isObject()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "笔记归档格式无效");
    }
    return new SyncResponse(
        syncService.sync(RequestIdentity.current().id(), request.archive()), clock.now());
  }

  record SyncRequest(JsonNode archive) {}

  record SyncResponse(JsonNode archive, String syncedAt) {}
}
