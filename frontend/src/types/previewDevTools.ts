// Message source identifier
export const PREVIEW_DEVTOOLS_SOURCE = 'vibe-devtools' as const;
export type PreviewDevToolsSource = typeof PREVIEW_DEVTOOLS_SOURCE;

// === Entry Types (for state management) ===

export interface ConsoleEntry {
  id: string;
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  args: unknown[];
  timestamp: number;
  stack?: string;
}

export interface NetworkEntry {
  id: string;
  method: string;
  url: string;
  status?: number;
  statusText?: string;
  duration?: number;
  phase: 'start' | 'end' | 'error';
  error?: string;
  timestamp: number;
}

export interface ErrorEntry {
  id: string;
  message: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  stack?: string;
  timestamp: number;
}

export interface NavigationState {
  url: string;
  title?: string;
  canGoBack: boolean;
  canGoForward: boolean;
}

// === Message Types (from iframe to parent) ===

export interface ConsoleMessage {
  source: PreviewDevToolsSource;
  type: 'console';
  payload: Omit<ConsoleEntry, 'id'>;
}

export interface NetworkMessage {
  source: PreviewDevToolsSource;
  type: 'network';
  payload: Omit<NetworkEntry, 'id'> & { id: string }; // id comes from iframe
}

export interface ErrorMessage {
  source: PreviewDevToolsSource;
  type: 'error';
  payload: Omit<ErrorEntry, 'id'>;
}

export interface NavigationMessage {
  source: PreviewDevToolsSource;
  type: 'navigation';
  payload: NavigationState & { timestamp: number };
}

export interface ReadyMessage {
  source: PreviewDevToolsSource;
  type: 'ready';
  payload?: Record<string, never>;
}

// === Command Types (from parent to iframe) ===

export interface NavigationCommand {
  source: PreviewDevToolsSource;
  type: 'navigate';
  payload: {
    action: 'back' | 'forward' | 'refresh' | 'goto';
    url?: string; // for 'goto' action
  };
}

// === Union Types ===

export type PreviewDevToolsMessage =
  | ConsoleMessage
  | NetworkMessage
  | ErrorMessage
  | NavigationMessage
  | ReadyMessage;

export type PreviewDevToolsCommand = NavigationCommand;

// === Type Guards ===

export function isPreviewDevToolsMessage(data: unknown): data is PreviewDevToolsMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    'source' in data &&
    (data as { source: unknown }).source === PREVIEW_DEVTOOLS_SOURCE
  );
}
