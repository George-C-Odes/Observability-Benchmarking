# Linting and Code Quality

This document describes the code quality and linting setup for the Observability-Benchmarking project.

## Checkstyle Configuration

### Overview
This project uses [Checkstyle](https://checkstyle.org/) to enforce consistent coding standards across all Java code. The configuration is based on the Google Java Style Guide with some customizations for this project.

### Versions
- **maven-checkstyle-plugin**: 3.6.0
- **checkstyle**: 12.2.0

### Configuration Files
Each module contains its own copy of the Checkstyle configuration files to support Docker builds:
- **checkstyle.xml**: Main Checkstyle configuration file located in each module directory
- **checkstyle-suppressions.xml**: Suppression rules for specific checks
- **Root copies**: Master copies are maintained at the project root for reference

### Running Checkstyle

To run Checkstyle on a specific module:

```bash
# For Quarkus JVM module
cd services/quarkus/jvm
mvn checkstyle:check

# For Spring JVM Netty module
cd services/spring/jvm/netty
mvn checkstyle:check

# For Spring JVM Tomcat module
cd services/spring/jvm/tomcat
mvn checkstyle:check
```

Checkstyle is also automatically executed during the Maven `validate` phase, so it runs as part of the build:

```bash
mvn clean install
```

### Key Rules Enforced

#### Naming Conventions
- Class names: PascalCase
- Method names: camelCase
- Constants: UPPER_SNAKE_CASE
- Variables: camelCase

#### Code Style
- Maximum line length: 120 characters
- Indentation: 4 spaces (no tabs)
- Braces required for all control structures
- Proper whitespace around operators and keywords

#### Javadoc Requirements
- Public classes must have Javadoc comments
- Public methods must have Javadoc comments
- Javadoc must include descriptions for parameters and return values (where applicable)

#### Import Organization
- No wildcard imports (*)
- No unused imports
- No illegal imports (e.g., sun.* packages)

### Suppressions

The following items are suppressed from Checkstyle checks:
- Generated code in `target/` directories
- Test files (for certain Javadoc requirements)
- Spring Boot Application main classes (utility class constructor check)

## Code Quality Standards

### Documentation
All public classes and methods should include:
1. **Class-level Javadoc**: Describing the purpose and responsibility of the class
2. **Method-level Javadoc**: Describing what the method does, its parameters, return value, and any exceptions thrown
3. **Inline comments**: For complex logic that may not be immediately obvious

### Best Practices Applied

#### Security
- No hardcoded credentials or secrets in source code
- Sensitive data should be externalized to environment variables
- Use proper file permissions in Dockerfiles
- Run containers as non-root users (UID 1001)

#### Performance
- Efficient use of caching (Caffeine cache with appropriate size limits)
- Proper thread pool configuration
- Memory management with explicit heap settings

#### Maintainability
- Single Responsibility Principle for classes
- Dependency Injection for better testability
- Clear separation of concerns (config, rest, etc.)

## Integration with CI/CD

Checkstyle violations will be reported but will not fail the build by default. This allows for gradual adoption and prevents blocking legitimate changes.

To make Checkstyle violations fail the build, update the plugin configuration in `pom.xml`:
```xml
<configuration>
    <failsOnError>true</failsOnError>
    <failOnViolation>true</failOnViolation>
</configuration>
```

## Customizing Rules

To customize Checkstyle rules for your needs:

1. Edit `checkstyle.xml` at the project root
2. Add suppressions to `checkstyle-suppressions.xml` for specific exceptions
3. Update the plugin version in `pom.xml` if newer Checkstyle features are needed

## Tools and Plugins

### IDE Integration

#### IntelliJ IDEA
1. Install the Checkstyle-IDEA plugin
2. Go to Settings → Tools → Checkstyle
3. Add the `checkstyle.xml` file from the project root
4. Enable real-time scanning

#### Eclipse
1. Install the Checkstyle Plug-in
2. Right-click project → Properties → Checkstyle
3. Select the project's `checkstyle.xml` file
4. Enable Checkstyle for the project

#### VS Code
1. Install the Checkstyle for Java extension
2. Configure the extension to use the project's `checkstyle.xml`

## Metrics

The Checkstyle plugin generates reports that can be found at:
- `target/checkstyle-result.xml` (XML format)
- Maven console output (human-readable format)

## Future Improvements

Potential enhancements to the code quality setup:
- Add PMD for additional static analysis
- Integrate SpotBugs for bug detection
- Add SonarQube for comprehensive code quality metrics
- Implement code coverage requirements with JaCoCo
- Add automated code formatting with Spotless or Google Java Format

## References

- [Checkstyle Documentation](https://checkstyle.org/)
- [Google Java Style Guide](https://google.github.io/styleguide/javaguide.html)
- [Maven Checkstyle Plugin](https://maven.apache.org/plugins/maven-checkstyle-plugin/)
