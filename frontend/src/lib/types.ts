import {
  DiffChunkType,
  ExecutionProcess,
  ExecutionProcessSummary,
  ProcessLogsResponse,
} from 'shared/types.ts';

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

export interface ConversationEntryDisplayType {
  entry: any;
  processId: string;
  processPrompt?: string;
  processStatus: string;
  processIsRunning: boolean;
  process: any;
  isFirstInProcess: boolean;
  processIndex: number;
  entryIndex: number;
}
