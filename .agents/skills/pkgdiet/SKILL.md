---
name: pkgdiet
description: Evaluates npm package installations for security, deprecation, and bloat.
---

# PkgDiet Dependency Guardrail

Before running ANY command that installs a new npm package (e.g., `npm install`, `yarn add`, `pnpm add`), you MUST first evaluate the requested package using the PkgDiet guardrail to prevent installing bloated, unmaintained, or malicious dependencies.

## Instructions

1. **Check the package**: Use the `check_dependency` tool provided by the PkgDiet MCP server to evaluate the requested package.
   * Example: If the user asks to install `request`, call `check_dependency` with `{"packageName": "request"}`.
2. **Analyze the results**:
   * **ALLOW**: If the verdict is `ALLOW`, proceed with the installation command.
   * **WARN**: If the verdict is `WARN`, inform the user of the health score/size impact and ask for confirmation before proceeding.
   * **BLOCK**: If the verdict is `BLOCK` (deprecated, severely bloated, or security risk), **DO NOT INSTALL THE PACKAGE**. Explain the risk to the user and suggest modern, maintained alternatives based on the tool's output.
3. **Suggest alternatives (if needed)**: If the user wants a replacement, use the `suggest_alternative` tool to find a modern, lightweight equivalent.
   * Example: If `request` is blocked, suggest `axios` or native `fetch`.
4. **Explain verdict (optional)**: Use `explain_verdict` if detailed scoring, policy match, or vulnerability justification is needed.

## Enforcement
This guardrail is mandatory for all dependency additions to protect the project's supply chain and performance.
