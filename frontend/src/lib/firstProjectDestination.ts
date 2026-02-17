import { PROJECTS_SHAPE, type Project } from 'shared/remote-types';
import { type OrganizationWithRole } from 'shared/types';
import { organizationsApi } from '@/lib/api';
import { createShapeCollection } from '@/lib/electric/collections';
import { getFirstProjectByOrder } from '@/lib/projectOrder';

const NAV_DEBUG_PREFIX = '[NAV_DEBUG]';
const FIRST_PROJECT_LOOKUP_TIMEOUT_MS = 3000;

function getFirstOrganization(
  organizations: OrganizationWithRole[]
): OrganizationWithRole | null {
  console.log(`${NAV_DEBUG_PREFIX} user organizations fetched`, {
    count: organizations.length,
    organizations: organizations.map((organization) => ({
      id: organization.id,
      name: organization.name,
      isPersonal: organization.is_personal,
    })),
  });

  if (organizations.length === 0) {
    console.log(`${NAV_DEBUG_PREFIX} no organizations available`);
    return null;
  }

  const selectedOrganization = organizations[0];
  console.log(`${NAV_DEBUG_PREFIX} selected organization for redirect`, {
    id: selectedOrganization.id,
    name: selectedOrganization.name,
    isPersonal: selectedOrganization.is_personal,
  });
  return selectedOrganization;
}

async function getFirstProjectInOrganization(
  organizationId: string
): Promise<Project | null> {
  const collection = createShapeCollection(PROJECTS_SHAPE, {
    organization_id: organizationId,
  });

  const getCollectionProjects = () =>
    collection.toArray as unknown as Project[];

  if (collection.isReady()) {
    const projects = getCollectionProjects();
    const firstProject = getFirstProjectByOrder(projects);

    console.log(`${NAV_DEBUG_PREFIX} organization projects fetched`, {
      organizationId,
      source: 'electric-ready',
      projectCount: projects.length,
      projectIds: projects.map((project) => project.id),
      selectedProjectId: firstProject?.id ?? null,
    });

    return firstProject;
  }

  return new Promise<Project | null>((resolve) => {
    let settled = false;
    let timeoutId: number | undefined;
    let subscription: { unsubscribe: () => void } | undefined;

    const settle = (project: Project | null) => {
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

      resolve(project);
    };

    const tryResolve = () => {
      if (!collection.isReady()) {
        return;
      }

      const projects = getCollectionProjects();
      const firstProject = getFirstProjectByOrder(projects);

      console.log(`${NAV_DEBUG_PREFIX} organization projects fetched`, {
        organizationId,
        source: 'electric-sync',
        projectCount: projects.length,
        projectIds: projects.map((project) => project.id),
        selectedProjectId: firstProject?.id ?? null,
      });

      settle(firstProject);
    };

    subscription = collection.subscribeChanges(tryResolve, {
      includeInitialState: true,
    });

    timeoutId = window.setTimeout(() => {
      console.log(
        `${NAV_DEBUG_PREFIX} project lookup timed out while waiting for Electric sync`,
        {
          organizationId,
          timeoutMs: FIRST_PROJECT_LOOKUP_TIMEOUT_MS,
        }
      );
      settle(null);
    }, FIRST_PROJECT_LOOKUP_TIMEOUT_MS);

    tryResolve();
  });
}

export async function getFirstProjectDestination(
  setSelectedOrgId: (orgId: string | null) => void
): Promise<string | null> {
  try {
    console.log(`${NAV_DEBUG_PREFIX} resolving first project destination`);
    const organizationsResponse = await organizationsApi.getUserOrganizations();
    const firstOrganization = getFirstOrganization(
      organizationsResponse.organizations ?? []
    );

    if (!firstOrganization) {
      console.log(
        `${NAV_DEBUG_PREFIX} returning null destination because no organization was found`
      );
      return null;
    }

    setSelectedOrgId(firstOrganization.id);

    const firstProject = await getFirstProjectInOrganization(
      firstOrganization.id
    );
    if (!firstProject) {
      console.log(
        `${NAV_DEBUG_PREFIX} returning null destination because no project was found`
      );
      return null;
    }

    const destination = `/projects/${firstProject.id}`;
    console.log(`${NAV_DEBUG_PREFIX} resolved destination`, {
      destination,
    });
    return destination;
  } catch (error) {
    console.error(
      `${NAV_DEBUG_PREFIX} failed to resolve first project destination`,
      error
    );
    return null;
  }
}
