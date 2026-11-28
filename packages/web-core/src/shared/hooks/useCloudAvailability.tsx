import { type ReactNode, useContext } from 'react';
import { createHmrContext } from '@/shared/lib/hmrContext';

/**
 * Whether this app has a cloud (and a relay) to talk to.
 *
 * The hosted cloud has shut down, so a build may have no cloud address. The
 * local app learns it at runtime from `/api/info` (`shared_api_base` and
 * `shared_relay_api_base`), which self-hosters set with `VK_SHARED_API_BASE`
 * and `VK_SHARED_RELAY_API_BASE`. The remote web app is served by the cloud
 * itself, so it always has both.
 */
export interface CloudAvailability {
  cloud: boolean;
  relay: boolean;
}

export const NO_CLOUD: CloudAvailability = { cloud: false, relay: false };

function isSet(value: string | null | undefined): boolean {
  return !!value && value.trim() !== '';
}

export function getCloudAvailability(info: {
  shared_api_base?: string | null;
  shared_relay_api_base?: string | null;
}): CloudAvailability {
  const cloud = isSet(info.shared_api_base);
  return { cloud, relay: cloud && isSet(info.shared_relay_api_base) };
}

const CloudAvailabilityContext = createHmrContext<CloudAvailability>(
  'CloudAvailabilityContext',
  NO_CLOUD
);

export function CloudAvailabilityProvider({
  value,
  children,
}: {
  value: CloudAvailability;
  children: ReactNode;
}) {
  return (
    <CloudAvailabilityContext.Provider value={value}>
      {children}
    </CloudAvailabilityContext.Provider>
  );
}

/** True only when a cloud address is configured. Gate every cloud feature on this. */
export function useCloudAvailable(): boolean {
  return useContext(CloudAvailabilityContext).cloud;
}

/** True only when both a cloud and a relay address are configured. */
export function useRelayAvailable(): boolean {
  return useContext(CloudAvailabilityContext).relay;
}
