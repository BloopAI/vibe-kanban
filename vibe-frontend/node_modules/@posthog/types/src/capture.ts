/**
 * Capture-related types
 */

import type { Properties } from './common'

/**
 * These are known events PostHog events that can be processed by the `beforeCapture` function
 * That means PostHog functionality does not rely on receiving 100% of these for calculations
 * So, it is safe to sample them to reduce the volume of events sent to PostHog
 */
export type KnownEventName =
    | '$heatmaps_data'
    | '$opt_in'
    | '$exception'
    | '$$heatmap'
    | '$web_vitals'
    | '$dead_click'
    | '$autocapture'
    | '$copy_autocapture'
    | '$rageclick'

/**
 * Known events that can be safely edited in beforeCapture without breaking PostHog functionality
 */
export type KnownUnsafeEditableEvent =
    | '$set'
    | '$pageview'
    | '$pageleave'
    | '$identify'
    | '$groupidentify'
    | '$create_alias'
    | '$feature_flag_called'

export type EventName =
    | KnownUnsafeEditableEvent
    | KnownEventName
    // magic value so that the type of EventName is a set of known strings or any other string
    // which means you get autocomplete for known strings
    // but no type complaints when you add an arbitrary string
    | (string & {})

export interface CaptureResult {
    uuid: string
    event: EventName
    properties: Properties
    $set?: Properties
    $set_once?: Properties
    timestamp?: Date
}

export interface CaptureOptions {
    /**
     * Used when `$identify` is called
     * Will set person properties overriding previous values
     */
    $set?: Properties

    /**
     * Used when `$identify` is called
     * Will set person properties but only once, it will NOT override previous values
     */
    $set_once?: Properties

    /**
     * Used to override the desired endpoint for the captured event
     */
    _url?: string

    /**
     * key of queue, e.g. 'sessionRecording' vs 'event'
     */
    _batchKey?: string

    /**
     * If set, overrides and disables config.properties_string_max_length
     */
    _noTruncate?: boolean

    /**
     * If set, skips the batched queue
     */
    send_instantly?: boolean

    /**
     * If set, skips the client side rate limiting
     */
    skip_client_rate_limiting?: boolean

    /**
     * If set, overrides the desired transport method
     */
    transport?: 'XHR' | 'fetch' | 'sendBeacon'

    /**
     * If set, overrides the current timestamp
     */
    timestamp?: Date
}

export type BeforeSendFn = (cr: CaptureResult | null) => CaptureResult | null
