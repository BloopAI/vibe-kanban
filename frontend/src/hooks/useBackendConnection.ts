import { useState, useEffect } from 'react';
import { isDesktop } from '@/lib/desktop-api';

export interface BackendConnectionStatus {
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  lastChecked: Date | null;
}

export const useBackendConnection = () => {
  const [status, setStatus] = useState<BackendConnectionStatus>({
    isConnected: !isDesktop(), // Start as connected for web, disconnected for desktop
    isLoading: isDesktop(),    // Only show loading for desktop
    error: null,
    lastChecked: null
  });

  const checkConnection = async () => {
    try {
      setStatus(prev => ({ ...prev, isLoading: true, error: null }));
      
      const backendPort = import.meta.env.VITE_BACKEND_PORT || '3002';
      if (import.meta.env.DEV) {
        console.log('🔍 Backend connection check - using port:', backendPort);
      }
      
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
    // Only run backend connection checks for desktop
    if (!isDesktop()) {
      setStatus({
        isConnected: true,
        isLoading: false,
        error: null,
        lastChecked: new Date()
      });
      return;
    }
    
    checkConnection();
    
    const interval = setInterval(checkConnection, 2000);
    
    return () => clearInterval(interval);
  }, []);

  return {
    ...status,
    retry: checkConnection
  };
};
