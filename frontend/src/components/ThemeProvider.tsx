import React, { createContext, useContext, useEffect, useState } from 'react';
import { FontSize, ThemeMode } from 'shared/types';

const FONT_SCALE_VALUES: Record<FontSize, number> = {
  [FontSize.SMALL]: 0.9,
  [FontSize.MEDIUM]: 1.0,
  [FontSize.LARGE]: 1.1,
  [FontSize.EXTRA_LARGE]: 1.2,
};

type ThemeProviderProps = {
  children: React.ReactNode;
  initialTheme?: ThemeMode;
  initialFontSize?: FontSize;
};

type ThemeProviderState = {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
};

const initialState: ThemeProviderState = {
  theme: ThemeMode.SYSTEM,
  setTheme: () => null,
  fontSize: FontSize.MEDIUM,
  setFontSize: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  initialTheme = ThemeMode.SYSTEM,
  initialFontSize = FontSize.MEDIUM,
  ...props
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemeMode>(initialTheme);
  const [fontSize, setFontSizeState] = useState<FontSize>(initialFontSize);

  // Update theme when initialTheme changes
  useEffect(() => {
    setThemeState(initialTheme);
  }, [initialTheme]);

  // Update fontSize when initialFontSize changes
  useEffect(() => {
    setFontSizeState(initialFontSize);
  }, [initialFontSize]);

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

  // Apply font scale CSS variable
  useEffect(() => {
    const root = window.document.documentElement;
    root.style.setProperty('--font-scale', String(FONT_SCALE_VALUES[fontSize]));
  }, [fontSize]);

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
  };

  const setFontSize = (newSize: FontSize) => {
    setFontSizeState(newSize);
  };

  const value = {
    theme,
    setTheme,
    fontSize,
    setFontSize,
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
