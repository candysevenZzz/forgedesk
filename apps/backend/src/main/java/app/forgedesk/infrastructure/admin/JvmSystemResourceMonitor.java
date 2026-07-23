package app.forgedesk.infrastructure.admin;

import app.forgedesk.domain.admin.SystemResourceMonitor;
import com.sun.management.OperatingSystemMXBean;
import java.io.IOException;
import java.lang.management.ManagementFactory;
import java.nio.file.FileStore;
import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.stereotype.Service;

@Service
public class JvmSystemResourceMonitor implements SystemResourceMonitor {

  private final Path serverDirectory =
      Path.of(System.getProperty("user.home"), ".forgedesk", "server");

  @Override
  public SystemResources snapshot() {
    OperatingSystemMXBean operatingSystem =
        (OperatingSystemMXBean) ManagementFactory.getOperatingSystemMXBean();
    long totalMemory = operatingSystem.getTotalMemorySize();
    long freeMemory = operatingSystem.getFreeMemorySize();
    return new SystemResources(
        new Cpu(
            operatingSystem.getAvailableProcessors(),
            percentage(operatingSystem.getProcessCpuLoad()),
            percentage(operatingSystem.getCpuLoad())),
        new Memory(totalMemory, Math.max(0, totalMemory - freeMemory), freeMemory),
        disk());
  }

  private Disk disk() {
    try {
      Files.createDirectories(serverDirectory);
      FileStore fileStore = Files.getFileStore(serverDirectory);
      long total = fileStore.getTotalSpace();
      long usable = fileStore.getUsableSpace();
      return new Disk(serverDirectory.toString(), total, Math.max(0, total - usable), usable);
    } catch (IOException exception) {
      throw new IllegalStateException("无法读取服务目录所在磁盘状态", exception);
    }
  }

  private double percentage(double value) {
    return value < 0 ? 0 : Math.round(value * 10_000d) / 100d;
  }
}
