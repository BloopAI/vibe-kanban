import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks';
import { About } from '@/pages/About';

/**
 * Landing page that shows:
 * - About page for unauthenticated users (marketing/landing content)
 * - Redirects to /projects for authenticated users (dashboard)
 */
export function LandingPage() {
  const { isSignedIn, isLoaded } = useAuth();

  // Wait for auth to load before deciding
  if (!isLoaded) {
    return null;
  }

  // Authenticated users go to dashboard
  if (isSignedIn) {
    return <Navigate to="/projects" replace />;
  }

  // Unauthenticated users see the About/landing page
  return <About />;
}
