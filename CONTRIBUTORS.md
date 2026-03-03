# Contributing & Change Control

## Change Control Policy

All changes to production code are governed by formal change control procedures. These procedures ensure that modifications are reviewed, approved, and deployed in a controlled manner.

## Code Review Requirements

A maintainer must review pull requests before they are merged into any production branch. No code changes shall be merged without explicit approval from a qualified reviewer.

## Pull Request Process

1. Create a feature or fix branch from the base branch.
2. Make changes and open a pull request.
3. Obtain the required review and approval from a maintainer.
4. All required CI checks must pass before merging.
5. Merge only after approval has been granted and CI checks have passed.

## Separation of Duties

Development, testing, and deployment of changes shall not be performed by a single individual without approval and oversight. All significant changes require independent review to ensure correctness, security, and alignment with project standards.

## Coding Practices

Contributors are expected to follow the project's coding standards throughout the development cycle. These standards cover code quality, style consistency, and security.

### Style & Formatting

- **Rust**: Code must be formatted with `rustfmt` (config in `rustfmt.toml`). Use `snake_case` for modules and functions, `PascalCase` for types. Group imports by crate.
- **TypeScript/React**: Code must pass ESLint and Prettier (2 spaces, single quotes, 80-column width). Use `PascalCase` for components, `camelCase` for variables and functions, and `kebab-case` for file names.
- Run `pnpm run format` before submitting a pull request.
- Run `pnpm run lint` to verify there are no linting errors.

### Code Quality

- Keep functions small and focused on a single responsibility.
- Write clear, self-documenting code. Add comments only where the logic is not self-evident.
- Do not introduce unnecessary abstractions or over-engineer solutions.
- Do not manually edit generated files (e.g., `shared/types.ts`). Modify the source and regenerate.

### Testing

- **Rust**: Add unit tests alongside code using `#[cfg(test)]`. Run `cargo test --workspace` to verify.
- **TypeScript**: Ensure `pnpm run check` and `pnpm run lint` pass. Include lightweight tests (e.g., Vitest) for new runtime logic.
- All CI checks must pass before a pull request can be merged.

### Security

- Never commit secrets, credentials, or API keys. Use `.env` for local configuration.
- Be mindful of common vulnerabilities (injection, XSS, insecure deserialization) when writing code that handles user input or external data.
- Report security issues privately to the maintainers rather than opening a public issue.

### Commit Messages

- Use clear, descriptive commit messages that explain the _why_ behind a change.
- Prefix with a conventional type where appropriate (e.g., `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
- Keep the subject line under 72 characters. Use the body for additional context if needed.

## Scope

These procedures apply to all production branches in this repository.
