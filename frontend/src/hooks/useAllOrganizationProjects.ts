import { useState, useEffect, useMemo } from 'react';
import { createShapeCollection } from '@/lib/electric/collections';
import { PROJECTS_SHAPE, type Project } from 'shared/remote-types';
import { useAuth } from '@/hooks/auth/useAuth';
import { useUserOrganizations } from '@/hooks/useUserOrganizations';

/**
 * Hook that fetches remote projects across ALL user organizations.
 * Uses the raw collection API (createShapeCollection + subscribeChanges)
 * to avoid calling useShape in a loop (which would violate React hooks rules).
 *
 * Collections are cached by createShapeCollection (5-min GC),
 * so no duplicate syncs if the same org's projects are subscribed elsewhere.
 */
export function useAllOrganizationProjects() {
  const { isSignedIn } = useAuth();
  const { data: orgsData } = useUserOrganizations();

  // Stable org IDs list — only recompute when orgsData changes
  const orgIds = useMemo(
    () => (orgsData?.organizations ?? []).map((o) => o.id),
    [orgsData?.organizations]
  );

  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isSignedIn || orgIds.length === 0) {
      setProjects([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const subscriptions: { unsubscribe: () => void }[] = [];
    const projectsByOrg = new Map<string, Project[]>();

    const updateAggregated = () => {
      if (cancelled) return;
      setProjects(Array.from(projectsByOrg.values()).flat());
    };

    (async () => {
      for (const orgId of orgIds) {
        if (cancelled) return;
        const collection = await createShapeCollection(PROJECTS_SHAPE, {
          organization_id: orgId,
        });
        if (cancelled) return;

        if (collection.isReady()) {
          projectsByOrg.set(orgId, collection.toArray as unknown as Project[]);
        }

        const sub = collection.subscribeChanges(
          () => {
            projectsByOrg.set(
              orgId,
              collection.toArray as unknown as Project[]
            );
            updateAggregated();
            setIsLoading(false);
          },
          { includeInitialState: true }
        );
        subscriptions.push(sub);
      }

      updateAggregated();

      let allReady = true;
      for (const id of orgIds) {
        if (cancelled) return;
        const col = await createShapeCollection(PROJECTS_SHAPE, {
          organization_id: id,
        });
        if (!col.isReady()) {
          allReady = false;
          break;
        }
      }
      if (allReady && !cancelled) {
        setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      subscriptions.forEach((s) => s.unsubscribe());
    };
  }, [isSignedIn, orgIds]);

  return { data: projects, isLoading };
}
