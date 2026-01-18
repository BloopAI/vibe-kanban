import { useState, useMemo, useCallback } from 'react';
import { useLiveQuery } from '@tanstack/react-db';
import { useAuth, useUserOrganizations } from '@/hooks';
import {
  createProjectsCollection,
  type SyncError,
} from '@/lib/electric';
import type { ElectricProject } from 'shared/types';

function ProjectsList({
  organizationId,
}: {
  organizationId: string;
}) {
  const [syncError, setSyncError] = useState<SyncError | null>(null);

  const handleError = useCallback((error: SyncError) => {
    setSyncError(error);
  }, []);

  const collection = useMemo(
    () => createProjectsCollection(organizationId, { onError: handleError }),
    [organizationId, handleError]
  );

  const { data: projects, isLoading, isError } = useLiveQuery((query) =>
    query.from({ project: collection })
  );

  // Debug logging
  console.log('useLiveQuery result:', { projects, isLoading, isError, syncError });

  if (syncError) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700">
        <p className="font-semibold">
          Sync Error{syncError.status ? ` (${syncError.status})` : ''}:
        </p>
        <pre className="mt-2 text-sm overflow-auto">{syncError.message}</pre>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700">
        <p className="font-semibold">Error loading projects</p>
        <p className="mt-2 text-sm">Check the console for details.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 bg-gray-50 border border-gray-200 rounded text-gray-600">
        Loading projects...
      </div>
    );
  }

  if (!projects || !Array.isArray(projects)) {
    return (
      <div className="p-4 bg-gray-50 border border-gray-200 rounded text-gray-600">
        Waiting for data...
      </div>
    );
  }

  // Handle both wrapped { project: Project } and unwrapped Project shapes
  const projectList: ElectricProject[] = projects
    .map((item: unknown) => {
      if (item && typeof item === 'object') {
        if ('project' in item && item.project) {
          return item.project as ElectricProject;
        }
        if ('id' in item && 'name' in item) {
          return item as ElectricProject;
        }
      }
      return null;
    })
    .filter((p): p is ElectricProject => p !== null);

  if (projectList.length === 0) {
    return (
      <div className="p-4 bg-gray-50 border border-gray-200 rounded text-gray-600">
        No projects found for this organization.
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        {projectList.length} project{projectList.length !== 1 ? 's' : ''} synced
      </p>
      <div className="overflow-x-auto">
        <table className="min-w-full border border-gray-200 rounded">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b">
                Name
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b">
                Color
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b">
                ID
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b">
                Updated
              </th>
            </tr>
          </thead>
          <tbody>
            {projectList.map((project) => (
              <tr key={project.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 border-b">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: project.color }}
                    />
                    <span className="font-medium">{project.name}</span>
                  </div>
                </td>
                <td className="px-4 py-2 border-b text-sm text-gray-600 font-mono">
                  {project.color}
                </td>
                <td className="px-4 py-2 border-b text-sm text-gray-500 font-mono">
                  {project.id.slice(0, 8)}...
                </td>
                <td className="px-4 py-2 border-b text-sm text-gray-500">
                  {new Date(project.updated_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ElectricTestPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const { data: orgsData } = useUserOrganizations();
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);

  const organizations = orgsData?.organizations ?? [];

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
    <div className="p-6 space-y-6 max-w-4xl">
      <h2 className="text-xl font-bold text-gray-900">Electric SDK Test</h2>

      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-800">Configuration</h3>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Organization
          </label>
          <select
            value={selectedOrgId}
            onChange={(e) => setSelectedOrgId(e.target.value)}
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

        {selectedOrgId && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Organization ID
            </label>
            <input
              type="text"
              value={selectedOrgId}
              readOnly
              className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-600 font-mono text-sm"
            />
          </div>
        )}

        <div className="flex items-center gap-4">
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
              onClick={() => setIsConnected(false)}
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

      {isConnected && selectedOrgId && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Projects</h3>
          <ProjectsList organizationId={selectedOrgId} />
        </div>
      )}
    </div>
  );
}
