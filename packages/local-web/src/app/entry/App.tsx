import { RouterProvider } from '@tanstack/react-router';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { UserSystemProvider } from '@web/app/providers/ConfigProvider';
import { ClickedElementsProvider } from '@web/app/providers/ClickedElementsProvider';
import { LocalAuthProvider } from '@/shared/providers/auth/LocalAuthProvider';
import { router } from '@web/app/router';

function App() {
  return (
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
  );
}

export default App;
