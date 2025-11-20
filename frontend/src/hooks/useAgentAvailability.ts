import { useEffect, useState } from 'react';
import { BaseCodingAgent } from 'shared/types';
import { configApi } from '../lib/api';

export type AgentAvailabilityState =
  | { status: 'checking' }
  | { status: 'login_detected'; lastModified: number }
  | { status: 'installation_found' }
  | { status: 'not_found' }
  | null;

export function useAgentAvailability(
  agent: BaseCodingAgent | null | undefined
): AgentAvailabilityState {
  const [availability, setAvailability] =
    useState<AgentAvailabilityState>(null);

  useEffect(() => {
    if (!agent) {
      setAvailability(null);
      return;
    }

    const checkAvailability = async () => {
      setAvailability({ status: 'checking' });
      try {
        const result = await configApi.checkAgentAvailability(agent);

        if (result.credential_last_modified !== null) {
          setAvailability({
            status: 'login_detected',
            lastModified: Number(result.credential_last_modified),
          });
        } else if (result.mcp_config_found) {
          setAvailability({ status: 'installation_found' });
        } else {
          setAvailability({ status: 'not_found' });
        }
      } catch (error) {
        console.error('Failed to check agent availability:', error);
        setAvailability(null);
      }
    };

    checkAvailability();
  }, [agent]);

  return availability;
}
