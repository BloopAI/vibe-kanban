# Security Policy

## Supported Versions

The following versions of vibe-kanban are currently supported with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.7+  | :white_check_mark: |
| 0.1.6   | :white_check_mark: |
| 0.1.5   | :x:                |
| < 0.1.5 | :x:                |

We recommend all users to upgrade to the latest supported version to receive security patches.

## Reporting a Vulnerability

### Private Reporting (Preferred)

If you discover a security vulnerability in vibe-kanban, please report it privately to allow us to address it before public disclosure.

**How to report:**
1. Go to https://github.com/BloopAI/vibe-kanban/security/advisories
2. Click **"Report a vulnerability"**
3. Provide a detailed description including:
   - Steps to reproduce
   - Affected versions
   - Potential impact
   - Suggested fix (if any)

### What to Expect

| Timeline | Action |
|----------|--------|
| Within 48 hours | Acknowledgment of your report |
| Within 7 days | Initial assessment and severity classification |
| Within 30 days | Fix released for critical/high severity issues |
| Upon fix release | Public disclosure with credit to reporter (if desired) |

### Security Update Process

1. **Acknowledgment**: We will acknowledge receipt of your vulnerability report within 48 hours.

2. **Assessment**: Our security team will assess the vulnerability and assign a severity rating based on CVSS v3.1 standards.

3. **Fix Development**: We will work to develop and test a fix. For critical and high severity issues, we aim to release a patch within 30 days.

4. **Disclosure**: Once a fix is released, we will publicly disclose the vulnerability with appropriate credit to the reporter (unless anonymity is requested).

## Security Best Practices for Users

- Keep vibe-kanban updated to the latest supported version
- Run `pnpm audit` regularly in your development environment
- Enable automatic security updates for your operating system
- Use strong authentication for your Git repositories
- Be cautious when executing AI-generated code

## Security Measures

### Dependency Management

- Regular dependency audits via `pnpm audit`
- Automated security scanning in CI/CD pipeline
- Prompt patching of known vulnerabilities

### Code Security

- Input validation for all user-provided data
- Parameterized commands to prevent injection attacks
- Path traversal protections
- Safe environment variable handling

## Out of Scope

The following are generally considered out of scope for security reports:
- Vulnerabilities in dependencies that are already publicly disclosed and tracked
- Issues requiring physical access to the user's machine
- Social engineering attacks
- Issues in third-party plugins or extensions not maintained by vibe-kanban
- AI-generated code that may contain bugs (this is expected behavior)

## Contact

For security-related inquiries, contact: security@vibekanban.com

---

**Note**: This security policy is subject to change. Please refer to the latest version in the main branch of this repository.
