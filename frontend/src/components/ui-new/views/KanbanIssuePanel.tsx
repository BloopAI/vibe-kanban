import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import {
  XIcon,
  TextBIcon,
  TextItalicIcon,
  ImageIcon,
  LinkIcon,
  MicrophoneIcon,
  CheckIcon,
} from '@phosphor-icons/react';
import type { IssuePriority, ProjectStatus, Tag } from 'shared/remote-types';
import type { OrganizationMemberWithProfile } from 'shared/types';
import { IssuePropertyRow } from '@/components/ui-new/kanban/IssuePropertyRow';
import { IssueTagsRow } from '@/components/ui-new/kanban/IssueTagsRow';
import {
  IssueWorkspaceCard,
  type WorkspaceWithStats,
} from '@/components/ui-new/kanban/IssueWorkspaceCard';
import { PrimaryButton } from '@/components/ui-new/primitives/PrimaryButton';
import { Toggle } from '@/components/ui-new/primitives/Toggle';
import { CollapsibleSectionHeader } from '@/components/ui-new/primitives/CollapsibleSectionHeader';
import type { PersistKey } from '@/stores/useUiPreferencesStore';
import type { Icon } from '@phosphor-icons/react';

export type IssuePanelMode = 'create' | 'edit';

export interface IssueFormData {
  title: string;
  description: string | null;
  statusId: string;
  priority: IssuePriority;
  assigneeId: string | null;
  tagIds: string[];
  createDraftWorkspace: boolean;
}

export interface IssueCommentData {
  id: string;
  authorId: string;
  authorName: string;
  authorImageUrl?: string | null;
  message: string;
  createdAt: string;
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
  users: OrganizationMemberWithProfile[];

  // Edit mode data
  workspaces?: WorkspaceWithStats[];
  comments?: IssueCommentData[];
  linkedPrs?: LinkedPullRequest[];

  // Actions
  onClose: () => void;
  onSubmit: () => void;
  onAddComment?: (message: string) => void;

  // Loading states
  isSubmitting?: boolean;
  isLoading?: boolean;
}

export function KanbanIssuePanel({
  mode,
  displayId,
  formData,
  onFormChange,
  statuses,
  tags,
  users,
  workspaces = [],
  comments = [],
  linkedPrs = [],
  onClose,
  onSubmit,
  isSubmitting,
}: KanbanIssuePanelProps) {
  const { t } = useTranslation('common');
  const isCreateMode = mode === 'create';

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
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
            assigneeId={formData.assigneeId}
            statuses={statuses}
            users={users}
            onStatusChange={(statusId) => onFormChange('statusId', statusId)}
            onPriorityChange={(priority) => onFormChange('priority', priority)}
            onAssigneeChange={(assigneeId) =>
              onFormChange('assigneeId', assigneeId)
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
              placeholder="Enter a title here..."
              disabled={isSubmitting}
              className={cn(
                'w-full bg-transparent text-high font-medium text-lg',
                'placeholder:text-low placeholder:font-medium',
                'focus:outline-none',
                'disabled:opacity-50'
              )}
            />

            {/* Description Textarea */}
            <textarea
              value={formData.description ?? ''}
              onChange={(e) =>
                onFormChange('description', e.target.value || null)
              }
              placeholder="Enter task description here..."
              disabled={isSubmitting}
              rows={4}
              className={cn(
                'w-full mt-base bg-transparent text-normal text-base resize-none',
                'placeholder:text-low',
                'focus:outline-none',
                'disabled:opacity-50'
              )}
            />

            {/* Formatting Toolbar */}
            <div className="flex items-center justify-between mt-base pt-base border-t border-border/50">
              <div className="flex items-center gap-half">
                <ToolbarButton icon={TextBIcon} label="Bold" />
                <ToolbarButton icon={TextItalicIcon} label="Italic" />
                <ToolbarButton icon={ImageIcon} label="Add image" />
                <ToolbarButton icon={LinkIcon} label="Add link" />
                <ToolbarButton icon={MicrophoneIcon} label="Voice input" />
              </div>
              <button
                type="button"
                className="p-half text-success hover:text-success/80 transition-colors"
                aria-label="Confirm"
              >
                <CheckIcon className="size-icon-sm" weight="bold" />
              </button>
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

        {/* Comments Section (Edit mode only) */}
        {!isCreateMode && (
          <div className="border-t">
            <CollapsibleSectionHeader
              title="Comments"
              persistKey={'kanban-issue-comments' as PersistKey}
              defaultExpanded={true}
              actions={[]}
            >
              <div className="px-base pb-base flex flex-col gap-base">
                {comments.length === 0 ? (
                  <p className="text-sm text-low">
                    {t('kanban.noCommentsYet')}
                  </p>
                ) : (
                  comments.map((comment) => (
                    <CommentItem key={comment.id} comment={comment} />
                  ))
                )}
              </div>
            </CollapsibleSectionHeader>
          </div>
        )}
      </div>
    </div>
  );
}

interface ToolbarButtonProps {
  icon: Icon;
  label: string;
  onClick?: () => void;
}

function ToolbarButton({
  icon: IconComponent,
  label,
  onClick,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="p-half text-low hover:text-normal transition-colors"
      aria-label={label}
    >
      <IconComponent className="size-icon-sm" weight="bold" />
    </button>
  );
}

interface CommentItemProps {
  comment: IssueCommentData;
}

function CommentItem({ comment }: CommentItemProps) {
  const timeAgo = getTimeAgo(comment.createdAt);

  return (
    <div className="flex flex-col gap-half">
      <div className="flex items-center gap-half">
        <div className="w-5 h-5 rounded-full bg-panel flex items-center justify-center text-xs text-low">
          {comment.authorName.charAt(0).toUpperCase()}
        </div>
        <span className="text-sm text-normal font-medium">
          {comment.authorName}
        </span>
        <span className="text-sm text-low">{timeAgo}</span>
      </div>
      <p className="text-base text-normal pl-[28px]">{comment.message}</p>
    </div>
  );
}

function getTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return `${diffWeeks}w ago`;
}
