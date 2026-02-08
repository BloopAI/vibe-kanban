import type { RefCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  XIcon,
  LinkIcon,
  DotsThreeIcon,
  TrashIcon,
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
import { IssueCommentsSectionContainer } from '@/components/ui-new/containers/IssueCommentsSectionContainer';
import { IssueSubIssuesSectionContainer } from '@/components/ui-new/containers/IssueSubIssuesSectionContainer';
import { IssueRelationshipsSectionContainer } from '@/components/ui-new/containers/IssueRelationshipsSectionContainer';
import { IssueWorkspacesSectionContainer } from '@/components/ui-new/containers/IssueWorkspacesSectionContainer';

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

  // Callback ref for title input (created in container)
  titleRef: RefCallback<HTMLDivElement>;

  // Copy link callback (edit mode only)
  onCopyLink?: () => void;

  // More actions callback (edit mode only) - opens command bar with issue actions
  onMoreActions?: () => void;
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
  titleRef,
  onCopyLink,
  onMoreActions,
}: KanbanIssuePanelProps) {
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

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
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
              aria-label="More actions"
            >
              <DotsThreeIcon className="size-icon-sm" weight="bold" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-half rounded-sm text-low hover:text-normal hover:bg-panel transition-colors"
            aria-label="Close panel"
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
          <div className="relative w-full mt-base">
            <div
              ref={titleRef}
              role="textbox"
              contentEditable={!isSubmitting}
              suppressContentEditableWarning
              data-empty={!formData.title ? 'true' : 'false'}
              onInput={(e) => {
                const v = e.currentTarget.textContent ?? '';
                onFormChange('title', v);
              }}
              onKeyDown={handleTitleKeyDown}
              className={cn(
                'w-full bg-transparent text-high font-medium text-lg px-base',
                'focus:outline-none',
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
              Issue Title...
            </div>
          </div>

          {/* Description WYSIWYG Editor */}
          <div className="mt-base">
            <WYSIWYGEditor
              placeholder="Enter task description here..."
              value={formData.description ?? ''}
              onChange={(value) => onFormChange('description', value || null)}
              onCmdEnter={onCmdEnterSubmit}
              disabled={isSubmitting}
              autoFocus={false}
              className="min-h-[100px] px-base"
              showStaticToolbar
              saveStatus={descriptionSaveStatus}
            />
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
              label="Create draft workspace immediately"
              description="Tick to automatically create a workspace"
              disabled={isSubmitting}
            />
          </div>
        )}

        {/* Create Task Button (Create mode only) */}
        {isCreateMode && (
          <div className="px-base pb-base flex items-center gap-half">
            <PrimaryButton
              value="Create Task"
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
