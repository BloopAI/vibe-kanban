import { useCallback } from 'react';
import {
  useRouter,
  useSearch,
  type NavigateOptions,
  type RegisteredRouter,
} from '@tanstack/react-router';

type NavigateWithSearchArg = NavigateOptions<
  RegisteredRouter,
  string,
  string,
  string,
  string
>;

function toSearchRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

/**
 * Imperative navigation helper that preserves current search params by default.
 *
 * - If caller provides `search`, that value wins.
 * - If caller omits `search`, current search params are retained.
 * - Numeric navigation uses the router history API.
 */
export function useNavigateWithSearch() {
  const router = useRouter();
  const currentSearch = toSearchRecord(useSearch({ strict: false }));

  return useCallback(
    (target: NavigateWithSearchArg | number) => {
      if (typeof target === 'number') {
        if (target === -1) {
          router.history.back();
          return;
        }

        router.history.go(target);
        return;
      }

      if (target.search !== undefined) {
        void router.navigate(target);
        return;
      }

      void router.navigate({
        ...target,
        search: (prev: Record<string, unknown>) => ({
          ...toSearchRecord(prev),
          ...currentSearch,
        }),
      });
    },
    [router, currentSearch]
  );
}
