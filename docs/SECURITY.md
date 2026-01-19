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
- Configuration: `services/quarkus/jvm/Dockerfile`

#### Spring Services
- User: `spring` (UID 1001, GID 1001)
- Home directory: `/nonexistent`
- Shell: `/sbin/nologin`
- Configuration: `services/spring/jvm/Dockerfile`

**Note**: UID/GID 1001 is chosen for OpenShift compatibility, as it falls within the standard range for non-root users.

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

In particular, native-image builds may use `container-registry.oracle.com/graalvm/native-image:25.0.1-ol10`. If you use those images, you are responsible for reviewing and complying with Oracle’s license terms.

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
