import type { AppDestination } from '@/shared/lib/routes/appNavigation';

export type RootDestination =
  | { kind: 'onboarding' }
  | { kind: 'workspaces-create' }
  | { kind: 'project'; projectId: string };

export interface RootDestinationInput {
  onboardingAcknowledged: boolean;
  isSignedIn: boolean;
  cloudAvailable: boolean;
}

/**
 * Where `/` sends the user. Without a cloud, go straight to local workspaces
 * and never look up cloud projects.
 */
export async function getRootDestination(
  { onboardingAcknowledged, isSignedIn, cloudAvailable }: RootDestinationInput,
  lookupFirstProject: () => Promise<AppDestination | null>
): Promise<RootDestination> {
  if (!onboardingAcknowledged) {
    return { kind: 'onboarding' };
  }

  if (!cloudAvailable || !isSignedIn) {
    return { kind: 'workspaces-create' };
  }

  const destination = await lookupFirstProject();
  if (destination?.kind === 'project') {
    return { kind: 'project', projectId: destination.projectId };
  }

  return { kind: 'workspaces-create' };
}
