package com.benchmarking.service;

import com.benchmarking.api.CommandPreset;
import com.benchmarking.core.IntelliJRunXmlParser;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import jakarta.enterprise.context.ApplicationScoped;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@ApplicationScoped
public class RunPresetService {
  /**
   * Logger instance for this class.
   */
  private static final Logger LOG = Logger.getLogger(RunPresetService.class);

  /**
   * Pattern to match run configuration file names with category prefix.
   */
  private static final Pattern RUN_FILE = Pattern.compile(
    "^\\[(build-img|single-cont|multi-cont)]\\s+(.+)\\.run\\.xml$",
    Pattern.CASE_INSENSITIVE
  );

  /**
   * Workspace directory path.
   */
  @ConfigProperty(name = "orchestrator.workspace")
  String workspace;

  /**
   * Discovers presets from IntelliJ's .run directory located at:
   *   ${orchestrator.workspace}/.run.
   */
  public List<CommandPreset> listPresets() {
    Path runDir = Path.of(workspace).resolve(".run");
    if (!Files.isDirectory(runDir)) {
      LOG.debugf(".run directory not found at %s", runDir);
      return List.of();
    }

    List<CommandPreset> out = new ArrayList<>();

    try (var s = Files.list(runDir)) {
      s.filter(Files::isRegularFile)
          .sorted(Comparator.comparing(p -> p.getFileName().toString().toLowerCase()))
          .forEach(p -> {
            String fn = p.getFileName().toString();
            Matcher m = RUN_FILE.matcher(fn);
            if (!m.matches()) {
              return;
            }

            String category = m.group(1);

            try {
              IntelliJRunXmlParser.ParsedRunConfig cfg = IntelliJRunXmlParser.parse(p);
              String title = normalizeTitle(category, cfg.name() != null ? cfg.name() : m.group(2));
              String cmd = IntelliJRunXmlParser.toDockerCommand(cfg, workspace);

              if (cmd == null || cmd.isBlank()) {
                LOG.warnf("Skipping %s: unsupported/empty command (type=%s deploymentType=%s)",
                    fn, cfg.configType(), cfg.deploymentType());
                return;
              }

              // Relative path is friendliest to show in UI
              String sourceFile = ".run/" + fn;

              out.add(new CommandPreset(category, title, cmd, sourceFile));
            } catch (Exception e) {
              LOG.warnf(e, "Failed to parse %s", fn);
            }
          });
    } catch (Exception e) {
      LOG.warnf(e, "Failed to list .run directory: %s", runDir);
    }

    return out;
  }

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
