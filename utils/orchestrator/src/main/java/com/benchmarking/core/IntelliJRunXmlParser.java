package com.benchmarking.core;

import org.apache.commons.lang3.StringUtils;
import org.jboss.logging.Logger;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Best-effort parser for IntelliJ .run/*.run.xml files that represent run configurations.
 * Supported conversions:
 * 1) Shell Script run configs (type=ShConfigurationType):
 *    - Reads SCRIPT_TEXT and returns the first line that starts with "docker "
 * 2) docker-deploy run configs with deployment type="dockerfile":
 *    - Converts to: docker buildx build --load -t <tag> -f <dockerfile> --build-arg ... <context>
 */
public final class IntelliJRunXmlParser {
  /**
   * Logger for this class.
   */
  private static final Logger LOG = Logger.getLogger(IntelliJRunXmlParser.class);

  private IntelliJRunXmlParser() { }

  /**
   * Parsed IntelliJ run configuration containing configuration details.
   *
   * @param name the name of the run configuration
   * @param configType the type of configuration (e.g., ShConfigurationType)
   * @param deploymentType the deployment type (e.g., dockerfile)
   * @param flatOptions map of configuration options
   * @param buildArgs list of build arguments for Docker builds
   */
  public record ParsedRunConfig(
      String name,
      String configType,
      String deploymentType,
      Map<String, String> flatOptions,
      List<EnvVar> buildArgs
  ) { }

  /**
   * Environment variable for Docker build arguments.
   *
   * @param name the variable name
   * @param value the variable value
   */
  public record EnvVar(String name, String value) { }

  public static ParsedRunConfig parse(Path file) throws Exception {
    DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
    // Secure-by-default XML parsing (avoid XXE).
    dbf.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
    dbf.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
    dbf.setFeature("http://xml.org/sax/features/external-general-entities", false);
    dbf.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
    dbf.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
    dbf.setXIncludeAware(false);
    dbf.setExpandEntityReferences(false);

    Document doc = dbf.newDocumentBuilder().parse(file.toFile());
    doc.getDocumentElement().normalize();

    Element cfg = firstElement(doc, "configuration");
    if (cfg == null) {
      throw new IllegalArgumentException("Missing <configuration> element");
    }

    String name = cfg.getAttribute("name");
    String configType = cfg.getAttribute("type");

    Element deployment = firstElement(cfg, "deployment");
    String deploymentType = deployment != null ? deployment.getAttribute("type") : null;

    // Option scope:
    // - docker-deploy: <deployment><settings>
    // - script configs: the <configuration> element
    Element optionScope = cfg;
    if (deployment != null) {
      Element settings = firstElement(deployment, "settings");
      if (settings != null) {
        optionScope = settings;
      }
    }

    Map<String, String> opts = new LinkedHashMap<>();
    NodeList options = optionScope.getElementsByTagName("option");
    for (int i = 0; i < options.getLength(); i++) {
      Node n = options.item(i);
      if (n.getNodeType() != Node.ELEMENT_NODE) {
        continue;
      }
      Element e = (Element) n;
      if (!e.hasAttribute("name")) {
        continue;
      }

      String on = e.getAttribute("name");
      // Skip nested list container; parsed separately
      if ("buildArgs".equals(on)) {
        continue;
      }

      String ov = e.getAttribute("value");
      if (!ov.isBlank()) {
        opts.putIfAbsent(on, ov);
        continue;
      }

      // Some run configs store text/CDATA inside the option element
      String text = e.getTextContent();
      if (text != null) {
        text = text.trim();
        if (!text.isBlank()) {
          opts.putIfAbsent(on, text);
        }
      }
    }

    List<EnvVar> buildArgs = deployment != null ? parseBuildArgs(optionScope) : List.of();

    return new ParsedRunConfig(name, configType, deploymentType, opts, buildArgs);
  }

  public static String toDockerCommand(ParsedRunConfig cfg, String workspace) {
    if (cfg == null) {
      return null;
    }

    // 1) Shell Script run config: SCRIPT_TEXT is the canonical command source
    if ("ShConfigurationType".equalsIgnoreCase(cfg.configType)) {
      String script = firstNonBlank(
          cfg.flatOptions.get("SCRIPT_TEXT"),
          cfg.flatOptions.get("scriptText"),
          cfg.flatOptions.get("COMMAND_LINE"),
          cfg.flatOptions.get("commandLine")
      );
      String cmd = extractFirstDockerCommand(script, workspace);
      if (cmd != null) {
        return cmd;
      }
    }

    // 2) dockerfile deployment -> buildx build
    if ("dockerfile".equalsIgnoreCase(cfg.deploymentType)) {
      return dockerfileToBuildx(cfg);
    }

    // 3) Fallback: some configs store a literal docker command under common keys
    String explicit = firstNonBlank(
        cfg.flatOptions.get("command"),
        cfg.flatOptions.get("commandLine"),
        cfg.flatOptions.get("COMMAND_LINE"),
        cfg.flatOptions.get("SCRIPT_TEXT"),
        cfg.flatOptions.get("scriptText"),
        cfg.flatOptions.get("programParameters")
    );
    if (explicit != null) {
      String cmd = extractFirstDockerCommand(explicit, workspace);
      if (cmd != null) {
        return cmd;
      }
    }

    LOG.debugf("Unsupported run config (type=%s deploymentType=%s) name=%s",
        cfg.configType, cfg.deploymentType, cfg.name);
    return null;
  }

  private static String extractFirstDockerCommand(String script, String workspace) {
    if (script == null) {
      return null;
    }

    String expanded = script;
    if (workspace != null && !workspace.isBlank()) {
      expanded = expanded.replace("$PROJECT_DIR$", workspace);
    }

    for (String line : expanded.split("\\R")) {
      String t = line.trim();
      if (t.startsWith("docker ")) {
        return t.replaceAll("[\r\n]+", " ").trim();
      }
    }

    String oneLine = expanded.strip().replaceAll("[\r\n]+", " ").trim();
    if (oneLine.startsWith("docker ")) {
      return oneLine;
    }

    return null;
  }

  private static String dockerfileToBuildx(ParsedRunConfig cfg) {
    String tag = cfg.flatOptions.get("imageTag");
    String dockerfile = cfg.flatOptions.get("sourceFilePath");
    if (StringUtils.isBlank(tag) || StringUtils.isBlank(dockerfile)) {
      throw new IllegalArgumentException("dockerfile deployment missing required options (imageTag/sourceFilePath)");
    }
    String context = cfg.flatOptions.get("contextFolderPath");
    if (StringUtils.isBlank(context)) {
      try {
        Path df = Path.of(dockerfile);
        Path parent = df.getParent();
        context = (parent == null) ? "." : parent.toString();
      } catch (Exception e) {
        context = ".";
      }
    }

    List<String> argv = new ArrayList<>();
    argv.add("docker");
    argv.add("buildx");
    argv.add("build");
    argv.add("--load");
    argv.add("-t");
    argv.add(tag);
    argv.add("-f");
    argv.add(dockerfile);

    for (EnvVar ev : cfg.buildArgs) {
      if (ev.name() == null || ev.name().isBlank()) {
        continue;
      }
      argv.add("--build-arg");
      argv.add(ev.name() + "=" + (ev.value() == null ? "" : ev.value()));
    }

    argv.add(context);

    return joinForClient(argv);
  }

  private static List<EnvVar> parseBuildArgs(Element settings) {
    List<EnvVar> out = new ArrayList<>();

    // <option name="buildArgs"><list><DockerEnvVarImpl>...</DockerEnvVarImpl></list></option>
    NodeList opts = settings.getElementsByTagName("option");
    for (int i = 0; i < opts.getLength(); i++) {
      Node n = opts.item(i);
      if (n.getNodeType() != Node.ELEMENT_NODE) {
        continue;
      }
      Element e = (Element) n;
      if (!"buildArgs".equals(e.getAttribute("name"))) {
        continue;
      }

      NodeList envNodes = e.getElementsByTagName("DockerEnvVarImpl");
      for (int j = 0; j < envNodes.getLength(); j++) {
        Node en = envNodes.item(j);
        if (en.getNodeType() != Node.ELEMENT_NODE) {
          continue;
        }
        Element env = (Element) en;

        String name = null;
        String value = null;
        NodeList envOpts = env.getElementsByTagName("option");
        for (int k = 0; k < envOpts.getLength(); k++) {
          Node o = envOpts.item(k);
          if (o.getNodeType() != Node.ELEMENT_NODE) {
            continue;
          }
          Element oe = (Element) o;
          String on = oe.getAttribute("name");
          String ov = oe.getAttribute("value");
          if ("name".equals(on)) {
            name = ov;
          }
          if ("value".equals(on)) {
            value = ov;
          }
        }

        if (name != null && !name.isBlank()) {
          out.add(new EnvVar(name, value));
        }
      }
    }

    return out;
  }

  private static String firstNonBlank(String... candidates) {
    if (candidates == null) {
      return null;
    }
    for (String c : candidates) {
      if (c == null) {
        continue;
      }
      String t = c.trim();
      if (!t.isBlank()) {
        return t;
      }
    }
    return null;
  }

  private static Element firstElement(Node parent, String tag) {
    if (parent instanceof Document d) {
      NodeList nl = d.getElementsByTagName(tag);
      return nl.getLength() > 0 ? (Element) nl.item(0) : null;
    }
    if (parent instanceof Element e) {
      NodeList nl = e.getElementsByTagName(tag);
      return nl.getLength() > 0 ? (Element) nl.item(0) : null;
    }
    return null;
  }

  /**
   * Joins argv into a single string that can be sent back to /v1/run.
   * If an arg contains whitespace, it is wrapped in double-quotes.
   */
  private static String joinForClient(List<String> argv) {
    StringBuilder sb = new StringBuilder();
    for (int i = 0; i < argv.size(); i++) {
      String a = argv.get(i);
      if (a == null) {
        a = "";
      }
      if (i > 0) {
        sb.append(' ');
      }

      if (a.isBlank()) {
        sb.append("\"\"");
        continue;
      }

      boolean needsQuote = a.chars().anyMatch(Character::isWhitespace) || a.contains("\"");
      if (!needsQuote) {
        sb.append(a);
      } else {
        sb.append('"').append(a.replace("\"", "\\\"")).append('"');
      }
    }
    return sb.toString();
  }
}
