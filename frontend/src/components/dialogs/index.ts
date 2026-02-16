// Global app dialogs
export { ReleaseNotesDialog } from './global/ReleaseNotesDialog';
export { OAuthDialog } from './global/OAuthDialog';

// Organization dialogs
export {
  CreateOrganizationDialog,
  type CreateOrganizationResult,
} from './org/CreateOrganizationDialog';
export {
  InviteMemberDialog,
  type InviteMemberResult,
} from './org/InviteMemberDialog';
export {
  CreateRemoteProjectDialog,
  type CreateRemoteProjectDialogProps,
  type CreateRemoteProjectResult,
} from './org/CreateRemoteProjectDialog';

// Project-related dialogs
export {
  ProjectFormDialog,
  type ProjectFormDialogProps,
  type ProjectFormDialogResult,
} from './projects/ProjectFormDialog';
export {
  ProjectEditorSelectionDialog,
  type ProjectEditorSelectionDialogProps,
} from './projects/ProjectEditorSelectionDialog';

// Task-related dialogs
export {
  TaskFormDialog,
  type TaskFormDialogProps,
} from './tasks/TaskFormDialog';

export { CreatePRDialog } from './tasks/CreatePRDialog';
export {
  EditorSelectionDialog,
  type EditorSelectionDialogProps,
} from './tasks/EditorSelectionDialog';
export {
  DeleteTaskConfirmationDialog,
  type DeleteTaskConfirmationDialogProps,
} from './tasks/DeleteTaskConfirmationDialog';
export {
  TagEditDialog,
  type TagEditDialogProps,
  type TagEditResult,
} from './tasks/TagEditDialog';
export {
  ChangeTargetBranchDialog,
  type ChangeTargetBranchDialogProps,
  type ChangeTargetBranchDialogResult,
} from './tasks/ChangeTargetBranchDialog';
export {
  RebaseDialog,
  type RebaseDialogProps,
  type RebaseDialogResult,
} from './tasks/RebaseDialog';
export {
  RestoreLogsDialog,
  type RestoreLogsDialogProps,
  type RestoreLogsDialogResult,
} from './tasks/RestoreLogsDialog';
export {
  ViewProcessesDialog,
  type ViewProcessesDialogProps,
} from './tasks/ViewProcessesDialog';
export {
  ViewRelatedTasksDialog,
  type ViewRelatedTasksDialogProps,
} from './tasks/ViewRelatedTasksDialog';
export {
  GitActionsDialog,
  type GitActionsDialogProps,
} from './tasks/GitActionsDialog';
export {
  EditBranchNameDialog,
  type EditBranchNameDialogResult,
} from './tasks/EditBranchNameDialog';
export { CreateAttemptDialog } from './tasks/CreateAttemptDialog';
export {
  StartReviewDialog,
  type StartReviewDialogProps,
} from './tasks/StartReviewDialog';

// Auth dialogs
export { GhCliSetupDialog } from './auth/GhCliSetupDialog';

// Settings dialogs
export {
  CreateConfigurationDialog,
  type CreateConfigurationDialogProps,
  type CreateConfigurationResult,
} from './settings/CreateConfigurationDialog';
export {
  DeleteConfigurationDialog,
  type DeleteConfigurationDialogProps,
  type DeleteConfigurationResult,
} from './settings/DeleteConfigurationDialog';

// Shared/Generic dialogs
export { ConfirmDialog, type ConfirmDialogProps } from './shared/ConfirmDialog';
export {
  FolderPickerDialog,
  type FolderPickerDialogProps,
} from './shared/FolderPickerDialog';
