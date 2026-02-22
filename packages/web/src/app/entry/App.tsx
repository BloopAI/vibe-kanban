import { RouterProvider } from '@tanstack/react-router';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { UserSystemProvider } from '@/app/providers/ConfigProvider';
import { ClickedElementsProvider } from '@/contexts/ClickedElementsProvider';
import { router } from '@/app/router';

function App() {
  return (
    <UserSystemProvider>
      <ClickedElementsProvider>
        <HotkeysProvider
          initiallyActiveScopes={['global', 'workspace', 'kanban', 'projects']}
        >
          <RouterProvider router={router} />
        </HotkeysProvider>
      </ClickedElementsProvider>
    </UserSystemProvider>
  );
}

export default App;
