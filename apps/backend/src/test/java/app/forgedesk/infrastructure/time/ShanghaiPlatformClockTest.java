package app.forgedesk.infrastructure.time;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import org.junit.jupiter.api.Test;

class ShanghaiPlatformClockTest {

  @Test
  void rendersTheConfiguredEastEightOffset() {
    ShanghaiPlatformClock clock =
        new ShanghaiPlatformClock(
            Clock.fixed(Instant.parse("2026-07-23T08:00:00Z"), ZoneId.of("Asia/Shanghai")));

    assertThat(clock.now()).isEqualTo("2026-07-23T16:00:00+08:00");
  }
}
