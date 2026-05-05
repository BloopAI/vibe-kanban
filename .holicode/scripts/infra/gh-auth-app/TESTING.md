# GitHub CLI Authentication — Testing Guide

**Component**: gh CLI auth waterfall in Coder workspaces  
**Status**: Ready for testing (Terraform script deployed)  
**Last Updated**: 2026-03-20  

---

## Overview

This guide documents how to test the GitHub CLI authentication waterfall strategy (HOL-49) in Coder workspaces. The waterfall tries four auth paths in order: skip if authed, Coder bridge, GH_TOKEN env var, interactive device flow.

**Test Duration**: ~30-45 minutes per scenario (device flow requires manual GitHub authorization)

---

## Prerequisites

- ✅ Coder workspace instance running (with updated template including `coder_script.github_auth`)
- ✅ Access to Coder dashboard to create/destroy workspaces
- ✅ Ability to SSH into workspace or use Coder browser terminal
- ✅ GitHub account (for device flow testing)
- ✅ (Optional) GitHub OAuth device authorizations ready to approve

---

## Test Scenario 1: Fresh Workspace — Device Flow (Interactive)

**Objective**: Verify device flow works when no other auth methods are available.

**Prerequisites**:
- Fresh workspace (no prior auth)
- No Coder external auth configured (or not completed)
- No GH_TOKEN set

**Steps**:

1. **Create new workspace** from Coder dashboard
2. **Connect via SSH** or use Coder browser terminal
3. **Check auth status**:
   ```bash
   gh auth status
   ```
   Expected: `NOT AUTHENTICATED` or similar error

4. **Monitor workspace startup** for GitHub Auth script:
   ```bash
   # Check workspace startup logs (Coder UI → workspace → logs)
   # Should show: "Setting up GitHub CLI authentication..."
   ```

5. **Watch for device code** in logs:
   ```
   Strategy 4: Device flow (interactive)...
   Starting device flow...
   ! Device code: WDJB-MJHT
   ! User code: XXXX-YYYY (or similar)
   ! Please visit https://github.com/login/device and enter the code
   ```

6. **Manually authorize** (as user):
   - Open browser: `https://github.com/login/device`
   - Enter the 8-character device code from logs
   - Approve the OAuth consent screen
   - Return to workspace

7. **Polling succeeds**, token retrieved:
   ```
   ✓ Successfully authenticated to github.com
   ```

8. **Verify auth status**:
   ```bash
   gh auth status
   ```
   Expected: Authenticated user + hostname + scopes (repo, read:org, workflow, gist)

9. **Test gh CLI works**:
   ```bash
   gh repo list
   # Should list repositories (or "No repositories found" if user has none)
   ```

**✓ Test Passes When**:
- Device code appears in logs
- User can visit GitHub and authorize
- `gh auth status` shows authenticated user
- `gh repo list` returns successfully (no auth errors)

**⚠ Troubleshooting**:
- **Device code not appearing**: Check workspace startup logs; gh-auth-setup.sh may have exited early
- **Timeout waiting for code**: Device code expires after 15 minutes; restart auth (`bash /var/tmp/vibe-kanban/worktrees/f464-hol-344-minecraf/holicode/scripts/infra/gh-auth-app/gh-auth-setup.sh`)
- **Network unreachable**: Verify workspace container has internet access (DNS, routing)

---

## Test Scenario 2: Coder External Auth Bridge (Zero-Touch)

**Objective**: Verify token bridges automatically from Coder external auth when available.

**Prerequisites**:
- Coder server configured with GitHub external auth
- External auth **already completed** by user (in Coder dashboard)
- Fresh workspace (no prior gh CLI auth)

**Steps**:

1. **Verify Coder external auth** is configured:
   ```bash
   # In workspace
   coder external-auth access-token github
   # Should return token (gho_...) if completed, or URL if pending
   ```

2. **Create fresh workspace** from dashboard
3. **Monitor startup logs** — expect:
   ```
   Strategy 2: Coder external auth...
     Got token from Coder external auth.
     Success! gh CLI authenticated via Coder external auth.
   ```

4. **Verify auth immediately**:
   ```bash
   gh auth status
   # Should show authenticated user (< 1 second after startup)
   ```

5. **Test gh CLI**:
   ```bash
   gh repo list
   ```

**✓ Test Passes When**:
- Startup logs show "Got token from Coder external auth"
- `gh auth status` shows authenticated user
- `gh repo list` returns successfully
- Total startup time < 5 seconds for auth script

**⚠ Troubleshooting**:
- **Coder external auth not configured**: Contact Coder admin or skip to Scenario 3
- **Token not returned**: May not be completed; manually authorize in Coder dashboard Settings → External auth
- **Auth fails silently**: Check `/tmp/vibe-kanban.log` for detailed errors

---

## Test Scenario 3: GH_TOKEN Environment Variable

**Objective**: Verify fallback to GH_TOKEN env var works.

**Prerequisites**:
- Valid GitHub OAuth token (create at https://github.com/settings/tokens/new if needed)
  - Scopes: `repo`, `read:org`, `workflow`, `gist` (or `public_repo` minimum)
  - Token format: `gho_XXXXXXXXXXXXXXXXXXXXXX...`
- Fresh workspace

**Steps**:

1. **Create workspace with GH_TOKEN set**:
   - Option A (Coder Terraform): Add env var to template, pass at workspace creation
   - Option B (Manual): Set in workspace after creation:
     ```bash
     export GH_TOKEN="gho_..."
     bash /var/tmp/vibe-kanban/worktrees/f464-hol-344-minecraf/holicode/scripts/infra/gh-auth-app/gh-auth-setup.sh
     ```

2. **Monitor startup logs**:
   ```
   Strategy 3: GH_TOKEN environment variable...
     Success! gh CLI authenticated via GH_TOKEN.
   ```

3. **Verify auth**:
   ```bash
   gh auth status
   ```

4. **Test gh CLI**:
   ```bash
   gh repo list
   ```

**✓ Test Passes When**:
- `gh auth status` shows authenticated user
- `gh repo list` returns successfully
- Token scopes match expected (repo, read:org, workflow, gist)

**⚠ Troubleshooting**:
- **Invalid token**: Re-create at https://github.com/settings/tokens/new
- **Insufficient scopes**: Regenerate token with required scopes
- **Token revoked**: Create new token if previously revoked
- **Auth still fails**: Check `gh auth status` for detailed error

---

## Test Scenario 4: Already-Authenticated Workspace (Restart)

**Objective**: Verify script exits quickly when auth already cached locally.

**Prerequisites**:
- Workspace with prior successful authentication
- Persistent home volume (survives stop/start)

**Steps**:

1. **Authenticate workspace** (Scenario 1, 2, or 3)
2. **Verify authentication cached**:
   ```bash
   ls -la ~/.config/gh/hosts.yml
   # Should exist (plaintext, human-readable YAML)
   ```

3. **Stop workspace** in Coder dashboard
4. **Wait 30 seconds**
5. **Restart workspace** via dashboard
6. **Monitor startup time**:
   - GitHub Auth script should complete in < 1 second
   - Logs should show: "Already authenticated" or similar

7. **Verify auth status** immediately after restart:
   ```bash
   gh auth status
   # Should instantly show authenticated user (no re-auth)
   ```

**✓ Test Passes When**:
- GitHub Auth script exits in < 1 second
- `gh auth status` instant (no delays)
- Home volume persists across restart

**⚠ Troubleshooting**:
- **Auth lost after restart**: Home volume may not persist; check Docker volume settings
- **Re-authenticates every startup**: gh-auth-setup.sh may not be detecting cached auth; check `gh auth status` output

---

## Test Scenario 5: Already-Authenticated + Manual Force-Reauthenticate

**Objective**: Verify user can manually re-authenticate if needed.

**Prerequisites**:
- Workspace with cached auth from Scenario 4

**Steps**:

1. **Manually run auth setup**:
   ```bash
   bash /var/tmp/vibe-kanban/worktrees/f464-hol-344-minecraf/holicode/scripts/infra/gh-auth-app/gh-auth-setup.sh
   ```

2. **Script should detect existing auth**:
   ```
   Already authenticated:
     GitHub.com
       - Logged in as: <username>
       - Git protocol: https
       - Token scopes: repo, read:org, workflow, gist
   
   Nothing to do.
   ```

3. **To force re-auth**:
   ```bash
   # Logout first
   gh auth logout
   
   # Then re-run script (starts waterfall again)
   bash /var/tmp/vibe-kanban/worktrees/f464-hol-344-minecraf/holicode/scripts/infra/gh-auth-app/gh-auth-setup.sh
   ```

**✓ Test Passes When**:
- Script detects cached auth and skips immediately
- Logout + re-run triggers fresh auth flow
- User can choose auth method during fresh flow

---

## Test Scenario 6: Workspace with gh CLI Commands

**Objective**: End-to-end test: verify authenticated workspace can run real GitHub API commands.

**Prerequisites**:
- Workspace authenticated (any scenario 1-3)

**Steps**:

1. **List repositories**:
   ```bash
   gh repo list
   ```

2. **Create a test issue** (if you have write access):
   ```bash
   gh issue create --title "Test issue from CI" --body "Automated test"
   ```

3. **View issue**:
   ```bash
   gh issue list
   ```

4. **Clean up**:
   ```bash
   gh issue delete <issue-number> --confirm
   ```

**✓ Test Passes When**:
- All gh CLI commands succeed without auth errors
- API responses are valid (repos listed, issue created/viewed/deleted)
- No rate limiting (unless user is hitting API hard)

---

## Test Results Template

```markdown
# HOL-49 Testing Results — [DATE]

## Environment
- Coder Version: [version]
- Workspace Image: [tag, e.g., holicode-cde:1.4]
- Host OS: [Ubuntu 24.04, etc.]
- Executor: [who ran tests]

## Scenario 1: Fresh Workspace — Device Flow
- ✓/✗ Device code appeared in logs
- ✓/✗ Manual authorization at GitHub succeeded
- ✓/✗ `gh auth status` shows authenticated user
- ✓/✗ `gh repo list` returns successfully
- **Result**: PASS/FAIL
- **Duration**: ~X minutes
- **Notes**: [any issues or observations]

## Scenario 2: Coder External Auth Bridge
- ✓/✗ Coder external auth available (if N/A, mark as SKIP)
- ✓/✗ Token bridged automatically
- ✓/✗ `gh auth status` shows authenticated user
- ✓/✗ Auth script completed < 5 seconds
- **Result**: PASS/FAIL/SKIP
- **Duration**: ~X minutes
- **Notes**: [any issues or observations]

## Scenario 3: GH_TOKEN Environment Variable
- ✓/✗ GH_TOKEN set correctly
- ✓/✗ `gh auth status` shows authenticated user
- ✓/✗ `gh repo list` returns successfully
- **Result**: PASS/FAIL
- **Duration**: ~X minutes
- **Notes**: [token scopes, any errors]

## Scenario 4: Already-Authenticated Workspace
- ✓/✗ Auth cached in ~/.config/gh/hosts.yml
- ✓/✗ Restart completes in < 1 second
- ✓/✗ `gh auth status` instant
- **Result**: PASS/FAIL
- **Duration**: ~X seconds
- **Notes**: [home volume persistence confirmed]

## Scenario 5: Force Re-Authentication
- ✓/✗ Script detects cached auth and skips
- ✓/✗ `gh auth logout` works
- ✓/✗ Re-running script triggers fresh auth
- **Result**: PASS/FAIL
- **Notes**: [any issues]

## Scenario 6: Real GitHub API Operations
- ✓/✗ `gh repo list` succeeded
- ✓/✗ Issue creation/viewing/deletion works
- **Result**: PASS/FAIL
- **Notes**: [any rate limiting issues]

## Summary
- **Total Scenarios Passed**: X/6 (or X/5 if Coder bridge N/A)
- **Auth Waterfall Working**: YES/NO
- **Recommended Next Steps**:
  1. [if any failures, list root causes and fixes]
  2. [any improvements to script or template]
  3. [ready to merge to main: YES/NO]

## Signed By
- **Executor**: [name]
- **Date**: [ISO date]
- **Commit**: [git commit hash if test-driven changes]
```

---

## References

- **Spike Report**: `.holicode/analysis/spike-HOL-56-gh-cli-auth-node-app.md`
- **Specification**: `.holicode/specs/HOL-49-gh-cli-auth-coder.md`
- **Implementation Plan**: `.holicode/specs/implementation-plan-HOL-49.md`
- **GitHub OAuth Device Flow Docs**: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow
- **Coder External Auth**: https://coder.com/docs/admin/external-auth
- **gh CLI Manual**: https://cli.github.com/manual/

---

## Known Limitations & Mitigations

| Issue | Mitigation |
|-------|-----------|
| Device flow code expires after 15 min | Script includes retry instructions; user can re-run setup |
| Token stored plaintext in hosts.yml | Mitigated: per-user Docker volumes, workspace volumes not shared |
| gh CLI doesn't use system keyring | Expected in Coder containers; falls back to `--insecure-storage` mode |
| Coder external auth token may refresh mid-session | Uncommon; script bridges at startup; user can logout/re-auth if needed |
| Network unavailability blocks device flow | User can retry later; fallback to GH_TOKEN if available |

---

**Status**: Ready for testing  
**Assigned to**: [executor with Coder workspace access]  
**Due Date**: [by end of sprint]

