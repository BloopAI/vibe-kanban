import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import { TaskWithAttemptStatus, TaskAttempt } from 'shared/types';
import { attemptsApi } from '@/lib/api';

interface SimpleTerminalProps {
  task: TaskWithAttemptStatus;
  projectId: string;
}

interface TerminalLine {
  id: string;
  content: string;
  type: 'output' | 'input' | 'error' | 'info';
}

export default function SimpleTerminal({ task, projectId }: SimpleTerminalProps) {
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestAttempt, setLatestAttempt] = useState<TaskAttempt | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const wsRef = useRef<WebSocket | null>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const linesRef = useRef<TerminalLine[]>([]);

  // Auto-scroll to bottom
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  // Fetch the latest attempt
  useEffect(() => {
    const fetchLatestAttempt = async () => {
      try {
        setIsLoading(true);
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
      } finally {
        setIsLoading(false);
      }
    };

    fetchLatestAttempt();
  }, [task.id, projectId]);

  // WebSocket connection
  useEffect(() => {
    if (!latestAttempt || isLoading) return;

    const addLine = (content: string, type: TerminalLine['type'] = 'output') => {
      const newLine: TerminalLine = {
        id: `${Date.now()}-${Math.random()}`,
        content,
        type
      };
      linesRef.current = [...linesRef.current, newLine];
      setLines(linesRef.current);
    };

    // Setup WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/api/terminal/${latestAttempt.id}`;
    
    console.log('Connecting to:', wsUrl);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
      addLine('Terminal connected!', 'info');
      addLine('', 'output');
    };

    ws.onmessage = (event) => {
      // Handle terminal output
      const data = event.data;
      // Split by newlines but keep the formatting
      const lines = data.split(/(\r?\n)/);
      lines.forEach((line: string) => {
        if (line && line !== '\n' && line !== '\r\n') {
          addLine(line, 'output');
        }
      });
    };

    ws.onerror = (event) => {
      console.error('WebSocket error:', event);
      setError('Cannot connect to terminal. Please ensure the backend is running.');
      addLine('Error: Failed to connect to terminal', 'error');
    };

    ws.onclose = () => {
      setIsConnected(false);
      addLine('Terminal disconnected', 'info');
    };

    // Cleanup
    return () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
      wsRef.current = null;
      linesRef.current = [];
    };
  }, [latestAttempt, isLoading]);

  const sendCommand = () => {
    if (!currentInput.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    // Add input line to display
    const inputLine: TerminalLine = {
      id: `${Date.now()}-input`,
      content: `$ ${currentInput}`,
      type: 'input'
    };
    linesRef.current = [...linesRef.current, inputLine];
    setLines(linesRef.current);

    // Send to backend
    wsRef.current.send(JSON.stringify({ 
      type: 'input', 
      data: currentInput + '\n' 
    }));

    setCurrentInput('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendCommand();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading terminal...
      </div>
    );
  }

  if (error && !latestAttempt) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-red-500 mb-4">{error}</div>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e]">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700 bg-[#252526]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-yellow-500'}`} />
            <span className="text-sm text-gray-400">
              {isConnected ? 'Connected' : 'Connecting...'}
            </span>
          </div>
          {latestAttempt && (
            <span className="text-xs text-gray-500">
              {latestAttempt.worktree_path.split('/').slice(-2).join('/')}
            </span>
          )}
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 font-mono text-sm">
        {lines.map((line) => (
          <div
            key={line.id}
            className={`whitespace-pre-wrap ${
              line.type === 'input' ? 'text-blue-400' :
              line.type === 'error' ? 'text-red-400' :
              line.type === 'info' ? 'text-yellow-400' :
              'text-gray-300'
            }`}
          >
            {line.content}
          </div>
        ))}
        <div ref={terminalEndRef} />
      </div>

      <div className="border-t border-gray-700 p-2 bg-[#252526]">
        <div className="flex items-center gap-2">
          <span className="text-gray-400">$</span>
          <input
            ref={inputRef}
            type="text"
            value={currentInput}
            onChange={(e) => setCurrentInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!isConnected}
            className="flex-1 bg-transparent text-gray-300 outline-none placeholder-gray-600"
            placeholder={isConnected ? "Type a command..." : "Not connected"}
            autoFocus
          />
        </div>
      </div>
    </div>
  );
}