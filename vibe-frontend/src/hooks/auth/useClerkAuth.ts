/**
 * Wrapper hooks for Clerk's useAuth/useUser that work safely when Clerk is not configured.
 *
 * When VITE_CLERK_PUBLISHABLE_KEY is not set, the app renders without ClerkProvider,
 * and calling Clerk hooks directly would crash. This wrapper provides safe fallbacks.
 *
 * IMPORTANT: We use static imports here. The key insight is that when hasClerk is false,
 * we return the noop functions BEFORE calling the Clerk hooks, so they never execute.
 * This is safe because React hooks rules only apply to hooks that are actually called.
 */

import { useAuth, useUser } from '@clerk/clerk-react';

// Check if Clerk is configured at module level
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

/**
 * Safe wrapper for Clerk's useAuth hook.
 *
 * Use this instead of importing useAuth directly from @clerk/clerk-react
 * in any hook that might be called when ClerkProvider is not rendered.
 */
export function useClerkAuth(): ClerkAuthReturn {
  // Return noop BEFORE calling any hooks when Clerk is not configured
  if (!hasClerk) {
    return noopClerkAuth;
  }

  // Safe to call useAuth here because we're inside ClerkProvider when hasClerk is true
  const auth = useAuth();
  return {
    getToken: auth.getToken,
    isLoaded: auth.isLoaded ?? true,
    isSignedIn: !!auth.isSignedIn,
    userId: auth.userId ?? null,
  };
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

/**
 * Safe wrapper for Clerk's useUser hook.
 *
 * Use this instead of importing useUser directly from @clerk/clerk-react
 * in any hook that might be called when ClerkProvider is not rendered.
 */
export function useClerkUser(): ClerkUserReturn {
  // Return noop BEFORE calling any hooks when Clerk is not configured
  if (!hasClerk) {
    return noopClerkUser;
  }

  // Safe to call useUser here because we're inside ClerkProvider when hasClerk is true
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
}
