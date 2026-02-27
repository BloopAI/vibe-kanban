import { PROJECTS_SHAPE, type Project } from 'shared/remote-types';
import { type OrganizationWithRole } from 'shared/types';
import { organizationsApi } from '@/shared/lib/api';
import { createShapeCollection } from '@/shared/lib/electric/collections';
import { getFirstProjectByOrder } from '@/shared/lib/projectOrder';

const FIRST_PROJECT_LOOKUP_TIMEOUT_MS = 3000;

function getFirstOrganization(
  organizations: OrganizationWithRole[]
): OrganizationWithRole | null {
  if (organizations.length === 0) {
    return null;
  }

  return organizations[0];
}

async function getProjectsInOrganization(
  organizationId: string
): Promise<Project[] | null> {
  const collection = createShapeCollection(PROJECTS_SHAPE, {
    organization_id: organizationId,
  });

  const getCollectionProjects = () =>
    collection.toArray as unknown as Project[];

  if (collection.isReady()) {
    return getCollectionProjects();
  }

  return new Promise<Project[] | null>((resolve) => {
    let settled = false;
    let timeoutId: number | undefined;
    let subscription: { unsubscribe: () => void } | undefined;

    const settle = (projects: Project[] | null) => {
      if (settled) return;
      settled = true;

      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      if (subscription) {
        subscription.unsubscribe();
        subscription = undefined;
      }

      resolve(projects);
    };

    const tryResolve = () => {
      if (!collection.isReady()) {
        return;
      }

      settle(getCollectionProjects());
    };

    subscription = collection.subscribeChanges(tryResolve, {
      includeInitialState: true,
    });

    timeoutId = window.setTimeout(() => {
      settle(null);
    }, FIRST_PROJECT_LOOKUP_TIMEOUT_MS);

    tryResolve();
  });
}

export async function getFirstProjectDestination(
  setSelectedOrgId: (orgId: string | null) => void,
  savedOrgId?: string | null,
  savedProjectId?: string | null
): Promise<string | null> {
  try {
    const organizationsResponse = await organizationsApi.getUserOrganizations();
    const organizations = organizationsResponse.organizations ?? [];

    // Prefer saved org if it still exists, otherwise fall back to first org
    const savedOrg = savedOrgId
      ? organizations.find((org) => org.id === savedOrgId)
      : null;
    const resolvedOrg = savedOrg ?? getFirstOrganization(organizations);

    if (!resolvedOrg) {
      return null;
    }

    setSelectedOrgId(resolvedOrg.id);

    const projects = await getProjectsInOrganization(resolvedOrg.id);

    // If we have a saved project in the same saved org, use it if still valid
    if (savedProjectId && savedOrg && projects) {
      if (projects.some((p) => p.id === savedProjectId)) {
        return `/projects/${savedProjectId}`;
      }
    }

    // Fall back to first project by sort order
    const firstProject = projects ? getFirstProjectByOrder(projects) : null;
    if (!firstProject) {
      return null;
    }

    return `/projects/${firstProject.id}`;
  } catch (error) {
    console.error('Failed to resolve first project destination:', error);
    return null;
  }
}
