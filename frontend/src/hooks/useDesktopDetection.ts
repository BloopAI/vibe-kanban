import { useState, useEffect } from 'react';
import { isDesktop } from '@/lib/desktop-api';

export const useDesktopDetection = () => {
  const [isDesktopEnv, setIsDesktopEnv] = useState(() => isDesktop());
  const [isReady] = useState(true);
  
  useEffect(() => {
    // Initial check
    const checkDesktop = () => {
      const desktop = isDesktop();
      setIsDesktopEnv(desktop);
      if (import.meta.env.DEV) {
        console.log('🔍 Desktop detection hook - isDesktop:', desktop);
      }
    };
    
    checkDesktop();
    
    // Only re-check if we haven't detected desktop yet
    if (!isDesktopEnv) {
      const interval = setInterval(() => {
        const desktop = isDesktop();
        if (desktop !== isDesktopEnv) {
          setIsDesktopEnv(desktop);
          if (import.meta.env.DEV) {
            console.log('🔄 Desktop detection changed to:', desktop);
          }
          clearInterval(interval);
        }
      }, 500);
      
      // Stop checking after 5 seconds
      setTimeout(() => {
        clearInterval(interval);
      }, 5000);
      
      return () => clearInterval(interval);
    }
  }, []);
  
  return { isDesktopEnv, isReady };
};
