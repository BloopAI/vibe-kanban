import { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { TaskWithAttemptStatus, TaskAttempt } from 'shared/types';
import { attemptsApi } from '@/lib/api';
import 'xterm/css/xterm.css';

interface TerminalTabProps {
  task: TaskWithAttemptStatus;
  projectId: string;
}

export default function TerminalTab({ task, projectId }: TerminalTabProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestAttempt, setLatestAttempt] = useState<TaskAttempt | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Fetch the latest attempt
  useEffect(() => {
    const fetchLatestAttempt = async () => {
      try {
        const attempts = await attemptsApi.getAll(projectId, task.id);
        if (attempts.length > 0) {
          const latest = attempts.sort((a: TaskAttempt, b: TaskAttempt) => 
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )[0];
          setLatestAttempt(latest);
        } else {
          setError('No task attempts found. Please create a task attempt first.');
        }
      } catch (err) {
        console.error('Failed to fetch attempts:', err);
        setError('Failed to load terminal');
      }
    };

    fetchLatestAttempt();
  }, [task.id, projectId]);

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current || !latestAttempt || isInitialized) return;

    const container = containerRef.current;
    
    // Ensure container has dimensions before initializing
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      // Retry after a delay
      const retryTimeout = setTimeout(() => {
        setIsInitialized(false);
      }, 100);
      return () => clearTimeout(retryTimeout);
    }

    // Create terminal instance
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    // Open terminal
    term.open(container);
    terminalRef.current = term;
    fitAddonRef.current = fitAddon;
    setIsInitialized(true);

    // Initial fit
    setTimeout(() => {
      try {
        fitAddon.fit();
      } catch (e) {
        console.error('Error fitting terminal:', e);
      }
    }, 0);

    // Setup WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/api/terminal/${latestAttempt.id}`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
      term.writeln('Terminal connected!');
      term.writeln('');
      term.focus();
    };

    ws.onmessage = (event) => {
      term.write(event.data);
    };

    ws.onerror = (event) => {
      console.error('WebSocket error:', event);
      setError('Cannot connect to terminal. Please ensure the backend is running.');
    };

    ws.onclose = () => {
      setIsConnected(false);
      if (!error) {
        term.writeln('\r\n\x1b[33mTerminal disconnected\x1b[0m');
      }
    };

    // Handle input
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    // Handle resize
    const handleResize = () => {
      if (fitAddon && terminalRef.current) {
        try {
          fitAddon.fit();
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'resize',
              cols: terminalRef.current.cols,
              rows: terminalRef.current.rows,
            }));
          }
        } catch (e) {
          console.error('Resize error:', e);
        }
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // Cleanup
    return () => {
      resizeObserver.disconnect();
      
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }

      if (term) {
        term.dispose();
      }

      terminalRef.current = null;
      fitAddonRef.current = null;
      wsRef.current = null;
      setIsInitialized(false);
    };
  }, [latestAttempt, isInitialized, error]);

  if (!latestAttempt && !error) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <div className="mb-2">Loading terminal...</div>
          <div className="text-xs text-muted-foreground">Fetching task attempts...</div>
        </div>
      </div>
    );
  }

  if (error && !isConnected) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-red-500 mb-4">{error}</div>
          <div className="text-sm text-muted-foreground mb-4">
            Make sure the backend is running with: <code className="bg-muted px-2 py-1 rounded">pnpm dev</code>
          </div>
          <button
            onClick={() => {
              setError(null);
              setIsInitialized(false);
            }}
            className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-yellow-500'}`} />
            <span className="text-sm text-muted-foreground">
              {isConnected ? 'Connected' : 'Connecting...'}
            </span>
          </div>
          {latestAttempt && (
            <span className="text-xs text-muted-foreground/70">
              Worktree: {latestAttempt.worktree_path.split('/').slice(-2).join('/')}
            </span>
          )}
        </div>
      </div>
      <div 
        ref={containerRef} 
        className="flex-1 bg-[#1e1e1e]" 
        style={{ minHeight: '400px' }}
      />
    </div>
  );
}