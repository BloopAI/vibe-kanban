import { useEffect, useRef, useCallback, useMemo } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

import { useTerminalWebSocket } from '@/hooks/useTerminalWebSocket';
import { useTheme } from '@/components/ThemeProvider';
import { getTerminalTheme } from '@/utils/terminalTheme';
import { useTerminal } from '@/contexts/TerminalContext';

interface XTermInstanceProps {
  tabId: string;
  workspaceId: string;
  isActive: boolean;
  onClose?: () => void;
}

export function XTermInstance({
  tabId,
  workspaceId,
  isActive,
  onClose,
}: XTermInstanceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const initialSizeRef = useRef({ cols: 80, rows: 24 });
  const { theme } = useTheme();
  const { registerTerminalInstance, getTerminalInstance } = useTerminal();

  const onData = useCallback((data: string) => {
    terminalRef.current?.write(data);
  }, []);

  const endpoint = useMemo(() => {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    const host = window.location.host;
    return `${protocol}//${host}/api/terminal/ws?workspace_id=${workspaceId}&cols=${initialSizeRef.current.cols}&rows=${initialSizeRef.current.rows}`;
  }, [workspaceId]);

  // Check if we already have a terminal instance for this tab
  const existingInstance = getTerminalInstance(tabId);

  const { send, resize } = useTerminalWebSocket({
    endpoint,
    onData,
    onExit: onClose,
    // Only enable WebSocket connection if we don't already have an instance
    enabled: !existingInstance,
  });

  useEffect(() => {
    if (!containerRef.current) return;

    // Check if we already have a terminal instance for this tab
    const existing = getTerminalInstance(tabId);
    if (existing) {
      // Reattach existing terminal to new container
      const { terminal, fitAddon } = existing;
      if (terminal.element) {
        containerRef.current.appendChild(terminal.element);
        fitAddon.fit();
      }
      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;
      return;
    }

    // Don't create new terminal if we already have one in our ref
    if (terminalRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: '"IBM Plex Mono", monospace',
      theme: getTerminalTheme(),
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.open(containerRef.current);

    fitAddon.fit();
    initialSizeRef.current = { cols: terminal.cols, rows: terminal.rows };

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Register the terminal instance in context so it survives unmount
    registerTerminalInstance(tabId, terminal, fitAddon);

    terminal.onData((data) => {
      send(data);
    });

    // Cleanup: detach from DOM but don't dispose (context manages disposal)
    return () => {
      // Only detach from DOM, don't dispose - the context will dispose when tab closes
      if (terminal.element && terminal.element.parentNode) {
        terminal.element.parentNode.removeChild(terminal.element);
      }
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [tabId, send, getTerminalInstance, registerTerminalInstance]);

  useEffect(() => {
    if (!isActive || !fitAddonRef.current) return;

    const handleResize = () => {
      fitAddonRef.current?.fit();
      if (terminalRef.current) {
        resize(terminalRef.current.cols, terminalRef.current.rows);
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    handleResize();

    return () => {
      resizeObserver.disconnect();
    };
  }, [isActive, resize]);

  useEffect(() => {
    if (isActive) {
      terminalRef.current?.focus();
    }
  }, [isActive]);

  // Update terminal theme when app theme changes
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = getTerminalTheme();
    }
  }, [theme]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ display: isActive ? 'block' : 'none' }}
    />
  );
}
