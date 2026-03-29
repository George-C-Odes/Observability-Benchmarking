package io.github.georgecodes.benchmarking.orchestrator.application;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import lombok.extern.jbosslog.JBossLog;

import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

import io.github.georgecodes.benchmarking.orchestrator.application.ServiceException.Type;

/**
 * Service for managing the benchmark targets configuration file.
 * Handles reading, validating, backing up, and writing the URL list.
 * Follows Single Responsibility Principle — only benchmark-targets file I/O.
 */
@JBossLog
@ApplicationScoped
public class BenchmarkTargetsService {

    /** Date-time formatter for backup file timestamps. */
    private static final DateTimeFormatter BACKUP_TIMESTAMP_FORMAT =
            DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss");

    /** Strongly-typed project-path configuration. */
    @Inject
    ProjectPathsConfig paths;

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
                throw new BenchmarkTargetsException("Benchmark targets file not found",
                        Type.NOT_FOUND);
            }

            List<String> allLines = Files.readAllLines(path);
            List<String> urls = allLines.stream()
                    .map(String::trim)
                    .filter(line -> !line.isEmpty() && !line.startsWith("#"))
                    .toList();

            log.infof("Read %d benchmark target(s) from: %s", urls.size(), path.toAbsolutePath());
            return new BenchmarkTargetsContent(urls, path.toAbsolutePath().toString());
        } catch (IOException e) {
            log.errorf(e, "Failed to read benchmark targets file: %s", filePath);
            throw new BenchmarkTargetsException("Failed to read benchmark targets file: " + e.getMessage(),
                    Type.IO_ERROR, e);
        }
    }

    /**
     * Updates the benchmark targets file with a new URL list.
     * Creates a timestamped backup before modification.
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
                throw new BenchmarkTargetsException("Benchmark targets file not found",
                        Type.NOT_FOUND);
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

            log.infof("Updated benchmark targets file with %d URL(s): %s", urls.size(), path.toAbsolutePath());
            return new BenchmarkTargetsUpdate(
                    "Benchmark targets updated successfully (%d URLs)".formatted(urls.size()),
                    backupFilename);
        } catch (IOException e) {
            log.errorf(e, "Failed to update benchmark targets file: %s", filePath);
            throw new BenchmarkTargetsException("Failed to update benchmark targets file: " + e.getMessage(),
                    Type.IO_ERROR, e);
        }
    }

    /** URL schemes accepted by the validator. */
    private static final List<String> ALLOWED_SCHEMES = List.of("http", "https");

    private void validateUrls(List<String> urls) {
        if (urls == null) {
            throw new BenchmarkTargetsException("URLs list cannot be null",
                    Type.VALIDATION_ERROR);
        }
        for (String url : urls) {
            if (url == null || url.isBlank()) {
                throw new BenchmarkTargetsException("URL entries must not be blank",
                        Type.VALIDATION_ERROR);
            }
            try {
                String scheme = URI.create(url).getScheme();
                if (scheme == null || !ALLOWED_SCHEMES.contains(scheme)) {
                    throw new BenchmarkTargetsException("Invalid URL scheme (must be http or https): " + url,
                            Type.VALIDATION_ERROR);
                }
            } catch (IllegalArgumentException e) {
                throw new BenchmarkTargetsException("Invalid URL syntax: " + url,
                        Type.VALIDATION_ERROR, e);
            }
        }
    }

    private String createBackup(Path originalPath) throws IOException {
        String timestamp = LocalDateTime.now().format(BACKUP_TIMESTAMP_FORMAT);
        Path backupPath = originalPath.resolveSibling(originalPath.getFileName() + ".backup." + timestamp);
        Files.copy(originalPath, backupPath, StandardCopyOption.REPLACE_EXISTING);
        log.infof("Created backup: %s", backupPath.toAbsolutePath());
        return backupPath.getFileName().toString();
    }

    /**
     * Response record for benchmark targets retrieval.
     *
     * @param urls the list of active benchmark target URLs
     * @param absolutePath the absolute path to the targets file
     */
    public record BenchmarkTargetsContent(
            List<String> urls,
            @JsonProperty("path") String absolutePath
    ) { }

    /**
     * Response record for benchmark targets update.
     *
     * @param message success message
     * @param backupFilename the filename of the backup created before update
     */
    public record BenchmarkTargetsUpdate(
            String message,
            @JsonProperty("backup") String backupFilename
    ) { }

    /**
     * Exception thrown when benchmark targets file operations fail.
     */
    public static class BenchmarkTargetsException extends ServiceException {

        public BenchmarkTargetsException(String message, Type type) {
            super(message, type);
        }

        public BenchmarkTargetsException(String message, Type type, Throwable cause) {
            super(message, type, cause);
        }
    }
}