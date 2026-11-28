import { describe, it, expect } from 'vitest';
import { isDestinationAvailable } from './appNavigation';

const noCloud = { cloud: false, relay: false };
const cloudOnly = { cloud: true, relay: false };
const cloudAndRelay = { cloud: true, relay: true };

describe('isDestinationAvailable', () => {
  it('keeps local workspaces without a cloud', () => {
    expect(isDestinationAvailable({ kind: 'workspaces' }, noCloud)).toBe(true);
    expect(isDestinationAvailable({ kind: 'workspaces-create' }, noCloud)).toBe(
      true
    );
    expect(
      isDestinationAvailable({ kind: 'workspace', workspaceId: 'w1' }, noCloud)
    ).toBe(true);
  });

  it('hides cloud projects and export without a cloud', () => {
    expect(
      isDestinationAvailable({ kind: 'project', projectId: 'p1' }, noCloud)
    ).toBe(false);
    expect(
      isDestinationAvailable(
        { kind: 'project-issue', projectId: 'p1', issueId: 'i1' },
        noCloud
      )
    ).toBe(false);
    expect(isDestinationAvailable({ kind: 'export' }, noCloud)).toBe(false);
    expect(isDestinationAvailable({ kind: 'export' }, cloudOnly)).toBe(true);
  });

  it('needs the relay for another machine', () => {
    const remote = { kind: 'workspaces', hostId: 'h1' } as const;
    expect(isDestinationAvailable(remote, noCloud)).toBe(false);
    expect(isDestinationAvailable(remote, cloudOnly)).toBe(false);
    expect(isDestinationAvailable(remote, cloudAndRelay)).toBe(true);
  });
});
