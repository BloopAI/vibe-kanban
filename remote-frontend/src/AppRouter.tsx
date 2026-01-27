import { createBrowserRouter, RouterProvider } from "react-router-dom";
import HomePage from "./pages/HomePage";
import InvitationPage from "./pages/InvitationPage";
import InvitationCompletePage from "./pages/InvitationCompletePage";
import ReviewPage from "./pages/ReviewPage";
import AccountPage from "./pages/AccountPage";
import AccountCompletePage from "./pages/AccountCompletePage";
import OrganizationPage from "./pages/OrganizationPage";
import UpgradePage from "./pages/UpgradePage";
import UpgradeCompletePage from "./pages/UpgradeCompletePage";
import UpgradeSuccessPage from "./pages/UpgradeSuccessPage";
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
    path: "/invitations/:token/accept",
    element: <InvitationPage />,
  },
  {
    path: "/invitations/:token/complete",
    element: <InvitationCompletePage />,
  },
  {
    path: "/account",
    element: <AccountPage />,
  },
  {
    path: "/account/complete",
    element: <AccountCompletePage />,
  },
  {
    path: "/account/organizations/:orgId",
    element: <OrganizationPage />,
  },
  {
    path: "/upgrade",
    element: <UpgradePage />,
  },
  {
    path: "/upgrade/complete",
    element: <UpgradeCompletePage />,
  },
  {
    path: "/upgrade/success",
    element: <UpgradeSuccessPage />,
  },
  {
    path: "*",
    element: <NotFoundPage />,
  },
]);

export default function AppRouter() {
  return <RouterProvider router={router} />;
}
