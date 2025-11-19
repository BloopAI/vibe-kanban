import React, { createContext, useContext, useEffect, useState } from 'react';

type GitOperationsContextType = {
  error: string | null;
  setError: (error: string | null) => void;
};

const GitOperationsContext = createContext<GitOperationsContextType | null>(
  null
);

export const GitOperationsProvider: React.FC<{
  attemptId: string | undefined;
  children: React.ReactNode;
}> = ({ attemptId, children }) => {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
  }, [attemptId]);

  return (
    <GitOperationsContext.Provider value={{ error, setError }}>
      {children}
    </GitOperationsContext.Provider>
  );
};

export const useGitOperationsError = () => {
  const ctx = useContext(GitOperationsContext);
  if (!ctx) {
    throw new Error(
      'useGitOperationsError must be used within GitOperationsProvider'
    );
  }
  return ctx;
};
