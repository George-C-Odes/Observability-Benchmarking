package io.github.georgecodes.benchmarking.orchestrator.application;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/** Utility for creating timestamped backup copies of workspace files. */
public final class TimestampedBackupFile {

  /** Timestamp pattern used in backup filenames. */
  private static final DateTimeFormatter BACKUP_TIMESTAMP_FORMAT =
      DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss");

  /** Utility class. */
  private TimestampedBackupFile() {}

  /**
   * Creates a timestamped sibling backup for the given file.
   *
   * @param originalPath the file to back up
   * @return the path to the created backup copy
   * @throws IOException if the backup cannot be created
   */
  public static Path create(Path originalPath) throws IOException {
    String timestamp = LocalDateTime.now().format(BACKUP_TIMESTAMP_FORMAT);
    Path backupPath =
        originalPath.resolveSibling(originalPath.getFileName() + ".backup." + timestamp);
    Files.copy(originalPath, backupPath, StandardCopyOption.REPLACE_EXISTING);
    return backupPath;
  }
}
