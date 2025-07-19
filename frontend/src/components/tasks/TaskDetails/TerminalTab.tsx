import { useEffect, useRef, useState } from 'react';
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
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestAttempt, setLatestAttempt] = useState<TaskAttempt | null>(null);

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

  useEffect(() => {
    if (!terminalRef.current || !latestAttempt) return;

    // Initialize terminal
    const term = new Terminal({
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
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    // Open terminal
    term.open(terminalRef.current);
    
    // Store refs
    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Fit terminal after it's opened
    setTimeout(() => {
      fitAddon.fit();
    }, 0);

    // Connect to WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const ws = new WebSocket(`${protocol}//${host}/api/terminal/${latestAttempt.id}`);
    
    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
      term.writeln('Connected to terminal...');
      term.writeln('');
    };

    ws.onmessage = (event) => {
      term.write(event.data);
    };

    ws.onerror = (event) => {
      console.error('WebSocket error:', event);
      setError('Failed to connect to terminal');
      term.writeln('\x1b[31mError: Failed to connect to terminal\x1b[0m');
    };

    ws.onclose = () => {
      setIsConnected(false);
      term.writeln('\x1b[33m\nTerminal connection closed\x1b[0m');
    };

    wsRef.current = ws;

    // Handle terminal input
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    // Handle resize
    const handleResize = () => {
      if (fitAddonRef.current && xtermRef.current) {
        try {
          fitAddonRef.current.fit();
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: 'resize',
              cols: xtermRef.current.cols,
              rows: xtermRef.current.rows,
            }));
          }
        } catch (e) {
          console.error('Error resizing terminal:', e);
        }
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(terminalRef.current);

    // Initial resize
    handleResize();

    // Cleanup
    return () => {
      resizeObserver.disconnect();
      
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      
      if (xtermRef.current) {
        xtermRef.current.dispose();
        xtermRef.current = null;
      }
      
      fitAddonRef.current = null;
    };
  }, [latestAttempt]);

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
        </div>
        {error && (
          <span className="text-sm text-red-500">{error}</span>
        )}
      </div>
      <div ref={terminalRef} className="flex-1 p-2 bg-[#0a0a0a] overflow-hidden" />
    </div>
  );
}