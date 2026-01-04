import { useCallback, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  X,
  ExternalLink,
  ChevronRight,
  MessageSquare,
  FileText,
  Activity,
  Link as LinkIcon,
  Paperclip,
  Trash2,
} from 'lucide-react';
import { useTeams } from '@/hooks/useTeams';
import { useTaskComments } from '@/hooks/useTaskComments';
import { useTaskDocumentLinks } from '@/hooks/useTaskDocumentLinks';
import { tasksApi } from '@/lib/api';
import { CommentEditor, CommentList } from '@/components/comments';
import { LinkDocumentsDialog } from '@/components/dialogs/issues/LinkDocumentsDialog';
import { cn } from '@/lib/utils';
import type { TaskWithAttemptStatus, TaskStatus } from 'shared/types';
import { PrioritySelector, type PriorityValue } from '@/components/selectors/PrioritySelector';

interface IssueDetailPanelProps {
  issue: TaskWithAttemptStatus;
  teamId?: string;
  issueKey?: string;
  onClose: () => void;
  onUpdate?: () => Promise<void>;
}

// Status colors
const STATUS_COLORS: Record<TaskStatus, { bg: string; text: string }> = {
  todo: { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-700 dark:text-gray-300' },
  inprogress: { bg: 'bg-yellow-100 dark:bg-yellow-900', text: 'text-yellow-700 dark:text-yellow-300' },
  inreview: { bg: 'bg-blue-100 dark:bg-blue-900', text: 'text-blue-700 dark:text-blue-300' },
  done: { bg: 'bg-green-100 dark:bg-green-900', text: 'text-green-700 dark:text-green-300' },
  cancelled: { bg: 'bg-red-100 dark:bg-red-900', text: 'text-red-700 dark:text-red-300' },
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'Backlog',
  inprogress: 'In Progress',
  inreview: 'In Review',
  done: 'Done',
  cancelled: 'Cancelled',
};

// Get current user info (mock for now - in real app, get from auth context)
const getCurrentUser = () => ({
  id: null, // Will be set when we have real auth
  name: 'Current User',
  email: 'user@example.com',
});

export function IssueDetailPanel({
  issue,
  teamId,
  issueKey,
  onClose,
  onUpdate,
}: IssueDetailPanelProps) {
  const { teamsById } = useTeams();
  const team = teamId ? teamsById[teamId] : null;

  const [title, setTitle] = useState(issue.title);
  const [description, setDescription] = useState(issue.description || '');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showLinkDocsDialog, setShowLinkDocsDialog] = useState(false);

  // Document links
  const {
    links: linkedDocuments,
    isLoading: linksLoading,
    linkDocuments,
    unlinkDocument,
    isLinking,
    isUnlinking,
  } = useTaskDocumentLinks(issue.id);

  // Comments with caching (staleTime configured in hook)
  const {
    comments,
    isLoading: commentsLoading,
    isFetching: commentsFetching,
    createComment,
    updateComment,
    deleteComment,
    isCreating,
    isUpdating,
    isDeleting,
  } = useTaskComments(issue.id);

  const currentUser = useMemo(() => getCurrentUser(), []);

  const handleSaveTitle = async () => {
    if (!title.trim() || title === issue.title) {
      setTitle(issue.title);
      setIsEditingTitle(false);
      return;
    }

    setIsSaving(true);
    try {
      await tasksApi.update(issue.id, {
        title: title.trim(),
        description: issue.description,
        status: issue.status,
        parent_workspace_id: issue.parent_workspace_id,
        image_ids: null,
        priority: issue.priority,
        due_date: issue.due_date,
        assignee_id: issue.assignee_id,
      });
      if (onUpdate) await onUpdate();
    } catch (err) {
      console.error('Failed to update title:', err);
      setTitle(issue.title);
    } finally {
      setIsSaving(false);
      setIsEditingTitle(false);
    }
  };

  const handleSaveDescription = async () => {
    if (description === (issue.description || '')) {
      setIsEditingDescription(false);
      return;
    }

    setIsSaving(true);
    try {
      await tasksApi.update(issue.id, {
        title: issue.title,
        description: description.trim() || null,
        status: issue.status,
        parent_workspace_id: issue.parent_workspace_id,
        image_ids: null,
        priority: issue.priority,
        due_date: issue.due_date,
        assignee_id: issue.assignee_id,
      });
      if (onUpdate) await onUpdate();
    } catch (err) {
      console.error('Failed to update description:', err);
      setDescription(issue.description || '');
    } finally {
      setIsSaving(false);
      setIsEditingDescription(false);
    }
  };

  const handleSubmitComment = useCallback(
    async (content: string, isInternal: boolean) => {
      await createComment({
        content,
        is_internal: isInternal,
        author_name: currentUser.name,
        author_email: currentUser.email,
        author_id: currentUser.id,
      });
    },
    [createComment, currentUser]
  );

  const handleSubmitAndClose = useCallback(
    async (content: string, isInternal: boolean) => {
      // First add the comment
      await createComment({
        content,
        is_internal: isInternal,
        author_name: currentUser.name,
        author_email: currentUser.email,
        author_id: currentUser.id,
      });

      // Then close the issue (set status to done)
      await tasksApi.update(issue.id, {
        title: issue.title,
        description: issue.description,
        status: 'done',
        parent_workspace_id: issue.parent_workspace_id,
        image_ids: null,
        priority: issue.priority,
        due_date: issue.due_date,
        assignee_id: issue.assignee_id,
      });

      if (onUpdate) await onUpdate();
    },
    [createComment, currentUser, issue, onUpdate]
  );

  const handleUpdateComment = useCallback(
    async (commentId: string, content: string, isInternal: boolean) => {
      await updateComment({
        commentId,
        payload: { content, is_internal: isInternal },
      });
    },
    [updateComment]
  );

  const handleDeleteComment = useCallback(
    async (commentId: string) => {
      await deleteComment(commentId);
    },
    [deleteComment]
  );

  const handlePriorityChange = async (priority: PriorityValue) => {
    setIsSaving(true);
    try {
      await tasksApi.update(issue.id, {
        title: issue.title,
        description: issue.description,
        status: issue.status,
        parent_workspace_id: issue.parent_workspace_id,
        image_ids: null,
        priority: priority,
        due_date: issue.due_date,
        assignee_id: issue.assignee_id,
      });
      if (onUpdate) await onUpdate();
    } catch (err) {
      console.error('Failed to update priority:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const statusColors = STATUS_COLORS[issue.status as TaskStatus] || STATUS_COLORS.todo;
  const statusLabel = STATUS_LABELS[issue.status as TaskStatus] || issue.status;

  // Check if we have cached comments (show them immediately, no loading state)
  const hasComments = comments.length > 0;
  const showCommentsLoading = commentsLoading && !hasComments;

  return (
    <div className="w-[500px] border-l bg-background flex flex-col overflow-hidden shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {team && (
            <>
              <span className="font-medium text-foreground">
                {team.icon || '👥'} {team.name}
              </span>
              <ChevronRight className="h-4 w-4" />
            </>
          )}
          {issueKey && (
            <Badge variant="outline" className="font-mono text-xs">
              {issueKey}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <ExternalLink className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main content - scrollable */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">
          {/* Title */}
          <div>
            {isEditingTitle ? (
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleSaveTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveTitle();
                  if (e.key === 'Escape') {
                    setTitle(issue.title);
                    setIsEditingTitle(false);
                  }
                }}
                className="text-lg font-semibold border-0 shadow-none px-0 focus-visible:ring-0"
                autoFocus
                disabled={isSaving}
              />
            ) : (
              <h1
                className="text-lg font-semibold cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1"
                onClick={() => setIsEditingTitle(true)}
              >
                {issue.title}
              </h1>
            )}
          </div>

          {/* Status and Priority row */}
          <div className="flex items-center gap-3">
            <Badge className={cn(statusColors.bg, statusColors.text, 'font-medium')}>
              {statusLabel}
            </Badge>
            <PrioritySelector
              value={(issue.priority || 0) as PriorityValue}
              onChange={handlePriorityChange}
              disabled={isSaving}
            />
          </div>

          {/* Description */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Description</h3>
            {isEditingDescription ? (
              <div className="space-y-2">
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="min-h-[100px]"
                  placeholder="Add a description..."
                  autoFocus
                  disabled={isSaving}
                />
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={handleSaveDescription} disabled={isSaving}>
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDescription(issue.description || '');
                      setIsEditingDescription(false);
                    }}
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div
                className={cn(
                  'min-h-[50px] p-2 rounded-md border cursor-pointer hover:bg-muted/50 text-sm',
                  !issue.description && 'text-muted-foreground italic'
                )}
                onClick={() => setIsEditingDescription(true)}
              >
                {issue.description || 'Click to add a description...'}
              </div>
            )}
          </div>

          {/* Linked Documents */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                <Paperclip className="h-3.5 w-3.5" />
                Attachments
                {linkedDocuments.length > 0 && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                    {linkedDocuments.length}
                  </Badge>
                )}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setShowLinkDocsDialog(true)}
                disabled={!teamId}
              >
                <LinkIcon className="h-3 w-3" />
                Link
              </Button>
            </div>
            {linksLoading ? (
              <div className="text-sm text-muted-foreground p-2 border rounded-md bg-muted/20">
                Loading...
              </div>
            ) : linkedDocuments.length === 0 ? (
              <div
                className="text-sm text-muted-foreground italic p-2 border rounded-md bg-muted/20 cursor-pointer hover:bg-muted/40"
                onClick={() => teamId && setShowLinkDocsDialog(true)}
              >
                No documents linked yet. Click to add.
              </div>
            ) : (
              <div className="space-y-1">
                {linkedDocuments.map((link) => (
                  <div
                    key={link.id}
                    className="flex items-center justify-between p-2 rounded-md border bg-muted/10 hover:bg-muted/30 group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm truncate">{link.document_title}</p>
                        {link.folder_name && (
                          <p className="text-xs text-muted-foreground truncate">
                            {link.folder_name}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                      onClick={() => unlinkDocument(link.document_id)}
                      disabled={isUnlinking}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tabs for Comments, Details, Activity */}
          <Tabs defaultValue="comments" className="w-full">
            <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0">
              <TabsTrigger
                value="comments"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-indigo-500 data-[state=active]:bg-transparent gap-1.5"
              >
                <MessageSquare className="h-4 w-4" />
                Comments
                {comments.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                    {comments.length}
                  </Badge>
                )}
                {commentsFetching && !commentsLoading && (
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
                )}
              </TabsTrigger>
              <TabsTrigger
                value="details"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-indigo-500 data-[state=active]:bg-transparent gap-1.5"
              >
                <FileText className="h-4 w-4" />
                Details
              </TabsTrigger>
              <TabsTrigger
                value="activity"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-indigo-500 data-[state=active]:bg-transparent gap-1.5"
              >
                <Activity className="h-4 w-4" />
                Activity
              </TabsTrigger>
            </TabsList>

            <TabsContent value="comments" className="mt-4 space-y-4">
              {/* Comment list - show cached immediately */}
              <CommentList
                comments={comments}
                isLoading={showCommentsLoading}
                onUpdate={handleUpdateComment}
                onDelete={handleDeleteComment}
                isUpdating={isUpdating}
                isDeleting={isDeleting}
              />

              {/* Comment editor */}
              <CommentEditor
                onSubmit={handleSubmitComment}
                onSubmitAndClose={handleSubmitAndClose}
                isSubmitting={isCreating}
                showCloseButton={issue.status !== 'done'}
              />
            </TabsContent>

            <TabsContent value="details" className="mt-4">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Created</span>
                    <p>{new Date(issue.created_at).toLocaleString()}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Updated</span>
                    <p>{new Date(issue.updated_at).toLocaleString()}</p>
                  </div>
                  {issue.due_date && (
                    <div>
                      <span className="text-muted-foreground">Due Date</span>
                      <p>{new Date(issue.due_date).toLocaleDateString()}</p>
                    </div>
                  )}
                  {issue.assignee_id && (
                    <div>
                      <span className="text-muted-foreground">Assignee</span>
                      <p>{issue.assignee_id}</p>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="activity" className="mt-4">
              <div className="text-sm text-muted-foreground">
                Activity log coming soon...
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Link Documents Dialog */}
      {teamId && (
        <LinkDocumentsDialog
          open={showLinkDocsDialog}
          onOpenChange={setShowLinkDocsDialog}
          teamId={teamId}
          existingLinks={linkedDocuments}
          onLink={linkDocuments}
          isLinking={isLinking}
        />
      )}
    </div>
  );
}
