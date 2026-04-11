import { useEffect } from "react";

/**
 * Applies 'dark' or 'light' class to <html> based on the browser's
 * prefers-color-scheme, and updates live when the OS setting changes.
 */
export function useSystemTheme() {
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");

    function apply(dark: boolean) {
      const root = document.documentElement;
      root.classList.toggle("dark", dark);
      root.classList.toggle("light", !dark);
    }

    apply(query.matches);

    function onChange(e: MediaQueryListEvent) {
      apply(e.matches);
    }

    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
}
