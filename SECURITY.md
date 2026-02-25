# Security Vulnerability Report: Unauthenticated Remote Code Execution (RCE)

**Severity:** Critical
**Component:** HTTP API Server
**Affected versions:** Latest (`main` branch, confirmed as of 2026-02-25)
**CWE:** CWE-78 (OS Command Injection), CWE-306 (Missing Authentication for Critical Function)

---

## Summary

The vibe-kanban local server exposes an HTTP API with **no authentication layer**. The only protection is an `Origin` header check (`ValidateRequestHeaderLayer`) designed to prevent browser-based CSRF attacks. This check is trivially bypassed by any non-browser HTTP client (e.g., `curl`, `python-requests`) that simply omits the `Origin` header.

Combined with API endpoints that allow arbitrary shell script content to be stored and subsequently executed server-side, this results in a **complete unauthenticated Remote Code Execution** vulnerability for any deployment where the server is reachable over a network (e.g., bound to `0.0.0.0` instead of `127.0.0.1`).

---

## Root Cause Analysis

### 1. Authentication bypass via missing Origin header

**File:** `crates/server/src/middleware/origin.rs:40`

```rust
pub fn validate_origin<B>(req: &mut Request<B>) -> Result<(), Response> {
    let Some(origin) = get_origin_header(req) else {
        return Ok(());  // No Origin header → unconditionally allowed
    };
    // ...
}
```

Any HTTP client that does not send an `Origin` header bypasses all access control entirely.

### 2. Arbitrary shell script stored via unauthenticated API

**File:** `crates/server/src/routes/repo.rs:142`

```rust
pub async fn update_repo(
    State(deployment): State<DeploymentImpl>,
    Path(repo_id): Path<Uuid>,
    ResponseJson(payload): ResponseJson<UpdateRepo>,
) -> Result<ResponseJson<ApiResponse<Repo>>, ApiError> {
    let repo = Repo::update(&deployment.db().pool, repo_id, &payload).await?;
    Ok(ResponseJson(ApiResponse::success(repo)))
}
```

`UpdateRepo` (`crates/db/src/models/repo.rs:72`) includes `setup_script`, `cleanup_script`, and `dev_server_script` fields — all `Option<String>` with no validation. Any caller can overwrite these fields with arbitrary shell commands.

### 3. Stored script executed directly via shell

**File:** `crates/executors/src/actions/script.rs:56-65`

```rust
let (shell_cmd, shell_arg) = get_shell_command(); // returns ("bash", "-c") or ("sh", "-c")
let mut command = Command::new(shell_cmd);
command
    .arg(shell_arg)
    .arg(&self.script)   // user-controlled content passed directly to shell
    .current_dir(&effective_dir);
```

The script content is passed verbatim as the argument to `bash -c` or `sh -c` with no sanitization, allowlist, or sandbox.

---

## Attack Chain

**Step 1 — Write malicious script** (no credentials required):

```
PUT /api/repos/<any-repo-uuid>
Content-Type: application/json

{"setup_script": "<arbitrary shell command>"}
```

**Step 2 — Trigger execution**:

```
POST /api/task-attempts/<workspace-uuid>/run-setup-script
```

The route `run-setup-script` (`crates/server/src/routes/task_attempts.rs:2075`) retrieves the stored script from the database and passes it directly to the shell executor.

The same primitive applies to:
- `cleanup_script` → `POST /api/task-attempts/<id>/run-cleanup-script`
- `dev_server_script` → `POST /api/task-attempts/<id>/start-dev-server`

---

## Additional Issues

### Path traversal in `working_dir`

**File:** `crates/executors/src/actions/script.rs:51-54`

```rust
let effective_dir = match &self.working_dir {
    Some(rel_path) => current_dir.join(rel_path),  // no canonicalization
    None => current_dir.to_path_buf(),
};
```

`Path::join()` does not prevent `../` traversal. An attacker can set `working_dir: "../../../../"` to escape the intended working directory.

### Unrestricted environment variable injection

**File:** `crates/executors/src/env.rs`

`CmdOverrides.env` allows setting arbitrary environment variables (including `LD_PRELOAD`, `PATH`) that are inherited by all child processes, enabling library hijacking as a secondary RCE vector.

---

## Impact

- **Confidentiality:** Full read access to all files accessible by the server process
- **Integrity:** Arbitrary file write / deletion
- **Availability:** Process termination, resource exhaustion
- **Scope:** Any network-accessible deployment (e.g., corporate intranet, `0.0.0.0` binding, reverse proxy without authentication)

---

## Recommended Fixes

### Short term (critical)

1. **Bind to localhost only by default.** Ensure the server listens on `127.0.0.1` and document clearly that binding to other interfaces requires additional security controls.

2. **Add an authentication layer.** All state-mutating API endpoints (`PUT`, `POST`, `DELETE`) must require a shared secret, API token, or session cookie before processing requests.

### Medium term

3. **Validate `working_dir` against the container base path:**

```rust
let requested = current_dir.join(rel_path);
let canonical = requested.canonicalize()?;
if !canonical.starts_with(current_dir.canonicalize()?) {
    return Err(ExecutorError::PathTraversal);
}
```

4. **Restrict environment variable overrides** to an explicit allowlist, blocking `LD_PRELOAD`, `LD_LIBRARY_PATH`, and similar dangerous variables.

---

## Disclosure

This vulnerability was identified through static source code analysis of the public repository. No live systems were targeted during this research. The findings are reported here in good faith to allow the maintainers to issue a fix before any potential exploitation.
