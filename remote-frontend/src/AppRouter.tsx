import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import InvitationPage from './pages/InvitationPage'
import InvitationCompletePage from './pages/InvitationCompletePage'

const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">Vibe Kanban Remote</h1>
          <p className="text-gray-400">Frontend coming soon...</p>
        </div>
      </div>
    ),
  },
  {
    path: '/invitations/:token',
    element: <InvitationPage />,
  },
  {
    path: '/invitations/:token/complete',
    element: <InvitationCompletePage />,
  },
  {
    path: '*',
    element: (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">404</h1>
          <p className="text-gray-600 mt-2">Page not found</p>
        </div>
      </div>
    ),
  },
])

export default function AppRouter() {
  return <RouterProvider router={router} />
}
