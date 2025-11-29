import { createContext, useContext } from 'react';

export const TaskAttemptContext = createContext<string | undefined>(undefined);

export function useTaskAttemptId() {
  return useContext(TaskAttemptContext);
}
