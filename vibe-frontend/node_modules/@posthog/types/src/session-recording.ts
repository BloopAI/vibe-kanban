/**
 * Session recording types
 */

import type { Headers } from './request'

export type SessionRecordingCanvasOptions = {
    /**
     * If set, records the canvas
     *
     * @default false
     */
    recordCanvas?: boolean | null

    /**
     * If set, records the canvas at the given FPS
     * Can be set in the remote configuration
     * Limited between 0 and 12
     * When canvas recording is enabled, if this is not set locally, then remote config sets this as 4
     *
     * @default null-ish
     */
    canvasFps?: number | null

    /**
     * If set, records the canvas at the given quality
     * Can be set in the remote configuration
     * Must be a string that is a valid decimal between 0 and 1
     * When canvas recording is enabled, if this is not set locally, then remote config sets this as "0.4"
     *
     * @default null-ish
     */
    canvasQuality?: string | null
}

/* for rrweb/network@1
 ** when that is released as part of rrweb this can be removed
 ** don't rely on this type, it may change without notice
 */
export type InitiatorType =
    | 'audio'
    | 'beacon'
    | 'body'
    | 'css'
    | 'early-hint'
    | 'embed'
    | 'fetch'
    | 'frame'
    | 'iframe'
    | 'icon'
    | 'image'
    | 'img'
    | 'input'
    | 'link'
    | 'navigation'
    | 'object'
    | 'ping'
    | 'script'
    | 'track'
    | 'video'
    | 'xmlhttprequest'

/** @deprecated - use CapturedNetworkRequest instead  */
export type NetworkRequest = {
    url: string
}

// we mirror PerformanceEntry since we read into this type from a PerformanceObserver,
// but we don't want to inherit its readonly-iness
type Writable<T> = { -readonly [P in keyof T]: T[P] }

// In rrweb this is called NetworkRequest, but we already exposed that as having only URL
// we also want to vary from the rrweb NetworkRequest because we want to include
// all PerformanceEntry properties too.
// that has 4 required properties
//     readonly duration: DOMHighResTimeStamp;
//     readonly entryType: string;
//     readonly name: string;
//     readonly startTime: DOMHighResTimeStamp;
// NB: properties below here are ALPHA, don't rely on them, they may change without notice
export type CapturedNetworkRequest = Writable<Omit<PerformanceEntry, 'toJSON'>> & {
    // properties below here are ALPHA, don't rely on them, they may change without notice
    method?: string
    initiatorType?: InitiatorType
    status?: number
    timeOrigin?: number
    timestamp?: number
    startTime?: number
    endTime?: number
    requestHeaders?: Headers
    requestBody?: string | null
    responseHeaders?: Headers
    responseBody?: string | null
    // was this captured before fetch/xhr could have been wrapped
    isInitial?: boolean
}

export type SessionIdChangedCallback = (
    sessionId: string,
    windowId: string | null | undefined,
    changeReason?: { noSessionId: boolean; activityTimeout: boolean; sessionPastMaximumLength: boolean }
) => void

// levels originally copied from Sentry to work with the sentry integration
// and to avoid relying on a frequently changing @sentry/types dependency
export type SeverityLevel = 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug'
