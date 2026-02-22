// Global app dialogs
export { ReleaseNotesDialog } from '@/dialogs/global/ReleaseNotesDialog';
export { OAuthDialog } from '@/dialogs/global/OAuthDialog';

// Organization dialogs
export {
  CreateOrganizationDialog,
  type CreateOrganizationResult,
} from '@/dialogs/org/CreateOrganizationDialog';
export {
  InviteMemberDialog,
  type InviteMemberResult,
} from '@/dialogs/org/InviteMemberDialog';
export {
  CreateRemoteProjectDialog,
  type CreateRemoteProjectDialogProps,
  type CreateRemoteProjectResult,
} from '@/dialogs/org/CreateRemoteProjectDialog';
export { CreatePRDialog } from '@/dialogs/command-bar/CreatePRDialog';
export {
  EditorSelectionDialog,
  type EditorSelectionDialogProps,
} from '@/dialogs/command-bar/EditorSelectionDialog';
export {
  TagEditDialog,
  type TagEditDialogProps,
  type TagEditResult,
} from '@/dialogs/shared/TagEditDialog';
export {
  ChangeTargetBranchDialog,
  type ChangeTargetBranchDialogProps,
  type ChangeTargetBranchDialogResult,
} from '@/dialogs/command-bar/ChangeTargetBranchDialog';
export {
  BranchRebaseDialog,
  type BranchRebaseDialogProps,
  type BranchRebaseDialogResult,
} from '@/dialogs/command-bar/BranchRebaseDialog';
export {
  RestoreLogsDialog,
  type RestoreLogsDialogProps,
  type RestoreLogsDialogResult,
} from '@/dialogs/tasks/RestoreLogsDialog';
export {
  ViewProcessesDialog,
  type ViewProcessesDialogProps,
} from '@/dialogs/command-bar/ViewProcessesDialog';
export {
  GitActionsDialog,
  type GitActionsDialogProps,
} from '@/dialogs/command-bar/GitActionsDialog';
export {
  EditBranchNameDialog,
  type EditBranchNameDialogResult,
} from '@/dialogs/command-bar/EditBranchNameDialog';
export {
  StartReviewDialog,
  type StartReviewDialogProps,
} from '@/dialogs/command-bar/StartReviewDialog';

// Auth dialogs
export { GhCliSetupDialog } from '@/dialogs/auth/GhCliSetupDialog';

// Settings dialogs
export {
  CreateConfigurationDialog,
  type CreateConfigurationDialogProps,
  type CreateConfigurationResult,
} from '@/dialogs/settings/CreateConfigurationDialog';
export {
  DeleteConfigurationDialog,
  type DeleteConfigurationDialogProps,
  type DeleteConfigurationResult,
} from '@/dialogs/settings/DeleteConfigurationDialog';

// Shared/Generic dialogs
export {
  ConfirmDialog,
  type ConfirmDialogProps,
} from '@/dialogs/shared/ConfirmDialog';
export {
  FolderPickerDialog,
  type FolderPickerDialogProps,
} from '@/dialogs/shared/FolderPickerDialog';
