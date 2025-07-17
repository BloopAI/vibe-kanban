import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { isDesktop } from '@/lib/desktop-api';

export const useDesktopShortcuts = () => {
  const navigate = useNavigate();
  
  useEffect(() => {
    if (!isDesktop()) return;
    
    const handleKeyDown = (event: KeyboardEvent) => {
      // Command/Ctrl key combinations
      const modifier = event.metaKey || event.ctrlKey;
      
      if (modifier) {
        switch (event.key) {
          case '1':
            event.preventDefault();
            navigate('/projects');
            break;
          case '2':
            event.preventDefault();
            navigate('/integrations');
            break;
          case '3':
            event.preventDefault();
            navigate('/mcp-servers');
            break;
          case '4':
            event.preventDefault();
            navigate('/settings');
            break;
          case 'n':
            event.preventDefault();
            // Trigger new project modal
            window.dispatchEvent(new CustomEvent('desktop:new-project'));
            break;
          case 't':
            event.preventDefault();
            // Trigger new task modal
            window.dispatchEvent(new CustomEvent('desktop:new-task'));
            break;
          case 'f': {
            event.preventDefault();
            // Focus search input
            const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
            if (searchInput) {
              searchInput.focus();
            }
            break;
          }
          case 'r':
            event.preventDefault();
            // Refresh page
            window.location.reload();
            break;
          case 'w':
            event.preventDefault();
            // Close window (minimize to tray)
            if ((window as unknown as { __TAURI__?: { window: { appWindow: { hide: () => void } } } }).__TAURI__) {
              (window as unknown as { __TAURI__: { window: { appWindow: { hide: () => void } } } }).__TAURI__.window.appWindow.hide();
            }
            break;
          case 'q':
            event.preventDefault();
            // Quit application
            if ((window as unknown as { __TAURI__?: { process: { exit: (code: number) => void } } }).__TAURI__) {
              (window as unknown as { __TAURI__: { process: { exit: (code: number) => void } } }).__TAURI__.process.exit(0);
            }
            break;
        }
      }
      
      // Escape key
      if (event.key === 'Escape') {
        // Close any open modals or dialogs
        const closeButtons = document.querySelectorAll('[data-radix-collection-item]');
        closeButtons.forEach(button => {
          if (button instanceof HTMLElement) {
            button.click();
          }
        });
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [navigate]);
};
