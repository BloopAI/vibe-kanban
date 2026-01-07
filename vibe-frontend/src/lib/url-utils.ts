import type { Team, Project } from 'shared/types';

/**
 * Generate a URL-safe slug from a name
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Check if a string is a valid UUID
 */
export function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Get the URL slug for a team
 * Prefers the team's identifier if set, otherwise generates from name
 */
export function getTeamSlug(team: Team): string {
  return team.identifier || generateSlug(team.name);
}

/**
 * Get the URL slug for a project
 * Generates from the project name
 */
export function getProjectSlug(project: Project): string {
  return generateSlug(project.name);
}

/**
 * Resolve a team from a URL parameter (can be UUID or slug)
 */
export function resolveTeamFromParam(
  param: string,
  teams: Team[],
  teamsById: Record<string, Team>
): Team | undefined {
  // First try as UUID
  if (isUUID(param)) {
    return teamsById[param];
  }
  // Then try as identifier or generated slug
  return teams.find(
    (t) => t.identifier === param || generateSlug(t.name) === param
  );
}

/**
 * Resolve a project from a URL parameter (can be UUID or slug)
 */
export function resolveProjectFromParam(
  param: string,
  projects: Project[],
  projectsById: Record<string, Project>
): Project | undefined {
  // First try as UUID
  if (isUUID(param)) {
    return projectsById[param];
  }
  // Then try as generated slug
  return projects.find((p) => generateSlug(p.name) === param);
}
