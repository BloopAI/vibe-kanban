# Dialogs Root Migration Plan (`src/dialogs/**`)

Date: 2026-02-22

## Goal

Move all dialog implementations to a single root namespace:

- `packages/web/src/dialogs/**`

Then reduce legacy dialog trees to temporary compatibility facades only:

- `packages/web/src/components/dialogs/**`
- `packages/web/src/components/ui-new/dialogs/**`
- `packages/web/src/features/*/ui/dialogs/**` (facades after move)
- `packages/web/src/shared/ui/dialogs/**` (facades after move)

## Why This Structure

Current lint blocks `src/features/**` from importing `@/features/**`.
This causes canonical-feature dialogs to be consumed through legacy paths.

`@/dialogs/**` avoids that boundary problem and gives one stable import target.

## Non-Negotiable Constraints

1. Use `git mv` for all file moves (preserve history).
2. No behavior change during move phases.
3. After each batch:
   - `pnpm run format`
   - `pnpm run web:check`
   - `pnpm run web:lint`
4. Legacy files must become strict facades:
   - no local logic
   - only `export ... from '@/dialogs/...';`

## Target Folder Layout

```
packages/web/src/dialogs/
  auth/
  command-bar/
    commandBar/
    selections/
  git/
  global/
  kanban/
  org/
  scripts/
  settings/
    settings/
      rjsf/
  shared/
  tasks/
  wysiwyg/
  index.ts            (optional, keep small and explicit if used)
```

## Canonical Import Rule (Post-Migration)

- App/features/widgets/entities should import dialogs from:
  - `@/dialogs/**`
- `components/dialogs/**`, `components/ui-new/dialogs/**`, `features/*/ui/dialogs/**`, `shared/ui/dialogs/**`:
  - compatibility facades only

## Recommended Execution Batches

## Batch 0: Preflight

- [ ] Create dedicated branch/session for this migration.
- [ ] Capture baseline:
  - `rg --files packages/web/src | rg "/dialogs/" | sort > /tmp/dialogs.before.txt`
  - `rg -n "@/components/dialogs|@/components/ui-new/dialogs|@/features/.*/ui/dialogs|@/shared/ui/dialogs" packages/web/src --glob "*.ts" --glob "*.tsx" > /tmp/dialog-imports.before.txt`
- [ ] Confirm clean start:
  - `git status --short`

## Batch 1: Create `src/dialogs` + Move High Cross-Feature Dialogs First

These unblock the biggest lint/path drift hotspots.

- [ ] Move:
  - `features/settings/ui/dialogs/OAuthDialog.tsx` -> `dialogs/global/OAuthDialog.tsx`
  - `features/settings/ui/dialogs/SettingsDialog.tsx` -> `dialogs/settings/SettingsDialog.tsx`
  - `features/command-bar/ui/dialogs/RestoreLogsDialog.tsx` -> `dialogs/tasks/RestoreLogsDialog.tsx`
  - `features/command-bar/ui/dialogs/ResolveConflictsDialog.tsx` -> `dialogs/tasks/ResolveConflictsDialog.tsx`
  - `features/command-bar/ui/dialogs/PrCommentsDialog.tsx` -> `dialogs/tasks/PrCommentsDialog.tsx`
  - `features/command-bar/ui/dialogs/CommandBarDialog.tsx` -> `dialogs/command-bar/CommandBarDialog.tsx`
  - `features/command-bar/ui/dialogs/AssigneeSelectionDialog.tsx` -> `dialogs/kanban/AssigneeSelectionDialog.tsx` (or `dialogs/command-bar/AssigneeSelectionDialog.tsx`, choose once and keep consistent)
- [ ] Convert moved source files to facades at original paths.
- [ ] Convert legacy facades (`components/dialogs/**`, `components/ui-new/dialogs/**`) to point to `@/dialogs/**`.
- [ ] Repoint direct callsites to `@/dialogs/**` where practical.

## Batch 2: Command Bar Dialog Cluster

- [ ] Move to `dialogs/command-bar/**`:
  - `SelectionDialog.tsx`
  - `WorkspaceSelectionDialog.tsx`
  - `CreatePRDialog.tsx`
  - `CreateWorkspaceFromPrDialog.tsx`
  - `StartReviewDialog.tsx`
  - `EditorSelectionDialog.tsx`
  - `GitActionsDialog.tsx`
  - `ViewProcessesDialog.tsx`
  - `ChangeTargetBranchDialog.tsx`
  - `EditBranchNameDialog.tsx`
  - `ForcePushDialog.tsx`
  - `RebaseDialog.tsx`
  - `BranchRebaseDialog.tsx`
- [ ] Move helpers:
  - `commandBar/*` -> `dialogs/command-bar/commandBar/*`
  - `selections/*` -> `dialogs/command-bar/selections/*`
- [ ] Turn old feature/ui-new/components files into facades.

## Batch 3: Settings + Org + Auth Dialog Cluster

- [ ] Move to `dialogs/settings/**` and `dialogs/org/**` and `dialogs/auth/**`:
  - `CreateConfigurationDialog.tsx`
  - `DeleteConfigurationDialog.tsx`
  - `ReleaseNotesDialog.tsx`
  - `GhCliSetupDialog.tsx`
  - `CreateOrganizationDialog.tsx`
  - `InviteMemberDialog.tsx`
  - `CreateRemoteProjectDialog.tsx`
  - `DeleteRemoteProjectDialog.tsx`
- [ ] Move settings sections:
  - `settings/SettingsSection.tsx`
  - `settings/SettingsDirtyContext.tsx`
  - `settings/SettingsComponents.tsx`
  - `settings/ExecutorConfigForm.tsx`
  - `settings/AgentsSettingsSection.tsx`
  - `settings/GeneralSettingsSection.tsx`
  - `settings/McpSettingsSection.tsx`
  - `settings/OrganizationsSettingsSection.tsx`
  - `settings/RemoteProjectsSettingsSection.tsx`
  - `settings/ReposSettingsSection.tsx`
  - `settings/rjsf/*`
- [ ] Facade all old paths.

## Batch 4: Shared/Reusable Dialog Cluster

- [ ] Move to `dialogs/shared/**`, `dialogs/scripts/**`, `dialogs/wysiwyg/**`, `dialogs/kanban/**`:
  - `shared/ui/dialogs/ConfirmDialog.tsx`
  - `FolderPickerDialog.tsx`
  - `ImagePreviewDialog.tsx`
  - `KeyboardShortcutsDialog.tsx`
  - `LoginRequiredPrompt.tsx`
  - `ScriptFixerDialog.tsx`
  - `TagEditDialog.tsx`
  - `WorkspacesGuideDialog.tsx`
  - `features/kanban/ui/dialogs/KanbanFiltersDialog.tsx`
- [ ] Keep old feature/shared/component files as facades only.

## Batch 5: Compatibility Cleanup + Import Convergence

- [ ] Bulk rewrite imports to `@/dialogs/**` with a map file.
- [ ] Keep temporary facades only where still needed for staged rollout.
- [ ] Remove dead facades with zero importers.
- [ ] Update `scripts/legacy-frontend-paths-allowlist.txt` to reflect remaining intentional legacy files only.

## Safe Bulk Rewrite Workflow

Use a mapping file (tab-separated):

`scripts/dialog-import-rewrite-map.tsv`

Format:

```
@/components/dialogs/global/OAuthDialog	@/dialogs/global/OAuthDialog
@/components/dialogs/tasks/RestoreLogsDialog	@/dialogs/tasks/RestoreLogsDialog
...
```

Apply:

```bash
while IFS=$'\t' read -r from to; do
  rg -l --fixed-strings "$from" packages/web/src \
    | while read -r f; do
        perl -pi -e "s@\Q$from\E@$to@g" "$f"
      done
done < scripts/dialog-import-rewrite-map.tsv
```

## Facade Template

```ts
export { SomeDialog, type SomeDialogProps } from '@/dialogs/path/SomeDialog';
```

No extra logic, hooks, constants, or local exports in facade files.

## Lint/Boundary Follow-Ups (After Migration)

- [ ] Add boundary rule to ban new dialog imports from:
  - `@/components/dialogs/**`
  - `@/components/ui-new/dialogs/**`
  - `@/features/*/ui/dialogs/**`
  - `@/shared/ui/dialogs/**`
  in non-facade files.
- [ ] Optionally allow those imports only in explicit compatibility directories.

## Validation Checklist Per Batch

- [ ] `pnpm run format`
- [ ] `pnpm run web:check`
- [ ] `pnpm run web:lint`
- [ ] `scripts/check-legacy-frontend-paths.sh`
- [ ] `git status --short` reviewed (only expected files changed)

## Exit Criteria

- All real dialog implementations live under `packages/web/src/dialogs/**`.
- Old dialog paths are facades only (or removed).
- Runtime behavior unchanged.
- Lint/typecheck pass.
- Legacy allowlist shrinks substantially and only tracks intentional temporary shims.

## Rollback Strategy

If a batch causes broad breakage:

1. `git restore --staged .`
2. `git checkout -- .` (only in your dedicated migration branch/session)
3. Re-apply smaller scoped batch (5-10 files max) with same validation loop.
