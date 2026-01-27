import { createContext, useContext, useState, useRef, useCallback, ReactNode } from 'react';

interface PmChatStreamState {
  isAiResponding: boolean;
  streamingResponse: string;
  projectId: string | null;
}

interface PmChatContextValue {
  // Stream state
  streamState: PmChatStreamState;
  // Stream control
  startStream: (projectId: string) => void;
  appendToStream: (content: string) => void;
  endStream: () => void;
  // Abort control
  setAbortController: (controller: { abort: () => void } | null) => void;
  abortStream: () => void;
}

const PmChatContext = createContext<PmChatContextValue | null>(null);

export function PmChatProvider({ children }: { children: ReactNode }) {
  const [streamState, setStreamState] = useState<PmChatStreamState>({
    isAiResponding: false,
    streamingResponse: '',
    projectId: null,
  });

  const abortControllerRef = useRef<{ abort: () => void } | null>(null);

  const startStream = useCallback((projectId: string) => {
    setStreamState({
      isAiResponding: true,
      streamingResponse: '',
      projectId,
    });
  }, []);

  const appendToStream = useCallback((content: string) => {
    setStreamState((prev) => ({
      ...prev,
      streamingResponse: prev.streamingResponse.length + content.length > 100000
        ? (prev.streamingResponse + content).slice(-100000)
        : prev.streamingResponse + content,
    }));
  }, []);

  const endStream = useCallback(() => {
    setStreamState((prev) => ({
      ...prev,
      isAiResponding: false,
      streamingResponse: '',
    }));
    abortControllerRef.current = null;
  }, []);

  const setAbortController = useCallback((controller: { abort: () => void } | null) => {
    abortControllerRef.current = controller;
  }, []);

  const abortStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStreamState((prev) => ({
      ...prev,
      isAiResponding: false,
      streamingResponse: '',
    }));
  }, []);

  return (
    <PmChatContext.Provider
      value={{
        streamState,
        startStream,
        appendToStream,
        endStream,
        setAbortController,
        abortStream,
      }}
    >
      {children}
    </PmChatContext.Provider>
  );
}

export function usePmChat() {
  const context = useContext(PmChatContext);
  if (!context) {
    throw new Error('usePmChat must be used within a PmChatProvider');
  }
  return context;
}
