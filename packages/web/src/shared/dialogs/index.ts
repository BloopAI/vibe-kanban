// Global app dialogs
export { ReleaseNotesDialog } from '@/shared/dialogs/global/ReleaseNotesDialog';
export { OAuthDialog } from '@/shared/dialogs/global/OAuthDialog';

// Organization dialogs
export {
  CreateOrganizationDialog,
  type CreateOrganizationResult,
} from '@/shared/dialogs/org/CreateOrganizationDialog';
export {
  InviteMemberDialog,
  type InviteMemberResult,
} from '@/shared/dialogs/org/InviteMemberDialog';
export {
  CreateRemoteProjectDialog,
  type CreateRemoteProjectDialogProps,
  type CreateRemoteProjectResult,
} from '@/shared/dialogs/org/CreateRemoteProjectDialog';
export { CreatePRDialog } from '@/shared/dialogs/command-bar/CreatePRDialog';
export {
  EditorSelectionDialog,
  type EditorSelectionDialogProps,
} from '@/shared/dialogs/command-bar/EditorSelectionDialog';
export {
  TagEditDialog,
  type TagEditDialogProps,
  type TagEditResult,
} from '@/shared/dialogs/shared/TagEditDialog';
export {
  ChangeTargetBranchDialog,
  type ChangeTargetBranchDialogProps,
  type ChangeTargetBranchDialogResult,
} from '@/shared/dialogs/command-bar/ChangeTargetBranchDialog';
export {
  BranchRebaseDialog,
  type BranchRebaseDialogProps,
  type BranchRebaseDialogResult,
} from '@/shared/dialogs/command-bar/BranchRebaseDialog';
export {
  RestoreLogsDialog,
  type RestoreLogsDialogProps,
  type RestoreLogsDialogResult,
} from '@/shared/dialogs/tasks/RestoreLogsDialog';
export {
  ViewProcessesDialog,
  type ViewProcessesDialogProps,
} from '@/shared/dialogs/command-bar/ViewProcessesDialog';
export {
  GitActionsDialog,
  type GitActionsDialogProps,
} from '@/shared/dialogs/command-bar/GitActionsDialog';
export {
  EditBranchNameDialog,
  type EditBranchNameDialogResult,
} from '@/shared/dialogs/command-bar/EditBranchNameDialog';
export {
  StartReviewDialog,
  type StartReviewDialogProps,
} from '@/shared/dialogs/command-bar/StartReviewDialog';

// Auth dialogs
export { GhCliSetupDialog } from '@/shared/dialogs/auth/GhCliSetupDialog';

// Settings dialogs
export {
  CreateConfigurationDialog,
  type CreateConfigurationDialogProps,
  type CreateConfigurationResult,
} from '@/shared/dialogs/settings/CreateConfigurationDialog';
export {
  DeleteConfigurationDialog,
  type DeleteConfigurationDialogProps,
  type DeleteConfigurationResult,
} from '@/shared/dialogs/settings/DeleteConfigurationDialog';

// Shared/Generic dialogs
export {
  ConfirmDialog,
  type ConfirmDialogProps,
} from '@/shared/dialogs/shared/ConfirmDialog';
export {
  FolderPickerDialog,
  type FolderPickerDialogProps,
} from '@/shared/dialogs/shared/FolderPickerDialog';
