package app.forgedesk.interfaces.rest.health;

import app.forgedesk.domain.time.PlatformClock;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class HealthController {

  private final PlatformClock clock;

  @GetMapping("/api/health")
  HealthResponse health() {
    return new HealthResponse("ok", clock.now());
  }

  record HealthResponse(String status, String checkedAt) {}
}
