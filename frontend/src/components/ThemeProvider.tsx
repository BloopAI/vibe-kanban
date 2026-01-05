import React, { createContext, useContext, useEffect, useState } from 'react';
import { ThemeMode } from 'shared/types';

type ThemeProviderProps = {
  children: React.ReactNode;
  initialTheme?: ThemeMode;
  initialFontFamily?: string | null;
};

type ThemeProviderState = {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  fontFamily: string | null;
  setFontFamily: (fontFamily: string | null) => void;
};

const initialState: ThemeProviderState = {
  theme: ThemeMode.SYSTEM,
  setTheme: () => null,
  fontFamily: null,
  setFontFamily: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  initialTheme = ThemeMode.SYSTEM,
  initialFontFamily = null,
  ...props
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemeMode>(initialTheme);
  const [fontFamily, setFontFamilyState] = useState<string | null>(
    initialFontFamily
  );

  // Update theme when initialTheme changes
  useEffect(() => {
    setThemeState(initialTheme);
  }, [initialTheme]);

  // Update font family when initialFontFamily changes
  useEffect(() => {
    setFontFamilyState(initialFontFamily);
  }, [initialFontFamily]);

  useEffect(() => {
    const root = window.document.documentElement;

    root.classList.remove('light', 'dark');

    if (theme === ThemeMode.SYSTEM) {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
        .matches
        ? 'dark'
        : 'light';

      root.classList.add(systemTheme);
      return;
    }

    root.classList.add(theme.toLowerCase());
  }, [theme]);

  // aplicar la fuente personalizada al body
  useEffect(() => {
    const body = window.document.body;

    if (fontFamily) {
      body.style.fontFamily = fontFamily;
    } else {
      // eliminar el estilo inline para volver a usar la fuente del tailwind config
      body.style.fontFamily = '';
    }
  }, [fontFamily]);

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
  };

  const setFontFamily = (newFontFamily: string | null) => {
    setFontFamilyState(newFontFamily);
  };

  const value = {
    theme,
    setTheme,
    fontFamily,
    setFontFamily,
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error('useTheme must be used within a ThemeProvider');

  return context;
};
