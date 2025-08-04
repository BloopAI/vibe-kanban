import type { NormalizedEntry } from 'shared/types';

export interface UnifiedLogEntry {
  id: string;
  ts: number; // epoch-ms timestamp for sorting and react-window key
  processId: string;
  processName: string;
  channel: 'raw' | 'stdout' | 'stderr' | 'normalized';
  payload: string | NormalizedEntry;
}
