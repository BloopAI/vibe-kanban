import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import HomePage from "./pages/HomePage";
import ReviewPage from "./pages/ReviewPage";
import InvitationPage from "./pages/InvitationPage";
import InvitationCompletePage from "./pages/InvitationCompletePage";
import AccountPage from "./pages/AccountPage";
import AccountCompletePage from "./pages/AccountCompletePage";
import OrganizationPage from "./pages/OrganizationPage";
import UpgradePage from "./pages/UpgradePage";
import UpgradeCompletePage from "./pages/UpgradeCompletePage";
import UpgradeSuccessPage from "./pages/UpgradeSuccessPage";
import NotFoundPage from "./pages/NotFoundPage";

const oauthCallbackSearchSchema = z.object({
  handoff_id: z.string().optional(),
  app_code: z.string().optional(),
  error: z.string().optional(),
});

const organizationSearchSchema = z.object({
  github_app: z.string().optional(),
  github_app_error: z.string().optional(),
  billing: z.string().optional(),
});

const upgradeSearchSchema = z.object({
  org_id: z.string().optional(),
});

const rootRoute = createRootRoute({
  notFoundComponent: NotFoundPage,
});

export const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

export const reviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "review/$id",
  component: ReviewPage,
});

export const invitationAcceptRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "invitations/$token/accept",
  component: InvitationPage,
});

export const invitationCompleteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "invitations/$token/complete",
  validateSearch: zodValidator(oauthCallbackSearchSchema),
  component: InvitationCompletePage,
});

export const accountRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "account",
  component: AccountPage,
});

export const accountCompleteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "account/complete",
  validateSearch: zodValidator(oauthCallbackSearchSchema),
  component: AccountCompletePage,
});

export const organizationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "account/organizations/$orgId",
  validateSearch: zodValidator(organizationSearchSchema),
  component: OrganizationPage,
});

export const upgradeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "upgrade",
  validateSearch: zodValidator(upgradeSearchSchema),
  component: UpgradePage,
});

export const upgradeCompleteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "upgrade/complete",
  validateSearch: zodValidator(oauthCallbackSearchSchema),
  component: UpgradeCompletePage,
});

export const upgradeSuccessRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "upgrade/success",
  component: UpgradeSuccessPage,
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  reviewRoute,
  invitationAcceptRoute,
  invitationCompleteRoute,
  accountRoute,
  accountCompleteRoute,
  organizationRoute,
  upgradeRoute,
  upgradeCompleteRoute,
  upgradeSuccessRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
