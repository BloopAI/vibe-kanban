import { useState, useEffect } from 'react';

export interface BackendConnectionStatus {
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  lastChecked: Date | null;
}

export const useBackendConnection = () => {
  const [status, setStatus] = useState<BackendConnectionStatus>({
    isConnected: false,
    isLoading: true,
    error: null,
    lastChecked: null
  });

  const checkConnection = async () => {
    try {
      setStatus(prev => ({ ...prev, isLoading: true, error: null }));
      
      const backendPort = import.meta.env.VITE_BACKEND_PORT || '3002';
      const response = await fetch(`http://localhost:${backendPort}/api/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000)
      });
      
      if (response.ok) {
        setStatus({
          isConnected: true,
          isLoading: false,
          error: null,
          lastChecked: new Date()
        });
      } else {
        throw new Error(`Backend responded with status ${response.status}`);
      }
    } catch (error) {
      setStatus({
        isConnected: false,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        lastChecked: new Date()
      });
    }
  };

  useEffect(() => {
    checkConnection();
    
    const interval = setInterval(checkConnection, 2000);
    
    return () => clearInterval(interval);
  }, []);

  return {
    ...status,
    retry: checkConnection
  };
};
