import { BrowserRouter } from 'react-router-dom';
import { UserSystemProvider } from '@/components/ConfigProvider';

import { HotkeysProvider } from 'react-hotkeys-hook';

import { ProjectProvider } from '@/contexts/ProjectContext';
import { ClickedElementsProvider } from './contexts/ClickedElementsProvider';
import { AppContent } from '@/AppContent.tsx';

function App() {
  return (
    <BrowserRouter>
      <UserSystemProvider>
        <ClickedElementsProvider>
          <ProjectProvider>
            <HotkeysProvider
              initiallyActiveScopes={[
                'global',
                'workspace',
                'kanban',
                'projects',
              ]}
            >
              <AppContent />
            </HotkeysProvider>
          </ProjectProvider>
        </ClickedElementsProvider>
      </UserSystemProvider>
    </BrowserRouter>
  );
}

export default App;
