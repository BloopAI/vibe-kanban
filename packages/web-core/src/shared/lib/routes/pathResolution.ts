function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export interface ParsedAppPathname {
  hostId: string | null;
  segments: string[];
  offset: number;
}

export function parseAppPathname(pathname: string): ParsedAppPathname {
  const segments = pathname.split('/').filter(Boolean).map(decodePathSegment);
  const hostId = segments[0] === 'hosts' && segments[1] ? segments[1] : null;
  const offset = hostId ? 2 : 0;

  return { hostId, segments, offset };
}

export function isProjectPathname(pathname: string): boolean {
  const { segments, offset } = parseAppPathname(pathname);
  return segments[offset] === 'projects' && Boolean(segments[offset + 1]);
}

export function getProjectIdFromPathname(pathname: string): string | null {
  const { segments, offset } = parseAppPathname(pathname);
  if (segments[offset] !== 'projects' || !segments[offset + 1]) {
    return null;
  }

  return segments[offset + 1];
}

export function isWorkspacesPathname(pathname: string): boolean {
  const { segments, offset } = parseAppPathname(pathname);
  return segments[offset] === 'workspaces';
}

export function isWorkspacesCreatePathname(pathname: string): boolean {
  const { segments, offset } = parseAppPathname(pathname);
  return (
    segments.length === offset + 2 &&
    segments[offset] === 'workspaces' &&
    segments[offset + 1] === 'create'
  );
}
