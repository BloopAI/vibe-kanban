import { useState, useMemo, useCallback } from 'react';
import { useLiveQuery } from '@tanstack/react-db';
import { useAuth, useUserOrganizations, useCurrentUser } from '@/hooks';
import {
  createProjectsCollection,
  createNotificationsCollection,
  createWorkspacesCollection,
  createProjectStatusesCollection,
  createTagsCollection,
  createIssuesCollection,
  createIssueAssigneesCollection,
  createIssueFollowersCollection,
  createIssueTagsCollection,
  createIssueDependenciesCollection,
  createIssueCommentsCollection,
  createIssueCommentReactionsCollection,
  type SyncError,
} from '@/lib/electric';
import type {
  ElectricProject,
  ElectricNotification,
  ElectricWorkspace,
  ElectricProjectStatus,
  ElectricTag,
  ElectricIssue,
  ElectricIssueAssignee,
  ElectricIssueFollower,
  ElectricIssueTag,
  ElectricIssueDependency,
  ElectricIssueComment,
  ElectricIssueCommentReaction,
} from 'shared/types';

// ============================================================================
// Types
// ============================================================================

type OrgCollectionType = 'projects' | 'notifications';
type ProjectCollectionType =
  | 'issues'
  | 'workspaces'
  | 'statuses'
  | 'tags'
  | 'assignees'
  | 'followers'
  | 'issueTags'
  | 'dependencies';
type IssueCollectionType = 'comments' | 'reactions';

// ============================================================================
// Helper Components
// ============================================================================

function CollectionTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1 text-sm rounded-md ${
            value === opt.value
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function LoadingState({ message }: { message: string }) {
  return (
    <div className="p-4 bg-gray-50 border border-gray-200 rounded text-gray-600">
      {message}
    </div>
  );
}

function ErrorState({
  syncError,
  title,
}: {
  syncError: SyncError | null;
  title: string;
}) {
  if (!syncError) return null;
  return (
    <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700">
      <p className="font-semibold">
        {title}
        {syncError.status ? ` (${syncError.status})` : ''}:
      </p>
      <pre className="mt-2 text-sm overflow-auto">{syncError.message}</pre>
    </div>
  );
}

function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  onRowClick,
  selectedId,
  getRowId,
}: {
  data: T[];
  columns: {
    key: string;
    label: string;
    render?: (item: T) => React.ReactNode;
  }[];
  onRowClick?: (item: T) => void;
  selectedId?: string;
  getRowId: (item: T) => string;
}) {
  if (data.length === 0) {
    return (
      <div className="p-4 bg-gray-50 border border-gray-200 rounded text-gray-600">
        No data found.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border border-gray-200 rounded text-sm">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-3 py-2 text-left font-medium text-gray-700 border-b"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item) => {
            const rowId = getRowId(item);
            const isSelected = selectedId === rowId;
            return (
              <tr
                key={rowId}
                onClick={() => onRowClick?.(item)}
                className={`${onRowClick ? 'cursor-pointer' : ''} ${
                  isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-3 py-2 border-b">
                    {col.render
                      ? col.render(item)
                      : String(item[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// Collection List Components
// ============================================================================

function ProjectsList({
  organizationId,
  onSelectProject,
  selectedProjectId,
}: {
  organizationId: string;
  onSelectProject: (project: ElectricProject) => void;
  selectedProjectId: string | null;
}) {
  const [syncError, setSyncError] = useState<SyncError | null>(null);
  const handleError = useCallback(
    (error: SyncError) => setSyncError(error),
    []
  );

  const collection = useMemo(
    () => createProjectsCollection(organizationId, { onError: handleError }),
    [organizationId, handleError]
  );

  const { data, isLoading } = useLiveQuery((query) =>
    query.from({ item: collection })
  );

  if (syncError) return <ErrorState syncError={syncError} title="Sync Error" />;
  if (isLoading) return <LoadingState message="Loading projects..." />;

  const items = extractItems<ElectricProject>(data, 'item');

  return (
    <div>
      <p className="text-sm text-gray-500 mb-2">{items.length} synced</p>
      <DataTable
        data={items}
        getRowId={(p) => p.id}
        selectedId={selectedProjectId ?? undefined}
        onRowClick={onSelectProject}
        columns={[
          {
            key: 'name',
            label: 'Name',
            render: (p) => (
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: p.color }}
                />
                <span className="font-medium">{p.name}</span>
              </div>
            ),
          },
          { key: 'id', label: 'ID', render: (p) => truncateId(p.id) },
          {
            key: 'updated_at',
            label: 'Updated',
            render: (p) => formatDate(p.updated_at),
          },
        ]}
      />
    </div>
  );
}

function NotificationsList({
  organizationId,
  userId,
}: {
  organizationId: string;
  userId: string;
}) {
  const [syncError, setSyncError] = useState<SyncError | null>(null);
  const handleError = useCallback(
    (error: SyncError) => setSyncError(error),
    []
  );

  const collection = useMemo(
    () =>
      createNotificationsCollection(organizationId, userId, {
        onError: handleError,
      }),
    [organizationId, userId, handleError]
  );

  const { data, isLoading } = useLiveQuery((query) =>
    query.from({ item: collection })
  );

  if (syncError) return <ErrorState syncError={syncError} title="Sync Error" />;
  if (isLoading) return <LoadingState message="Loading notifications..." />;

  const items = extractItems<ElectricNotification>(data, 'item');

  return (
    <div>
      <p className="text-sm text-gray-500 mb-2">{items.length} synced</p>
      <DataTable
        data={items}
        getRowId={(n) => n.id}
        columns={[
          { key: 'notification_type', label: 'Type' },
          {
            key: 'seen',
            label: 'Seen',
            render: (n) => (n.seen ? 'Yes' : 'No'),
          },
          { key: 'id', label: 'ID', render: (n) => truncateId(n.id) },
          {
            key: 'created_at',
            label: 'Created',
            render: (n) => formatDate(n.created_at),
          },
        ]}
      />
    </div>
  );
}

function IssuesList({
  projectId,
  onSelectIssue,
  selectedIssueId,
}: {
  projectId: string;
  onSelectIssue: (issue: ElectricIssue) => void;
  selectedIssueId: string | null;
}) {
  const [syncError, setSyncError] = useState<SyncError | null>(null);
  const handleError = useCallback(
    (error: SyncError) => setSyncError(error),
    []
  );

  const collection = useMemo(
    () => createIssuesCollection(projectId, { onError: handleError }),
    [projectId, handleError]
  );

  const { data, isLoading } = useLiveQuery((query) =>
    query.from({ item: collection })
  );

  if (syncError) return <ErrorState syncError={syncError} title="Sync Error" />;
  if (isLoading) return <LoadingState message="Loading issues..." />;

  const items = extractItems<ElectricIssue>(data, 'item');

  return (
    <div>
      <p className="text-sm text-gray-500 mb-2">{items.length} synced</p>
      <DataTable
        data={items}
        getRowId={(i) => i.id}
        selectedId={selectedIssueId ?? undefined}
        onRowClick={onSelectIssue}
        columns={[
          { key: 'title', label: 'Title' },
          { key: 'priority', label: 'Priority' },
          { key: 'id', label: 'ID', render: (i) => truncateId(i.id) },
          {
            key: 'updated_at',
            label: 'Updated',
            render: (i) => formatDate(i.updated_at),
          },
        ]}
      />
    </div>
  );
}

function WorkspacesList({ projectId }: { projectId: string }) {
  const [syncError, setSyncError] = useState<SyncError | null>(null);
  const handleError = useCallback(
    (error: SyncError) => setSyncError(error),
    []
  );

  const collection = useMemo(
    () => createWorkspacesCollection(projectId, { onError: handleError }),
    [projectId, handleError]
  );

  const { data, isLoading } = useLiveQuery((query) =>
    query.from({ item: collection })
  );

  if (syncError) return <ErrorState syncError={syncError} title="Sync Error" />;
  if (isLoading) return <LoadingState message="Loading workspaces..." />;

  const items = extractItems<ElectricWorkspace>(data, 'item');

  return (
    <div>
      <p className="text-sm text-gray-500 mb-2">{items.length} synced</p>
      <DataTable
        data={items}
        getRowId={(w) => w.id}
        columns={[
          { key: 'id', label: 'ID', render: (w) => truncateId(w.id) },
          {
            key: 'archived',
            label: 'Archived',
            render: (w) => (w.archived ? 'Yes' : 'No'),
          },
          { key: 'files_changed', label: 'Files Changed' },
          {
            key: 'created_at',
            label: 'Created',
            render: (w) => formatDate(w.created_at),
          },
        ]}
      />
    </div>
  );
}

function StatusesList({ projectId }: { projectId: string }) {
  const [syncError, setSyncError] = useState<SyncError | null>(null);
  const handleError = useCallback(
    (error: SyncError) => setSyncError(error),
    []
  );

  const collection = useMemo(
    () => createProjectStatusesCollection(projectId, { onError: handleError }),
    [projectId, handleError]
  );

  const { data, isLoading } = useLiveQuery((query) =>
    query.from({ item: collection })
  );

  if (syncError) return <ErrorState syncError={syncError} title="Sync Error" />;
  if (isLoading) return <LoadingState message="Loading statuses..." />;

  const items = extractItems<ElectricProjectStatus>(data, 'item');

  return (
    <div>
      <p className="text-sm text-gray-500 mb-2">{items.length} synced</p>
      <DataTable
        data={items}
        getRowId={(s) => s.id}
        columns={[
          {
            key: 'name',
            label: 'Name',
            render: (s) => (
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span>{s.name}</span>
              </div>
            ),
          },
          { key: 'sort_order', label: 'Order' },
          { key: 'id', label: 'ID', render: (s) => truncateId(s.id) },
        ]}
      />
    </div>
  );
}

function TagsList({ projectId }: { projectId: string }) {
  const [syncError, setSyncError] = useState<SyncError | null>(null);
  const handleError = useCallback(
    (error: SyncError) => setSyncError(error),
    []
  );

  const collection = useMemo(
    () => createTagsCollection(projectId, { onError: handleError }),
    [projectId, handleError]
  );

  const { data, isLoading } = useLiveQuery((query) =>
    query.from({ item: collection })
  );

  if (syncError) return <ErrorState syncError={syncError} title="Sync Error" />;
  if (isLoading) return <LoadingState message="Loading tags..." />;

  const items = extractItems<ElectricTag>(data, 'item');

  return (
    <div>
      <p className="text-sm text-gray-500 mb-2">{items.length} synced</p>
      <DataTable
        data={items}
        getRowId={(t) => t.id}
        columns={[
          {
            key: 'name',
            label: 'Name',
            render: (t) => (
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: t.color }}
                />
                <span>{t.name}</span>
              </div>
            ),
          },
          { key: 'id', label: 'ID', render: (t) => truncateId(t.id) },
        ]}
      />
    </div>
  );
}

function AssigneesList({ projectId }: { projectId: string }) {
  const [syncError, setSyncError] = useState<SyncError | null>(null);
  const handleError = useCallback(
    (error: SyncError) => setSyncError(error),
    []
  );

  const collection = useMemo(
    () => createIssueAssigneesCollection(projectId, { onError: handleError }),
    [projectId, handleError]
  );

  const { data, isLoading } = useLiveQuery((query) =>
    query.from({ item: collection })
  );

  if (syncError) return <ErrorState syncError={syncError} title="Sync Error" />;
  if (isLoading) return <LoadingState message="Loading assignees..." />;

  const items = extractItems<ElectricIssueAssignee>(data, 'item');

  return (
    <div>
      <p className="text-sm text-gray-500 mb-2">{items.length} synced</p>
      <DataTable
        data={items}
        getRowId={(a) => `${a.issue_id}-${a.user_id}`}
        columns={[
          {
            key: 'issue_id',
            label: 'Issue ID',
            render: (a) => truncateId(a.issue_id),
          },
          {
            key: 'user_id',
            label: 'User ID',
            render: (a) => truncateId(a.user_id),
          },
          {
            key: 'assigned_at',
            label: 'Assigned',
            render: (a) => formatDate(a.assigned_at),
          },
        ]}
      />
    </div>
  );
}

function FollowersList({ projectId }: { projectId: string }) {
  const [syncError, setSyncError] = useState<SyncError | null>(null);
  const handleError = useCallback(
    (error: SyncError) => setSyncError(error),
    []
  );

  const collection = useMemo(
    () => createIssueFollowersCollection(projectId, { onError: handleError }),
    [projectId, handleError]
  );

  const { data, isLoading } = useLiveQuery((query) =>
    query.from({ item: collection })
  );

  if (syncError) return <ErrorState syncError={syncError} title="Sync Error" />;
  if (isLoading) return <LoadingState message="Loading followers..." />;

  const items = extractItems<ElectricIssueFollower>(data, 'item');

  return (
    <div>
      <p className="text-sm text-gray-500 mb-2">{items.length} synced</p>
      <DataTable
        data={items}
        getRowId={(f) => `${f.issue_id}-${f.user_id}`}
        columns={[
          {
            key: 'issue_id',
            label: 'Issue ID',
            render: (f) => truncateId(f.issue_id),
          },
          {
            key: 'user_id',
            label: 'User ID',
            render: (f) => truncateId(f.user_id),
          },
        ]}
      />
    </div>
  );
}

function IssueTagsList({ projectId }: { projectId: string }) {
  const [syncError, setSyncError] = useState<SyncError | null>(null);
  const handleError = useCallback(
    (error: SyncError) => setSyncError(error),
    []
  );

  const collection = useMemo(
    () => createIssueTagsCollection(projectId, { onError: handleError }),
    [projectId, handleError]
  );

  const { data, isLoading } = useLiveQuery((query) =>
    query.from({ item: collection })
  );

  if (syncError) return <ErrorState syncError={syncError} title="Sync Error" />;
  if (isLoading) return <LoadingState message="Loading issue tags..." />;

  const items = extractItems<ElectricIssueTag>(data, 'item');

  return (
    <div>
      <p className="text-sm text-gray-500 mb-2">{items.length} synced</p>
      <DataTable
        data={items}
        getRowId={(t) => `${t.issue_id}-${t.tag_id}`}
        columns={[
          {
            key: 'issue_id',
            label: 'Issue ID',
            render: (t) => truncateId(t.issue_id),
          },
          {
            key: 'tag_id',
            label: 'Tag ID',
            render: (t) => truncateId(t.tag_id),
          },
        ]}
      />
    </div>
  );
}

function DependenciesList({ projectId }: { projectId: string }) {
  const [syncError, setSyncError] = useState<SyncError | null>(null);
  const handleError = useCallback(
    (error: SyncError) => setSyncError(error),
    []
  );

  const collection = useMemo(
    () => createIssueDependenciesCollection(projectId, { onError: handleError }),
    [projectId, handleError]
  );

  const { data, isLoading } = useLiveQuery((query) =>
    query.from({ item: collection })
  );

  if (syncError) return <ErrorState syncError={syncError} title="Sync Error" />;
  if (isLoading) return <LoadingState message="Loading dependencies..." />;

  const items = extractItems<ElectricIssueDependency>(data, 'item');

  return (
    <div>
      <p className="text-sm text-gray-500 mb-2">{items.length} synced</p>
      <DataTable
        data={items}
        getRowId={(d) => `${d.blocking_issue_id}-${d.blocked_issue_id}`}
        columns={[
          {
            key: 'blocking_issue_id',
            label: 'Blocking',
            render: (d) => truncateId(d.blocking_issue_id),
          },
          {
            key: 'blocked_issue_id',
            label: 'Blocked',
            render: (d) => truncateId(d.blocked_issue_id),
          },
          {
            key: 'created_at',
            label: 'Created',
            render: (d) => formatDate(d.created_at),
          },
        ]}
      />
    </div>
  );
}

function CommentsList({ issueId }: { issueId: string }) {
  const [syncError, setSyncError] = useState<SyncError | null>(null);
  const handleError = useCallback(
    (error: SyncError) => setSyncError(error),
    []
  );

  const collection = useMemo(
    () => createIssueCommentsCollection(issueId, { onError: handleError }),
    [issueId, handleError]
  );

  const { data, isLoading } = useLiveQuery((query) =>
    query.from({ item: collection })
  );

  if (syncError) return <ErrorState syncError={syncError} title="Sync Error" />;
  if (isLoading) return <LoadingState message="Loading comments..." />;

  const items = extractItems<ElectricIssueComment>(data, 'item');

  return (
    <div>
      <p className="text-sm text-gray-500 mb-2">{items.length} synced</p>
      <DataTable
        data={items}
        getRowId={(c) => c.id}
        columns={[
          {
            key: 'message',
            label: 'Message',
            render: (c) =>
              c.message.length > 50 ? c.message.slice(0, 50) + '...' : c.message,
          },
          {
            key: 'author_id',
            label: 'Author',
            render: (c) => truncateId(c.author_id),
          },
          { key: 'id', label: 'ID', render: (c) => truncateId(c.id) },
          {
            key: 'created_at',
            label: 'Created',
            render: (c) => formatDate(c.created_at),
          },
        ]}
      />
    </div>
  );
}

function ReactionsList({ issueId }: { issueId: string }) {
  const [syncError, setSyncError] = useState<SyncError | null>(null);
  const handleError = useCallback(
    (error: SyncError) => setSyncError(error),
    []
  );

  const collection = useMemo(
    () => createIssueCommentReactionsCollection(issueId, { onError: handleError }),
    [issueId, handleError]
  );

  const { data, isLoading } = useLiveQuery((query) =>
    query.from({ item: collection })
  );

  if (syncError) return <ErrorState syncError={syncError} title="Sync Error" />;
  if (isLoading) return <LoadingState message="Loading reactions..." />;

  const items = extractItems<ElectricIssueCommentReaction>(data, 'item');

  return (
    <div>
      <p className="text-sm text-gray-500 mb-2">{items.length} synced</p>
      <DataTable
        data={items}
        getRowId={(r) => r.id}
        columns={[
          { key: 'emoji', label: 'Emoji' },
          {
            key: 'comment_id',
            label: 'Comment',
            render: (r) => truncateId(r.comment_id),
          },
          {
            key: 'user_id',
            label: 'User',
            render: (r) => truncateId(r.user_id),
          },
          { key: 'id', label: 'ID', render: (r) => truncateId(r.id) },
        ]}
      />
    </div>
  );
}

// ============================================================================
// Utility functions
// ============================================================================

function extractItems<T>(data: unknown, key: string): T[] {
  if (!data || !Array.isArray(data)) return [];
  return data
    .map((item: unknown) => {
      if (item && typeof item === 'object') {
        if (key in item && (item as Record<string, unknown>)[key]) {
          return (item as Record<string, unknown>)[key] as T;
        }
        if ('id' in item) {
          return item as T;
        }
      }
      return null;
    })
    .filter((item): item is T => item !== null);
}

function truncateId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) + '...' : id;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

// ============================================================================
// Main Component
// ============================================================================

export function ElectricTestPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const { data: orgsData } = useUserOrganizations();
  const { data: currentUser } = useCurrentUser();

  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null
  );
  const [selectedProject, setSelectedProject] =
    useState<ElectricProject | null>(null);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<ElectricIssue | null>(
    null
  );
  const [isConnected, setIsConnected] = useState(false);

  const [activeOrgCollection, setActiveOrgCollection] =
    useState<OrgCollectionType>('projects');
  const [activeProjectCollection, setActiveProjectCollection] =
    useState<ProjectCollectionType>('issues');
  const [activeIssueCollection, setActiveIssueCollection] =
    useState<IssueCollectionType>('comments');

  const organizations = orgsData?.organizations ?? [];
  const userId = currentUser?.user_id;

  const handleDisconnect = () => {
    setIsConnected(false);
    setSelectedProjectId(null);
    setSelectedProject(null);
    setSelectedIssueId(null);
    setSelectedIssue(null);
  };

  const handleSelectProject = (project: ElectricProject) => {
    setSelectedProjectId(project.id);
    setSelectedProject(project);
    setSelectedIssueId(null);
    setSelectedIssue(null);
  };

  const handleSelectIssue = (issue: ElectricIssue) => {
    setSelectedIssueId(issue.id);
    setSelectedIssue(issue);
  };

  if (!isLoaded) {
    return (
      <div className="p-6">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          Electric SDK Test
        </h2>
        <p className="text-gray-500">Please sign in to test Electric sync.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <h2 className="text-xl font-bold text-gray-900">Electric SDK Test</h2>

      {/* Configuration */}
      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-800">Configuration</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Organization
            </label>
            <select
              value={selectedOrgId}
              onChange={(e) => {
                setSelectedOrgId(e.target.value);
                setSelectedProjectId(null);
                setSelectedProject(null);
                setSelectedIssueId(null);
                setSelectedIssue(null);
              }}
              disabled={isConnected}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
            >
              <option value="">Select an organization...</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end gap-4">
            {!isConnected ? (
              <button
                onClick={() => setIsConnected(true)}
                disabled={!selectedOrgId}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                Connect
              </button>
            ) : (
              <button
                onClick={handleDisconnect}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                Disconnect
              </button>
            )}
            <span
              className={`text-sm ${isConnected ? 'text-green-600' : 'text-gray-500'}`}
            >
              {isConnected ? 'Connected' : 'Not connected'}
            </span>
          </div>
        </div>

        {selectedOrgId && (
          <div className="text-xs text-gray-500 font-mono">
            Organization ID: {selectedOrgId}
            {userId && <span className="ml-4">User ID: {userId}</span>}
          </div>
        )}
      </div>

      {/* Organization-scoped collections */}
      {isConnected && selectedOrgId && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            Organization Collections
          </h3>

          <CollectionTabs
            value={activeOrgCollection}
            onChange={setActiveOrgCollection}
            options={[
              { value: 'projects', label: 'Projects' },
              { value: 'notifications', label: 'Notifications' },
            ]}
          />

          {activeOrgCollection === 'projects' && (
            <ProjectsList
              organizationId={selectedOrgId}
              onSelectProject={handleSelectProject}
              selectedProjectId={selectedProjectId}
            />
          )}
          {activeOrgCollection === 'notifications' && userId && (
            <NotificationsList organizationId={selectedOrgId} userId={userId} />
          )}
          {activeOrgCollection === 'notifications' && !userId && (
            <LoadingState message="Loading user info..." />
          )}

          {selectedProject && (
            <p className="mt-4 text-sm text-blue-600">
              Selected project: <strong>{selectedProject.name}</strong> (click a
              row to select)
            </p>
          )}
        </div>
      )}

      {/* Project-scoped collections */}
      {isConnected && selectedProjectId && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            Project Collections
            <span className="text-sm font-normal text-gray-500 ml-2">
              ({selectedProject?.name})
            </span>
          </h3>

          <CollectionTabs
            value={activeProjectCollection}
            onChange={setActiveProjectCollection}
            options={[
              { value: 'issues', label: 'Issues' },
              { value: 'workspaces', label: 'Workspaces' },
              { value: 'statuses', label: 'Statuses' },
              { value: 'tags', label: 'Tags' },
              { value: 'assignees', label: 'Assignees' },
              { value: 'followers', label: 'Followers' },
              { value: 'issueTags', label: 'Issue Tags' },
              { value: 'dependencies', label: 'Dependencies' },
            ]}
          />

          {activeProjectCollection === 'issues' && (
            <IssuesList
              projectId={selectedProjectId}
              onSelectIssue={handleSelectIssue}
              selectedIssueId={selectedIssueId}
            />
          )}
          {activeProjectCollection === 'workspaces' && (
            <WorkspacesList projectId={selectedProjectId} />
          )}
          {activeProjectCollection === 'statuses' && (
            <StatusesList projectId={selectedProjectId} />
          )}
          {activeProjectCollection === 'tags' && (
            <TagsList projectId={selectedProjectId} />
          )}
          {activeProjectCollection === 'assignees' && (
            <AssigneesList projectId={selectedProjectId} />
          )}
          {activeProjectCollection === 'followers' && (
            <FollowersList projectId={selectedProjectId} />
          )}
          {activeProjectCollection === 'issueTags' && (
            <IssueTagsList projectId={selectedProjectId} />
          )}
          {activeProjectCollection === 'dependencies' && (
            <DependenciesList projectId={selectedProjectId} />
          )}

          {selectedIssue && (
            <p className="mt-4 text-sm text-blue-600">
              Selected issue: <strong>{selectedIssue.title}</strong>
            </p>
          )}
        </div>
      )}

      {/* Issue-scoped collections */}
      {isConnected && selectedIssueId && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            Issue Collections
            <span className="text-sm font-normal text-gray-500 ml-2">
              ({selectedIssue?.title})
            </span>
          </h3>

          <CollectionTabs
            value={activeIssueCollection}
            onChange={setActiveIssueCollection}
            options={[
              { value: 'comments', label: 'Comments' },
              { value: 'reactions', label: 'Reactions' },
            ]}
          />

          {activeIssueCollection === 'comments' && (
            <CommentsList issueId={selectedIssueId} />
          )}
          {activeIssueCollection === 'reactions' && (
            <ReactionsList issueId={selectedIssueId} />
          )}
        </div>
      )}
    </div>
  );
}
