import type { Project } from 'shared/remote-types';
import { type OrganizationWithRole } from 'shared/types';
import { handleApiResponse, organizationsApi } from '@/lib/api';
import { getFirstProjectByOrder } from '@/lib/projectOrder';

type ListRemoteProjectsResponse = {
  projects: Project[];
};

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
  const response = await fetch(
    `/api/remote/projects?organization_id=${encodeURIComponent(organizationId)}`
  );
  const { projects } =
    await handleApiResponse<ListRemoteProjectsResponse>(response);
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
