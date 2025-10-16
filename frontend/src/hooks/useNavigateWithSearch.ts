import { useCallback } from 'react';
import {
  useNavigate,
  useSearchParams,
  parsePath,
  type To,
  type NavigateOptions,
  type Path,
  type NavigateFunction,
} from 'react-router-dom';

/**
 * Custom hook that wraps React Router's useNavigate to automatically preserve
 * search parameters (like ?view=preview or ?view=diffs) during navigation.
 *
 * This ensures that fullscreen modes and other URL state are maintained when
 * navigating between routes, UNLESS the caller explicitly provides their own
 * search parameters.
 *
 * @example
 * // Current URL: /tasks?view=preview
 *
 * const navigate = useNavigateWithSearch();
 *
 * // Preserves current search params when navigating to new path
 * navigate('/projects/123/tasks');
 * // Result: /projects/123/tasks?view=preview
 *
 * // Caller's search params take precedence
 * navigate('/projects/123?tab=settings');
 * // Result: /projects/123?tab=settings
 *
 * // Preserves search params, adds hash
 * navigate('/projects/123#section');
 * // Result: /projects/123?view=preview#section
 *
 * // Caller's search and hash take precedence
 * navigate('/projects/123?tab=settings#section');
 * // Result: /projects/123?tab=settings#section
 *
 * // Change search params without changing pathname (stays on /tasks)
 * navigate({ search: '?view=diffs' });
 * // Result: /tasks?view=diffs
 *
 * // Object-style navigation with pathname
 * navigate({ pathname: '/projects/123', search: '?tab=settings' });
 * // Result: /projects/123?tab=settings
 *
 * // Numeric navigation (back/forward)
 * navigate(-1); // Goes back
 */
export function useNavigateWithSearch(): NavigateFunction {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  return useCallback(
    (to: To | number, options?: NavigateOptions) => {
      // Handle numeric navigation (back/forward)
      if (typeof to === 'number') {
        navigate(to);
        return;
      }

      // Handle object-style navigation
      if (typeof to === 'object') {
        // Only add current search params if none provided
        const currentSearch = searchParams.toString();

        // Build the final navigation object, preserving undefined values
        // so React Router can use current pathname/hash when not specified
        const finalTo: Partial<Path> = {};

        // Only set pathname if it was provided
        if (to.pathname !== undefined) {
          finalTo.pathname = to.pathname;
        }

        // Set search: use provided, or preserve current if not provided
        if (to.search !== undefined) {
          finalTo.search = to.search;
        } else if (currentSearch) {
          finalTo.search = `?${currentSearch}`;
        }

        // Only set hash if it was provided
        if (to.hash !== undefined) {
          finalTo.hash = to.hash;
        }

        navigate(finalTo, options);
        return;
      }

      // Handle string-style navigation - parse pathname?search#hash
      const parsed = parsePath(to);

      // Only preserve current search params if none provided in the path
      const currentSearch = searchParams.toString();
      const finalSearch = parsed.search
        ? parsed.search
        : currentSearch
          ? `?${currentSearch}`
          : '';

      navigate(
        {
          pathname: parsed.pathname,
          search: finalSearch,
          hash: parsed.hash,
        },
        options
      );
    },
    [navigate, searchParams]
  ) as NavigateFunction;
}
