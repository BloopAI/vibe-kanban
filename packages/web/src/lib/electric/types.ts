/**
 * Error type for Electric sync operations.
 * Wraps errors from Electric's onError callback (HTTP errors, network failures, etc.)
 */
export interface SyncError {
  /** HTTP status code if available */
  status?: number;
  /** Error message */
  message: string;
}

/**
 * Configuration options for creating Electric collections.
 */
export interface CollectionConfig {
  /** Callback for sync errors */
  onError?: (error: SyncError) => void;
}
