/**
 * Session recording types
 */
import type { Headers } from './request';
export type SessionRecordingCanvasOptions = {
    /**
     * If set, records the canvas
     *
     * @default false
     */
    recordCanvas?: boolean | null;
    /**
     * If set, records the canvas at the given FPS
     * Can be set in the remote configuration
     * Limited between 0 and 12
     * When canvas recording is enabled, if this is not set locally, then remote config sets this as 4
     *
     * @default null-ish
     */
    canvasFps?: number | null;
    /**
     * If set, records the canvas at the given quality
     * Can be set in the remote configuration
     * Must be a string that is a valid decimal between 0 and 1
     * When canvas recording is enabled, if this is not set locally, then remote config sets this as "0.4"
     *
     * @default null-ish
     */
    canvasQuality?: string | null;
};
export type InitiatorType = 'audio' | 'beacon' | 'body' | 'css' | 'early-hint' | 'embed' | 'fetch' | 'frame' | 'iframe' | 'icon' | 'image' | 'img' | 'input' | 'link' | 'navigation' | 'object' | 'ping' | 'script' | 'track' | 'video' | 'xmlhttprequest';
/** @deprecated - use CapturedNetworkRequest instead  */
export type NetworkRequest = {
    url: string;
};
type Writable<T> = {
    -readonly [P in keyof T]: T[P];
};
export type CapturedNetworkRequest = Writable<Omit<PerformanceEntry, 'toJSON'>> & {
    method?: string;
    initiatorType?: InitiatorType;
    status?: number;
    timeOrigin?: number;
    timestamp?: number;
    startTime?: number;
    endTime?: number;
    requestHeaders?: Headers;
    requestBody?: string | null;
    responseHeaders?: Headers;
    responseBody?: string | null;
    isInitial?: boolean;
};
export type SessionIdChangedCallback = (sessionId: string, windowId: string | null | undefined, changeReason?: {
    noSessionId: boolean;
    activityTimeout: boolean;
    sessionPastMaximumLength: boolean;
}) => void;
export type SeverityLevel = 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug';
export {};
//# sourceMappingURL=session-recording.d.ts.map