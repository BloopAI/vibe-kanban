import { useEffect, useState, useRef } from 'react';
import { applyPatch } from 'rfc6902';
import type { NormalizedConversation, NormalizedEntry } from 'shared/types';

interface UseNormalizedConversationResult {
  entries: NormalizedEntry[];
  isConnected: boolean;
  error: string | null;
}

export const useNormalizedConversation = (
  processId: string,
  enabled: boolean
): UseNormalizedConversationResult => {
  const [entries, setEntries] = useState<NormalizedEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const conversationRef = useRef<NormalizedConversation>({
    entries: [],
    session_id: null,
    executor_type: '',
    prompt: null,
    summary: null,
  });

  useEffect(() => {
    if (!enabled || !processId) {
      return;
    }

    const eventSource = new EventSource(
      `/api/execution-processes/${processId}/normalized-logs`
    );
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    eventSource.addEventListener('json_patch', (event) => {
      try {
        const patches = JSON.parse(event.data);
        
        // Apply JSON patches to the conversation
        applyPatch(conversationRef.current, patches);
        
        // Trigger re-render with new entries
        setEntries([...conversationRef.current.entries]);
      } catch (err) {
        console.error('Failed to apply JSON patch:', err);
        setError('Failed to process log update');
      }
    });

    eventSource.addEventListener('finished', () => {
      eventSource.close();
      setIsConnected(false);
    });

    eventSource.onerror = () => {
      setError('Connection failed');
      setIsConnected(false);
      eventSource.close();
    };

    return () => {
      eventSource.close();
      setIsConnected(false);
    };
  }, [processId, enabled]);

  // Reset conversation when disabled
  useEffect(() => {
    if (!enabled) {
      setEntries([]);
      setError(null);
      setIsConnected(false);
      conversationRef.current = {
        entries: [],
        session_id: null,
        executor_type: '',
        prompt: null,
        summary: null,
      };
    }
  }, [enabled]);

  return { entries, isConnected, error };
};
