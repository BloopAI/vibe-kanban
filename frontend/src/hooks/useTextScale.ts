import { useEffect } from 'react';
import { useUserSystem } from '@/components/config-provider';

/**
 * Hook to dynamically apply text scale CSS variables based on user config.
 * This scales text content (chat, diffs, logs) while keeping UI controls at normal size.
 */
export function useTextScale() {
  const { config } = useUserSystem();

  useEffect(() => {
    if (config?.text_scale) {
      const scale = config.text_scale;
      const root = document.documentElement;

      // Apply CSS variables for text scaling
      // These variables are used in the global CSS
      root.style.setProperty('--chat-text-scale', String(scale));
      root.style.setProperty('--diff-text-scale', String(scale * 1.04)); // Slightly larger for code
      root.style.setProperty('--log-text-scale', String(scale * 1.12)); // Larger for logs
      root.style.setProperty('--markdown-scale', String(scale * 0.96)); // Slightly smaller for markdown
    } else {
      // Reset to defaults if no scale is set
      const root = document.documentElement;
      root.style.setProperty('--chat-text-scale', '1.0');
      root.style.setProperty('--diff-text-scale', '1.0');
      root.style.setProperty('--log-text-scale', '1.0');
      root.style.setProperty('--markdown-scale', '1.0');
    }
  }, [config?.text_scale]);
}
