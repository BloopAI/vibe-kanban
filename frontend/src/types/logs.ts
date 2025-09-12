import type {
  NormalizedEntry,
  ExecutorAction,
  ApprovalRequest,
  ApprovalResponse,
} from 'shared/types';

export interface UnifiedLogEntry {
  id: string;
  ts: number; // epoch-ms timestamp for sorting and react-window key
  processId: string;
  processName: string;
  channel:
    | 'raw'
    | 'stdout'
    | 'stderr'
    | 'normalized'
    | 'process_start'
    | 'approval_request'
    | 'approval_response'
    | 'approval_pending';
  payload:
    | string
    | NormalizedEntry
    | ProcessStartPayload
    | ApprovalRequest
    | ApprovalResponse;
}

export interface ProcessStartPayload {
  processId: string;
  runReason: string;
  startedAt: string;
  status: string;
  action?: ExecutorAction;
}
