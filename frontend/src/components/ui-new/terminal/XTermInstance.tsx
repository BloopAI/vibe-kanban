import { useEffect, useRef, useCallback, useMemo } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

import { useTerminalWebSocket } from '@/hooks/useTerminalWebSocket';
import { useTheme } from '@/components/ThemeProvider';
import { getTerminalTheme } from '@/utils/terminalTheme';

interface XTermInstanceProps {
  workspaceId: string;
  isActive: boolean;
  onClose?: () => void;
}

export function XTermInstance({
  workspaceId,
  isActive,
  onClose,
}: XTermInstanceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const initialSizeRef = useRef({ cols: 80, rows: 24 });
  const { theme } = useTheme();

  const onData = useCallback((data: string) => {
    terminalRef.current?.write(data);
  }, []);

  const endpoint = useMemo(() => {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    const host = window.location.host;
    return `${protocol}//${host}/api/terminal/ws?workspace_id=${workspaceId}&cols=${initialSizeRef.current.cols}&rows=${initialSizeRef.current.rows}`;
  }, [workspaceId]);

  const { send, resize } = useTerminalWebSocket({
    endpoint,
    onData,
    onExit: onClose,
  });

  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;

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

    terminal.onData((data) => {
      send(data);
    });

    return () => {
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [send]);

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
