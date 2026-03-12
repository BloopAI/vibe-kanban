export type HostRequestScope =
  | { kind: 'current' }
  | { kind: 'local' }
  | { kind: 'host'; hostId: string };

export function resolveHostRequestScope(
  hostId?: string | null
): HostRequestScope {
  if (hostId === undefined) {
    return { kind: 'current' };
  }

  if (hostId === null) {
    return { kind: 'local' };
  }

  return { kind: 'host', hostId };
}

export function getHostRequestScopeQueryKey(hostId?: string | null): string {
  const scope = resolveHostRequestScope(hostId);

  switch (scope.kind) {
    case 'current':
      return 'current';
    case 'local':
      return 'local';
    case 'host':
      return scope.hostId;
  }
}
