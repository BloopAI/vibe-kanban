import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  XIcon,
  LinkIcon,
  DotsThreeIcon,
  TrashIcon,
  PaperclipIcon,
  ImageIcon,
} from '@phosphor-icons/react';
import WYSIWYGEditor from '@/components/ui/wysiwyg';
import type {
  IssuePriority,
  ProjectStatus,
  Tag,
  PullRequestStatus,
} from 'shared/remote-types';
import type { OrganizationMemberWithProfile } from 'shared/types';
import { IssuePropertyRow } from '@/components/ui-new/views/IssuePropertyRow';
import { IssueTagsRow } from '@/components/ui-new/views/IssueTagsRow';
import { PrimaryButton } from '@/components/ui-new/primitives/PrimaryButton';
import { Toggle } from '@/components/ui-new/primitives/Toggle';
import { CopyButton } from '@/components/ui-new/containers/CopyButton';
import { IconButton } from '@/components/ui-new/primitives/IconButton';
import { AutoResizeTextarea } from '@/components/ui-new/primitives/AutoResizeTextarea';
import { IssueCommentsSectionContainer } from '@/components/ui-new/containers/IssueCommentsSectionContainer';
import { IssueSubIssuesSectionContainer } from '@/components/ui-new/containers/IssueSubIssuesSectionContainer';
import { IssueRelationshipsSectionContainer } from '@/components/ui-new/containers/IssueRelationshipsSectionContainer';
import { IssueWorkspacesSectionContainer } from '@/components/ui-new/containers/IssueWorkspacesSectionContainer';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ErrorAlert } from '@/components/ui-new/primitives/ErrorAlert';

export type IssuePanelMode = 'create' | 'edit';

export interface IssueFormData {
  title: string;
  description: string | null;
  statusId: string;
  priority: IssuePriority | null;
  assigneeIds: string[];
  tagIds: string[];
  createDraftWorkspace: boolean;
}

export interface LinkedPullRequest {
  id: string;
  number: number;
  url: string;
  status: PullRequestStatus;
}

export interface KanbanIssuePanelProps {
  mode: IssuePanelMode;
  displayId: string;

  // Form data
  formData: IssueFormData;
  onFormChange: <K extends keyof IssueFormData>(
    field: K,
    value: IssueFormData[K]
  ) => void;

  // Options for dropdowns
  statuses: ProjectStatus[];
  tags: Tag[];

  // Resolved assignee profiles for avatar display
  assigneeUsers?: OrganizationMemberWithProfile[];

  // Edit mode data
  issueId?: string | null;
  creatorUser?: OrganizationMemberWithProfile | null;
  parentIssue?: { id: string; simpleId: string } | null;
  onParentIssueClick?: () => void;
  onRemoveParentIssue?: () => void;
  linkedPrs?: LinkedPullRequest[];

  // Actions
  onClose: () => void;
  onSubmit: () => void;
  onCmdEnterSubmit?: () => void;
  onDeleteDraft?: () => void;

  // Tag create callback - returns the new tag ID
  onCreateTag?: (data: { name: string; color: string }) => string;

  // Loading states
  isSubmitting?: boolean;
  isLoading?: boolean;

  // Save status for description field
  descriptionSaveStatus?: 'idle' | 'saved';

  // Ref for title input (created in container)
  titleInputRef: RefObject<HTMLTextAreaElement>;

  // Copy link callback (edit mode only)
  onCopyLink?: () => void;

  // More actions callback (edit mode only) - opens command bar with issue actions
  onMoreActions?: () => void;

  // Image attachment upload
  onPasteFiles?: (files: File[]) => void;
  dropzoneProps?: {
    getRootProps: () => Record<string, unknown>;
    getInputProps: () => Record<string, unknown>;
    isDragActive: boolean;
  };
  onBrowseAttachment?: () => void;
  isUploading?: boolean;
  attachmentError?: string | null;
  onDismissAttachmentError?: () => void;
}

export function KanbanIssuePanel({
  mode,
  displayId,
  formData,
  onFormChange,
  statuses,
  tags,
  assigneeUsers,
  issueId,
  creatorUser,
  parentIssue,
  onParentIssueClick,
  onRemoveParentIssue,
  linkedPrs = [],
  onClose,
  onSubmit,
  onCmdEnterSubmit,
  onDeleteDraft,
  onCreateTag,
  isSubmitting,
  descriptionSaveStatus,
  titleInputRef,
  onCopyLink,
  onMoreActions,
  onPasteFiles,
  dropzoneProps,
  onBrowseAttachment,
  isUploading,
  attachmentError,
  onDismissAttachmentError,
}: KanbanIssuePanelProps) {
  const { t } = useTranslation('common');
  const isCreateMode = mode === 'create';
  const breadcrumbTextClass =
    'min-w-0 text-sm text-normal truncate rounded-sm px-1 py-0.5 hover:bg-panel hover:text-high transition-colors';
  const creatorName =
    creatorUser?.first_name?.trim() || creatorUser?.username?.trim() || null;
  const showCreator = !isCreateMode && Boolean(creatorName);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onCmdEnterSubmit?.();
    }
  };

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-base py-half border-b shrink-0">
        <div className="flex items-center gap-half min-w-0 font-ibm-plex-mono">
          <span className={`${breadcrumbTextClass} shrink-0`}>{displayId}</span>
          {!isCreateMode && onCopyLink && (
            <CopyButton
              iconSize="size-icon-sm"
              onCopy={onCopyLink}
              disabled={false}
              icon={LinkIcon}
            />
          )}
        </div>
        <div className="flex items-center gap-half">
          {!isCreateMode && onMoreActions && (
            <button
              type="button"
              onClick={onMoreActions}
              className="p-half rounded-sm text-low hover:text-normal hover:bg-panel transition-colors"
              aria-label={t('kanban.moreActions')}
            >
              <DotsThreeIcon className="size-icon-sm" weight="bold" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-half rounded-sm text-low hover:text-normal hover:bg-panel transition-colors"
            aria-label={t('kanban.closePanel')}
          >
            <XIcon className="size-icon-sm" weight="bold" />
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Property Row */}
        <div className="px-base py-base border-b">
          <IssuePropertyRow
            statusId={formData.statusId}
            priority={formData.priority}
            assigneeIds={formData.assigneeIds}
            assigneeUsers={assigneeUsers}
            statuses={statuses}
            creatorUser={showCreator ? creatorUser : undefined}
            parentIssue={parentIssue}
            onParentIssueClick={onParentIssueClick}
            onRemoveParentIssue={onRemoveParentIssue}
            onStatusClick={() => onFormChange('statusId', formData.statusId)}
            onPriorityClick={() => onFormChange('priority', formData.priority)}
            onAssigneeClick={() =>
              onFormChange('assigneeIds', formData.assigneeIds)
            }
            disabled={isSubmitting}
          />
        </div>

        {/* Tags Row */}
        <div className="px-base py-base border-b">
          <IssueTagsRow
            selectedTagIds={formData.tagIds}
            availableTags={tags}
            linkedPrs={isCreateMode ? [] : linkedPrs}
            onTagsChange={(tagIds) => onFormChange('tagIds', tagIds)}
            onCreateTag={onCreateTag}
            disabled={isSubmitting}
          />
        </div>

        {/* Title and Description */}
        <div className="rounded-sm">
          {/* Title Input */}
          <div className="w-full mt-base">
            <AutoResizeTextarea
              ref={titleInputRef}
              value={formData.title}
              onChange={(value) => onFormChange('title', value)}
              onKeyDown={handleTitleKeyDown}
              placeholder="Issue Title..."
              autoFocus={isCreateMode}
              aria-label="Issue title"
              disabled={isSubmitting}
              className={cn(
                'px-base text-lg font-medium text-high',
                'placeholder:text-high/50',
                isSubmitting && 'opacity-50 pointer-events-none'
              )}
            />

            <div
              className={cn(
                'pointer-events-none absolute inset-0 px-base',
                'text-high/50 font-medium text-lg',
                'hidden',
                "[[data-empty='true']_+_&]:block" // show placeholder when previous sibling data-empty=true
              )}
            >
              {t('kanban.issueTitlePlaceholder')}
            </div>
          </div>

          {/* Description WYSIWYG Editor with image dropzone */}
          <div {...dropzoneProps?.getRootProps()} className="relative mt-base">
            <input
              {...(dropzoneProps?.getInputProps() as React.InputHTMLAttributes<HTMLInputElement>)}
              data-dropzone-input
            />
            <WYSIWYGEditor
              placeholder={t('kanban.issueDescriptionPlaceholder')}
              value={formData.description ?? ''}
              onChange={(value) => onFormChange('description', value || null)}
              onCmdEnter={onCmdEnterSubmit}
              onPasteFiles={onPasteFiles}
              disabled={isSubmitting}
              autoFocus={false}
              className="min-h-[100px] px-base"
              showStaticToolbar
              saveStatus={descriptionSaveStatus}
              staticToolbarActions={
                onBrowseAttachment ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            if (!isSubmitting && !isUploading) {
                              onBrowseAttachment();
                            }
                          }}
                          disabled={isSubmitting || isUploading}
                          className={cn(
                            'p-half rounded-sm transition-colors',
                            'text-low hover:text-normal hover:bg-panel/50',
                            'disabled:opacity-50 disabled:cursor-not-allowed'
                          )}
                          title={t('kanban.attachFile')}
                          aria-label={t('kanban.attachFile')}
                        >
                          <PaperclipIcon className="size-icon-sm" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {t('kanban.attachFileHint')}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : null
              }
            />
            {attachmentError && (
              <div className="px-base">
                <ErrorAlert
                  message={attachmentError}
                  className="mt-half mb-half"
                  onDismiss={onDismissAttachmentError}
                  dismissLabel={t('buttons.close')}
                />
              </div>
            )}
            {dropzoneProps?.isDragActive && (
              <div className="absolute inset-0 z-50 bg-primary/80 backdrop-blur-sm border-2 border-dashed border-brand rounded flex items-center justify-center pointer-events-none animate-in fade-in-0 duration-150">
                <div className="text-center">
                  <div className="mx-auto mb-2 w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center">
                    <ImageIcon className="h-5 w-5 text-brand" />
                  </div>
                  <p className="text-sm font-medium text-high">
                    {t('kanban.dropFilesHere')}
                  </p>
                  <p className="text-xs text-low mt-0.5">
                    {t('kanban.fileDropHint')}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Create Draft Workspace Toggle (Create mode only) */}
        {isCreateMode && (
          <div className="p-base border-t">
            <Toggle
              checked={formData.createDraftWorkspace}
              onCheckedChange={(checked) =>
                onFormChange('createDraftWorkspace', checked)
              }
              label={t('kanban.createDraftWorkspaceImmediately')}
              description={t('kanban.createDraftWorkspaceDescription')}
              disabled={isSubmitting}
            />
          </div>
        )}

        {/* Create Task Button (Create mode only) */}
        {isCreateMode && (
          <div className="px-base pb-base flex items-center gap-half">
            <PrimaryButton
              value={t('kanban.createTask')}
              onClick={onSubmit}
              disabled={isSubmitting || !formData.title.trim()}
              actionIcon={isSubmitting ? 'spinner' : undefined}
              variant="default"
            />
            {onDeleteDraft && (
              <IconButton
                icon={TrashIcon}
                onClick={onDeleteDraft}
                disabled={isSubmitting}
                aria-label="Delete draft"
                title="Delete draft"
                className="hover:text-error hover:bg-error/10"
              />
            )}
          </div>
        )}

        {/* Workspaces Section (Edit mode only) */}
        {!isCreateMode && issueId && (
          <div className="border-t">
            <IssueWorkspacesSectionContainer issueId={issueId} />
          </div>
        )}

        {/* Relationships Section (Edit mode only) */}
        {!isCreateMode && issueId && (
          <div className="border-t">
            <IssueRelationshipsSectionContainer issueId={issueId} />
          </div>
        )}

        {/* Sub-Issues Section (Edit mode only) */}
        {!isCreateMode && issueId && (
          <div className="border-t">
            <IssueSubIssuesSectionContainer issueId={issueId} />
          </div>
        )}

        {/* Comments Section (Edit mode only) */}
        {!isCreateMode && issueId && (
          <div className="border-t">
            <IssueCommentsSectionContainer issueId={issueId} />
          </div>
        )}
      </div>
    </div>
  );
}
