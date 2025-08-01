import {
  DiffChunkType,
} from 'shared/types';
import { ExecutionProcess, ExecutionProcessSummary } from 'shared/types';

export type AttemptData = {
  processes: ExecutionProcessSummary[];
  runningProcessDetails: Record<string, ExecutionProcess>;
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
