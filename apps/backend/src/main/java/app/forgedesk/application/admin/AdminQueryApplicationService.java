package app.forgedesk.application.admin;

import app.forgedesk.application.auth.AuthApplicationService;
import app.forgedesk.application.translation.TranslationConfigurationApplicationService;
import app.forgedesk.application.worknotes.WorkNotesSyncApplicationService;
import app.forgedesk.domain.admin.StorageIndex;
import app.forgedesk.domain.admin.SystemResourceMonitor;
import app.forgedesk.domain.time.PlatformClock;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class AdminQueryApplicationService {

  private final AuthApplicationService authService;

  private final WorkNotesSyncApplicationService workNotesSyncService;

  private final TranslationConfigurationApplicationService translationConfigurationService;

  private final StorageIndex storageIndex;

  private final SystemResourceMonitor resourceMonitor;

  private final PlatformClock clock;

  private final java.time.Instant startedAt;

  public AdminQueryApplicationService(
      AuthApplicationService authService,
      WorkNotesSyncApplicationService workNotesSyncService,
      TranslationConfigurationApplicationService translationConfigurationService,
      StorageIndex storageIndex,
      SystemResourceMonitor resourceMonitor,
      PlatformClock clock) {
    this.authService = authService;
    this.workNotesSyncService = workNotesSyncService;
    this.translationConfigurationService = translationConfigurationService;
    this.storageIndex = storageIndex;
    this.resourceMonitor = resourceMonitor;
    this.clock = clock;
    this.startedAt = clock.instant();
  }

  public AdminOverview overview() {
    return new AdminOverview(
        clock.format(startedAt),
        Math.max(0, clock.instant().getEpochSecond() - startedAt.getEpochSecond()),
        authService.usersForAdmin().size(),
        authService.activeSessionCount(),
        workNotesSyncService.archiveCount(),
        translationConfigurationService.configuredUserCount());
  }

  public List<UserRecord> users() {
    return authService.usersForAdmin().stream()
        .map(
            user ->
                new UserRecord(
                    user.id(), user.username(), user.displayName(), user.role(), user.createdAt()))
        .toList();
  }

  public List<StorageRecord> records() {
    return storageIndex.list().stream()
        .map(
            item ->
                new StorageRecord(item.kind(), item.userId(), item.sizeBytes(), item.updatedAt()))
        .toList();
  }

  public SystemStatus systemStatus() {
    SystemResourceMonitor.SystemResources resources = resourceMonitor.snapshot();
    List<StorageIndex.StoredResource> resourcesByFile = storageIndex.list();
    List<UserStorageUsage> userStorage =
        resourcesByFile.stream()
            .filter(item -> !item.userId().isBlank())
            .collect(
                java.util.stream.Collectors.groupingBy(
                    StorageIndex.StoredResource::userId,
                    java.util.TreeMap::new,
                    java.util.stream.Collectors.toList()))
            .entrySet()
            .stream()
            .map(
                entry ->
                    new UserStorageUsage(
                        entry.getKey(),
                        entry.getValue().size(),
                        entry.getValue().stream()
                            .mapToLong(StorageIndex.StoredResource::sizeBytes)
                            .sum(),
                        entry.getValue().stream()
                            .map(StorageIndex.StoredResource::updatedAt)
                            .max(java.util.Comparator.comparing(this::parseTimestamp))
                            .orElse("")))
            .sorted(java.util.Comparator.comparingLong(UserStorageUsage::sizeBytes).reversed())
            .toList();
    long totalUserStorage = userStorage.stream().mapToLong(UserStorageUsage::sizeBytes).sum();
    return new SystemStatus(
        new CpuStatus(
            resources.cpu().availableProcessors(),
            resources.cpu().processLoadPercent(),
            resources.cpu().systemLoadPercent()),
        new MemoryStatus(
            resources.memory().totalBytes(),
            resources.memory().usedBytes(),
            resources.memory().freeBytes()),
        new DiskStatus(
            resources.disk().path(),
            resources.disk().totalBytes(),
            resources.disk().usedBytes(),
            resources.disk().usableBytes()),
        totalUserStorage,
        userStorage);
  }

  private java.time.Instant parseTimestamp(String value) {
    try {
      return java.time.Instant.parse(value);
    } catch (Exception ignored) {
      return java.time.Instant.EPOCH;
    }
  }

  public record AdminOverview(
      String startedAt,
      long uptimeSeconds,
      int userCount,
      int activeSessionCount,
      long workNotesArchiveCount,
      long translationConfigurationCount) {}

  public record UserRecord(
      String id, String username, String displayName, String role, String createdAt) {}

  public record StorageRecord(String kind, String userId, long sizeBytes, String updatedAt) {}

  public record SystemStatus(
      CpuStatus cpu,
      MemoryStatus memory,
      DiskStatus disk,
      long totalUserStorageBytes,
      List<UserStorageUsage> userStorage) {}

  public record CpuStatus(
      int availableProcessors, double processLoadPercent, double systemLoadPercent) {}

  public record MemoryStatus(long totalBytes, long usedBytes, long freeBytes) {}

  public record DiskStatus(String path, long totalBytes, long usedBytes, long usableBytes) {}

  public record UserStorageUsage(String userId, int fileCount, long sizeBytes, String updatedAt) {}
}
