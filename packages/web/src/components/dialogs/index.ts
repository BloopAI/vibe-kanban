// Global app dialogs
export { ReleaseNotesDialog } from '@/features/settings/ui/dialogs/ReleaseNotesDialog';
export { OAuthDialog } from '@/features/settings/ui/dialogs/OAuthDialog';

// Organization dialogs
export {
  CreateOrganizationDialog,
  type CreateOrganizationResult,
} from '@/features/settings/ui/dialogs/CreateOrganizationDialog';
export {
  InviteMemberDialog,
  type InviteMemberResult,
} from '@/features/settings/ui/dialogs/InviteMemberDialog';
export {
  CreateRemoteProjectDialog,
  type CreateRemoteProjectDialogProps,
  type CreateRemoteProjectResult,
} from '@/features/settings/ui/dialogs/CreateRemoteProjectDialog';
export { CreatePRDialog } from '@/features/command-bar/ui/dialogs/CreatePRDialog';
export {
  EditorSelectionDialog,
  type EditorSelectionDialogProps,
} from '@/features/command-bar/ui/dialogs/EditorSelectionDialog';
export {
  TagEditDialog,
  type TagEditDialogProps,
  type TagEditResult,
} from '@/shared/ui/dialogs/TagEditDialog';
export {
  ChangeTargetBranchDialog,
  type ChangeTargetBranchDialogProps,
  type ChangeTargetBranchDialogResult,
} from '@/features/command-bar/ui/dialogs/ChangeTargetBranchDialog';
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
} from '@/features/command-bar/ui/dialogs/ViewProcessesDialog';
export {
  GitActionsDialog,
  type GitActionsDialogProps,
} from './tasks/GitActionsDialog';
export {
  EditBranchNameDialog,
  type EditBranchNameDialogResult,
} from '@/features/command-bar/ui/dialogs/EditBranchNameDialog';
export {
  StartReviewDialog,
  type StartReviewDialogProps,
} from '@/features/command-bar/ui/dialogs/StartReviewDialog';

// Auth dialogs
export { GhCliSetupDialog } from '@/features/settings/ui/dialogs/GhCliSetupDialog';

// Settings dialogs
export {
  CreateConfigurationDialog,
  type CreateConfigurationDialogProps,
  type CreateConfigurationResult,
} from '@/features/settings/ui/dialogs/CreateConfigurationDialog';
export {
  DeleteConfigurationDialog,
  type DeleteConfigurationDialogProps,
  type DeleteConfigurationResult,
} from '@/features/settings/ui/dialogs/DeleteConfigurationDialog';

// Shared/Generic dialogs
export {
  ConfirmDialog,
  type ConfirmDialogProps,
} from '@/shared/ui/dialogs/ConfirmDialog';
export {
  FolderPickerDialog,
  type FolderPickerDialogProps,
} from './shared/FolderPickerDialog';
