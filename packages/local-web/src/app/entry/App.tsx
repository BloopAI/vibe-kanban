import { RouterProvider } from '@tanstack/react-router';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { UserSystemProvider } from '@web/app/providers/ConfigProvider';
import { ClickedElementsProvider } from '@web/app/providers/ClickedElementsProvider';
import { LocalAuthProvider } from '@/shared/providers/auth/LocalAuthProvider';
import { AppRuntimeProvider } from '@/shared/hooks/useAppRuntime';
import { AppNavigationProvider } from '@/shared/hooks/useAppNavigation';
import {
  type AppNavigation,
  resolveAppNavigationFromPath,
} from '@/shared/lib/routes/appNavigation';
import { router } from '@web/app/router';

function createLocalAppNavigation(): AppNavigation {
  const navigation: AppNavigation = {
    toRoot: () => ({ to: '/' }) as any,
    toOnboarding: () => ({ to: '/onboarding' }) as any,
    toOnboardingSignIn: () => ({ to: '/onboarding/sign-in' }) as any,
    toMigrate: () => ({ to: '/migrate' }) as any,
    toWorkspaces: () => ({ to: '/workspaces' }) as any,
    toWorkspacesCreate: () => ({ to: '/workspaces/create' }) as any,
    toWorkspace: (workspaceId) =>
      ({ to: '/workspaces/$workspaceId', params: { workspaceId } }) as any,
    toWorkspaceVsCode: (workspaceId) =>
      ({
        to: '/workspaces/$workspaceId/vscode',
        params: { workspaceId },
      }) as any,
    toProject: (projectId, search) =>
      ({
        to: '/projects/$projectId',
        params: { projectId },
        ...(search ? { search } : {}),
      }) as any,
    toProjectIssueCreate: (projectId, search) =>
      ({
        to: '/projects/$projectId/issues/new',
        params: { projectId },
        ...(search ? { search } : {}),
      }) as any,
    toProjectIssue: (projectId, issueId, search) =>
      ({
        to: '/projects/$projectId/issues/$issueId',
        params: { projectId, issueId },
        ...(search ? { search } : {}),
      }) as any,
    toProjectIssueWorkspace: (projectId, issueId, workspaceId, search) =>
      ({
        to: '/projects/$projectId/issues/$issueId/workspaces/$workspaceId',
        params: { projectId, issueId, workspaceId },
        ...(search ? { search } : {}),
      }) as any,
    toProjectIssueWorkspaceCreate: (projectId, issueId, draftId, search) =>
      ({
        to: '/projects/$projectId/issues/$issueId/workspaces/create/$draftId',
        params: { projectId, issueId, draftId },
        ...(search ? { search } : {}),
      }) as any,
    toProjectWorkspaceCreate: (projectId, draftId, search) =>
      ({
        to: '/projects/$projectId/workspaces/create/$draftId',
        params: { projectId, draftId },
        ...(search ? { search } : {}),
      }) as any,
    fromPath: (path) => resolveAppNavigationFromPath(path, navigation),
  };

  return navigation;
}

const localAppNavigation = createLocalAppNavigation();

function App() {
  return (
    <AppRuntimeProvider runtime="local">
      <AppNavigationProvider value={localAppNavigation}>
        <UserSystemProvider>
          <LocalAuthProvider>
            <ClickedElementsProvider>
              <HotkeysProvider
                initiallyActiveScopes={[
                  'global',
                  'workspace',
                  'kanban',
                  'projects',
                ]}
              >
                <RouterProvider router={router} />
              </HotkeysProvider>
            </ClickedElementsProvider>
          </LocalAuthProvider>
        </UserSystemProvider>
      </AppNavigationProvider>
    </AppRuntimeProvider>
  );
}

export default App;
