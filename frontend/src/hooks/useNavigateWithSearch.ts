import { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

/**
 * Custom hook that wraps React Router's useNavigate to automatically preserve
 * search parameters (like ?view=preview or ?view=diffs) during navigation.
 *
 * This ensures that fullscreen modes and other URL state are maintained when
 * navigating between routes.
 *
 * @example
 * const navigate = useNavigateWithSearch();
 * navigate('/projects/123/tasks');  // Preserves current search params
 * navigate('/projects/123/tasks', { replace: true });
 */
export function useNavigateWithSearch() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  return useCallback(
    (
      pathname: string | number,
      options?: { replace?: boolean; state?: any }
    ) => {
      // If pathname is a number (for navigate(-1), navigate(1), etc.), use it directly
      if (typeof pathname === 'number') {
        navigate(pathname);
        return;
      }

      // Otherwise, preserve search parameters
      const search = searchParams.toString();
      navigate(
        {
          pathname,
          search: search ? `?${search}` : '',
        },
        options
      );
    },
    [navigate, searchParams]
  );
}
