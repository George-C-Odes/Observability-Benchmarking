# Security Guidelines

This document outlines practical security guidance for working with this repository.

> Scope: this project is optimized for **local benchmarking**. It is not a hardened production deployment.

## Docker Security

### Non-Root User Execution

All containers run as non-root users to minimize security risks:

#### Quarkus Services
- User: `quarkus` (UID 1001, GID 1001)
- Home directory: `/nonexistent`
- Shell: `/sbin/nologin`
- Configuration: `services/java/quarkus/jvm/Dockerfile`

#### Spring Services
- User: `spring` (UID 1001, GID 1001)
- Home directory: `/nonexistent`
- Shell: `/sbin/nologin`
- Configuration: `services/java/spring/jvm/Dockerfile`

#### Django Services
- User: `nonroot` (UID 65532, GID 65532), explicitly created in the Dockerfile
- Base image: `python:<version>-slim-bookworm`
- Configuration: `services/python/django/gunicorn/WSGI/Dockerfile`, `services/python/django/gunicorn/ASGI/Dockerfile`

**Note**: UID/GID 1001 is chosen for OpenShift compatibility, as it falls within the standard range for non-root users. Django services instead use UID/GID 65532.

### File Permissions

Proper file permissions are enforced in all Dockerfiles:

```dockerfile
# Quarkus example
RUN chown -R quarkus:quarkus /deployments /otel /work \
  && chmod -R g+rX,o-rwx /deployments /otel /work

# Spring example
RUN chown 1001:1001 /app/app.jar && chmod 0640 /app/app.jar
```

Key permission settings:
- **Application JARs**: `0640` (read/write for owner, read for group, no access for others)
- **OpenTelemetry agents**: `0640` (restricted access)
- **Directories**: `g+rX,o-rwx` (group can read/execute, no access for others)

### Multi-Stage Builds

All Dockerfiles use multi-stage builds to minimize attack surface:
1. **Builder stage**: Contains build tools and source code (not included in final image)
2. **Runtime stage**: Contains only runtime dependencies and compiled application

Benefits:
- Smaller image size
- Reduced attack surface
- No build tools or source code in production images
- Separate build-time and runtime dependencies

### Base Image Security

- Base images are from trusted sources (Amazon Corretto, Eclipse Temurin)
- Package managers clean caches after installations
- `install_weak_deps=False` prevents unnecessary package installations
- Regular base image updates recommended

Example:
```dockerfile
RUN dnf install -y --setopt=install_weak_deps=False shadow-utils \
    && dnf clean all && rm -rf /var/cache/dnf/*
```

## Configuration Security

### No Hardcoded Secrets

This repository is designed to avoid committing secrets.

However, always assume any repo you clone may contain sensitive configuration over time (via forks or local changes). Before sharing logs/screenshots or publishing results, do a quick hygiene pass:

- Don’t commit `.env` files containing secrets.
- Don’t publish Grafana API keys/tokens.
- Don’t include private hostnames or IPs in screenshots.

### Environment Variables

Sensitive data should be provided via environment variables:
- Database credentials (if applicable)
- API keys for external services
- Authentication tokens

Example usage in Docker Compose:
```yaml
environment:
  - DATABASE_PASSWORD=${DB_PASSWORD}
  - API_KEY=${EXTERNAL_API_KEY}
```

### Qodana Report Environment Trust Boundary

`scripts/qodana-python-report.py` is a local/CI report helper, not a privileged service for remote
requests. Its allowed results location is `RUNNER_TEMP/qodana-python/results`; without `RUNNER_TEMP`,
the root comes from `tempfile.gettempdir()`. GitHub runner configuration supplies `RUNNER_TEMP` in the
checked-in Django quality workflow. No separate remote request or LLM-supplied data is mapped to that
variable by the workflow. Locally, the launcher and its environment must be trusted.

The helper requires the CLI path to resolve to that exact location and rejects symlink redirection
of the results directory, parents below the root, and report files before I/O. These checks constrain
CLI paths relative to the configured root; they do **not** establish that the root itself is trustworthy.
`Path.resolve()` is canonicalization, not sanitization. An attacker controlling both the environment
and CLI path can select a different accepted root. The OS temporary-directory fallback also considers
environment variables (`TMPDIR`, `TEMP`, `TMP`), so using it alone does not remove this trust dependency.

Do not run this helper with elevated privileges and a caller-controlled environment, or accept remote
or agent-supplied environment overrides without a separate boundary. Such launchers must select and
protect an output root from trusted configuration independently of request/LLM data and construct the
child environment from trusted values. Use isolated output storage when other users/processes could
modify it concurrently; the pre-I/O symlink checks are not a guarantee against hostile filesystem races.

SnykCode alert [#345](https://github.com/George-C-Odes/Observability-Benchmarking/security/code-scanning/345)
(`python/PT`, this helper's environment-derived root) was reviewed as a context-specific false positive
under the above execution model: no lower-trust input-to-environment path or privilege boundary was
identified. Dismiss only this alert with that justification, not the rule or environment-source checks
globally. Reassess the finding if a new launcher introduces untrusted environment input, elevated
execution, or shared writable output storage. PR-controlled executable source is not made trusted by
these path checks; existing workflow permission and isolation constraints still apply.

`scripts/run-qodana-python.py` likewise expects a trusted local/CI-selected workspace, not a remote
filesystem selector. Before reading Qodana config or copying source, it rejects symlink/junction
redirection of `services`, `python`, and `django` below that workspace. Descendant symlinks are also
rejected. Host Git directories are not mounted into the scanner: revision, attached branch, and a
network remote URI are collected on the host and applied only to exported SARIF. The URI omits
userinfo, query strings, and fragments; local/unsupported remotes are omitted. This does not promise
to detect secrets placed in repository path names. No Git config, history, refs, or objects enter Docker.

SnykCode command-injection alerts [#346](https://github.com/George-C-Odes/Observability-Benchmarking/security/code-scanning/346)
and [#347](https://github.com/George-C-Odes/Observability-Benchmarking/security/code-scanning/347)
refer to the runner's `docker cp` and `docker rm` calls. Both use argument vectors and a resolved Docker
executable, with no shell. The export destination remains one absolute-path argument and the removal
target is an internally generated UUID-based name. They were reviewed as context-specific false positives;
dismiss only these instances, not command-injection checks globally. Reassess if execution gains a shell,
an untrusted executable selection, or caller-selected Docker operations. Path validation and Git-data
isolation remain separate requirements, not reasons to suppress the staging path-traversal finding.

### Configuration Files

Application configuration files contain:
- ✅ Port numbers
- ✅ Thread pool settings
- ✅ Memory configuration
- ✅ Logging levels
- ✅ Feature flags
- ❌ No passwords
- ❌ No API keys
- ❌ No tokens
- ❌ No credentials

## Dependency Security

### Maven Dependency Management

All dependencies are managed through Maven with version locking:
- Explicit version numbers specified
- Dependency management sections for BOM imports
- Regular updates recommended for security patches

### Known Vulnerabilities

Before adding new dependencies:
1. Check for known vulnerabilities using Maven dependency-check plugin
2. Review security advisories on GitHub
3. Prefer well-maintained libraries with active security updates

## Network Security

### Port Exposure

Only necessary ports are exposed:
- **8080**: Application HTTP port
- Observability stack ports are documented in compose files

### Internal Communication

Services communicate over internal Docker networks:
- No unnecessary external exposure
- Bridge networks isolate services
- Service discovery through Docker DNS

## Logging and Monitoring

### Secure Logging Practices

Secure logging guidelines:

No sensitive data in logs (passwords, tokens, and keys).

Prefer structured logging (JSON) when practical.

Use appropriate log levels (INFO/WARN/ERROR) to avoid over-logging.

Ensure log rotation/retention is configured in the observability stack (Loki).

Example of safe logging:
```markdown
// Safe
log.info("User logged in: {}", username);

// Unsafe - never do this
log.info("User logged in with password: {}", password);
```

### OpenTelemetry Security

OpenTelemetry agents are configured with:
- Secure defaults
- No sensitive data collection in traces
- Controlled data export to local observability stack only

## Build Security

### Maven Settings

- Build artifacts are not committed to repository
- `.gitignore` properly configured to exclude:
  - `target/` directories
  - `*.class` files
  - `*.jar` files (except necessary ones)
  - IDE-specific files

### Source Code Security

- No credentials in source code
- Regular security scans recommended
- Code review process for security-sensitive changes

### CodeQL Automated Scanning

[GitHub CodeQL](https://codeql.github.com/) runs automated security vulnerability detection across all major languages in the repository (Java/Kotlin, Python, Go, JavaScript/TypeScript). The workflow (`.github/workflows/codeql.yml`) executes on every push to `main`, on pull requests, and on a weekly schedule to catch newly published CWE patterns.

- **SARIF results** are uploaded to GitHub's Security tab (Code Scanning alerts)
- **HTML report** is published to [GitHub Pages](https://george-c-odes.github.io/Observability-Benchmarking/quality/codeql/)
- Reports are always published, even when findings are detected, so the hosted page stays current

For details on the CodeQL configuration and how to run it locally, see [docs/LINTING_AND_CODE_QUALITY.md](LINTING_AND_CODE_QUALITY.md#codeql-configuration-security--quality-analysis).

### Snyk Automated Scanning

The workflow (`.github/workflows/snyk-security.yml`) runs Snyk Code and Open Source scans on pushes and pull requests
to `main`, manual dispatch, and a weekly schedule. Configure the repository secret `SNYK_TOKEN` to enable it.
Runs without a token (including fork pull requests) explicitly skip scanning; a skipped run is not a security assessment.

- Java {{JAVA_MAJOR_VERSION}}, Python 3.13, Go from the service `go.mod`, and the dashboard's Node.js version are set up before scanning.
  Maven wrappers are made executable on Linux, and both Django dependency sets are installed through the shared
  hash-verified Python action. Snyk uses that same Python interpreter for dependency resolution.
- Open Source discovery includes deeply nested JVM/native variants and source dependency manifests. Generated
  directories such as `node_modules`, `vendor`, `_site`, `target`, `.next`, virtual environments, and `apm_modules`
  are excluded; source manifests and `.github` CI dependency inventories are not excluded.
- The gate distinguishes **findings** (test exit code 1) from **scan errors** (including exit code 2 and no supported
  projects, exit code 3). Findings produce **non-blocking warning annotations** and a warning in the job summary;
  GitHub Actions has no warning job conclusion, so a findings-only job check is successful. Scan errors and incomplete
  scans still fail CI. Open Source uses `--fail-fast` so unresolved projects cannot silently produce a passing partial
  assessment. Resolve the dependency error and rerun to obtain the full findings report; do not bypass coverage with
  `--skip-unresolved` or relax the severity threshold to make the job green.
- Available SARIF reports are uploaded to GitHub Code Scanning with separate Code and Open Source categories.
  The `snyk-results` artifact retains logs, status files, Open Source JSON, and available SARIF for 14 days, including
  after scan failures. Each scan also writes its result and exit code to the Actions step summary.
- `snyk monitor` uploads a dependency snapshot only on non-PR runs on `main`. PR and non-main manual runs still test,
  but do not overwrite the trusted dashboard snapshot. Monitor failures are operational errors and also fail CI.

Troubleshoot **errors** using the saved logs and runtime versions printed in the preparation step. Findings require
dependency or source remediation; fixing the workflow alone does not resolve genuine vulnerabilities.

## Runtime Security

### Java Security Manager

While not currently enabled, Java Security Manager can be configured for:
- Restricted file system access
- Network permission controls
- Reflection restrictions

### JVM Security Flags

Applied security-related JVM flags:
```bash
-Djava.security.egd=file:/dev/./urandom  # Better entropy source
-XX:+ExitOnOutOfMemoryError              # Fail fast on OOM
```

## Observability Stack Security

### Grafana Security

Default credentials should be changed in production:
- Current: `a/a` (for local development only)
- Production: Use strong passwords and consider OAuth integration

### Data Retention

- Metrics, logs, and traces have configured retention periods
- Old data is automatically cleaned up
- Consider data privacy regulations (GDPR, etc.)

## Third-party licenses

This repository is Apache-2.0 licensed.

When you build or run the stack, Docker may pull/build third-party container images and dependencies that are governed by their own licenses.

In particular, native-image builds may use `container-registry-frankfurt.oracle.com/graalvm/native-image:{{JAVA_MAJOR_VERSION}}.{{JAVA_MINOR_PATCH_VERSION}}-ol9`. If you use those images, you are responsible for reviewing and complying with Oracle’s license terms.

## Security Checklist

Before deploying to production:

- [ ] Change all default passwords
- [ ] Configure TLS/SSL for external connections
- [ ] Review and restrict container capabilities
- [ ] Implement network policies
- [ ] Configure proper authentication and authorization
- [ ] Set up regular security scanning
- [ ] Implement rate limiting
- [ ] Configure CORS policies appropriately
- [ ] Review and update dependencies
- [ ] Implement audit logging
- [ ] Set up security monitoring and alerting
- [ ] Perform penetration testing
- [ ] Review access controls

## Incident Response

In case of a security incident:

1. **Identify**: Determine scope and impact
2. **Contain**: Isolate affected systems
3. **Eradicate**: Remove threat and vulnerabilities
4. **Recover**: Restore systems to normal operation
5. **Learn**: Document and improve processes

## Reporting Security Issues

If you discover a security vulnerability in the repository content:

- Please open a GitHub issue with a minimal repro and no secrets.
- If the issue involves credentials or sensitive information, redact it and provide a safe description.

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Docker Security Best Practices](https://docs.docker.com/engine/security/)
- [Spring Boot Security](https://spring.io/guides/gs/securing-web/)
- [Quarkus Security](https://quarkus.io/guides/security)
- [CIS Docker Benchmark](https://www.cisecurity.org/benchmark/docker)

## Compliance

This project follows industry-standard security practices but is designed for:
- ✅ Local development and benchmarking
- ✅ Testing and evaluation
- ⚠️ Production deployment (requires additional hardening)

For production deployment, additional security measures should be implemented based on your specific requirements and compliance needs.
