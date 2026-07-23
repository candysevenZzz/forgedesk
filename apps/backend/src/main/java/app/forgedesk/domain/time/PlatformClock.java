package app.forgedesk.domain.time;

import java.time.Instant;

public interface PlatformClock {

  Instant instant();

  String now();

  String format(Instant instant);
}
