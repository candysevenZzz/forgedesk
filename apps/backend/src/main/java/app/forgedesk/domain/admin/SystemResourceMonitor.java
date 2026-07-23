package app.forgedesk.domain.admin;

public interface SystemResourceMonitor {

  SystemResources snapshot();

  record SystemResources(Cpu cpu, Memory memory, Disk disk) {}

  record Cpu(int availableProcessors, double processLoadPercent, double systemLoadPercent) {}

  record Memory(long totalBytes, long usedBytes, long freeBytes) {}

  record Disk(String path, long totalBytes, long usedBytes, long usableBytes) {}
}
