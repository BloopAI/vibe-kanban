import { RouterProvider } from '@tanstack/react-router';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { UserSystemProvider } from '@/components/ConfigProvider';
import { ClickedElementsProvider } from './contexts/ClickedElementsProvider';
import { router } from './Router';

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
