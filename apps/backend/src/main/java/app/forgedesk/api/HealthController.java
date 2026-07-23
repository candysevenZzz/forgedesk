package app.forgedesk.api;

import java.time.Instant;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {

    @GetMapping("/api/health")
    HealthResponse health() {
        return new HealthResponse("ok", Instant.now().toString());
    }

    record HealthResponse(String status, String checkedAt) {
    }
}
