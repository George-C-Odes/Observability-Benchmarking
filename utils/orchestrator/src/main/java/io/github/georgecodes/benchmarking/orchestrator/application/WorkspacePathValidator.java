package io.github.georgecodes.benchmarking.orchestrator.application;

import java.nio.file.Path;

/** Validates path values supplied to Docker command options. */
final class WorkspacePathValidator {

  /** Minimum length for a Windows drive-absolute path such as {@code C:\\x}. */
  private static final int MIN_WINDOWS_ABSOLUTE_PATH_LENGTH = 3;

  /** Index of the drive letter in a Windows drive-absolute path. */
  private static final int WINDOWS_DRIVE_LETTER_INDEX = 0;

  /** Index of the colon in a Windows drive-absolute path. */
  private static final int WINDOWS_DRIVE_SEPARATOR_INDEX = 1;

  /** Index of the separator after the drive in a Windows drive-absolute path. */
  private static final int WINDOWS_PATH_SEPARATOR_INDEX = 2;

  /** Windows drive-letter separator. */
  private static final char WINDOWS_DRIVE_SEPARATOR = ':';

  /** Backslash path separator. */
  private static final char WINDOWS_BACKSLASH = '\\';

  /** Forward slash path separator. */
  private static final char FORWARD_SLASH = '/';

  /** UNC path prefix using backslashes. */
  private static final String WINDOWS_UNC_PREFIX = "\\\\";

  /** UNC path prefix using forward slashes. */
  private static final String FORWARD_SLASH_UNC_PREFIX = "//";

  /** Strongly typed project-path configuration. */
  private final ProjectPathsConfig paths;

  /**
   * Creates a workspace path validator.
   *
   * @param paths strongly typed project-path configuration
   */
  WorkspacePathValidator(ProjectPathsConfig paths) {
    this.paths = paths;
  }

  /**
   * Accepts absolute OR relative paths: absolute must be under workspace, relative is resolved
   * against workspace.
   *
   * @param pathString the path string to validate against the workspace root
   */
  void ensureUnderWorkspace(String pathString) {
    Path workspace = Path.of(paths.workspace().root()).normalize().toAbsolutePath();
    Path path = Path.of(pathString);
    Path absolutePath =
        path.isAbsolute()
            ? path.normalize().toAbsolutePath()
            : workspace.resolve(path).normalize().toAbsolutePath();

    if (!absolutePath.startsWith(workspace)) {
      throw new IllegalArgumentException("Path must be under workspace: " + absolutePath);
    }
  }

  /**
   * Returns true if the provided path string looks like an absolute Windows path.
   *
   * @param path the path string to inspect
   * @return {@code true} when the path appears to be an absolute Windows path
   */
  static boolean isWindowsAbsolutePath(String path) {
    return isWindowsDriveAbsolutePath(path) || isWindowsUncPath(path);
  }

  /**
   * Checks for a drive-letter absolute path such as {@code C:\\workspace} or {@code C:/workspace}.
   *
   * @param path the path string to inspect
   * @return {@code true} when the path uses Windows drive-letter absolute syntax
   */
  private static boolean isWindowsDriveAbsolutePath(String path) {
    return path != null
        && path.length() >= MIN_WINDOWS_ABSOLUTE_PATH_LENGTH
        && Character.isLetter(path.charAt(WINDOWS_DRIVE_LETTER_INDEX))
        && path.charAt(WINDOWS_DRIVE_SEPARATOR_INDEX) == WINDOWS_DRIVE_SEPARATOR
        && isPathSeparator(path.charAt(WINDOWS_PATH_SEPARATOR_INDEX));
  }

  /**
   * Checks for a UNC path prefix.
   *
   * @param path the path string to inspect
   * @return {@code true} when the path starts with a UNC prefix
   */
  private static boolean isWindowsUncPath(String path) {
    return path != null
        && (path.startsWith(WINDOWS_UNC_PREFIX) || path.startsWith(FORWARD_SLASH_UNC_PREFIX));
  }

  /**
   * Checks whether a character is a supported path separator.
   *
   * @param value the character to check
   * @return {@code true} for slash or backslash
   */
  private static boolean isPathSeparator(char value) {
    return value == WINDOWS_BACKSLASH || value == FORWARD_SLASH;
  }
}
