---
mb_meta:
  projectID: "{{PROJECT_ID}}"
  version: "0.1.0"
  lastUpdated: "{{ISO_DATE}}"
  templateVersion: "1.0"
  fileType: "gitContext"
---

# Git Context - {{PROJECT_NAME}}

## Current Branch
- **Branch**: main
- **Type**: default
- **Created**: {{ISO_DATE}}
- **Last Switch**: {{ISO_DATE}}

## Recent Commits (Last 5)
<!-- Keep only the 5 most recent commits -->
1. **{{COMMIT_HASH_SHORT}}**: `chore(init): initial commit` - {{ISO_DATE}}

## Recent Branch Operations (Last 5)
<!-- Keep only the 5 most recent branch operations -->
1. **{{ISO_DATE}}**: Created branch `main` (initial)

## Active Branches
<!-- List currently active branches -->
- `main` - Default branch
- <!-- Add active feature/spec branches here -->

## Uncommitted Changes
- **Count**: 0 files
- **Status**: Clean working directory

## Remote Status
- **Remote**: origin
- **URL**: {{REMOTE_URL}}
- **Push Status**: Up to date
- **Pull Status**: Up to date
- **Offline Mode**: false

## PR Status
<!-- Current PR information if any -->
- **Open PRs**: 0
- **Draft PRs**: 0
- **Ready for Review**: 0

## Release History
<!-- Track recent releases and their status -->

### Recent Releases
| Version | Date | Type | Status | Notes |
|---------|------|------|--------|--------| 
| v1.0.0 | YYYY-MM-DD | major | released | Initial release |

### Pending Release
- Next Version: TBD
- Planned Date: TBD
- Pending Changes:
  - Features: 0
  - Fixes: 0
  - Breaking Changes: 0

## CI/CD Status
<!-- Track CI/CD pipeline health and recent runs -->

### Pipeline Health
- Overall Success Rate: 95%
- Average Build Time: 15 minutes
- Last Successful Build: YYYY-MM-DD HH:MM

### Recent CI Runs
| PR/Branch | Status | Duration | Timestamp | Issues |
|-----------|--------|----------|-----------|---------|
| main | ✅ success | 12m | YYYY-MM-DD HH:MM | - |
| PR #123 | ❌ failure | 8m | YYYY-MM-DD HH:MM | Test failures |
| PR #122 | ✅ success | 14m | YYYY-MM-DD HH:MM | - |

### Known CI Issues
- Flaky Tests: []
- Environment Issues: []
- Dependencies Issues: []

## Deployment Status
<!-- Track deployment states across environments -->

### Environments
| Environment | Version | Last Deploy | Status | Health |
|-------------|---------|-------------|--------|--------|
| Development | latest | YYYY-MM-DD | active | ✅ |
| Staging | v0.9.0 | YYYY-MM-DD | active | ✅ |
| Production | v0.8.5 | YYYY-MM-DD | active | ✅ |

### Deployment History
- [YYYY-MM-DD HH:MM] Deployed v0.8.5 to production
- [YYYY-MM-DD HH:MM] Deployed v0.9.0 to staging
- [YYYY-MM-DD HH:MM] Rolled back v0.8.4 from production

## Configuration
- **User Name**: {{GIT_USER_NAME}}
- **User Email**: {{GIT_USER_EMAIL}}
- **Default Branch**: main
- **Commit Convention**: Conventional Commits
- **Branch Convention**: type/id-description

## Notes
<!-- Any important notes about Git state -->
- Git repository initialized with HoliCode framework
- Using GitHub CLI for authentication
- Non-blocking push operations enabled
