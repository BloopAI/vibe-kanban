import { cn } from '@/lib/utils';
import { XIcon } from '@phosphor-icons/react';
import WYSIWYGEditor from '@/components/ui/wysiwyg';
import type {
  IssuePriority,
  ProjectStatus,
  Tag,
  User,
} from 'shared/remote-types';
import { IssuePropertyRow } from '@/components/ui-new/views/IssuePropertyRow';
import { IssueTagsRow } from '@/components/ui-new/views/IssueTagsRow';
import {
  IssueWorkspaceCard,
  type WorkspaceWithStats,
} from '@/components/ui-new/views/IssueWorkspaceCard';
import { PrimaryButton } from '@/components/ui-new/primitives/PrimaryButton';
import { Toggle } from '@/components/ui-new/primitives/Toggle';
import { CollapsibleSectionHeader } from '@/components/ui-new/primitives/CollapsibleSectionHeader';
import { IssueCommentsSectionContainer } from '@/components/ui-new/containers/IssueCommentsSectionContainer';
import { IssueSubIssuesSectionContainer } from '@/components/ui-new/containers/IssueSubIssuesSectionContainer';
import type { PersistKey } from '@/stores/useUiPreferencesStore';

export type IssuePanelMode = 'create' | 'edit';

export interface IssueFormData {
  title: string;
  description: string | null;
  statusId: string;
  priority: IssuePriority;
  assigneeIds: string[];
  tagIds: string[];
  createDraftWorkspace: boolean;
}

export interface LinkedPullRequest {
  id: string;
  number: number;
  url: string;
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
  users: User[];

  // Edit mode data
  issueId?: string | null;
  parentIssue?: { id: string; simpleId: string } | null;
  onParentIssueClick?: () => void;
  workspaces?: WorkspaceWithStats[];
  linkedPrs?: LinkedPullRequest[];

  // Actions
  onClose: () => void;
  onSubmit: () => void;
  onCmdEnterSubmit?: () => void;

  // Tag create callback - returns the new tag ID
  onCreateTag?: (data: { name: string; color: string }) => string;

  // Loading states
  isSubmitting?: boolean;
  isLoading?: boolean;

  // Save status for description field
  descriptionSaveStatus?: 'idle' | 'saved';
}

export function KanbanIssuePanel({
  mode,
  displayId,
  formData,
  onFormChange,
  statuses,
  tags,
  users,
  issueId,
  parentIssue,
  onParentIssueClick,
  workspaces = [],
  linkedPrs = [],
  onClose,
  onSubmit,
  onCmdEnterSubmit,
  onCreateTag,
  isSubmitting,
  descriptionSaveStatus,
}: KanbanIssuePanelProps) {
  const isCreateMode = mode === 'create';

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onCmdEnterSubmit?.();
    }
  };

  return (
    <div
      className="flex flex-col h-full bg-panel overflow-hidden"
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-base py-half border-b shrink-0">
        <span className="font-ibm-plex-mono text-base text-normal">
          {displayId}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="p-half rounded-sm text-low hover:text-normal hover:bg-panel transition-colors"
          aria-label="Close panel"
        >
          <XIcon className="size-icon-sm" weight="bold" />
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Property Row */}
        <div className="px-base py-base border-b">
          <IssuePropertyRow
            statusId={formData.statusId}
            priority={formData.priority}
            assigneeIds={formData.assigneeIds}
            statuses={statuses}
            users={users}
            parentIssue={parentIssue}
            onParentIssueClick={onParentIssueClick}
            onStatusClick={() => onFormChange('statusId', formData.statusId)}
            onPriorityChange={(priority) => onFormChange('priority', priority)}
            onAssigneeChange={(assigneeIds) =>
              onFormChange('assigneeIds', assigneeIds)
            }
            disabled={isSubmitting}
          />
        </div>

        {/* Tags Row (Edit mode only) */}
        {!isCreateMode && (
          <div className="px-base py-base border-b">
            <IssueTagsRow
              selectedTagIds={formData.tagIds}
              availableTags={tags}
              linkedPrs={linkedPrs}
              onTagsChange={(tagIds) => onFormChange('tagIds', tagIds)}
              onCreateTag={onCreateTag}
              disabled={isSubmitting}
            />
          </div>
        )}

        {/* Title and Description */}
        <div className="px-base py-base">
          <div className="bg-primary rounded-sm p-base">
            {/* Title Input */}
            <input
              type="text"
              value={formData.title}
              onChange={(e) => onFormChange('title', e.target.value)}
              onKeyDown={handleTitleKeyDown}
              placeholder="Enter a title here..."
              disabled={isSubmitting}
              className={cn(
                'w-full bg-transparent text-high font-medium text-lg',
                'placeholder:text-low placeholder:font-medium',
                'focus:outline-none',
                'disabled:opacity-50'
              )}
            />

            {/* Description WYSIWYG Editor */}
            <div className="mt-base">
              <WYSIWYGEditor
                placeholder="Enter task description here..."
                value={formData.description ?? ''}
                onChange={(value) => onFormChange('description', value || null)}
                onCmdEnter={onCmdEnterSubmit}
                disabled={isSubmitting}
                autoFocus={false}
                className="min-h-[100px]"
                showStaticToolbar
                saveStatus={descriptionSaveStatus}
              />
            </div>
          </div>
        </div>

        {/* Create Draft Workspace Toggle (Create mode only) */}
        {isCreateMode && (
          <div className="px-base pb-base">
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
          <div className="px-base pb-base">
            <PrimaryButton
              value="Create Task"
              onClick={onSubmit}
              disabled={isSubmitting || !formData.title.trim()}
              actionIcon={isSubmitting ? 'spinner' : undefined}
              variant="default"
            />
          </div>
        )}

        {/* Workspaces Section (Edit mode only) */}
        {!isCreateMode && workspaces.length > 0 && (
          <div className="border-t">
            <CollapsibleSectionHeader
              title="Workspaces"
              persistKey={'kanban-issue-workspaces' as PersistKey}
              defaultExpanded={true}
              actions={[]}
            >
              <div className="px-base pb-base flex flex-col gap-base">
                {workspaces.map((workspace) => (
                  <IssueWorkspaceCard
                    key={workspace.id}
                    workspace={workspace}
                  />
                ))}
              </div>
            </CollapsibleSectionHeader>
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
