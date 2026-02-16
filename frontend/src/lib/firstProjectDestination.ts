import type { Project } from 'shared/remote-types';
import { type OrganizationWithRole } from 'shared/types';
import { organizationsApi, remoteProjectsApi } from '@/lib/api';
import { getFirstProjectByOrder } from '@/lib/projectOrder';

function getFirstOrganization(
  organizations: OrganizationWithRole[]
): OrganizationWithRole | null {
  if (organizations.length === 0) {
    return null;
  }

  const firstNonPersonal = organizations.find(
    (organization) => !organization.is_personal
  );
  return firstNonPersonal ?? organizations[0];
}

async function getFirstProjectInOrganization(
  organizationId: string
): Promise<Project | null> {
  const projects = await remoteProjectsApi.listByOrganization(organizationId);
  return getFirstProjectByOrder(projects);
}

export async function getFirstProjectDestination(
  setSelectedOrgId: (orgId: string | null) => void
): Promise<string | null> {
  try {
    const organizationsResponse = await organizationsApi.getUserOrganizations();
    const firstOrganization = getFirstOrganization(
      organizationsResponse.organizations ?? []
    );

    if (!firstOrganization) {
      return null;
    }

    setSelectedOrgId(firstOrganization.id);

    const firstProject = await getFirstProjectInOrganization(
      firstOrganization.id
    );
    if (!firstProject) {
      return null;
    }

    return `/projects/${firstProject.id}`;
  } catch (error) {
    console.error('Failed to resolve first project destination:', error);
    return null;
  }
}
