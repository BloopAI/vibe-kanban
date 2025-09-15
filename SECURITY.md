# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.0.x   | :white_check_mark: |

## Reporting a Vulnerability

We take the security of Vibe Kanban seriously. If you discover a security vulnerability, please follow these steps:

1. **DO NOT** create a public GitHub issue for the vulnerability
2. Email security details to: security@anthropic.com
3. Include the following information:
   - Type of vulnerability
   - Full paths of source file(s) related to the vulnerability
   - Location of the affected source code (tag/branch/commit or direct URL)
   - Any special configuration required to reproduce the issue
   - Step-by-step instructions to reproduce the issue
   - Proof-of-concept or exploit code (if possible)
   - Impact of the issue, including how an attacker might exploit it

## Response Timeline

- We will acknowledge receipt of your vulnerability report within 48 hours
- We will provide a detailed response within 7 days
- We will work on a fix and coordinate the release timeline with you

## Security Measures

### Supply Chain Security

This project implements several measures to prevent supply chain attacks:

#### Dependency Management
- **Cargo.lock**: Committed to repository for reproducible Rust builds
- **pnpm-lock.yaml**: Committed for reproducible Node.js builds
- **Pinned versions**: Critical dependencies use exact versions or commit hashes
- **No floating versions**: Avoid using `latest` or unpinned versions

#### Continuous Security Monitoring
- **Automated audits**: Daily security scans via GitHub Actions
- **Dependency updates**: Weekly Dependabot checks with grouped updates
- **SBOM generation**: Automatic Software Bill of Materials creation
- **License compliance**: Automated license checking

#### Build Security
- **Locked installations**: CI/CD uses `--locked` and `--frozen-lockfile` flags
- **Checksum verification**: Lock files ensure dependency integrity
- **No arbitrary code execution**: Build scripts are reviewed and versioned

#### Third-party Dependencies
- **Git dependencies**: Pinned to specific commit hashes
- **Registry dependencies**: From official registries (crates.io, npmjs.org)
- **Vendored dependencies**: Critical C dependencies are vendored (OpenSSL)

### Development Practices

1. **Code Review**: All changes require pull request review
2. **CI/CD Validation**: Automated testing and security checks
3. **Signed Commits**: Contributors encouraged to sign commits
4. **Access Control**: Limited write access to main branch

### Runtime Security

- **Input Validation**: All user inputs are validated
- **Authentication**: GitHub OAuth for user authentication
- **Authorization**: Role-based access control for operations
- **Secrets Management**: Environment variables for sensitive data
- **Error Handling**: No sensitive information in error messages

## Security Checklist for Contributors

Before submitting a PR, ensure:

- [ ] No hardcoded secrets or credentials
- [ ] Dependencies are from trusted sources
- [ ] New dependencies are justified and reviewed
- [ ] Lock files are updated if dependencies change
- [ ] Security scan passes (`npm audit`, `cargo audit`)
- [ ] No use of `eval()` or similar dynamic code execution
- [ ] User input is properly validated and sanitized
- [ ] Error messages don't leak sensitive information

## Known Security Considerations

### Current Warnings

1. **Git Dependencies**: The project uses a Git dependency for `ts-rs`. While pinned to a specific commit, this should eventually be replaced with a crates.io version.

2. **Development Dependencies**: Some development dependencies may have known vulnerabilities that don't affect production builds.

### Accepted Risks

Some security warnings may be accepted after review:
- Development-only dependencies with vulnerabilities
- False positives from security scanners
- Dependencies awaiting upstream fixes

These are documented in `.github/security-exceptions.json` with justification.

## Security Updates

Security updates are released as soon as possible after a vulnerability is confirmed. We follow semantic versioning, and security fixes are:

- **Patch releases** for non-breaking security fixes
- **Minor releases** if security fix requires minor breaking changes
- **Major releases** only if absolutely necessary

## Contact

For security concerns, contact: security@anthropic.com

For general issues, use: https://github.com/anthropics/vibe-kanban/issues