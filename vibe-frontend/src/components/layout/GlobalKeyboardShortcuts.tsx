import { useNavigate } from 'react-router-dom';
import { useSidebar } from '@/contexts/SidebarContext';
import {
  useKeyToggleSidebar,
  useKeyGoInbox,
  useKeyGoMyIssues,
  useKeyGoProjects,
  useKeyCommandPalette,
} from '@/keyboard';
import { Scope } from '@/keyboard/registry';

/**
 * Global keyboard shortcuts handler component.
 * This component registers global keyboard shortcuts for sidebar navigation.
 * Include this component once at the app root level.
 */
export function GlobalKeyboardShortcuts() {
  const navigate = useNavigate();
  const { toggleCollapsed } = useSidebar();

  // Toggle sidebar: Cmd/Ctrl + \
  useKeyToggleSidebar(
    () => {
      toggleCollapsed();
    },
    { scope: Scope.GLOBAL, preventDefault: true }
  );

  // Go to Inbox: G then I
  useKeyGoInbox(
    () => {
      navigate('/inbox');
    },
    { scope: Scope.GLOBAL }
  );

  // Go to My Issues: G then M
  useKeyGoMyIssues(
    () => {
      navigate('/my-issues');
    },
    { scope: Scope.GLOBAL }
  );

  // Go to Projects: G then P
  useKeyGoProjects(
    () => {
      navigate('/projects');
    },
    { scope: Scope.GLOBAL }
  );

  // Command palette: Cmd/Ctrl + K
  useKeyCommandPalette(
    (e) => {
      e?.preventDefault();
      // TODO: Open command palette when implemented
      // For now, focus on workspace switcher search or show a toast
      console.log('Command palette triggered - to be implemented');
    },
    { scope: Scope.GLOBAL, preventDefault: true }
  );

  // This component doesn't render anything visible
  return null;
}
