package io.github.georgecodes.benchmarking.orchestrator.application;

import com.fasterxml.jackson.annotation.JsonProperty;
import io.github.georgecodes.benchmarking.orchestrator.application.ServiceException.Type;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.io.IOException;
import java.io.Serial;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import lombok.extern.jbosslog.JBossLog;

/**
 * Service for managing the benchmark targets configuration file. Handles reading, validating,
 * backing up, and writing the URL list. Follows Single Responsibility Principle — only
 * benchmark-targets file I/O.
 */
@JBossLog
@ApplicationScoped
public class BenchmarkTargetsService {

  /** Strongly-typed project-path configuration. */
  private final ProjectPathsConfig paths;

  /**
   * Creates a benchmark-targets service.
   *
   * @param paths strongly typed project-path configuration
   */
  @Inject
  public BenchmarkTargetsService(ProjectPathsConfig paths) {
    this.paths = paths;
  }

  /**
   * Reads the benchmark targets file and returns the list of active URLs.
   *
   * @return BenchmarkTargetsContent containing the URL list and file path
   * @throws BenchmarkTargetsException if file cannot be read
   */
  public BenchmarkTargetsContent readTargets() {
    String filePath = paths.workspace().benchmarkTargets();
    try {
      Path path = Path.of(filePath);

      if (!Files.exists(path)) {
        log.warnf("Benchmark targets file not found at: %s", path.toAbsolutePath());
        throw new BenchmarkTargetsException("Benchmark targets file not found", Type.NOT_FOUND);
      }

      List<String> allLines = Files.readAllLines(path);
      List<String> urls =
          allLines.stream()
              .map(String::trim)
              .filter(line -> !line.isEmpty() && !line.startsWith("#"))
              .toList();

      log.infof("Read %d benchmark target(s) from: %s", urls.size(), path.toAbsolutePath());
      return new BenchmarkTargetsContent(urls, path.toAbsolutePath().toString());
    } catch (IOException e) {
      log.errorf(e, "Failed to read benchmark targets file: %s", filePath);
      throw new BenchmarkTargetsException(
          "Failed to read benchmark targets file: " + e.getMessage(), Type.IO_ERROR, e);
    }
  }

  /**
   * Updates the benchmark targets file with a new URL list. Creates a timestamped backup before
   * modification.
   *
   * @param urls the new list of benchmark target URLs
   * @return BenchmarkTargetsUpdate with success message and backup filename
   * @throws BenchmarkTargetsException if file cannot be updated
   */
  public BenchmarkTargetsUpdate updateTargets(List<String> urls) {
    validateUrls(urls);
    String filePath = paths.workspace().benchmarkTargets();

    try {
      Path path = Path.of(filePath);

      if (!Files.exists(path)) {
        log.warnf("Benchmark targets file not found at: %s", path.toAbsolutePath());
        throw new BenchmarkTargetsException("Benchmark targets file not found", Type.NOT_FOUND);
      }

      // Preserve the header comments from the original file
      List<String> originalLines = Files.readAllLines(path);
      List<String> headerComments = new ArrayList<>();
      for (String line : originalLines) {
        String trimmed = line.trim();
        if (trimmed.isEmpty() || trimmed.startsWith("#")) {
          headerComments.add(line);
        } else {
          break;
        }
      }

      // Create backup
      String backupFilename = createBackup(path);

      // Write: header comments + URLs
      List<String> newContent = new ArrayList<>(headerComments);
      newContent.addAll(urls);
      Files.writeString(path, String.join("\n", newContent) + "\n");

      log.infof(
          "Updated benchmark targets file with %d URL(s): %s", urls.size(), path.toAbsolutePath());
      return new BenchmarkTargetsUpdate(
          "Benchmark targets updated successfully (%d URLs)".formatted(urls.size()),
          backupFilename);
    } catch (IOException e) {
      log.errorf(e, "Failed to update benchmark targets file: %s", filePath);
      throw new BenchmarkTargetsException(
          "Failed to update benchmark targets file: " + e.getMessage(), Type.IO_ERROR, e);
    }
  }

  /** URL schemes accepted by the validator. */
  private static final List<String> ALLOWED_SCHEMES = List.of("http", "https");

  /**
   * Validates the submitted benchmark target URLs.
   *
   * @param urls the URLs to validate
   * @throws BenchmarkTargetsException when the list is null, blank, or contains invalid URLs
   */
  private void validateUrls(List<String> urls) {
    if (urls == null) {
      throw new BenchmarkTargetsException("URLs list cannot be null", Type.VALIDATION_ERROR);
    }
    for (String url : urls) {
      validateUrl(url);
    }
  }

  /**
   * Validates a single benchmark target URL.
   *
   * @param url the URL to validate
   */
  private static void validateUrl(String url) {
    if (url == null || url.isBlank()) {
      throw new BenchmarkTargetsException("URL entries must not be blank", Type.VALIDATION_ERROR);
    }
    try {
      String scheme = URI.create(url).getScheme();
      if (!isAllowedScheme(scheme)) {
        throw new BenchmarkTargetsException(
            "Invalid URL scheme (must be http or https): " + url, Type.VALIDATION_ERROR);
      }
    } catch (IllegalArgumentException e) {
      throw new BenchmarkTargetsException("Invalid URL syntax: " + url, Type.VALIDATION_ERROR, e);
    }
  }

  /**
   * Checks whether a URI scheme is accepted for benchmark targets.
   *
   * @param scheme the URI scheme to check
   * @return {@code true} when the scheme is allowed
   */
  private static boolean isAllowedScheme(String scheme) {
    return scheme != null && ALLOWED_SCHEMES.contains(scheme);
  }

  /**
   * Creates a timestamped backup copy of the benchmark targets file.
   *
   * @param originalPath the file to back up
   * @return the backup filename
   * @throws IOException if the backup cannot be created
   */
  private String createBackup(Path originalPath) throws IOException {
    Path backupPath = TimestampedBackupFile.create(originalPath);
    log.infof("Created backup: %s", backupPath.toAbsolutePath());
    Path backupFileName = backupPath.getFileName();
    if (backupFileName == null) {
      throw new IOException("Backup file name could not be determined for: " + backupPath);
    }
    return backupFileName.toString();
  }

  /**
   * Response record for benchmark targets retrieval.
   *
   * @param urls the list of active benchmark target URLs
   * @param absolutePath the absolute path to the targets file
   */
  public record BenchmarkTargetsContent(
      List<String> urls, @JsonProperty("path") String absolutePath) {

    /**
     * Creates benchmark target content with an immutable URL list.
     *
     * @param urls the active benchmark target URLs
     * @param absolutePath the absolute path to the benchmark targets file
     */
    public BenchmarkTargetsContent {
      urls = List.copyOf(urls);
    }
  }

  /**
   * Response record for benchmark targets update.
   *
   * @param message success message
   * @param backupFilename the filename of the backup created before update
   */
  public record BenchmarkTargetsUpdate(
      String message, @JsonProperty("backup") String backupFilename) {}

  /** Exception thrown when benchmark targets file operations fail. */
  public static class BenchmarkTargetsException extends ServiceException {

    @Serial private static final long serialVersionUID = 1L;

    /**
     * Creates a benchmark targets exception without an underlying cause.
     *
     * @param message the error message
     * @param type the service error type
     */
    public BenchmarkTargetsException(String message, Type type) {
      super(message, type);
    }

    /**
     * Creates a benchmark targets exception with an underlying cause.
     *
     * @param message the error message
     * @param type the service error type
     * @param cause the underlying cause
     */
    public BenchmarkTargetsException(String message, Type type, Throwable cause) {
      super(message, type, cause);
    }
  }
}
