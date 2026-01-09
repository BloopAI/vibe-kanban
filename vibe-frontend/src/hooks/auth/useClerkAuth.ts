/**
 * Wrapper hook for Clerk's useAuth that works safely when Clerk is not configured.
 *
 * When VITE_CLERK_PUBLISHABLE_KEY is not set, the app renders without ClerkProvider,
 * and calling Clerk hooks directly would crash. This wrapper provides safe fallbacks.
 */

// Check if Clerk is configured at module level (before any hooks are called)
const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const hasClerk = !!CLERK_PUBLISHABLE_KEY;

// Define the return type to match what our hooks need from Clerk's useAuth
export interface ClerkAuthReturn {
  getToken: () => Promise<string | null>;
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
}

// Stub implementation for when Clerk is not configured
const noopClerkAuth: ClerkAuthReturn = {
  getToken: async () => null,
  isLoaded: true,
  isSignedIn: false,
  userId: null,
};

// Implementation function that will be set based on Clerk availability
let useClerkAuthImpl: () => ClerkAuthReturn;

if (hasClerk) {
  // Only import Clerk when it's configured (module-level check is safe)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useAuth } = require('@clerk/clerk-react');
  useClerkAuthImpl = () => {
    const auth = useAuth();
    return {
      getToken: auth.getToken,
      isLoaded: auth.isLoaded ?? true,
      isSignedIn: !!auth.isSignedIn,
      userId: auth.userId ?? null,
    };
  };
} else {
  // Return safe defaults when Clerk is not available
  useClerkAuthImpl = () => noopClerkAuth;
}

/**
 * Safe wrapper for Clerk's useAuth hook.
 *
 * Use this instead of importing useAuth directly from @clerk/clerk-react
 * in any hook that might be called when ClerkProvider is not rendered.
 */
export function useClerkAuth(): ClerkAuthReturn {
  return useClerkAuthImpl();
}

// Define the return type for useClerkUser (subset of Clerk's useUser return)
export interface ClerkUserReturn {
  user: {
    id: string;
    primaryEmailAddress?: { emailAddress: string } | null;
    fullName: string | null;
    firstName: string | null;
    imageUrl: string | null;
  } | null;
  isLoaded: boolean;
  isSignedIn: boolean;
}

// Stub for when Clerk is not configured
const noopClerkUser: ClerkUserReturn = {
  user: null,
  isLoaded: true,
  isSignedIn: false,
};

// Implementation for useClerkUser
let useClerkUserImpl: () => ClerkUserReturn;

if (hasClerk) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useUser } = require('@clerk/clerk-react');
  useClerkUserImpl = () => {
    const { user, isLoaded, isSignedIn } = useUser();
    return {
      user: user
        ? {
            id: user.id,
            primaryEmailAddress: user.primaryEmailAddress,
            fullName: user.fullName,
            firstName: user.firstName,
            imageUrl: user.imageUrl,
          }
        : null,
      isLoaded: isLoaded ?? true,
      isSignedIn: !!isSignedIn,
    };
  };
} else {
  useClerkUserImpl = () => noopClerkUser;
}

/**
 * Safe wrapper for Clerk's useUser hook.
 *
 * Use this instead of importing useUser directly from @clerk/clerk-react
 * in any hook that might be called when ClerkProvider is not rendered.
 */
export function useClerkUser(): ClerkUserReturn {
  return useClerkUserImpl();
}
