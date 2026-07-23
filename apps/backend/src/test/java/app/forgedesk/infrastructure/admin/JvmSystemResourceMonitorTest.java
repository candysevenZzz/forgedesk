package app.forgedesk.infrastructure.admin;

import static org.assertj.core.api.Assertions.assertThat;

import app.forgedesk.domain.admin.SystemResourceMonitor.SystemResources;
import org.junit.jupiter.api.Test;

class JvmSystemResourceMonitorTest {

  @Test
  void reportsNonNegativeServerResources() {
    SystemResources resources = new JvmSystemResourceMonitor().snapshot();
    assertThat(resources.cpu().availableProcessors()).isPositive();
    assertThat(resources.cpu().processLoadPercent()).isBetween(0d, 100d);
    assertThat(resources.cpu().systemLoadPercent()).isBetween(0d, 100d);
    assertThat(resources.memory().totalBytes()).isPositive();
    assertThat(resources.memory().usedBytes()).isGreaterThanOrEqualTo(0);
    assertThat(resources.disk().totalBytes()).isPositive();
    assertThat(resources.disk().usableBytes()).isGreaterThanOrEqualTo(0);
  }
}
