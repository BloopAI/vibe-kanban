import { Navigate } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import { Loader } from '@/components/ui/loader';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

// Check if Clerk is configured (evaluated once at module load)
const CLERK_ENABLED = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

/**
 * Wraps routes that require authentication.
 * - If user is authenticated via Clerk: renders children
 * - If user is not authenticated: redirects to /about
 * - While loading: shows loading spinner
 * - If Clerk is not configured: allows access (local dev mode)
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  // If Clerk is not enabled, allow access without auth check
  if (!CLERK_ENABLED) {
    return <>{children}</>;
  }

  return <ClerkProtectedRoute>{children}</ClerkProtectedRoute>;
}

/**
 * Internal component that uses Clerk hooks (only rendered when Clerk is enabled)
 */
function ClerkProtectedRoute({ children }: ProtectedRouteProps) {
  const { isSignedIn, isLoaded } = useUser();

  // Show loader while Clerk is loading
  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader message="Loading..." size={32} />
      </div>
    );
  }

  // If user is not signed in, redirect to about page
  if (!isSignedIn) {
    return <Navigate to="/about" replace />;
  }

  // User is authenticated, render the protected content
  return <>{children}</>;
}
