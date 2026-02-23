import { RouterProvider } from '@tanstack/react-router';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { UserSystemProvider } from '@/app/providers/ConfigProvider';
import { ClickedElementsProvider } from '@/app/providers/ClickedElementsProvider';
import { LocalAuthProvider } from '@/shared/providers/auth/LocalAuthProvider';
import { router } from '@/app/router';

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
