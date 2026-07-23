package app.forgedesk.infrastructure.time;

import app.forgedesk.domain.time.PlatformClock;
import java.time.Clock;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ShanghaiPlatformClock implements PlatformClock {

  private final Clock clock;

  @Override
  public Instant instant() {
    return clock.instant();
  }

  @Override
  public String now() {
    return format(instant());
  }

  @Override
  public String format(Instant instant) {
    return DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(instant.atZone(clock.getZone()));
  }
}
