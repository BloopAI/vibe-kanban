import type { Project } from 'shared/remote-types';
import { type OrganizationWithRole } from 'shared/types';
import { organizationsApi, remoteProjectsApi } from '@/lib/api';
import { getFirstProjectByOrder } from '@/lib/projectOrder';

const NAV_DEBUG_PREFIX = '[NAV_DEBUG]';

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

  const firstNonPersonal = organizations.find(
    (organization) => !organization.is_personal
  );
  const selectedOrganization = firstNonPersonal ?? organizations[0];
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
  const projects = await remoteProjectsApi.listByOrganization(organizationId);
  const firstProject = getFirstProjectByOrder(projects);

  console.log(`${NAV_DEBUG_PREFIX} organization projects fetched`, {
    organizationId,
    projectCount: projects.length,
    projectIds: projects.map((project) => project.id),
    selectedProjectId: firstProject?.id ?? null,
  });

  return firstProject;
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
