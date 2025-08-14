import React, { useEffect } from 'react';
import { STYLE_MSG, StyleOverrideMessage, ThemeName } from '@/types/post-message';
import { useTheme } from '@/components/theme-provider';
import { ALLOWED_CSS_VARS, isValidCSSValue } from '@/utils/css-variables';
import { ThemeMode } from 'shared/types';

export interface StyleOverrideProviderProps {
  children: React.ReactNode;
}

// Convert ThemeName to ThemeMode for compatibility with existing ThemeProvider
function themeNameToThemeMode(themeName: ThemeName): ThemeMode {
  switch (themeName) {
    case 'system':
      return ThemeMode.SYSTEM;
    case 'light':
      return ThemeMode.LIGHT;
    case 'dark':
      return ThemeMode.DARK;
    case 'purple':
      return ThemeMode.PURPLE;
    case 'green':
      return ThemeMode.GREEN;
    case 'blue':
      return ThemeMode.BLUE;
    case 'orange':
      return ThemeMode.ORANGE;
    case 'red':
      return ThemeMode.RED;
    default:
      return ThemeMode.SYSTEM;
  }
}

export const StyleOverrideProvider: React.FC<StyleOverrideProviderProps> = ({ children }) => {
  const { setTheme } = useTheme();

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      // Basic message validation
      if (!event.data || event.data.type !== STYLE_MSG) {
        return;
      }

      // Origin validation (only if VITE_PARENT_ORIGIN is configured)
      const allowedOrigin = import.meta.env.VITE_PARENT_ORIGIN;
      if (allowedOrigin && event.origin !== allowedOrigin) {
        console.warn('[StyleOverride] Message from unauthorized origin:', event.origin);
        return;
      }

      try {
        const message = event.data as StyleOverrideMessage;
        
        if (message.payload.kind === 'theme') {
          const themeMode = themeNameToThemeMode(message.payload.theme);
          setTheme(themeMode);
          
          // Send acknowledgment back to parent
          if (event.source) {
            (event.source as Window).postMessage(
              { 
                type: 'VIBE_STYLE_OVERRIDE_ACK', 
                applied: true, 
                kind: 'theme',
                theme: message.payload.theme 
              },
              event.origin
            );
          }
        } else if (message.payload.kind === 'cssVars') {
          const appliedVars: string[] = [];
          const rejectedVars: string[] = [];
          
          Object.entries(message.payload.variables).forEach(([name, value]) => {
            // Security: Check if variable name is allowed
            if (!ALLOWED_CSS_VARS.has(name)) {
              rejectedVars.push(name);
              console.warn('[StyleOverride] Rejected unauthorized CSS variable:', name);
              return;
            }

            // Security: Validate CSS value format
            if (!isValidCSSValue(name, value)) {
              rejectedVars.push(name);
              console.warn('[StyleOverride] Rejected invalid CSS value:', name, value);
              return;
            }

            // Apply the CSS variable
            document.documentElement.style.setProperty(name, value);
            appliedVars.push(name);
          });

          // Send acknowledgment back to parent
          if (event.source) {
            (event.source as Window).postMessage(
              { 
                type: 'VIBE_STYLE_OVERRIDE_ACK', 
                applied: appliedVars.length > 0,
                kind: 'cssVars',
                appliedVariables: appliedVars,
                rejectedVariables: rejectedVars
              },
              event.origin
            );
          }
        }
      } catch (error) {
        console.error('[StyleOverride] Error processing message:', error);
        
        // Send error acknowledgment back to parent
        if (event.source) {
          (event.source as Window).postMessage(
            { 
              type: 'VIBE_STYLE_OVERRIDE_ACK', 
              applied: false,
              error: error instanceof Error ? error.message : 'Unknown error'
            },
            event.origin
          );
        }
      }
    };

    window.addEventListener('message', handler);
    
    return () => {
      window.removeEventListener('message', handler);
    };
  }, [setTheme]);

  return <>{children}</>;
};
