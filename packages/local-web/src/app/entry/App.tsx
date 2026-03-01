import { RouterProvider } from '@tanstack/react-router';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { UserSystemProvider } from '@web/app/providers/ConfigProvider';
import { ClickedElementsProvider } from '@web/app/providers/ClickedElementsProvider';
import { LocalAuthProvider } from '@/shared/providers/auth/LocalAuthProvider';
import { AppRuntimeProvider } from '@/shared/hooks/useAppRuntime';
import { AppNavigationProvider } from '@/shared/hooks/useAppNavigation';
import { createLocalAppNavigation } from '@/shared/lib/routes/appNavigation';
import { router } from '@web/app/router';

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
