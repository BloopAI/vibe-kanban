import { useEffect } from 'react';
import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { zodValidator } from '@tanstack/zod-adapter';
import { z } from 'zod';
import { I18nextProvider } from 'react-i18next';
import { usePostHog } from 'posthog-js/react';
import { ThemeMode } from 'shared/types';
import i18n from '@/i18n';
import { useUserSystem } from '@/components/ConfigProvider';
import { ThemeProvider } from '@/components/ThemeProvider';
import { usePreviousPath } from '@/hooks/usePreviousPath';
import { useUiPreferencesScratch } from '@/hooks/useUiPreferencesScratch';
import { ReleaseNotesDialog } from '@/components/dialogs/global/ReleaseNotesDialog';
import { NewDesignScope } from '@/components/ui-new/scope/NewDesignScope';
import { VSCodeScope } from '@/components/ui-new/scope/VSCodeScope';
import { TerminalProvider } from '@/contexts/TerminalContext';
import { SharedAppLayout } from '@/components/ui-new/containers/SharedAppLayout';
import { LandingPage } from '@/pages/ui-new/LandingPage';
import { OnboardingSignInPage } from '@/pages/ui-new/OnboardingSignInPage';
import { RootRedirectPage } from '@/pages/ui-new/RootRedirectPage';
import { VSCodeWorkspacePage } from '@/pages/ui-new/VSCodeWorkspacePage';
import { WorkspacesLanding } from '@/pages/ui-new/WorkspacesLanding';
import { Workspaces } from '@/pages/ui-new/Workspaces';
import { ElectricTestPage } from '@/pages/ui-new/ElectricTestPage';
import { ProjectKanban } from '@/pages/ui-new/ProjectKanban';
import { MigratePage } from '@/pages/ui-new/MigratePage';
import { useLocation } from '@tanstack/react-router';

const projectSearchSchema = z.object({
  statusId: z.string().optional(),
  priority: z.string().optional(),
  assignees: z.string().optional(),
  parentIssueId: z.string().optional(),
  mode: z.string().optional(),
  orgId: z.string().optional(),
});

const projectSearchValidator = zodValidator(projectSearchSchema);

function RootRouteComponent() {
  const { config, analyticsUserId, updateAndSaveConfig } = useUserSystem();
  const posthog = usePostHog();
  const location = useLocation();

  usePreviousPath();
  useUiPreferencesScratch();

  useEffect(() => {
    if (!posthog || !analyticsUserId) return;

    if (config?.analytics_enabled) {
      posthog.opt_in_capturing();
      posthog.identify(analyticsUserId);
      console.log('[Analytics] Analytics enabled and user identified');
    } else {
      posthog.opt_out_capturing();
      console.log('[Analytics] Analytics disabled by user preference');
    }
  }, [config?.analytics_enabled, analyticsUserId, posthog]);

  useEffect(() => {
    if (!config || !config.remote_onboarding_acknowledged) return;

    const pathname = location.pathname;
    if (pathname.startsWith('/onboarding') || pathname.startsWith('/migrate')) {
      return;
    }

    let cancelled = false;

    const showReleaseNotes = async () => {
      if (config.show_release_notes) {
        await ReleaseNotesDialog.show();
        if (!cancelled) {
          await updateAndSaveConfig({ show_release_notes: false });
        }
        ReleaseNotesDialog.hide();
      }
    };

    void showReleaseNotes();

    return () => {
      cancelled = true;
    };
  }, [config, updateAndSaveConfig, location.pathname]);

  return (
    <I18nextProvider i18n={i18n}>
      <ThemeProvider initialTheme={config?.theme || ThemeMode.SYSTEM}>
        <Outlet />
      </ThemeProvider>
    </I18nextProvider>
  );
}

function RootRedirectRouteComponent() {
  return (
    <NewDesignScope>
      <RootRedirectPage />
    </NewDesignScope>
  );
}

function OnboardingLandingRouteComponent() {
  return (
    <NewDesignScope>
      <LandingPage />
    </NewDesignScope>
  );
}

function OnboardingSignInRouteComponent() {
  return (
    <NewDesignScope>
      <OnboardingSignInPage />
    </NewDesignScope>
  );
}

function VSCodeWorkspaceRouteComponent() {
  return (
    <VSCodeScope>
      <TerminalProvider>
        <VSCodeWorkspacePage />
      </TerminalProvider>
    </VSCodeScope>
  );
}

function AppLayoutRouteComponent() {
  return (
    <NewDesignScope>
      <TerminalProvider>
        <SharedAppLayout />
      </TerminalProvider>
    </NewDesignScope>
  );
}

export const rootRoute = createRootRoute({
  component: RootRouteComponent,
});

export const rootRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: RootRedirectRouteComponent,
});

export const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'onboarding',
  component: OnboardingLandingRouteComponent,
});

export const onboardingSignInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'onboarding/sign-in',
  component: OnboardingSignInRouteComponent,
});

export const vscodeWorkspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'workspaces/$workspaceId/vscode',
  component: VSCodeWorkspaceRouteComponent,
});

export const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'appLayout',
  component: AppLayoutRouteComponent,
});

export const workspacesLandingRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: 'workspaces',
  component: WorkspacesLanding,
});

export const workspacesCreateRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: 'workspaces/create',
  component: Workspaces,
});

export const electricTestRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: 'workspaces/electric-test',
  component: ElectricTestPage,
});

export const workspaceRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: 'workspaces/$workspaceId',
  component: Workspaces,
});

export const projectKanbanRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: 'projects/$projectId',
  validateSearch: projectSearchValidator,
  component: ProjectKanban,
});

export const projectIssueCreateRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: 'projects/$projectId/issues/new',
  validateSearch: projectSearchValidator,
  component: ProjectKanban,
});

export const projectIssueRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: 'projects/$projectId/issues/$issueId',
  validateSearch: projectSearchValidator,
  component: ProjectKanban,
});

export const projectIssueWorkspaceRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: 'projects/$projectId/issues/$issueId/workspaces/$workspaceId',
  validateSearch: projectSearchValidator,
  component: ProjectKanban,
});

export const projectIssueWorkspaceCreateRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: 'projects/$projectId/issues/$issueId/workspaces/create/$draftId',
  validateSearch: projectSearchValidator,
  component: ProjectKanban,
});

export const projectWorkspaceCreateRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: 'projects/$projectId/workspaces/create/$draftId',
  validateSearch: projectSearchValidator,
  component: ProjectKanban,
});

export const migrateRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: 'migrate',
  component: MigratePage,
});

const routeTree = rootRoute.addChildren([
  rootRedirectRoute,
  onboardingRoute,
  onboardingSignInRoute,
  vscodeWorkspaceRoute,
  appLayoutRoute.addChildren([
    workspacesLandingRoute,
    workspacesCreateRoute,
    electricTestRoute,
    workspaceRoute,
    projectKanbanRoute,
    projectIssueCreateRoute,
    projectIssueRoute,
    projectIssueWorkspaceRoute,
    projectIssueWorkspaceCreateRoute,
    projectWorkspaceCreateRoute,
    migrateRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
