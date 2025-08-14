export const STYLE_MSG = 'VIBE_STYLE_OVERRIDE' as const;

export type ThemeName =
  | 'purple' 
  | 'green' 
  | 'blue'
  | 'orange' 
  | 'red'  
  | 'dark' 
  | 'light'
  | 'system';

export type StyleOverrideMessage =
  | { 
      type: typeof STYLE_MSG; 
      payload: { 
        kind: 'theme'; 
        theme: ThemeName 
      } 
    }
  | { 
      type: typeof STYLE_MSG; 
      payload: { 
        kind: 'cssVars'; 
        variables: Record<string, string> 
      } 
    };
