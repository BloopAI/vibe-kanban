import {
  DiffChunkType,
  ExecutionProcess,
  ExecutionProcessSummary,
} from 'shared/types.ts';
import type { NormalizedConversation } from 'shared/types.ts';

export type ProcessLogsResponse = {
  id: string;
  process_type: string;
  command: string;
  executor_type?: string;
  status: string;
  normalized_conversation: NormalizedConversation;
};

export type AttemptData = {
  processes: ExecutionProcessSummary[];
  runningProcessDetails: Record<string, ExecutionProcess>;
  allLogs: ProcessLogsResponse[];
};

export interface ProcessedLine {
  content: string;
  chunkType: DiffChunkType;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface ProcessedSection {
  type: 'context' | 'change' | 'expanded';
  lines: ProcessedLine[];
  expandKey?: string;
  expandedAbove?: boolean;
  expandedBelow?: boolean;
}
