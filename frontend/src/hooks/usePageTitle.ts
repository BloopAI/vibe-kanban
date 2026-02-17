import { useEffect } from 'react';

const BASE_TITLE = 'Vibe Kanban';

/**
 * Sets the document title. Resets to the base title on unmount.
 */
export function usePageTitle(...parts: (string | null | undefined)[]) {
  const filtered = parts.filter(Boolean) as string[];
  const title =
    filtered.length > 0
      ? `${filtered.join(' - ')} | ${BASE_TITLE}`
      : BASE_TITLE;

  useEffect(() => {
    document.title = title;
    return () => {
      document.title = BASE_TITLE;
    };
  }, [title]);
}
