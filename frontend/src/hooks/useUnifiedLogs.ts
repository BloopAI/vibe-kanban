import { useEffect, useState, useRef, useCallback } from 'react';
import { applyPatch } from 'rfc6902';
import type { ExecutionProcessSummary, NormalizedConversation, NormalizedEntry } from 'shared/types';
import type { UnifiedLogEntry } from '@/types/logs';

interface UseUnifiedLogsResult {
  entries: UnifiedLogEntry[];
  isConnected: boolean;
  errors: Map<string, string>;
}

const MAX_ENTRIES = 50000; // Memory limit as suggested by Oracle

export const useUnifiedLogs = (
  processes: ExecutionProcessSummary[],
  enabled: boolean
): UseUnifiedLogsResult => {
  const [entries, setEntries] = useState<UnifiedLogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  
  // Use refs for internal state to avoid triggering re-renders on every log entry
  const entriesRef = useRef<UnifiedLogEntry[]>([]);
  const eventSourcesRef = useRef<Map<string, EventSource>>(new Map());
  const conversationsRef = useRef<Map<string, NormalizedConversation>>(new Map());
  const rafIdRef = useRef<number | null>(null);
  
  // Debounced state update using requestAnimationFrame
  const updateEntries = useCallback(() => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
    }
    
    rafIdRef.current = requestAnimationFrame(() => {
      // Sort entries by timestamp and enforce memory limit
      const sortedEntries = [...entriesRef.current]
        .sort((a, b) => a.ts - b.ts)
        .slice(-MAX_ENTRIES);
      
      entriesRef.current = sortedEntries;
      setEntries(sortedEntries);
    });
  }, []);

  // Generate unique ID for log entries
  const generateId = useCallback(() => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Add entry to the unified log
  const addEntry = useCallback((entry: Omit<UnifiedLogEntry, 'id'>) => {
    const newEntry: UnifiedLogEntry = {
      ...entry,
      id: generateId(),
    };
    
    entriesRef.current.push(newEntry);
    updateEntries();
  }, [updateEntries, generateId]);

  // Setup EventSource for a process
  const setupEventSource = useCallback((process: ExecutionProcessSummary) => {
    const isCodingAgent = process.run_reason === 'codingagent';
    const endpoint = isCodingAgent 
      ? `/api/execution-processes/${process.id}/normalized-logs`
      : `/api/execution-processes/${process.id}/raw-logs`;

    const eventSource = new EventSource(endpoint);
    
    // Initialize conversation state for coding agents
    if (isCodingAgent) {
      conversationsRef.current.set(process.id, {
        entries: [],
        session_id: null,
        executor_type: '',
        prompt: null,
        summary: null,
      });
    }

    eventSource.onopen = () => {
      setErrors(prev => {
        const newErrors = new Map(prev);
        newErrors.delete(process.id);
        return newErrors;
      });
    };

    if (isCodingAgent) {
      // Handle normalized conversation logs with JSON patches
      eventSource.addEventListener('json_patch', (event) => {
        try {
          const patches = JSON.parse(event.data);
          const conversation = conversationsRef.current.get(process.id);
          
          if (conversation) {
            applyPatch(conversation, patches);
            
            // Add new entries to unified log
            conversation.entries.forEach((entry: NormalizedEntry, index: number) => {
              const entryId = `${process.id}-normalized-${index}`;
              const existingEntry = entriesRef.current.find(e => e.id === entryId);
              
              if (!existingEntry) {
                addEntry({
                  ts: entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now(),
                  processId: process.id,
                  processName: process.run_reason,
                  channel: 'normalized',
                  payload: entry,
                });
              }
            });
          }
        } catch (err) {
          console.error('Failed to apply JSON patch:', err);
          setErrors(prev => new Map(prev).set(process.id, 'Failed to process log update'));
        }
      });
    } else {
      // Handle raw logs
      eventSource.onmessage = (event) => {
        addEntry({
          ts: Date.now(), // TODO: Server should provide timestamp
          processId: process.id,
          processName: process.run_reason,
          channel: 'raw',
          payload: event.data,
        });
      };

      eventSource.addEventListener('stdout', (event) => {
        addEntry({
          ts: Date.now(), // TODO: Server should provide timestamp
          processId: process.id,
          processName: process.run_reason,
          channel: 'stdout',
          payload: event.data,
        });
      });

      eventSource.addEventListener('stderr', (event) => {
        addEntry({
          ts: Date.now(), // TODO: Server should provide timestamp
          processId: process.id,
          processName: process.run_reason,
          channel: 'stderr',
          payload: event.data,
        });
      });
    }

    eventSource.addEventListener('finished', () => {
      eventSource.close();
      eventSourcesRef.current.delete(process.id);
      if (isCodingAgent) {
        conversationsRef.current.delete(process.id);
      }
      
      // Update connection status
      setIsConnected(eventSourcesRef.current.size > 0);
    });

    eventSource.onerror = () => {
      setErrors(prev => new Map(prev).set(process.id, 'Connection failed'));
      eventSource.close();
      eventSourcesRef.current.delete(process.id);
      if (isCodingAgent) {
        conversationsRef.current.delete(process.id);
      }
      
      // Update connection status
      setIsConnected(eventSourcesRef.current.size > 0);
    };

    return eventSource;
  }, [addEntry]);

  // Main effect to manage EventSource connections
  useEffect(() => {
    if (!enabled || !processes.length) {
      // Cleanup all connections
      eventSourcesRef.current.forEach(eventSource => eventSource.close());
      eventSourcesRef.current.clear();
      conversationsRef.current.clear();
      entriesRef.current = [];
      setEntries([]);
      setIsConnected(false);
      setErrors(new Map());
      return;
    }

    // Get current process IDs
    const currentProcessIds = new Set(processes.map(p => p.id));
    const activeProcessIds = new Set(eventSourcesRef.current.keys());

    // Remove connections for processes that no longer exist
    activeProcessIds.forEach(processId => {
      if (!currentProcessIds.has(processId)) {
        const eventSource = eventSourcesRef.current.get(processId);
        if (eventSource) {
          eventSource.close();
          eventSourcesRef.current.delete(processId);
          conversationsRef.current.delete(processId);
        }
      }
    });

    // Add connections for new processes
    processes.forEach(process => {
      if (!eventSourcesRef.current.has(process.id)) {
        const eventSource = setupEventSource(process);
        eventSourcesRef.current.set(process.id, eventSource);
      }
    });

    // Update connection status
    setIsConnected(eventSourcesRef.current.size > 0);

    // Cleanup on unmount
    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
      eventSourcesRef.current.forEach(eventSource => eventSource.close());
      eventSourcesRef.current.clear();
      conversationsRef.current.clear();
    };
  }, [processes, enabled, setupEventSource]);

  return { entries, isConnected, errors };
};
