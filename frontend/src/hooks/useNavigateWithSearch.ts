import { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

/**
 * Parsed path components from a URL string
 */
interface ParsedPath {
  pathname: string;
  search: string;
  hash: string;
}

/**
 * Parses a path string into its components (pathname, search, hash).
 *
 * @example
 * parsePath('/projects/123?tab=settings#section')
 * // Returns: { pathname: '/projects/123', search: '?tab=settings', hash: '#section' }
 */
function parsePath(path: string): ParsedPath {
  const hashIndex = path.indexOf('#');
  const searchIndex = path.indexOf('?');

  let pathname = path;
  let search = '';
  let hash = '';

  // Extract hash first (always at the end)
  if (hashIndex !== -1) {
    hash = path.slice(hashIndex);
    pathname = path.slice(0, hashIndex);
  }

  // Extract search params (between pathname and hash)
  if (searchIndex !== -1 && (hashIndex === -1 || searchIndex < hashIndex)) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex);
  }

  return { pathname, search, hash };
}

/**
 * Navigation target - can be a string path, numeric delta, or path object
 */
type NavigateTo =
  | string
  | number
  | Partial<{ pathname: string; search: string; hash: string }>;

/**
 * Options for navigation
 */
interface NavigateOptions {
  replace?: boolean;
  state?: any;
}

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
 * // Preserves current search params
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
 * // Object-style navigation
 * navigate({ pathname: '/projects/123', search: '?tab=settings' });
 * // Result: /projects/123?tab=settings
 *
 * // Numeric navigation (back/forward)
 * navigate(-1); // Goes back
 */
export function useNavigateWithSearch() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  return useCallback(
    (to: NavigateTo, options?: NavigateOptions) => {
      // Handle numeric navigation (back/forward)
      if (typeof to === 'number') {
        navigate(to);
        return;
      }

      // Handle object-style navigation
      if (typeof to === 'object') {
        // Only add current search params if none provided
        const currentSearch = searchParams.toString();
        const finalTo = {
          pathname: to.pathname || '',
          search:
            to.search !== undefined
              ? to.search
              : currentSearch
                ? `?${currentSearch}`
                : '',
          hash: to.hash || '',
        };
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
  );
}
