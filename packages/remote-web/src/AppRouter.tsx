import { RouterProvider } from '@tanstack/react-router';
import { router } from './Router';

export function AppRouter() {
  return <RouterProvider router={router} />;
}
