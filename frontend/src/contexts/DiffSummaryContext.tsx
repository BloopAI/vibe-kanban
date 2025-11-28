import React, { createContext, useContext, useMemo } from 'react';
import { useDiffSummary } from '@/hooks/useDiffSummary';

type DiffSummaryContextType = {
  fileCount: number;
  added: number;
  deleted: number;
  error: string | null;
};

const DiffSummaryContext = createContext<DiffSummaryContextType | null>(null);

export const DiffSummaryProvider: React.FC<{
  attemptId: string;
  children: React.ReactNode;
}> = ({ attemptId, children }) => {
  const { fileCount, added, deleted, error } = useDiffSummary(attemptId);

  const value = useMemo(
    () => ({ fileCount, added, deleted, error }),
    [fileCount, added, deleted, error]
  );

  return (
    <DiffSummaryContext.Provider value={value}>
      {children}
    </DiffSummaryContext.Provider>
  );
};

export const useDiffSummaryContext = () => {
  const ctx = useContext(DiffSummaryContext);
  if (!ctx) {
    throw new Error(
      'useDiffSummaryContext must be used within DiffSummaryProvider'
    );
  }
  return ctx;
};
