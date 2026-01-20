import { useState } from 'react';
import { useAuth, useUserOrganizations, useCurrentUser } from '@/hooks';
import { useElectricCollection, type SyncError } from '@/lib/electric';
import {
  PROJECTS_SHAPE,
  NOTIFICATIONS_SHAPE,
  WORKSPACES_SHAPE,
  PROJECT_STATUSES_SHAPE,
  TAGS_SHAPE,
  ISSUES_SHAPE,
  ISSUE_ASSIGNEES_SHAPE,
  ISSUE_FOLLOWERS_SHAPE,
  ISSUE_TAGS_SHAPE,
  ISSUE_DEPENDENCIES_SHAPE,
  ISSUE_COMMENTS_SHAPE,
  ISSUE_COMMENT_REACTIONS_SHAPE,
  type Project,
  type Issue,
} from 'shared/remote-types';

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
    <div className="flex flex-wrap gap-base mb-base">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-base py-half text-sm rounded-sm ${
            value === opt.value
              ? 'bg-brand text-on-brand'
              : 'bg-secondary text-normal hover:bg-panel'
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
    <div className="p-base bg-secondary border rounded-sm text-low">
      {message}
    </div>
  );
}

function ErrorState({
  syncError,
  title,
  onRetry,
}: {
  syncError: SyncError | null;
  title: string;
  onRetry?: () => void;
}) {
  if (!syncError) return null;
  return (
    <div className="p-base bg-error/10 border border-error rounded-sm text-error">
      <p className="font-medium">
        {title}
        {syncError.status ? ` (${syncError.status})` : ''}:
      </p>
      <pre className="mt-base text-sm overflow-auto">{syncError.message}</pre>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-base px-base py-half bg-error text-on-brand rounded-sm"
        >
          Retry
        </button>
      )}
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
      <div className="p-base bg-secondary border rounded-sm text-low">
        No data found.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border rounded-sm text-sm">
        <thead className="bg-secondary">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-base py-half text-left font-medium text-normal border-b"
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
                  isSelected ? 'bg-brand/10' : 'hover:bg-secondary'
                }`}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-base py-half border-b">
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
// Collection List Components (using generic hook)
// ============================================================================

function ProjectsList({
  organizationId,
  onSelectProject,
  selectedProjectId,
}: {
  organizationId: string;
  onSelectProject: (project: Project) => void;
  selectedProjectId: string | null;
}) {
  const { data, isLoading, error, retry } = useElectricCollection(
    PROJECTS_SHAPE,
    { organization_id: organizationId }
  );

  if (error)
    return <ErrorState syncError={error} title="Sync Error" onRetry={retry} />;
  if (isLoading) return <LoadingState message="Loading projects..." />;

  return (
    <div>
      <p className="text-sm text-low mb-base">{data.length} synced</p>
      <DataTable
        data={data}
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
  const { data, isLoading, error, retry } = useElectricCollection(
    NOTIFICATIONS_SHAPE,
    { organization_id: organizationId, user_id: userId }
  );

  if (error)
    return <ErrorState syncError={error} title="Sync Error" onRetry={retry} />;
  if (isLoading) return <LoadingState message="Loading notifications..." />;

  return (
    <div>
      <p className="text-sm text-low mb-base">{data.length} synced</p>
      <DataTable
        data={data}
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
  onSelectIssue: (issue: Issue) => void;
  selectedIssueId: string | null;
}) {
  const { data, isLoading, error, retry } = useElectricCollection(
    ISSUES_SHAPE,
    { project_id: projectId }
  );

  if (error)
    return <ErrorState syncError={error} title="Sync Error" onRetry={retry} />;
  if (isLoading) return <LoadingState message="Loading issues..." />;

  return (
    <div>
      <p className="text-sm text-low mb-base">{data.length} synced</p>
      <DataTable
        data={data}
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
  const { data, isLoading, error, retry } = useElectricCollection(
    WORKSPACES_SHAPE,
    { project_id: projectId }
  );

  if (error)
    return <ErrorState syncError={error} title="Sync Error" onRetry={retry} />;
  if (isLoading) return <LoadingState message="Loading workspaces..." />;

  return (
    <div>
      <p className="text-sm text-low mb-base">{data.length} synced</p>
      <DataTable
        data={data}
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
  const { data, isLoading, error, retry } = useElectricCollection(
    PROJECT_STATUSES_SHAPE,
    { project_id: projectId }
  );

  if (error)
    return <ErrorState syncError={error} title="Sync Error" onRetry={retry} />;
  if (isLoading) return <LoadingState message="Loading statuses..." />;

  return (
    <div>
      <p className="text-sm text-low mb-base">{data.length} synced</p>
      <DataTable
        data={data}
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
  const { data, isLoading, error, retry } = useElectricCollection(TAGS_SHAPE, {
    project_id: projectId,
  });

  if (error)
    return <ErrorState syncError={error} title="Sync Error" onRetry={retry} />;
  if (isLoading) return <LoadingState message="Loading tags..." />;

  return (
    <div>
      <p className="text-sm text-low mb-base">{data.length} synced</p>
      <DataTable
        data={data}
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
  const { data, isLoading, error, retry } = useElectricCollection(
    ISSUE_ASSIGNEES_SHAPE,
    { project_id: projectId }
  );

  if (error)
    return <ErrorState syncError={error} title="Sync Error" onRetry={retry} />;
  if (isLoading) return <LoadingState message="Loading assignees..." />;

  return (
    <div>
      <p className="text-sm text-low mb-base">{data.length} synced</p>
      <DataTable
        data={data}
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
  const { data, isLoading, error, retry } = useElectricCollection(
    ISSUE_FOLLOWERS_SHAPE,
    { project_id: projectId }
  );

  if (error)
    return <ErrorState syncError={error} title="Sync Error" onRetry={retry} />;
  if (isLoading) return <LoadingState message="Loading followers..." />;

  return (
    <div>
      <p className="text-sm text-low mb-base">{data.length} synced</p>
      <DataTable
        data={data}
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
  const { data, isLoading, error, retry } = useElectricCollection(
    ISSUE_TAGS_SHAPE,
    { project_id: projectId }
  );

  if (error)
    return <ErrorState syncError={error} title="Sync Error" onRetry={retry} />;
  if (isLoading) return <LoadingState message="Loading issue tags..." />;

  return (
    <div>
      <p className="text-sm text-low mb-base">{data.length} synced</p>
      <DataTable
        data={data}
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
  const { data, isLoading, error, retry } = useElectricCollection(
    ISSUE_DEPENDENCIES_SHAPE,
    { project_id: projectId }
  );

  if (error)
    return <ErrorState syncError={error} title="Sync Error" onRetry={retry} />;
  if (isLoading) return <LoadingState message="Loading dependencies..." />;

  return (
    <div>
      <p className="text-sm text-low mb-base">{data.length} synced</p>
      <DataTable
        data={data}
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
  const { data, isLoading, error, retry } = useElectricCollection(
    ISSUE_COMMENTS_SHAPE,
    { issue_id: issueId }
  );

  if (error)
    return <ErrorState syncError={error} title="Sync Error" onRetry={retry} />;
  if (isLoading) return <LoadingState message="Loading comments..." />;

  return (
    <div>
      <p className="text-sm text-low mb-base">{data.length} synced</p>
      <DataTable
        data={data}
        getRowId={(c) => c.id}
        columns={[
          {
            key: 'message',
            label: 'Message',
            render: (c) =>
              c.message.length > 50
                ? c.message.slice(0, 50) + '...'
                : c.message,
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
  const { data, isLoading, error, retry } = useElectricCollection(
    ISSUE_COMMENT_REACTIONS_SHAPE,
    { issue_id: issueId }
  );

  if (error)
    return <ErrorState syncError={error} title="Sync Error" onRetry={retry} />;
  if (isLoading) return <LoadingState message="Loading reactions..." />;

  return (
    <div>
      <p className="text-sm text-low mb-base">{data.length} synced</p>
      <DataTable
        data={data}
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
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
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

  const handleSelectProject = (project: Project) => {
    setSelectedProjectId(project.id);
    setSelectedProject(project);
    setSelectedIssueId(null);
    setSelectedIssue(null);
  };

  const handleSelectIssue = (issue: Issue) => {
    setSelectedIssueId(issue.id);
    setSelectedIssue(issue);
  };

  if (!isLoaded) {
    return (
      <div className="p-double">
        <p className="text-low">Loading...</p>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="p-double">
        <h2 className="text-xl font-medium text-high mb-base">
          Electric SDK Test
        </h2>
        <p className="text-low">Please sign in to test Electric sync.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-auto p-double space-y-double max-w-6xl bg-background">
      <h2 className="text-xl font-medium text-high">Electric SDK Test</h2>

      {/* Configuration */}
      <div className="bg-primary border rounded-sm p-base space-y-base">
        <h3 className="text-lg font-medium text-normal">Configuration</h3>

        <div className="grid grid-cols-2 gap-base">
          <div>
            <label className="block text-sm font-medium text-normal mb-half">
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
              className="w-full px-base py-half border rounded-sm bg-primary text-normal focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand disabled:bg-secondary disabled:text-low"
            >
              <option value="">Select an organization...</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end gap-base">
            {!isConnected ? (
              <button
                onClick={() => setIsConnected(true)}
                disabled={!selectedOrgId}
                className="px-base py-half bg-brand text-on-brand rounded-sm hover:bg-brand-hover focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:bg-panel disabled:text-low disabled:cursor-not-allowed"
              >
                Connect
              </button>
            ) : (
              <button
                onClick={handleDisconnect}
                className="px-base py-half bg-error text-on-brand rounded-sm focus:outline-none focus:ring-2 focus:ring-error focus:ring-offset-2"
              >
                Disconnect
              </button>
            )}
            <span
              className={`text-sm ${isConnected ? 'text-success' : 'text-low'}`}
            >
              {isConnected ? 'Connected' : 'Not connected'}
            </span>
          </div>
        </div>

        {selectedOrgId && (
          <div className="text-xs text-low font-ibm-plex-mono">
            Organization ID: {selectedOrgId}
            {userId && <span className="ml-base">User ID: {userId}</span>}
          </div>
        )}
      </div>

      {/* Organization-scoped collections */}
      {isConnected && selectedOrgId && (
        <div className="bg-primary border rounded-sm p-base">
          <h3 className="text-lg font-medium text-normal mb-base">
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
            <p className="mt-base text-sm text-brand">
              Selected project: <strong>{selectedProject.name}</strong> (click a
              row to select)
            </p>
          )}
        </div>
      )}

      {/* Project-scoped collections */}
      {isConnected && selectedProjectId && (
        <div className="bg-primary border rounded-sm p-base">
          <h3 className="text-lg font-medium text-normal mb-base">
            Project Collections
            <span className="text-sm font-normal text-low ml-base">
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
            <p className="mt-base text-sm text-brand">
              Selected issue: <strong>{selectedIssue.title}</strong>
            </p>
          )}
        </div>
      )}

      {/* Issue-scoped collections */}
      {isConnected && selectedIssueId && (
        <div className="bg-primary border rounded-sm p-base">
          <h3 className="text-lg font-medium text-normal mb-base">
            Issue Collections
            <span className="text-sm font-normal text-low ml-base">
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
