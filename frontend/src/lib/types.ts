import { ExecutionProcess, ProfileVariantLabel } from 'shared/types';

export type AttemptData = {
  processes: ExecutionProcess[];
  runningProcessDetails: Record<string, ExecutionProcess>;
  processProfiles: Record<string, ProfileVariantLabel | null>;
};

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
