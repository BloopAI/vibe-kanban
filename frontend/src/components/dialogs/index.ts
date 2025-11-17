import { defineModal } from '@/lib/modals';
import type { ProfileResponse, EditorType, SharedTask } from 'shared/types';
import type { GhCliSupportContent } from './auth/GhCliSetupDialog';

// Global app dialogs
export { DisclaimerDialog } from './global/DisclaimerDialog';
export {
  OnboardingDialog,
  type OnboardingResult,
} from './global/OnboardingDialog';
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
export {
  LinkProjectDialog,
  type LinkProjectResult,
} from './projects/LinkProjectDialog';

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
export { ShareDialog, type ShareDialogProps } from './tasks/ShareDialog';
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
  ReassignDialog,
  type ReassignDialogProps,
} from './tasks/ReassignDialog';
export {
  StopShareTaskDialog,
  type StopShareTaskDialogProps,
} from './tasks/StopShareTaskDialog';
export {
  EditBranchNameDialog,
  type EditBranchNameDialogResult,
} from './tasks/EditBranchNameDialog';
export { CreateAttemptDialog } from './tasks/CreateAttemptDialog';

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

// Re-export for convenience
import { ConfirmDialog } from './shared/ConfirmDialog';
import { DisclaimerDialog } from './global/DisclaimerDialog';
import { OnboardingDialog } from './global/OnboardingDialog';
import { ReleaseNotesDialog } from './global/ReleaseNotesDialog';
import { OAuthDialog } from './global/OAuthDialog';
import { CreateOrganizationDialog } from './org/CreateOrganizationDialog';
import { InviteMemberDialog } from './org/InviteMemberDialog';
import { ProjectFormDialog } from './projects/ProjectFormDialog';
import { ProjectEditorSelectionDialog } from './projects/ProjectEditorSelectionDialog';
import { LinkProjectDialog } from './projects/LinkProjectDialog';
import { TaskFormDialog } from './tasks/TaskFormDialog';
import { CreatePRDialog } from './tasks/CreatePRDialog';
import { EditorSelectionDialog } from './tasks/EditorSelectionDialog';
import { DeleteTaskConfirmationDialog } from './tasks/DeleteTaskConfirmationDialog';
import { ShareDialog } from './tasks/ShareDialog';
import { TagEditDialog } from './tasks/TagEditDialog';
import { ChangeTargetBranchDialog } from './tasks/ChangeTargetBranchDialog';
import { RebaseDialog } from './tasks/RebaseDialog';
import { RestoreLogsDialog } from './tasks/RestoreLogsDialog';
import { ViewProcessesDialog } from './tasks/ViewProcessesDialog';
import { ViewRelatedTasksDialog } from './tasks/ViewRelatedTasksDialog';
import { GitActionsDialog } from './tasks/GitActionsDialog';
import { ReassignDialog } from './tasks/ReassignDialog';
import { StopShareTaskDialog } from './tasks/StopShareTaskDialog';
import { EditBranchNameDialog } from './tasks/EditBranchNameDialog';
import { CreateAttemptDialog } from './tasks/CreateAttemptDialog';
import { GhCliSetupDialog } from './auth/GhCliSetupDialog';
import { CreateConfigurationDialog } from './settings/CreateConfigurationDialog';
import { DeleteConfigurationDialog } from './settings/DeleteConfigurationDialog';
import { FolderPickerDialog } from './shared/FolderPickerDialog';

import type { ConfirmResult } from '@/lib/modals';
import type {
  OnboardingResult,
  CreateOrganizationResult,
  InviteMemberResult,
  ProjectFormDialogResult,
  LinkProjectResult,
  TagEditResult,
  ChangeTargetBranchDialogResult,
  RebaseDialogResult,
  RestoreLogsDialogResult,
  CreateConfigurationResult,
  DeleteConfigurationResult,
  EditBranchNameDialogResult,
} from '.';

/**
 * Typesafe registry of all modal dialogs.
 * Use with showModal(Modals.X, props) from @/lib/modals
 */
export const Modals = {
  // Global dialogs
  Confirm: defineModal<ConfirmResult>(ConfirmDialog),
  Disclaimer: defineModal<'accepted' | void>(DisclaimerDialog),
  Onboarding: defineModal<OnboardingResult>(OnboardingDialog),
  ReleaseNotes: defineModal<void>(ReleaseNotesDialog),
  OAuth: defineModal<ProfileResponse | null>(OAuthDialog),

  // Organization dialogs
  CreateOrganization: defineModal<CreateOrganizationResult>(
    CreateOrganizationDialog
  ),
  InviteMember: defineModal<InviteMemberResult>(InviteMemberDialog),

  // Project dialogs
  ProjectForm: defineModal<ProjectFormDialogResult>(ProjectFormDialog),
  ProjectEditorSelection: defineModal<EditorType | null>(
    ProjectEditorSelectionDialog
  ),
  LinkProject: defineModal<LinkProjectResult>(LinkProjectDialog),

  // Task dialogs
  TaskForm: defineModal<void>(TaskFormDialog),
  CreatePR: defineModal<void>(CreatePRDialog),
  EditorSelection: defineModal<EditorType | null>(EditorSelectionDialog),
  DeleteTaskConfirmation: defineModal<void>(DeleteTaskConfirmationDialog),
  ShareTask: defineModal<boolean>(ShareDialog),
  TagEdit: defineModal<TagEditResult>(TagEditDialog),
  ChangeTargetBranch: defineModal<ChangeTargetBranchDialogResult>(
    ChangeTargetBranchDialog
  ),
  Rebase: defineModal<RebaseDialogResult>(RebaseDialog),
  RestoreLogs: defineModal<RestoreLogsDialogResult>(RestoreLogsDialog),
  ViewProcesses: defineModal<void>(ViewProcessesDialog),
  ViewRelatedTasks: defineModal<void>(ViewRelatedTasksDialog),
  GitActions: defineModal<void>(GitActionsDialog),
  ReassignSharedTask: defineModal<SharedTask | null>(ReassignDialog),
  StopShareTask: defineModal<void>(StopShareTaskDialog),
  EditBranchName: defineModal<EditBranchNameDialogResult>(EditBranchNameDialog),
  CreateAttempt: defineModal<void>(CreateAttemptDialog),

  // Auth dialogs
  GhCliSetup: defineModal<GhCliSupportContent | null>(GhCliSetupDialog),

  // Settings dialogs
  CreateConfiguration: defineModal<CreateConfigurationResult>(
    CreateConfigurationDialog
  ),
  DeleteConfiguration: defineModal<DeleteConfigurationResult>(
    DeleteConfigurationDialog
  ),

  // Shared dialogs
  FolderPicker: defineModal<string | null>(FolderPickerDialog),
} as const;
