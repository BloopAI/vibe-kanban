import { describe, it, expect, vi } from 'vitest';
import { getRootDestination } from './rootDestination';

const projectLookup = () =>
  vi.fn(async () => ({ kind: 'project' as const, projectId: 'p1' }));

describe('getRootDestination', () => {
  it('goes straight to local workspaces when no cloud is configured', async () => {
    const lookup = projectLookup();

    await expect(
      getRootDestination(
        {
          onboardingAcknowledged: true,
          isSignedIn: false,
          cloudAvailable: false,
        },
        lookup
      )
    ).resolves.toEqual({ kind: 'workspaces-create' });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('never looks up cloud projects without a cloud, even with old credentials', async () => {
    const lookup = projectLookup();

    await expect(
      getRootDestination(
        {
          onboardingAcknowledged: true,
          isSignedIn: true,
          cloudAvailable: false,
        },
        lookup
      )
    ).resolves.toEqual({ kind: 'workspaces-create' });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('sends unfinished onboarding to onboarding first', async () => {
    const lookup = projectLookup();

    await expect(
      getRootDestination(
        {
          onboardingAcknowledged: false,
          isSignedIn: false,
          cloudAvailable: false,
        },
        lookup
      )
    ).resolves.toEqual({ kind: 'onboarding' });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('opens the first cloud project for a signed-in self-hoster', async () => {
    const lookup = projectLookup();

    await expect(
      getRootDestination(
        {
          onboardingAcknowledged: true,
          isSignedIn: true,
          cloudAvailable: true,
        },
        lookup
      )
    ).resolves.toEqual({ kind: 'project', projectId: 'p1' });
    expect(lookup).toHaveBeenCalledOnce();
  });

  it('falls back to local workspaces when the cloud has no project', async () => {
    await expect(
      getRootDestination(
        {
          onboardingAcknowledged: true,
          isSignedIn: true,
          cloudAvailable: true,
        },
        async () => null
      )
    ).resolves.toEqual({ kind: 'workspaces-create' });
  });

  it('does not look up projects for a signed-out self-hoster', async () => {
    const lookup = projectLookup();

    await expect(
      getRootDestination(
        {
          onboardingAcknowledged: true,
          isSignedIn: false,
          cloudAvailable: true,
        },
        lookup
      )
    ).resolves.toEqual({ kind: 'workspaces-create' });
    expect(lookup).not.toHaveBeenCalled();
  });
});
