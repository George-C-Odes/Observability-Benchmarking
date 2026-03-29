package io.github.georgecodes.benchmarking.orchestrator.application;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import lombok.extern.jbosslog.JBossLog;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

import static io.github.georgecodes.benchmarking.orchestrator.application.ServiceException.Type.*;

/**
 * Service for managing environment configuration files.
 * Handles file I/O, validation, and backup operations following Single Responsibility Principle.
 */
@JBossLog
@ApplicationScoped
public class EnvFileService {
    /**
     * Date-time formatter for backup file timestamps.
     */
    private static final DateTimeFormatter BACKUP_TIMESTAMP_FORMAT =
            DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss");

    /** Strongly-typed project-path configuration. */
    @Inject
    ProjectPathsConfig paths;

    /**
     * Retrieves the content of the environment file.
     *
     * @return EnvFileContent containing the file content and path
     * @throws EnvFileException if file cannot be read
     */
    public EnvFileContent readEnvFile() {
        String envFilePath = paths.workspace().env();
        try {
            Path path = Path.of(envFilePath);

            if (!Files.exists(path)) {
                log.warnf("Environment file not found at: %s", path.toAbsolutePath());
                throw new EnvFileException("Environment file not found", NOT_FOUND);
            }

            String content = Files.readString(path);
            log.infof("Successfully read environment file from: %s", path.toAbsolutePath());

            return new EnvFileContent(content, path.toAbsolutePath().toString());
        } catch (IOException e) {
            log.errorf(e, "Failed to read environment file: %s", envFilePath);
            throw new EnvFileException("Failed to read environment file: " + e.getMessage(),
                    IO_ERROR, e);
        }
    }

    /**
     * Updates the environment file with new content.
     * Automatically creates a timestamped backup before modification.
     *
     * @param newContent the new content to write
     * @return EnvFileUpdate result containing success message and backup filename
     * @throws EnvFileException if file cannot be updated
     */
    public EnvFileUpdate updateEnvFile(String newContent) {
        validateContent(newContent);
        String envFilePath = paths.workspace().env();

        try {
            Path path = Path.of(envFilePath);

            if (!Files.exists(path)) {
                log.warnf("Environment file not found at: %s", path.toAbsolutePath());
                throw new EnvFileException("Environment file not found", NOT_FOUND);
            }

            // Create backup
            String backupFilename = createBackup(path);

            // Write new content
            Files.writeString(path, newContent);
            log.infof("Successfully updated environment file: %s", path.toAbsolutePath());

            return new EnvFileUpdate("Environment file updated successfully", backupFilename);
        } catch (IOException e) {
            log.errorf(e, "Failed to update environment file: %s", envFilePath);
            throw new EnvFileException("Failed to update environment file: " + e.getMessage(),
                    IO_ERROR, e);
        }
    }

    /**
     * Validates environment file content.
     *
     * @param content the content to validate
     * @throws EnvFileException if content is invalid
     */
    private void validateContent(String content) {
        if (content == null || content.isEmpty()) {
            throw new EnvFileException("Content cannot be empty", VALIDATION_ERROR);
        }
    }

    /**
     * Creates a timestamped backup of the given file.
     *
     * @param originalPath the path to the file to backup
     * @return the filename of the created backup
     * @throws IOException if backup creation fails
     */
    private String createBackup(Path originalPath) throws IOException {
        String timestamp = LocalDateTime.now().format(BACKUP_TIMESTAMP_FORMAT);
        Path backupPath = originalPath.resolveSibling(originalPath.getFileName() + ".backup." + timestamp);
        Files.copy(originalPath, backupPath, StandardCopyOption.REPLACE_EXISTING);
        log.infof("Created backup: %s", backupPath.toAbsolutePath());
        return backupPath.getFileName().toString();
    }

    /**
     * Immutable record representing environment file content.
     *
     * @param content the file content
     * @param absolutePath the absolute path to the file
     */
    public record EnvFileContent(
      String content,
      @JsonProperty("path") String absolutePath
    ) { }

    /**
     * Immutable record representing the result of an environment file update.
     *
     * @param message success message
     * @param backupFilename the filename of the backup created
     */
    public record EnvFileUpdate(
      String message,
      @JsonProperty("backup") String backupFilename
    ) { }

    /**
     * Exception thrown when environment file operations fail.
     */
    public static class EnvFileException extends ServiceException {

        public EnvFileException(String message, Type type) {
            super(message, type);
        }

        public EnvFileException(String message, Type type, Throwable cause) {
            super(message, type, cause);
        }
    }
}