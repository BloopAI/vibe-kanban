import React from 'react';
import { BackendConnectionStatus } from '../../hooks/useBackendConnection';

interface LoadingScreenProps {
  status: BackendConnectionStatus;
  onRetry: () => void;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ status, onRetry }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50/30 via-transparent to-purple-50/30"></div>
      <div className="absolute top-0 left-0 w-full h-full opacity-10">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-300 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-300 rounded-full blur-3xl"></div>
      </div>
      
      <div className="relative bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl p-10 max-w-md w-full mx-4 border border-white/20">
        <div className="text-center">
          {/* App Icon */}
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500 via-blue-600 to-purple-600 rounded-3xl mx-auto mb-8 flex items-center justify-center shadow-lg">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          
          {/* App Title */}
          <h1 className="text-3xl font-bold text-slate-800 mb-3 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Vibe Kanban</h1>
          <p className="text-slate-500 text-sm mb-8">Development Task Management</p>
          
          {/* Status Message */}
          <div className="mb-6">
            {status.isLoading && (
              <>
                <div className="flex justify-center mb-6">
                  <div className="relative">
                    <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                    <div className="absolute inset-0 w-12 h-12 border-4 border-transparent border-r-purple-600 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}></div>
                  </div>
                </div>
                <p className="text-slate-600 text-base font-medium mb-2">Connecting to backend services...</p>
                <p className="text-slate-500 text-sm">This may take up to 2 minutes</p>
              </>
            )}
            
            {status.error && !status.isLoading && (
              <>
                <div className="flex justify-center mb-6">
                  <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <p className="text-red-600 text-base font-medium mb-2">
                  Connection failed
                </p>
                <p className="text-red-500 text-sm mb-6">
                  {status.error}
                </p>
                <button
                  onClick={onRetry}
                  className="px-6 py-3 bg-gradient-to-b from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all transform hover:scale-105 active:scale-95 text-sm font-semibold shadow-lg hover:shadow-xl"
                >
                  Retry Connection
                </button>
              </>
            )}
          </div>
          
          {/* Progress Indicator */}
          {status.isLoading && (
            <div className="w-full bg-slate-200 rounded-full h-2 mb-6">
              <div className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full animate-pulse transition-all duration-1000" style={{ width: '70%' }}></div>
            </div>
          )}
          
          {/* Footer */}
          <div className="mt-4 text-xs text-slate-400">
            {status.lastChecked && (
              <p>Last checked: {status.lastChecked.toLocaleTimeString()}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
