package io.github.georgecodes.benchmarking.orchestrator.application;

import io.github.georgecodes.benchmarking.orchestrator.domain.IntelliJRunXmlParser;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.xml.parsers.ParserConfigurationException;
import lombok.extern.jbosslog.JBossLog;
import org.xml.sax.SAXException;

/** Discovers preset commands from IntelliJ {@code .run} XML files. */
@JBossLog
@ApplicationScoped
public class RunPresetService {

  /** Pattern to match run configuration file names with category prefix. */
  private static final Pattern RUN_FILE =
      Pattern.compile(
          "^\\[(build-img|single-cont|multi-cont)]\\s+(.+)\\.run\\.xml$", Pattern.CASE_INSENSITIVE);

  /** Strongly-typed project-path configuration. */
  private final ProjectPathsConfig paths;

  /**
   * Creates a run preset discovery service.
   *
   * @param paths strongly typed project-path configuration
   */
  @Inject
  public RunPresetService(ProjectPathsConfig paths) {
    this.paths = paths;
  }

  /**
   * Discovers presets from IntelliJ's .run directory located at: {@code
   * ${orchestrator.project-paths.workspace.root}/.run}.
   *
   * @return the discovered run presets
   */
  public List<RunPreset> listPresets() {
    String workspace = paths.workspace().root();
    Path runDir = Path.of(workspace).resolve(".run");
    if (!Files.isDirectory(runDir)) {
      log.debugf(".run directory not found at %s", runDir);
      return List.of();
    }

    List<RunPreset> out = new ArrayList<>();

    try (var s = Files.list(runDir)) {
      s.filter(Files::isRegularFile)
          .sorted(Comparator.comparing(p -> p.getFileName().toString().toLowerCase()))
          .forEach(
              p -> {
                String fn = p.getFileName().toString();
                Matcher m = RUN_FILE.matcher(fn);
                if (!m.matches()) {
                  return;
                }

                String category = m.group(1);

                try {
                  IntelliJRunXmlParser.ParsedRunConfig cfg = IntelliJRunXmlParser.parse(p);
                  String title =
                      normalizeTitle(category, cfg.name() != null ? cfg.name() : m.group(2));
                  String cmd = IntelliJRunXmlParser.toDockerCommand(cfg, workspace);

                  if (cmd == null || cmd.isBlank()) {
                    log.warnf(
                        "Skipping %s: unsupported/empty command (type=%s deploymentType=%s)",
                        fn, cfg.configType(), cfg.deploymentType());
                    return;
                  }

                  // Relative path is friendliest to show in UI
                  String sourceFile = ".run/" + fn;

                  out.add(new RunPreset(category, title, cmd, sourceFile));
                } catch (IOException
                    | ParserConfigurationException
                    | SAXException
                    | IllegalArgumentException e) {
                  log.warnf(e, "Failed to parse %s", fn);
                }
              });
    } catch (IOException | SecurityException e) {
      log.warnf(e, "Failed to list .run directory: %s", runDir);
    }

    return out;
  }

  /**
   * Removes the category prefix from a preset title when present.
   *
   * @param category the preset category prefix
   * @param raw the raw title from the run configuration
   * @return the normalized title for display
   */
  private static String normalizeTitle(String category, String raw) {
    if (raw == null) {
      return "";
    }
    String prefix = "[" + category + "]";
    String t = raw.trim();
    if (t.startsWith(prefix)) {
      t = t.substring(prefix.length()).trim();
    }
    return t;
  }
}
