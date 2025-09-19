import { useEffect, useMemo, useState } from 'react';
import type {
  ExecutorAction,
  ExecutorConfig,
  ExecutionProcess,
  ExecutorProfileId,
} from 'shared/types';

type Args = {
  processes: ExecutionProcess[];
  profiles?: Record<string, ExecutorConfig> | null;
};

export function useDefaultVariant({ processes, profiles }: Args) {
  const latestProfileId = useMemo<ExecutorProfileId | null>(() => {
    if (!processes?.length) return null;

    // Walk processes from newest to oldest and extract the first executor_profile_id
    // from either the action itself or its next_action (when current is a ScriptRequest).
    const extractProfile = (
      action: ExecutorAction | null
    ): ExecutorProfileId | null => {
      let curr: ExecutorAction | null = action;
      while (curr) {
        const typ = curr.typ;
        switch (typ.type) {
          case 'CodingAgentInitialRequest':
          case 'CodingAgentFollowUpRequest':
            return typ.executor_profile_id;
          case 'ScriptRequest':
            curr = curr.next_action;
            continue;
        }
      }
      return null;
    };
    return (
      processes
        .slice()
        .reverse()
        .map((p) => extractProfile(p.executor_action ?? null))
        .find((pid) => pid !== null) ?? null
    );
  }, [processes]);

  const defaultFollowUpVariant = latestProfileId?.variant ?? null;

  const [selectedVariant, setSelectedVariant] = useState<string | null>(
    defaultFollowUpVariant
  );
  useEffect(
    () => setSelectedVariant(defaultFollowUpVariant),
    [defaultFollowUpVariant]
  );

  const currentProfile = useMemo(() => {
    if (!latestProfileId) return null;
    return profiles?.[latestProfileId.executor] ?? null;
  }, [latestProfileId, profiles]);

  return { selectedVariant, setSelectedVariant, currentProfile } as const;
}
