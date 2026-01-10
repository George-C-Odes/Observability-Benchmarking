package com.benchmarking.service;

import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * Service for managing environment configuration files.
 * Handles file I/O, validation, and backup operations following Single Responsibility Principle.
 */
@ApplicationScoped
public class EnvFileService {

    /**
     * Logger instance for this service.
     */
    private static final Logger LOG = Logger.getLogger(EnvFileService.class);
    
    /**
     * Date-time formatter for backup file timestamps.
     */
    private static final DateTimeFormatter BACKUP_TIMESTAMP_FORMAT = 
            DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss");

    /**
     * Path to the environment configuration file.
     */
    @ConfigProperty(name = "orchestrator.project-paths.workspace.env")
    String envFilePath;

    /**
     * Retrieves the content of the environment file.
     *
     * @return EnvFileContent containing the file content and path
     * @throws EnvFileException if file cannot be read
     */
    public EnvFileContent readEnvFile() throws EnvFileException {
        try {
            Path path = Paths.get(envFilePath);
            
            if (!Files.exists(path)) {
                LOG.warnf("Environment file not found at: %s", path.toAbsolutePath());
                throw new EnvFileException("Environment file not found", EnvFileException.Type.NOT_FOUND);
            }

            String content = Files.readString(path);
            LOG.infof("Successfully read environment file from: %s", path.toAbsolutePath());
            
            return new EnvFileContent(content, path.toAbsolutePath().toString());
        } catch (IOException e) {
            LOG.errorf(e, "Failed to read environment file: %s", envFilePath);
            throw new EnvFileException("Failed to read environment file: " + e.getMessage(), 
                    EnvFileException.Type.IO_ERROR, e);
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
    public EnvFileUpdate updateEnvFile(String newContent) throws EnvFileException {
        validateContent(newContent);
        
        try {
            Path path = Paths.get(envFilePath);
            
            if (!Files.exists(path)) {
                LOG.warnf("Environment file not found at: %s", path.toAbsolutePath());
                throw new EnvFileException("Environment file not found", EnvFileException.Type.NOT_FOUND);
            }

            // Create backup
            String backupFilename = createBackup(path);
            
            // Write new content
            Files.writeString(path, newContent);
            LOG.infof("Successfully updated environment file: %s", path.toAbsolutePath());

            return new EnvFileUpdate("Environment file updated successfully", backupFilename);
        } catch (IOException e) {
            LOG.errorf(e, "Failed to update environment file: %s", envFilePath);
            throw new EnvFileException("Failed to update environment file: " + e.getMessage(), 
                    EnvFileException.Type.IO_ERROR, e);
        }
    }

    /**
     * Validates environment file content.
     *
     * @param content the content to validate
     * @throws EnvFileException if content is invalid
     */
    private void validateContent(String content) throws EnvFileException {
        if (content == null || content.isEmpty()) {
            throw new EnvFileException("Content cannot be empty", EnvFileException.Type.VALIDATION_ERROR);
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
        LOG.infof("Created backup: %s", backupPath.toAbsolutePath());
        return backupPath.getFileName().toString();
    }

    /**
     * Immutable record representing environment file content.
     *
     * @param content the file content
     * @param absolutePath the absolute path to the file
     */
    public record EnvFileContent(String content, String absolutePath) { }

    /**
     * Immutable record representing the result of an environment file update.
     *
     * @param message success message
     * @param backupFilename the filename of the backup created
     */
    public record EnvFileUpdate(String message, String backupFilename) { }

    /**
     * Exception thrown when environment file operations fail.
     */
    public static class EnvFileException extends Exception {
        /**
         * Type of environment file exception.
         */
        public enum Type {
            /**
             * File not found.
             */
            NOT_FOUND,
            /**
             * I/O error during file operations.
             */
            IO_ERROR,
            /**
             * Content validation error.
             */
            VALIDATION_ERROR
        }

        /**
         * The type of exception that occurred.
         */
        private final Type type;

        /**
         * Creates an environment file exception.
         *
         * @param message the error message
         * @param type the exception type
         */
        public EnvFileException(String message, Type type) {
            super(message);
            this.type = type;
        }

        /**
         * Creates an environment file exception with a cause.
         *
         * @param message the error message
         * @param type the exception type
         * @param cause the underlying cause
         */
        public EnvFileException(String message, Type type, Throwable cause) {
            super(message, cause);
            this.type = type;
        }

        /**
         * Gets the exception type.
         *
         * @return the exception type
         */
        public Type getType() {
            return type;
        }
    }
}
