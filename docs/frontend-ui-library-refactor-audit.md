# Frontend UI Package Refactor Audit

Date: 2026-02-21

## Scope

- Source audited: `packages/local-web/src/components/**/*.tsx`
- Total components: 280
- Objective: identify what should move first into a new pnpm UI library package.

## Current Frontend Structure (Component View)

| Area | Components | Extract now | Extract later | Keep app |
| --- | ---: | ---: | ---: | ---: |
| `ui-new/primitives` | 73 | 16 | 8 | 49 |
| `ui-new/containers` | 45 | 0 | 0 | 45 |
| `ui-new/dialogs` | 33 | 0 | 0 | 33 |
| `ui-new/views` | 32 | 0 | 0 | 32 |
| `dialogs` | 27 | 0 | 0 | 27 |
| `ui/wysiwyg` | 20 | 0 | 20 | 0 |
| `ui` | 17 | 11 | 5 | 1 |
| `tasks` | 10 | 0 | 0 | 10 |
| `NormalizedConversation` | 7 | 0 | 0 | 7 |
| `root` | 3 | 0 | 0 | 3 |
| `common` | 2 | 0 | 0 | 2 |
| `ide` | 2 | 0 | 0 | 2 |
| `org` | 2 | 0 | 0 | 2 |
| `ui-new/scope` | 2 | 0 | 0 | 2 |
| `ui/table` | 2 | 0 | 2 | 0 |
| `agents` | 1 | 0 | 0 | 1 |
| `settings` | 1 | 0 | 0 | 1 |
| `ui-new/terminal` | 1 | 0 | 0 | 1 |

## Refactor Status Legend

- `extract-now`: move in first `@vibe/ui` package wave.
- `extract-later`: reusable, but move only after API/dependency decoupling.
- `keep-app`: stay in frontend app package (feature/domain/integration UI).

## Recommended First Extraction Set

- Start with `extract-now` components from `components/ui` and selected `components/ui-new/primitives`.
- Keep all `containers`, `views`, and feature `dialogs` in the app package.
- Treat `components/ui/wysiwyg` as a separate future package (`@vibe/editor-ui`) after `@vibe/ui` lands.

## Full Component Map

### ui-new/primitives

| Component | Status | Target package | Notes |
| --- | --- | --- | --- |
| `ui-new/primitives/Accordion.tsx` | `extract-now` | `@vibe/ui` | Primitive UI component; good first package candidate. |
| `ui-new/primitives/AppBar.tsx` | `keep-app` | `frontend-app` | Domain-specific primitive for kanban/chat/workspace flows. |
| `ui-new/primitives/AppBarButton.tsx` | `keep-app` | `frontend-app` | Domain-specific primitive for kanban/chat/workspace flows. |
| `ui-new/primitives/AppBarSocialLink.tsx` | `keep-app` | `frontend-app` | Domain-specific primitive for kanban/chat/workspace flows. |
| `ui-new/primitives/AppBarUserPopover.tsx` | `keep-app` | `frontend-app` | Domain-specific primitive for kanban/chat/workspace flows. |
| `ui-new/primitives/AutoResizeTextarea.tsx` | `extract-now` | `@vibe/ui` | Primitive UI component; good first package candidate. |
| `ui-new/primitives/ChatBoxBase.tsx` | `keep-app` | `frontend-app` | Domain-specific primitive for kanban/chat/workspace flows. |
| `ui-new/primitives/CollapsibleSectionHeader.tsx` | `extract-later` | `@vibe/ui` | Primitive UI component; good first package candidate. Move after decoupling @/stores. |
| `ui-new/primitives/ColorPicker.tsx` | `extract-now` | `@vibe/ui` | Primitive UI component; good first package candidate. |
| `ui-new/primitives/Command.tsx` | `extract-now` | `@vibe/ui` | Primitive UI component; good first package candidate. |
| `ui-new/primitives/CommandBar.tsx` | `extract-later` | `@vibe/ui` | Potentially reusable but needs API cleanup. Requires decoupling from @/components/*. |
| `ui-new/primitives/CommentCard.tsx` | `keep-app` | `frontend-app` | Domain-specific primitive for kanban/chat/workspace flows. |
| `ui-new/primitives/ContextBar.tsx` | `keep-app` | `frontend-app` | Domain-specific primitive for kanban/chat/workspace flows. |
| `ui-new/primitives/ContextUsageGauge.tsx` | `keep-app` | `frontend-app` | Domain-specific primitive for kanban/chat/workspace flows. |
| `ui-new/primitives/CreateChatBox.tsx` | `keep-app` | `frontend-app` | Domain-specific primitive for kanban/chat/workspace flows. |
| `ui-new/primitives/Dialog.tsx` | `extract-later` | `@vibe/ui` | Primitive UI component; good first package candidate. Move after decoupling @/contexts. |
| `ui-new/primitives/Dropdown.tsx` | `extract-later` | `@vibe/ui` | Primitive UI component; good first package candidate. Move after decoupling @/contexts. |
| `ui-new/primitives/EmojiPicker.tsx` | `extract-later` | `@vibe/ui` | Potentially reusable but needs API cleanup. Requires decoupling from @/contexts. |
| `ui-new/primitives/ErrorAlert.tsx` | `extract-now` | `@vibe/ui` | Primitive UI component; good first package candidate. |
| `ui-new/primitives/GoogleLogo.tsx` | `keep-app` | `frontend-app` | Domain-specific primitive for kanban/chat/workspace flows. |
| `ui-new/primitives/IconButton.tsx` | `extract-now` | `@vibe/ui` | Primitive UI component; good first package candidate. |
| `ui-new/primitives/IconButtonGroup.tsx` | `extract-now` | `@vibe/ui` | Primitive UI component; good first package candidate. |
| `ui-new/primitives/InputField.tsx` | `extract-now` | `@vibe/ui` | Primitive UI component; good first package candidate. |
| `ui-new/primitives/KanbanAssignee.tsx` | `keep-app` | `frontend-app` | Domain-specific primitive for kanban/chat/workspace flows. |
| `ui-new/primitives/KanbanBadge.tsx` | `keep-app` | `frontend-app` | Domain-specific primitive for kanban/chat/workspace flows. |
| `ui-new/primitives/MultiSelectCommandBar.tsx` | `extract-later` | `@vibe/ui` | Potentially reusable but needs API cleanup. |
| `ui-new/primitives/MultiSelectDropdown.tsx` | `extract-now` | `@vibe/ui` | Primitive UI component; good first package candidate. |
| `ui-new/primitives/OAuthButtons.tsx` | `keep-app` | `frontend-app` | Domain-specific primitive for kanban/chat/workspace flows. |
| `ui-new/primitives/Popover.tsx` | `extract-later` | `@vibe/ui` | Primitive UI component; good first package candidate. Move after decoupling @/contexts. |
| `ui-new/primitives/PrBadge.tsx` | `keep-app` | `frontend-app` | Domain-specific primitive for kanban/chat/workspace flows. |
| `ui-new/primitives/PrimaryButton.tsx` | `extract-now` | `@vibe/ui` | Primitive UI component; good first package candidate. |
| `ui-new/primitives/PriorityIcon.tsx` | `keep-app` | `frontend-app` | Domain-specific primitive for kanban/chat/workspace flows. |
| `ui-new/primitives/ProcessListItem.tsx` | `keep-app` | `frontend-app` | Domain-specific primitive for kanban/chat/workspace flows. |
| `ui-new/primitives/PropertyDropdown.tsx` | `keep-app` | `frontend-app` | Domain-specific primitive for kanban/chat/workspace flows. |
| `ui-new/primitives/RelationshipBadge.tsx` | `keep-app` | `frontend-app` | Domain-specific primitive for kanban/chat/workspace flows. |
| `ui-new/primitives/RepoCard.tsx` | `keep-app` | `frontend-app` | Domain-specific primitive for kanban/chat/workspace flows. |
| `ui-new/primitives/RunningDots.tsx` | `extract-now` | `@vibe/ui` | Primitive UI component; good first package candidate. |
| `ui-new/primitives/SearchableDropdown.tsx` | `extract-now` | `@vibe/ui` | Primitive UI component; good first package candidate. |
| `ui-new/primitives/SearchableTagDropdown.tsx` | `keep-app` | `frontend-app` | Domain-specific primitive for kanban/chat/workspace flows. |
| `ui-new/primitives/SessionChatBox.tsx` | `keep-app` | `frontend-app` | Domain-specific primitive for kanban/chat/workspace flows. |
| `ui-new/primitives/SplitButton.tsx` | `extract-now` | `@vibe/ui` | Primitive UI component; good first package candidate. |
| `ui-new/primitives/StatusDot.tsx` | `extract-now` | `@vibe/ui` | Primitive UI component; good first package candidate. |
| `ui-new/primitives/SubIssueRow.tsx` | `keep-app` | `frontend-app` | Domain-specific primitive for kanban/chat/workspace flows. |
| `ui-new/primitives/SyncErrorIndicator.tsx` | `keep-app` | `frontend-app` | Domain-specific primitive for kanban/chat/workspace flows. |
| `ui-new/primitives/TodoProgressPopup.tsx` | `keep-app` | `frontend-app` | Domain-specific primitive for kanban/chat/workspace flows. |
| `ui-new/primitives/Toggle.tsx` | `extract-now` | `@vibe/ui` | Primitive UI component; good first package candidate. |
| `ui-new/primitives/Toolbar.tsx` | `extract-now` | `@vibe/ui` | Primitive UI component; good first package candidate. |
| `ui-new/primitives/Tooltip.tsx` | `extract-later` | `@vibe/ui` | Primitive UI component; good first package candidate. Move after decoupling @/contexts. |
| `ui-new/primitives/UserAvatar.tsx` | `keep-app` | `frontend-app` | Domain-specific primitive for kanban/chat/workspace flows. |
| `ui-new/primitives/ViewNavTabs.tsx` | `keep-app` | `frontend-app` | Domain-specific primitive for kanban/chat/workspace flows. |
| `ui-new/primitives/WorkspaceSummary.tsx` | `keep-app` | `frontend-app` | Domain-specific primitive for kanban/chat/workspace flows. |
| `ui-new/primitives/conversation/ChatAggregatedDiffEntries.tsx` | `keep-app` | `frontend-app` | Conversation domain rendering components. |
| `ui-new/primitives/conversation/ChatAggregatedToolEntries.tsx` | `keep-app` | `frontend-app` | Conversation domain rendering components. |
| `ui-new/primitives/conversation/ChatApprovalCard.tsx` | `keep-app` | `frontend-app` | Conversation domain rendering components. |
| `ui-new/primitives/conversation/ChatAssistantMessage.tsx` | `keep-app` | `frontend-app` | Conversation domain rendering components. |
| `ui-new/primitives/conversation/ChatCollapsedThinking.tsx` | `keep-app` | `frontend-app` | Conversation domain rendering components. |
| `ui-new/primitives/conversation/ChatEntryContainer.tsx` | `keep-app` | `frontend-app` | Conversation domain rendering components. |
| `ui-new/primitives/conversation/ChatErrorMessage.tsx` | `keep-app` | `frontend-app` | Conversation domain rendering components. |
| `ui-new/primitives/conversation/ChatFileEntry.tsx` | `keep-app` | `frontend-app` | Conversation domain rendering components. |
| `ui-new/primitives/conversation/ChatMarkdown.tsx` | `keep-app` | `frontend-app` | Conversation domain rendering components. |
| `ui-new/primitives/conversation/ChatScriptEntry.tsx` | `keep-app` | `frontend-app` | Conversation domain rendering components. |
| `ui-new/primitives/conversation/ChatScriptPlaceholder.tsx` | `keep-app` | `frontend-app` | Conversation domain rendering components. |
| `ui-new/primitives/conversation/ChatSubagentEntry.tsx` | `keep-app` | `frontend-app` | Conversation domain rendering components. |
| `ui-new/primitives/conversation/ChatSystemMessage.tsx` | `keep-app` | `frontend-app` | Conversation domain rendering components. |
| `ui-new/primitives/conversation/ChatThinkingMessage.tsx` | `keep-app` | `frontend-app` | Conversation domain rendering components. |
| `ui-new/primitives/conversation/ChatTodoList.tsx` | `keep-app` | `frontend-app` | Conversation domain rendering components. |
| `ui-new/primitives/conversation/ChatToolSummary.tsx` | `keep-app` | `frontend-app` | Conversation domain rendering components. |
| `ui-new/primitives/conversation/ChatUserMessage.tsx` | `keep-app` | `frontend-app` | Conversation domain rendering components. |
| `ui-new/primitives/conversation/PierreConversationDiff.tsx` | `keep-app` | `frontend-app` | Conversation domain rendering components. |
| `ui-new/primitives/conversation/ToolStatusDot.tsx` | `keep-app` | `frontend-app` | Conversation domain rendering components. |
| `ui-new/primitives/model-selector/ModelList.tsx` | `keep-app` | `frontend-app` | Model/provider domain UI. |
| `ui-new/primitives/model-selector/ModelProviderIcon.tsx` | `keep-app` | `frontend-app` | Model/provider domain UI. |
| `ui-new/primitives/model-selector/ModelSelectorPopover.tsx` | `keep-app` | `frontend-app` | Model/provider domain UI. |

### ui-new/containers

| Component | Status | Target package | Notes |
| --- | --- | --- | --- |
| `ui-new/containers/AppBarUserPopoverContainer.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/ChangesPanelContainer.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/ColorPickerContainer.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/CommentWidgetLine.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/ContextBarContainer.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/ConversationListContainer.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/CopyButton.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/CreateChatBoxContainer.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/CreateModeRepoPickerBar.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/FileTreeContainer.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/GitHubCommentRenderer.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/GitPanelContainer.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/IssueCommentsSectionContainer.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/IssueRelationshipsSectionContainer.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/IssueSubIssuesSectionContainer.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/IssueWorkspacesSectionContainer.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/KanbanContainer.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/KanbanIssuePanelContainer.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/LogsContentContainer.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/MigrateChooseProjectsContainer.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/MigrateFinishContainer.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/MigrateIntroductionContainer.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/MigrateLayout.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/MigrateMigrateContainer.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/ModelSelectorContainer.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/NavbarContainer.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/NewDisplayConversationEntry.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/PierreDiffCard.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/PreviewBrowserContainer.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/PreviewControlsContainer.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/ProcessListContainer.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/ProjectRightSidebarContainer.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/RemoteIssueLink.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/ReviewCommentRenderer.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/RightSidebar.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/SearchableDropdownContainer.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/SearchableTagDropdownContainer.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/SessionChatBoxContainer.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/SharedAppLayout.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/TerminalPanelContainer.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/VirtualizedProcessLogs.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/WorkspaceNotesContainer.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/WorkspacesLayout.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/WorkspacesMainContainer.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |
| `ui-new/containers/WorkspacesSidebarContainer.tsx` | `keep-app` | `frontend-app` | State/data container; keep with app feature logic. |

### ui-new/dialogs

| Component | Status | Target package | Notes |
| --- | --- | --- | --- |
| `ui-new/dialogs/AssigneeSelectionDialog.tsx` | `keep-app` | `frontend-app` | Workflow/dialog feature UI tied to app flows. |
| `ui-new/dialogs/ChangeTargetDialog.tsx` | `keep-app` | `frontend-app` | Workflow/dialog feature UI tied to app flows. |
| `ui-new/dialogs/CommandBarDialog.tsx` | `keep-app` | `frontend-app` | Workflow/dialog feature UI tied to app flows. |
| `ui-new/dialogs/ConfirmDialog.tsx` | `keep-app` | `frontend-app` | Workflow/dialog feature UI tied to app flows. |
| `ui-new/dialogs/CreateRepoDialog.tsx` | `keep-app` | `frontend-app` | Workflow/dialog feature UI tied to app flows. |
| `ui-new/dialogs/DeleteWorkspaceDialog.tsx` | `keep-app` | `frontend-app` | Workflow/dialog feature UI tied to app flows. |
| `ui-new/dialogs/ErrorDialog.tsx` | `keep-app` | `frontend-app` | Workflow/dialog feature UI tied to app flows. |
| `ui-new/dialogs/GuideDialogShell.tsx` | `keep-app` | `frontend-app` | Workflow/dialog feature UI tied to app flows. |
| `ui-new/dialogs/KanbanFiltersDialog.tsx` | `keep-app` | `frontend-app` | Workflow/dialog feature UI tied to app flows. |
| `ui-new/dialogs/KeyboardShortcutsDialog.tsx` | `keep-app` | `frontend-app` | Workflow/dialog feature UI tied to app flows. |
| `ui-new/dialogs/ProjectsGuideDialog.tsx` | `keep-app` | `frontend-app` | Workflow/dialog feature UI tied to app flows. |
| `ui-new/dialogs/RebaseDialog.tsx` | `keep-app` | `frontend-app` | Workflow/dialog feature UI tied to app flows. |
| `ui-new/dialogs/RebaseInProgressDialog.tsx` | `keep-app` | `frontend-app` | Workflow/dialog feature UI tied to app flows. |
| `ui-new/dialogs/RenameWorkspaceDialog.tsx` | `keep-app` | `frontend-app` | Workflow/dialog feature UI tied to app flows. |
| `ui-new/dialogs/ResolveConflictsDialog.tsx` | `keep-app` | `frontend-app` | Workflow/dialog feature UI tied to app flows. |
| `ui-new/dialogs/SelectionDialog.tsx` | `keep-app` | `frontend-app` | Workflow/dialog feature UI tied to app flows. |
| `ui-new/dialogs/SettingsDialog.tsx` | `keep-app` | `frontend-app` | Workflow/dialog feature UI tied to app flows. |
| `ui-new/dialogs/WorkspaceSelectionDialog.tsx` | `keep-app` | `frontend-app` | Workflow/dialog feature UI tied to app flows. |
| `ui-new/dialogs/WorkspacesGuideDialog.tsx` | `keep-app` | `frontend-app` | Workflow/dialog feature UI tied to app flows. |
| `ui-new/dialogs/selections/ProjectSelectionDialog.tsx` | `keep-app` | `frontend-app` | Workflow/dialog feature UI tied to app flows. |
| `ui-new/dialogs/settings/AgentsSettingsSection.tsx` | `keep-app` | `frontend-app` | Workflow/dialog feature UI tied to app flows. |
| `ui-new/dialogs/settings/ExecutorConfigForm.tsx` | `keep-app` | `frontend-app` | Workflow/dialog feature UI tied to app flows. |
| `ui-new/dialogs/settings/GeneralSettingsSection.tsx` | `keep-app` | `frontend-app` | Workflow/dialog feature UI tied to app flows. |
| `ui-new/dialogs/settings/McpSettingsSection.tsx` | `keep-app` | `frontend-app` | Workflow/dialog feature UI tied to app flows. |
| `ui-new/dialogs/settings/OrganizationsSettingsSection.tsx` | `keep-app` | `frontend-app` | Workflow/dialog feature UI tied to app flows. |
| `ui-new/dialogs/settings/RemoteProjectsSettingsSection.tsx` | `keep-app` | `frontend-app` | Workflow/dialog feature UI tied to app flows. |
| `ui-new/dialogs/settings/ReposSettingsSection.tsx` | `keep-app` | `frontend-app` | Workflow/dialog feature UI tied to app flows. |
| `ui-new/dialogs/settings/SettingsComponents.tsx` | `keep-app` | `frontend-app` | Workflow/dialog feature UI tied to app flows. |
| `ui-new/dialogs/settings/SettingsDirtyContext.tsx` | `keep-app` | `frontend-app` | Workflow/dialog feature UI tied to app flows. |
| `ui-new/dialogs/settings/SettingsSection.tsx` | `keep-app` | `frontend-app` | Workflow/dialog feature UI tied to app flows. |
| `ui-new/dialogs/settings/rjsf/Fields.tsx` | `keep-app` | `frontend-app` | Workflow/dialog feature UI tied to app flows. |
| `ui-new/dialogs/settings/rjsf/Templates.tsx` | `keep-app` | `frontend-app` | Workflow/dialog feature UI tied to app flows. |
| `ui-new/dialogs/settings/rjsf/Widgets.tsx` | `keep-app` | `frontend-app` | Workflow/dialog feature UI tied to app flows. |

### ui-new/views

| Component | Status | Target package | Notes |
| --- | --- | --- | --- |
| `ui-new/views/ChangesPanel.tsx` | `keep-app` | `frontend-app` | Feature view composition. |
| `ui-new/views/FileTree.tsx` | `keep-app` | `frontend-app` | Feature view composition. |
| `ui-new/views/FileTreeNode.tsx` | `keep-app` | `frontend-app` | Feature view composition. |
| `ui-new/views/FileTreeSearchBar.tsx` | `keep-app` | `frontend-app` | Feature view composition. |
| `ui-new/views/GitPanel.tsx` | `keep-app` | `frontend-app` | Feature view composition. |
| `ui-new/views/IssueCommentsSection.tsx` | `keep-app` | `frontend-app` | Feature view composition. |
| `ui-new/views/IssueListRow.tsx` | `keep-app` | `frontend-app` | Feature view composition. |
| `ui-new/views/IssueListSection.tsx` | `keep-app` | `frontend-app` | Feature view composition. |
| `ui-new/views/IssueListView.tsx` | `keep-app` | `frontend-app` | Feature view composition. |
| `ui-new/views/IssuePropertyRow.tsx` | `keep-app` | `frontend-app` | Feature view composition. |
| `ui-new/views/IssueRelationshipsSection.tsx` | `keep-app` | `frontend-app` | Feature view composition. |
| `ui-new/views/IssueSubIssuesSection.tsx` | `keep-app` | `frontend-app` | Feature view composition. |
| `ui-new/views/IssueTagsRow.tsx` | `keep-app` | `frontend-app` | Feature view composition. |
| `ui-new/views/IssueWorkspaceCard.tsx` | `keep-app` | `frontend-app` | Feature view composition. |
| `ui-new/views/IssueWorkspacesSection.tsx` | `keep-app` | `frontend-app` | Feature view composition. |
| `ui-new/views/KanbanBoard.tsx` | `keep-app` | `frontend-app` | Feature view composition. |
| `ui-new/views/KanbanCardContent.tsx` | `keep-app` | `frontend-app` | Feature view composition. |
| `ui-new/views/KanbanFilterBar.tsx` | `keep-app` | `frontend-app` | Feature view composition. |
| `ui-new/views/KanbanIssuePanel.tsx` | `keep-app` | `frontend-app` | Feature view composition. |
| `ui-new/views/MigrateChooseProjects.tsx` | `keep-app` | `frontend-app` | Feature view composition. |
| `ui-new/views/MigrateFinish.tsx` | `keep-app` | `frontend-app` | Feature view composition. |
| `ui-new/views/MigrateIntroduction.tsx` | `keep-app` | `frontend-app` | Feature view composition. |
| `ui-new/views/MigrateMigrate.tsx` | `keep-app` | `frontend-app` | Feature view composition. |
| `ui-new/views/MigrateSidebar.tsx` | `keep-app` | `frontend-app` | Feature view composition. |
| `ui-new/views/Navbar.tsx` | `keep-app` | `frontend-app` | Feature view composition. |
| `ui-new/views/PreviewBrowser.tsx` | `keep-app` | `frontend-app` | Feature view composition. |
| `ui-new/views/PreviewControls.tsx` | `keep-app` | `frontend-app` | Feature view composition. |
| `ui-new/views/PreviewNavigation.tsx` | `keep-app` | `frontend-app` | Feature view composition. |
| `ui-new/views/PriorityFilterDropdown.tsx` | `keep-app` | `frontend-app` | Feature view composition. |
| `ui-new/views/TerminalPanel.tsx` | `keep-app` | `frontend-app` | Feature view composition. |
| `ui-new/views/WorkspacesMain.tsx` | `keep-app` | `frontend-app` | Feature view composition. |
| `ui-new/views/WorkspacesSidebar.tsx` | `keep-app` | `frontend-app` | Feature view composition. |

### dialogs

| Component | Status | Target package | Notes |
| --- | --- | --- | --- |
| `dialogs/CreateWorkspaceFromPrDialog.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `dialogs/auth/GhCliSetupDialog.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `dialogs/git/ForcePushDialog.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `dialogs/global/OAuthDialog.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `dialogs/global/ReleaseNotesDialog.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `dialogs/org/CreateOrganizationDialog.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `dialogs/org/CreateRemoteProjectDialog.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `dialogs/org/DeleteRemoteProjectDialog.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `dialogs/org/InviteMemberDialog.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `dialogs/scripts/ScriptFixerDialog.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `dialogs/settings/CreateConfigurationDialog.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `dialogs/settings/DeleteConfigurationDialog.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `dialogs/shared/ConfirmDialog.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `dialogs/shared/FolderPickerDialog.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `dialogs/shared/LoginRequiredPrompt.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `dialogs/tasks/ChangeTargetBranchDialog.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `dialogs/tasks/CreatePRDialog.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `dialogs/tasks/EditBranchNameDialog.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `dialogs/tasks/EditorSelectionDialog.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `dialogs/tasks/GitActionsDialog.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `dialogs/tasks/PrCommentsDialog.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `dialogs/tasks/RebaseDialog.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `dialogs/tasks/RestoreLogsDialog.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `dialogs/tasks/StartReviewDialog.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `dialogs/tasks/TagEditDialog.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `dialogs/tasks/ViewProcessesDialog.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `dialogs/wysiwyg/ImagePreviewDialog.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |

### ui/wysiwyg

| Component | Status | Target package | Notes |
| --- | --- | --- | --- |
| `ui/wysiwyg/context/task-attempt-context.tsx` | `extract-later` | `@vibe/editor-ui` | Editor subsystem; split as a dedicated package later. |
| `ui/wysiwyg/context/typeahead-open-context.tsx` | `extract-later` | `@vibe/editor-ui` | Editor subsystem; split as a dedicated package later. |
| `ui/wysiwyg/lib/create-decorator-node.tsx` | `extract-later` | `@vibe/editor-ui` | Editor subsystem; split as a dedicated package later. |
| `ui/wysiwyg/nodes/component-info-node.tsx` | `extract-later` | `@vibe/editor-ui` | Editor subsystem; split as a dedicated package later. |
| `ui/wysiwyg/nodes/image-node.tsx` | `extract-later` | `@vibe/editor-ui` | Editor subsystem; split as a dedicated package later. Requires decoupling from @/hooks, @/components/*. |
| `ui/wysiwyg/nodes/pr-comment-node.tsx` | `extract-later` | `@vibe/editor-ui` | Editor subsystem; split as a dedicated package later. |
| `ui/wysiwyg/plugins/clickable-code-plugin.tsx` | `extract-later` | `@vibe/editor-ui` | Editor subsystem; split as a dedicated package later. |
| `ui/wysiwyg/plugins/code-block-shortcut-plugin.tsx` | `extract-later` | `@vibe/editor-ui` | Editor subsystem; split as a dedicated package later. |
| `ui/wysiwyg/plugins/code-highlight-plugin.tsx` | `extract-later` | `@vibe/editor-ui` | Editor subsystem; split as a dedicated package later. |
| `ui/wysiwyg/plugins/component-info-keyboard-plugin.tsx` | `extract-later` | `@vibe/editor-ui` | Editor subsystem; split as a dedicated package later. |
| `ui/wysiwyg/plugins/file-tag-typeahead-plugin.tsx` | `extract-later` | `@vibe/editor-ui` | Editor subsystem; split as a dedicated package later. Requires decoupling from @/components/*, @/contexts, @/lib/*api, @/stores. |
| `ui/wysiwyg/plugins/image-keyboard-plugin.tsx` | `extract-later` | `@vibe/editor-ui` | Editor subsystem; split as a dedicated package later. |
| `ui/wysiwyg/plugins/keyboard-commands-plugin.tsx` | `extract-later` | `@vibe/editor-ui` | Editor subsystem; split as a dedicated package later. |
| `ui/wysiwyg/plugins/markdown-sync-plugin.tsx` | `extract-later` | `@vibe/editor-ui` | Editor subsystem; split as a dedicated package later. |
| `ui/wysiwyg/plugins/paste-markdown-plugin.tsx` | `extract-later` | `@vibe/editor-ui` | Editor subsystem; split as a dedicated package later. |
| `ui/wysiwyg/plugins/read-only-link-plugin.tsx` | `extract-later` | `@vibe/editor-ui` | Editor subsystem; split as a dedicated package later. |
| `ui/wysiwyg/plugins/slash-command-typeahead-plugin.tsx` | `extract-later` | `@vibe/editor-ui` | Editor subsystem; split as a dedicated package later. Requires decoupling from @/contexts, @/hooks. |
| `ui/wysiwyg/plugins/static-toolbar-plugin.tsx` | `extract-later` | `@vibe/editor-ui` | Editor subsystem; split as a dedicated package later. |
| `ui/wysiwyg/plugins/toolbar-plugin.tsx` | `extract-later` | `@vibe/editor-ui` | Editor subsystem; split as a dedicated package later. Requires decoupling from @/contexts. |
| `ui/wysiwyg/plugins/typeahead-menu-components.tsx` | `extract-later` | `@vibe/editor-ui` | Editor subsystem; split as a dedicated package later. |

### ui

| Component | Status | Target package | Notes |
| --- | --- | --- | --- |
| `ui/alert.tsx` | `extract-now` | `@vibe/ui` | Core shadcn-style primitive with low business coupling. |
| `ui/auto-expanding-textarea.tsx` | `extract-now` | `@vibe/ui` | Core shadcn-style primitive with low business coupling. |
| `ui/badge.tsx` | `extract-now` | `@vibe/ui` | Core shadcn-style primitive with low business coupling. |
| `ui/button.tsx` | `extract-now` | `@vibe/ui` | Core shadcn-style primitive with low business coupling. |
| `ui/card.tsx` | `extract-now` | `@vibe/ui` | Core shadcn-style primitive with low business coupling. |
| `ui/checkbox.tsx` | `extract-now` | `@vibe/ui` | Core shadcn-style primitive with low business coupling. |
| `ui/dialog.tsx` | `extract-later` | `@vibe/ui` | Reusable but currently tied to app context/portal behavior. Requires decoupling from @/keyboard. |
| `ui/dropdown-menu.tsx` | `extract-later` | `@vibe/ui` | Reusable but currently tied to app context/portal behavior. Requires decoupling from @/contexts. |
| `ui/input.tsx` | `extract-now` | `@vibe/ui` | Core shadcn-style primitive with low business coupling. |
| `ui/label.tsx` | `extract-now` | `@vibe/ui` | Core shadcn-style primitive with low business coupling. |
| `ui/loader.tsx` | `extract-now` | `@vibe/ui` | Core shadcn-style primitive with low business coupling. |
| `ui/pr-comment-card.tsx` | `keep-app` | `frontend-app` | PR domain card component. |
| `ui/select.tsx` | `extract-later` | `@vibe/ui` | Reusable but currently tied to app context/portal behavior. Requires decoupling from @/contexts. |
| `ui/switch.tsx` | `extract-now` | `@vibe/ui` | Core shadcn-style primitive with low business coupling. |
| `ui/textarea.tsx` | `extract-now` | `@vibe/ui` | Core shadcn-style primitive with low business coupling. |
| `ui/tooltip.tsx` | `extract-later` | `@vibe/ui` | Reusable but currently tied to app context/portal behavior. Requires decoupling from @/contexts. |
| `ui/wysiwyg.tsx` | `extract-later` | `@vibe/editor-ui` | Editor subsystem; split as a dedicated package later. Requires decoupling from @/vscode. |

### tasks

| Component | Status | Target package | Notes |
| --- | --- | --- | --- |
| `tasks/AgentSelector.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `tasks/BranchSelector.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `tasks/ConfigSelector.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `tasks/RepoBranchSelector.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `tasks/RepoSelector.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `tasks/TaskDetails/ProcessLogsViewer.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `tasks/TaskDetails/ProcessesTab.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `tasks/Toolbar/GitOperations.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `tasks/UserAvatar.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `tasks/VariantSelector.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |

### NormalizedConversation

| Component | Status | Target package | Notes |
| --- | --- | --- | --- |
| `NormalizedConversation/DisplayConversationEntry.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `NormalizedConversation/EditDiffRenderer.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `NormalizedConversation/FileChangeRenderer.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `NormalizedConversation/FileContentView.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `NormalizedConversation/PendingApprovalEntry.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `NormalizedConversation/RetryEditorInline.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `NormalizedConversation/UserMessage.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |

### root

| Component | Status | Target package | Notes |
| --- | --- | --- | --- |
| `ConfigProvider.tsx` | `keep-app` | `frontend-app` | App bootstrap/provider concern. |
| `TagManager.tsx` | `keep-app` | `frontend-app` | App bootstrap/provider concern. |
| `ThemeProvider.tsx` | `keep-app` | `frontend-app` | App bootstrap/provider concern. |

### common

| Component | Status | Target package | Notes |
| --- | --- | --- | --- |
| `common/ProfileVariantBadge.tsx` | `keep-app` | `frontend-app` | App-specific utility presentation component. |
| `common/RawLogText.tsx` | `keep-app` | `frontend-app` | App-specific utility presentation component. |

### ide

| Component | Status | Target package | Notes |
| --- | --- | --- | --- |
| `ide/IdeIcon.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `ide/OpenInIdeButton.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |

### org

| Component | Status | Target package | Notes |
| --- | --- | --- | --- |
| `org/MemberListItem.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |
| `org/PendingInvitationItem.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |

### ui-new/scope

| Component | Status | Target package | Notes |
| --- | --- | --- | --- |
| `ui-new/scope/NewDesignScope.tsx` | `keep-app` | `frontend-app` | Runtime integration (scope, terminal, keyboard, IDE). |
| `ui-new/scope/VSCodeScope.tsx` | `keep-app` | `frontend-app` | Runtime integration (scope, terminal, keyboard, IDE). |

### ui/table

| Component | Status | Target package | Notes |
| --- | --- | --- | --- |
| `ui/table/data-table.tsx` | `extract-later` | `@vibe/ui` | Reusable table building blocks; defer until core package is stable. |
| `ui/table/table.tsx` | `extract-later` | `@vibe/ui` | Reusable table building blocks; defer until core package is stable. |

### agents

| Component | Status | Target package | Notes |
| --- | --- | --- | --- |
| `agents/AgentIcon.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |

### settings

| Component | Status | Target package | Notes |
| --- | --- | --- | --- |
| `settings/ExecutorProfileSelector.tsx` | `keep-app` | `frontend-app` | Feature component tied to app domain/data. |

### ui-new/terminal

| Component | Status | Target package | Notes |
| --- | --- | --- | --- |
| `ui-new/terminal/XTermInstance.tsx` | `keep-app` | `frontend-app` | Runtime integration (scope, terminal, keyboard, IDE). |

## Summary Counts

- extract-now: 27
- extract-later: 35
- keep-app: 218

## Suggested Package Split

- `packages/ui`: design tokens, core primitives, small reusable composed controls.
- `packages/editor-ui` (later): WYSIWYG/editor-specific nodes and plugins.
- `frontend`: feature views/containers/dialogs and integration-heavy components.
