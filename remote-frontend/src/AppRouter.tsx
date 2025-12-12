import { createBrowserRouter, RouterProvider } from "react-router-dom";
import HomePage from "./pages/HomePage";
import InvitationPage from "./pages/InvitationPage";
import InvitationCompletePage from "./pages/InvitationCompletePage";
import ReviewPage from "./pages/ReviewPage";
import DiffReviewPage from "./pages/DiffReviewPage";
import NotFoundPage from "./pages/NotFoundPage";

const router = createBrowserRouter([
  {
    path: "/",
    element: <HomePage />,
  },
  {
    path: "/review/:id",
    element: <ReviewPage />,
  },
  {
    path: "/review/:id/diff",
    element: <DiffReviewPage />,
  },
  {
    path: "/invitations/:token/accept",
    element: <InvitationPage />,
  },
  {
    path: "/invitations/:token/complete",
    element: <InvitationCompletePage />,
  },
  {
    path: "*",
    element: <NotFoundPage />,
  },
]);

export default function AppRouter() {
  return <RouterProvider router={router} />;
}
