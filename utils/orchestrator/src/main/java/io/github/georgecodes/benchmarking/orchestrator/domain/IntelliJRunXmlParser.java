package io.github.georgecodes.benchmarking.orchestrator.domain;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import lombok.extern.jbosslog.JBossLog;
import org.apache.commons.lang3.StringUtils;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.ErrorHandler;
import org.xml.sax.InputSource;
import org.xml.sax.SAXException;
import org.xml.sax.SAXParseException;

/**
 * Best-effort parser for IntelliJ .run/*.run.xml files that represent run configurations. Supported
 * conversions: 1) Shell Script run configs (type=ShConfigurationType): - Reads SCRIPT_TEXT and
 * returns the first line that starts with "docker " 2) docker-deploy run configs with deployment
 * type="dockerfile": - Converts to: docker buildx build --load -t <tag> -f <dockerfile> --build-arg
 * ... <context>
 */
@JBossLog
public final class IntelliJRunXmlParser {

  /** XML element name used by IntelliJ option entries. */
  private static final String OPTION_ELEMENT = "option";

  /** XML attribute name used by IntelliJ option names. */
  private static final String NAME_ATTRIBUTE = "name";

  /** XML attribute name used by IntelliJ option values. */
  private static final String VALUE_ATTRIBUTE = "value";

  /** IntelliJ option that contains Docker build arguments. */
  private static final String BUILD_ARGS_OPTION = "buildArgs";

  /** Docker command prefix accepted from script-like run configurations. */
  private static final String DOCKER_COMMAND_PREFIX = "docker ";

  /** IntelliJ Shell Script run configuration type. */
  private static final String SHELL_SCRIPT_CONFIG_TYPE = "ShConfigurationType";

  /** IntelliJ Docker deployment type for Dockerfile builds. */
  private static final String DOCKERFILE_DEPLOYMENT_TYPE = "dockerfile";

  /** Regex that collapses line separators when normalizing extracted commands. */
  private static final String LINE_SEPARATOR_PATTERN = "[\r\n]+";

  /** Error handler that rethrows parser diagnostics without writing them to stderr. */
  private static final ErrorHandler THROWING_ERROR_HANDLER = new ThrowingErrorHandler();

  /** Utility class. */
  private IntelliJRunXmlParser() {}

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
      List<EnvVar> buildArgs) {

    /**
     * Creates a parsed run configuration with immutable option and build-argument collections.
     *
     * @param name the name of the run configuration
     * @param configType the IntelliJ configuration type
     * @param deploymentType the deployment type, when present
     * @param flatOptions the flattened IntelliJ option map
     * @param buildArgs the parsed Docker build arguments
     */
    public ParsedRunConfig {
      flatOptions = Map.copyOf(flatOptions);
      buildArgs = List.copyOf(buildArgs);
    }
  }

  /**
   * Environment variable for Docker build arguments.
   *
   * @param name the variable name
   * @param value the variable value
   */
  public record EnvVar(String name, String value) {}

  /**
   * Parses an IntelliJ run-configuration XML file into a normalized configuration model.
   *
   * @param file the IntelliJ {@code .run.xml} file to parse
   * @return the parsed run-configuration model
   * @throws ParserConfigurationException if the XML parser cannot be configured securely
   * @throws IOException if the file cannot be read
   * @throws SAXException if the XML is malformed
   */
  public static ParsedRunConfig parse(Path file)
      throws ParserConfigurationException, IOException, SAXException {
    DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
    // Secure-by-default XML parsing (avoid XXE).
    dbf.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
    dbf.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
    dbf.setFeature("http://xml.org/sax/features/external-general-entities", false);
    dbf.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
    dbf.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
    dbf.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
    dbf.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
    dbf.setXIncludeAware(false);
    dbf.setExpandEntityReferences(false);

    var documentBuilder = dbf.newDocumentBuilder();
    documentBuilder.setErrorHandler(THROWING_ERROR_HANDLER);

    Document doc;
    try (InputStream inputStream = Files.newInputStream(file)) {
      InputSource inputSource = new InputSource(inputStream);
      inputSource.setSystemId(file.toUri().toString());
      doc = documentBuilder.parse(inputSource);
    }
    doc.getDocumentElement().normalize();

    Element cfg = firstElement(doc, "configuration");
    if (cfg == null) {
      throw new IllegalArgumentException("Missing <configuration> element");
    }

    String name = cfg.getAttribute(NAME_ATTRIBUTE);
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

    Map<String, String> opts = parseOptionsMap(optionScope);

    List<EnvVar> buildArgs = deployment != null ? parseBuildArgs(optionScope) : List.of();

    return new ParsedRunConfig(name, configType, deploymentType, opts, buildArgs);
  }

  /**
   * Flattens IntelliJ {@code <option>} elements into a map keyed by option name.
   *
   * @param optionScope the XML element containing the option nodes to read
   * @return the parsed options map
   */
  private static Map<String, String> parseOptionsMap(Element optionScope) {
    Map<String, String> opts = new LinkedHashMap<>();
    NodeList options = optionScope.getElementsByTagName(OPTION_ELEMENT);
    for (int i = 0; i < options.getLength(); i++) {
      Node n = options.item(i);
      if (n.getNodeType() != Node.ELEMENT_NODE) {
        continue;
      }
      Element e = (Element) n;
      if (!e.hasAttribute(NAME_ATTRIBUTE)) {
        continue;
      }

      String on = e.getAttribute(NAME_ATTRIBUTE);
      // Skip nested list container; parsed separately
      if (BUILD_ARGS_OPTION.equals(on)) {
        continue;
      }

      String ov = e.getAttribute(VALUE_ATTRIBUTE);
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
    return opts;
  }

  /**
   * Converts a parsed IntelliJ run configuration into a docker command string when supported.
   *
   * @param cfg the parsed run configuration
   * @param workspace the workspace path used to expand IntelliJ placeholders
   * @return the derived docker command, or {@code null} when the configuration is unsupported
   */
  public static String toDockerCommand(ParsedRunConfig cfg, String workspace) {
    if (cfg == null) {
      return null;
    }

    // 1) Shell Script run config: SCRIPT_TEXT is the canonical command source
    if (SHELL_SCRIPT_CONFIG_TYPE.equalsIgnoreCase(cfg.configType)) {
      String script =
          firstNonBlank(
              cfg.flatOptions.get("SCRIPT_TEXT"),
              cfg.flatOptions.get("scriptText"),
              cfg.flatOptions.get("COMMAND_LINE"),
              cfg.flatOptions.get("commandLine"));
      String cmd = extractFirstDockerCommand(script, workspace);
      if (cmd != null) {
        return cmd;
      }
    }

    // 2) dockerfile deployment -> buildx build
    if (DOCKERFILE_DEPLOYMENT_TYPE.equalsIgnoreCase(cfg.deploymentType)) {
      return dockerfileToBuildx(cfg);
    }

    // 3) Fallback: some configs store a literal docker command under common keys
    String explicit =
        firstNonBlank(
            cfg.flatOptions.get("command"),
            cfg.flatOptions.get("commandLine"),
            cfg.flatOptions.get("COMMAND_LINE"),
            cfg.flatOptions.get("SCRIPT_TEXT"),
            cfg.flatOptions.get("scriptText"),
            cfg.flatOptions.get("programParameters"));
    if (explicit != null) {
      String cmd = extractFirstDockerCommand(explicit, workspace);
      if (cmd != null) {
        return cmd;
      }
    }

    log.debugf(
        "Unsupported run config (type=%s deploymentType=%s) name=%s",
        cfg.configType, cfg.deploymentType, cfg.name);
    return null;
  }

  /**
   * Extracts the first docker command line from a script-like configuration value.
   *
   * @param script the script text to inspect
   * @param workspace the workspace path used to expand IntelliJ placeholders
   * @return the extracted docker command, or {@code null} when none is found
   */
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
      if (t.startsWith(DOCKER_COMMAND_PREFIX)) {
        return t.replaceAll(LINE_SEPARATOR_PATTERN, " ").trim();
      }
    }

    String oneLine = expanded.strip().replaceAll(LINE_SEPARATOR_PATTERN, " ").trim();
    if (oneLine.startsWith(DOCKER_COMMAND_PREFIX)) {
      return oneLine;
    }

    return null;
  }

  /**
   * Converts a dockerfile deployment run configuration into a {@code docker buildx build} command.
   *
   * @param cfg the parsed run configuration
   * @return the generated docker command string
   */
  private static String dockerfileToBuildx(ParsedRunConfig cfg) {
    String tag = cfg.flatOptions.get("imageTag");
    String dockerfile = cfg.flatOptions.get("sourceFilePath");
    if (StringUtils.isBlank(tag) || StringUtils.isBlank(dockerfile)) {
      throw new IllegalArgumentException(
          "dockerfile deployment missing required options (imageTag/sourceFilePath)");
    }
    String context = cfg.flatOptions.get("contextFolderPath");
    if (StringUtils.isBlank(context)) {
      try {
        Path df = Path.of(dockerfile);
        Path parent = df.getParent();
        context = (parent == null) ? "." : parent.toString();
      } catch (InvalidPathException e) {
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

  /**
   * Parses Docker build arguments from the IntelliJ deployment settings block.
   *
   * @param settings the deployment settings element
   * @return the parsed build arguments
   */
  private static List<EnvVar> parseBuildArgs(Element settings) {
    List<EnvVar> out = new ArrayList<>();

    // <option name="buildArgs"><list><DockerEnvVarImpl>...</DockerEnvVarImpl></list></option>
    NodeList opts = settings.getElementsByTagName(OPTION_ELEMENT);
    for (int i = 0; i < opts.getLength(); i++) {
      Node n = opts.item(i);
      if (n.getNodeType() != Node.ELEMENT_NODE) {
        continue;
      }
      Element e = (Element) n;
      if (!BUILD_ARGS_OPTION.equals(e.getAttribute(NAME_ATTRIBUTE))) {
        continue;
      }

      out.addAll(parseBuildArgOption(e));
    }

    return out;
  }

  /**
   * Parses one IntelliJ {@code buildArgs} option element into Docker build arguments.
   *
   * @param buildArgsOption the {@code buildArgs} option element
   * @return the parsed build arguments
   */
  private static List<EnvVar> parseBuildArgOption(Element buildArgsOption) {
    List<EnvVar> out = new ArrayList<>();
    NodeList envNodes = buildArgsOption.getElementsByTagName("DockerEnvVarImpl");
    for (int j = 0; j < envNodes.getLength(); j++) {
      Node en = envNodes.item(j);
      if (en.getNodeType() != Node.ELEMENT_NODE) {
        continue;
      }
      EnvVar envVar = parseEnvVar((Element) en);
      if (envVar.name() != null && !envVar.name().isBlank()) {
        out.add(envVar);
      }
    }
    return out;
  }

  /**
   * Parses one IntelliJ {@code DockerEnvVarImpl} element.
   *
   * @param env the environment-variable element
   * @return the parsed build argument
   */
  private static EnvVar parseEnvVar(Element env) {
    String name = null;
    String value = null;
    NodeList envOpts = env.getElementsByTagName(OPTION_ELEMENT);
    for (int k = 0; k < envOpts.getLength(); k++) {
      Node o = envOpts.item(k);
      if (o.getNodeType() != Node.ELEMENT_NODE) {
        continue;
      }
      Element oe = (Element) o;
      String on = oe.getAttribute(NAME_ATTRIBUTE);
      String ov = oe.getAttribute(VALUE_ATTRIBUTE);
      if (NAME_ATTRIBUTE.equals(on)) {
        name = ov;
      }
      if (VALUE_ATTRIBUTE.equals(on)) {
        value = ov;
      }
    }
    return new EnvVar(name, value);
  }

  /**
   * Returns the first non-blank string from the provided candidates.
   *
   * @param candidates candidate values to inspect
   * @return the first non-blank candidate, or {@code null} when none match
   */
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

  /**
   * Returns the first child element matching the requested tag.
   *
   * @param parent the parent document or element
   * @param tag the tag name to search for
   * @return the first matching element, or {@code null} when absent
   */
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
   * Joins argv into a single string that can be sent back to /v1/run. If an arg contains
   * whitespace, it is wrapped in double-quotes.
   *
   * @param argv the command arguments to join
   * @return the joined command string
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

  /** SAX error handler that rethrows every parser diagnostic instead of writing to stderr. */
  private static final class ThrowingErrorHandler implements ErrorHandler {
    /**
     * Rethrows parser warnings instead of writing them to stderr.
     *
     * @param exception the warning raised by the SAX parser
     * @throws SAXException always rethrows the provided exception
     */
    @Override
    public void warning(SAXParseException exception) throws SAXException {
      throw exception;
    }

    /**
     * Rethrows parser errors instead of writing them to stderr.
     *
     * @param exception the error raised by the SAX parser
     * @throws SAXException always rethrows the provided exception
     */
    @Override
    public void error(SAXParseException exception) throws SAXException {
      throw exception;
    }

    /**
     * Rethrows fatal parser errors instead of writing them to stderr.
     *
     * @param exception the fatal error raised by the SAX parser
     * @throws SAXException always rethrows the provided exception
     */
    @Override
    public void fatalError(SAXParseException exception) throws SAXException {
      throw exception;
    }
  }
}
