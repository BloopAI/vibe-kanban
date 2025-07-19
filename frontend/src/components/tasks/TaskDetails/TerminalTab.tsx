import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { TaskWithAttemptStatus, TaskAttempt } from 'shared/types';
import { attemptsApi } from '@/lib/api';
import 'xterm/css/xterm.css';

interface TerminalTabProps {
  task: TaskWithAttemptStatus;
  projectId: string;
}

export default function TerminalTab({ task, projectId }: TerminalTabProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstanceRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestAttempt, setLatestAttempt] = useState<TaskAttempt | null>(null);
  const isCleaningUp = useRef(false);

  // Fetch the latest attempt
  useEffect(() => {
    const fetchLatestAttempt = async () => {
      try {
        const attempts = await attemptsApi.getAll(projectId, task.id);
        if (attempts.length > 0) {
          // Get the most recent attempt
          const latest = attempts.sort((a: TaskAttempt, b: TaskAttempt) => 
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )[0];
          setLatestAttempt(latest);
        } else {
          setError('No task attempts found');
        }
      } catch (err) {
        console.error('Failed to fetch attempts:', err);
        setError('Failed to load terminal');
      }
    };

    fetchLatestAttempt();
  }, [task.id, projectId]);

  const cleanupTerminal = useCallback(() => {
    if (isCleaningUp.current) return;
    isCleaningUp.current = true;

    // Close WebSocket
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }

    // Dispose terminal
    if (terminalInstanceRef.current) {
      try {
        terminalInstanceRef.current.dispose();
      } catch (e) {
        console.error('Error disposing terminal:', e);
      }
      terminalInstanceRef.current = null;
    }

    fitAddonRef.current = null;
    isCleaningUp.current = false;
  }, []);

  useEffect(() => {
    if (!terminalRef.current || !latestAttempt) return;

    let mounted = true;
    let term: Terminal | null = null;
    let fitAddon: FitAddon | null = null;
    let ws: WebSocket | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const initTerminal = async () => {
      if (!mounted || !terminalRef.current) return;

      try {
        // Initialize terminal
        term = new Terminal({
          theme: {
            background: '#0a0a0a',
            foreground: '#e4e4e7',
            cursor: '#e4e4e7',
            black: '#18181b',
            red: '#ef4444',
            green: '#10b981',
            yellow: '#f59e0b',
            blue: '#3b82f6',
            magenta: '#a855f7',
            cyan: '#06b6d4',
            white: '#e4e4e7',
            brightBlack: '#52525b',
            brightRed: '#f87171',
            brightGreen: '#34d399',
            brightYellow: '#fbbf24',
            brightBlue: '#60a5fa',
            brightMagenta: '#c084fc',
            brightCyan: '#22d3ee',
            brightWhite: '#fafafa',
          },
          cursorBlink: true,
          fontSize: 14,
          fontFamily: '"SF Mono", "Monaco", "Inconsolata", "Fira Code", monospace',
          lineHeight: 1.4,
          scrollback: 10000,
        });

        // Add addons
        fitAddon = new FitAddon();
        const webLinksAddon = new WebLinksAddon();
        
        term.loadAddon(fitAddon);
        term.loadAddon(webLinksAddon);

        // Open terminal
        term.open(terminalRef.current);
        
        // Store refs
        terminalInstanceRef.current = term;
        fitAddonRef.current = fitAddon;

        // Initial fit after DOM settles
        requestAnimationFrame(() => {
          if (mounted && fitAddon && terminalRef.current) {
            try {
              fitAddon.fit();
            } catch (e) {
              console.error('Initial fit error:', e);
            }
          }
        });

        // Connect to WebSocket
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        ws = new WebSocket(`${protocol}//${host}/api/terminal/${latestAttempt.id}`);
        wsRef.current = ws;
        
        ws.onopen = () => {
          if (!mounted) return;
          setIsConnected(true);
          setError(null);
          if (term) {
            term.writeln('Connected to terminal...');
            term.writeln('');
          }
        };

        ws.onmessage = (event) => {
          if (!mounted || !term) return;
          term.write(event.data);
        };

        ws.onerror = (event) => {
          console.error('WebSocket error:', event);
          if (!mounted) return;
          setError('Failed to connect to terminal');
          if (term) {
            term.writeln('\x1b[31mError: Failed to connect to terminal\x1b[0m');
          }
        };

        ws.onclose = () => {
          if (!mounted) return;
          setIsConnected(false);
          if (term && !isCleaningUp.current) {
            term.writeln('\x1b[33m\nTerminal connection closed\x1b[0m');
          }
        };

        // Handle terminal input
        term.onData((data) => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'input', data }));
          }
        });

        // Handle resize
        const handleResize = () => {
          if (!mounted || !fitAddon || !term || !terminalRef.current) return;
          
          // Ensure the terminal container has dimensions
          const rect = terminalRef.current.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return;

          try {
            fitAddon.fit();
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'resize',
                cols: term.cols,
                rows: term.rows,
              }));
            }
          } catch (e) {
            console.error('Error resizing terminal:', e);
          }
        };

        // Use ResizeObserver for better resize handling
        if (terminalRef.current) {
          resizeObserver = new ResizeObserver(() => {
            requestAnimationFrame(handleResize);
          });
          resizeObserver.observe(terminalRef.current);
        }

        // Initial resize after a short delay
        setTimeout(handleResize, 100);
      } catch (err) {
        console.error('Failed to initialize terminal:', err);
        setError('Failed to initialize terminal');
      }
    };

    // Initialize terminal
    initTerminal();

    // Cleanup on unmount
    return () => {
      mounted = false;
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      cleanupTerminal();
    };
  }, [latestAttempt, cleanupTerminal]);

  if (!latestAttempt && !error) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading terminal...
      </div>
    );
  }

  if (error && !latestAttempt) {
    return (
      <div className="flex items-center justify-center h-full text-red-500">
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm text-muted-foreground">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
          {latestAttempt && (
            <span className="text-xs text-muted-foreground">
              (Attempt: {latestAttempt.id.slice(0, 8)})
            </span>
          )}
        </div>
        {error && (
          <span className="text-sm text-red-500">{error}</span>
        )}
      </div>
      <div 
        ref={terminalRef} 
        className="flex-1 bg-[#0a0a0a] overflow-hidden" 
        style={{ minHeight: '200px' }}
      />
    </div>
  );
}