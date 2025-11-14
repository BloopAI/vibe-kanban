import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import HomePage from './pages/HomePage'
import InvitationPage from './pages/InvitationPage'
import InvitationCompletePage from './pages/InvitationCompletePage'
import NotFoundPage from './pages/NotFoundPage'

const router = createBrowserRouter([
  {
    path: '/',
    element: <HomePage />,
  },
  {
    path: '/invitations/:token/accept',
    element: <InvitationPage />,
  },
  {
    path: '/invitations/:token/complete',
    element: <InvitationCompletePage />,
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
])

export default function AppRouter() {
  return <RouterProvider router={router} />
}
