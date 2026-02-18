# Legacy UI Removal Manifest (Step 1 Baseline)

This document is the baseline inventory for deleting legacy UI safely in
phases, with TypeScript as the gate.

## Scope of Legacy UI

Legacy UI is defined by routes rendered inside `LegacyDesignScope` in
`frontend/src/App.tsx`.

Primary legacy route entry points:

- `frontend/src/components/layout/NormalLayout.tsx`
- `frontend/src/pages/Projects.tsx`
- `frontend/src/pages/Migration.tsx`
- `frontend/src/pages/ProjectTasks.tsx`
- `frontend/src/pages/FullAttemptLogs.tsx`
- `frontend/src/pages/settings/SettingsLayout.tsx`
- `frontend/src/pages/settings/GeneralSettings.tsx`
- `frontend/src/pages/settings/ProjectSettings.tsx`
- `frontend/src/pages/settings/ReposSettings.tsx`
- `frontend/src/pages/settings/OrganizationSettings.tsx`
- `frontend/src/pages/settings/AgentSettings.tsx`
- `frontend/src/pages/settings/McpSettings.tsx`

## Route -> Page Mapping (Legacy Scope)

- `/local-projects/:projectId/tasks/:taskId/attempts/:attemptId/full` ->
  `FullAttemptLogsPage` (`frontend/src/pages/FullAttemptLogs.tsx`)
- `/local-projects` -> `Projects` (`frontend/src/pages/Projects.tsx`)
- `/local-projects/:projectId` -> `Projects`
- `/migration` -> `Migration` (`frontend/src/pages/Migration.tsx`)
- `/local-projects/:projectId/tasks` -> `ProjectTasks`
  (`frontend/src/pages/ProjectTasks.tsx`)
- `/local-projects/:projectId/tasks/:taskId` -> `ProjectTasks`
- `/local-projects/:projectId/tasks/:taskId/attempts/:attemptId` ->
  `ProjectTasks`
- `/settings/*` -> `SettingsLayout` + nested settings pages
- `/mcp-servers` -> redirect to `/settings/mcp`

## Dependency Cones

The lists below track direct children and one-hop descendants to guide phased
deletion. They are intentionally focused on app components (not every hook/lib).

### `frontend/src/components/layout/NormalLayout.tsx`

- Direct children:
  - `frontend/src/components/DevBanner.tsx`
  - `frontend/src/components/layout/Navbar.tsx`
- One-hop descendants:
  - `frontend/src/components/layout/Navbar.tsx` ->
    `frontend/src/components/Logo.tsx`,
    `frontend/src/components/SearchBar.tsx`,
    `frontend/src/components/ide/OpenInIdeButton.tsx`,
    `frontend/src/components/dialogs/global/OAuthDialog.tsx`,
    `frontend/src/components/ConfigProvider.tsx`

### `frontend/src/pages/Projects.tsx`

- Direct children:
  - `frontend/src/components/projects/ProjectList.tsx`
  - `frontend/src/components/projects/ProjectDetail.tsx`
- One-hop descendants:
  - `frontend/src/components/projects/ProjectList.tsx` ->
    `frontend/src/components/dialogs/projects/ProjectFormDialog.tsx`,
    `frontend/src/components/projects/ProjectCard.tsx`
  - `frontend/src/components/projects/ProjectDetail.tsx` ->
    task/settings navigation only (mostly UI primitives)

### `frontend/src/pages/Migration.tsx`

- Direct children:
  - UI primitives only (`button`, `checkbox`, `alert`, `card`, `select`)
- Note:
  - No custom component subtree rooted under `components/*` beyond primitives.

### `frontend/src/pages/FullAttemptLogs.tsx`

- Direct children:
  - `frontend/src/components/panels/TaskAttemptPanel.tsx`
- One-hop descendants:
  - `frontend/src/components/logs/VirtualizedList.tsx`
  - `frontend/src/components/tasks/TaskFollowUpSection.tsx`
- Route-specific wrappers/contexts in page:
  - `AppWithStyleOverride`, `WebviewContextMenu`,
    `ClickedElementsProvider`, `ReviewProvider`,
    `ExecutionProcessesProvider`

### `frontend/src/pages/ProjectTasks.tsx`

- Direct children:
  - `frontend/src/components/layout/TasksLayout.tsx`
  - `frontend/src/components/panels/PreviewPanel.tsx`
  - `frontend/src/components/panels/DiffsPanel.tsx`
  - `frontend/src/components/panels/TaskAttemptPanel.tsx`
  - `frontend/src/components/panels/TaskPanel.tsx`
  - `frontend/src/components/panels/AttemptHeaderActions.tsx`
  - `frontend/src/components/panels/TaskPanelHeaderActions.tsx`
  - `frontend/src/components/tasks/TodoPanel.tsx`
  - `frontend/src/components/ui/shadcn-io/kanban/index.tsx`
  - `frontend/src/components/dialogs/global/FeatureShowcaseDialog.tsx`
  - `frontend/src/components/dialogs/global/BetaWorkspacesDialog.tsx`
- One-hop descendants (major cones):
  - `frontend/src/components/panels/TaskAttemptPanel.tsx` ->
    `frontend/src/components/logs/VirtualizedList.tsx`,
    `frontend/src/components/tasks/TaskFollowUpSection.tsx`
  - `frontend/src/components/panels/TaskPanel.tsx` ->
    `frontend/src/components/dialogs/tasks/CreateAttemptDialog.tsx`,
    `frontend/src/components/ui/wysiwyg.tsx`,
    `frontend/src/components/ui/table/index.ts`
  - `frontend/src/components/panels/PreviewPanel.tsx` ->
    `frontend/src/components/tasks/TaskDetails/preview/DevServerLogsView.tsx`,
    `frontend/src/components/tasks/TaskDetails/preview/PreviewToolbar.tsx`,
    `frontend/src/components/tasks/TaskDetails/preview/NoServerContent.tsx`,
    `frontend/src/components/tasks/TaskDetails/preview/ReadyContent.tsx`,
    `frontend/src/components/dialogs/scripts/ScriptFixerDialog.tsx`
  - `frontend/src/components/panels/DiffsPanel.tsx` ->
    `frontend/src/components/DiffCard.tsx`,
    `frontend/src/components/DiffViewSwitch.tsx`,
    `frontend/src/components/tasks/Toolbar/GitOperations.tsx`

### Settings pages under `/settings/*`

`frontend/src/pages/settings/SettingsLayout.tsx`

- Direct children:
  - UI shell/navigation (`NavLink`, `Outlet`) and shared button primitive

`frontend/src/pages/settings/GeneralSettings.tsx`

- Direct children:
  - `frontend/src/components/EditorAvailabilityIndicator.tsx`
  - `frontend/src/components/TagManager.tsx`
  - `frontend/src/components/dialogs/shared/FolderPickerDialog.tsx`

`frontend/src/pages/settings/ProjectSettings.tsx`

- Direct children:
  - `frontend/src/components/dialogs/shared/RepoPickerDialog.tsx`
- One-hop descendants:
  - `frontend/src/components/dialogs/shared/FolderPickerDialog.tsx`

`frontend/src/pages/settings/ReposSettings.tsx`

- Direct children:
  - `frontend/src/components/ui/auto-expanding-textarea.tsx`
  - `frontend/src/components/ui/multi-file-search-textarea.tsx`

`frontend/src/pages/settings/OrganizationSettings.tsx`

- Direct children:
  - `frontend/src/components/dialogs/shared/LoginRequiredPrompt.tsx`
  - `frontend/src/components/dialogs/org/CreateOrganizationDialog.tsx`
  - `frontend/src/components/dialogs/org/InviteMemberDialog.tsx`
  - `frontend/src/components/org/MemberListItem.tsx`
  - `frontend/src/components/org/PendingInvitationItem.tsx`

`frontend/src/pages/settings/AgentSettings.tsx`

- Direct children:
  - `frontend/src/components/ExecutorConfigForm.tsx`
  - `frontend/src/components/AgentAvailabilityIndicator.tsx`
  - `frontend/src/components/dialogs/settings/CreateConfigurationDialog.tsx`
  - `frontend/src/components/dialogs/settings/DeleteConfigurationDialog.tsx`

`frontend/src/pages/settings/McpSettings.tsx`

- Direct children:
  - `frontend/src/components/ui/json-editor.tsx`
  - `frontend/src/components/ConfigProvider.tsx`

## Runtime / Dynamic References To Preserve During Migration

These are not always visible in static route mapping but are required while
legacy pages still exist.

- `frontend/src/pages/ProjectTasks.tsx`
  - `openTaskForm(...)`
  - `FeatureShowcaseDialog.show(...)`
  - `BetaWorkspacesDialog.show(...)`
- `frontend/src/components/projects/ProjectList.tsx`
  - `ProjectFormDialog.show(...)`
- `frontend/src/pages/settings/ProjectSettings.tsx`
  - `RepoPickerDialog.show(...)`
- `frontend/src/pages/settings/GeneralSettings.tsx`
  - `FolderPickerDialog.show(...)`
- `frontend/src/pages/settings/OrganizationSettings.tsx`
  - `CreateOrganizationDialog.show(...)`
  - `InviteMemberDialog.show(...)`
- `frontend/src/pages/settings/AgentSettings.tsx`
  - `CreateConfigurationDialog.show(...)`
  - `DeleteConfigurationDialog.show(...)`
- `frontend/src/components/panels/TaskPanel.tsx`
  - `CreateAttemptDialog.show(...)`
- `frontend/src/components/panels/PreviewPanel.tsx`
  - `ScriptFixerDialog.show(...)`

Dynamic imports in the transitive legacy closure currently appear in shared
modules:

- `frontend/src/lib/api.ts`
- `frontend/src/lib/auth/tokenManager.ts`
- `frontend/src/components/ui-new/actions/index.ts`

These are shared and should not be treated as legacy-only delete targets.

## Shared-Module Caveat (Important For Child Cleanup)

Legacy entry points currently pull in many shared building blocks used by new
UI paths (for example `ConfigProvider`, `ThemeProvider`, UI primitives,
multiple contexts, and `lib/api.ts`). During deletion, remove route/page cones
first; then let `pnpm run check` determine what remains referenced.

## Verification Commands (for each slice)

- `pnpm run check`
- `rg -n \"LegacyDesignScope|/local-projects|/migration|/mcp-servers|/settings\" frontend/src`
- `rg -n \"\\.show\\(|openTaskForm\\(\" frontend/src/pages frontend/src/components`

