/**
 * Segment integration types
 */

/**
 * Segment user object
 */
export type SegmentUser = {
    anonymousId(): string | undefined
    id(): string | undefined
}

/**
 * Segment analytics object used for integration with PostHog
 */
export type SegmentAnalytics = {
    user: () => SegmentUser | Promise<SegmentUser>
    register: (integration: SegmentPlugin) => Promise<void>
}

/**
 * Segment plugin function type
 */
export type SegmentFunction = (ctx: SegmentContext) => Promise<SegmentContext> | SegmentContext

/**
 * Segment plugin interface
 * Loosely based on https://github.com/segmentio/analytics-next/blob/master/packages/core/src/plugins/index.ts
 */
export interface SegmentPlugin {
    name: string
    version: string
    type: 'enrichment'
    isLoaded: () => boolean
    load: (ctx: SegmentContext, instance: any, config?: any) => Promise<unknown>
    unload?: (ctx: SegmentContext, instance: any) => Promise<unknown> | unknown
    ready?: () => Promise<unknown>
    track?: SegmentFunction
    identify?: SegmentFunction
    page?: SegmentFunction
    group?: SegmentFunction
    alias?: SegmentFunction
    screen?: SegmentFunction
}

/**
 * Segment context object
 */
export interface SegmentContext {
    event: {
        event: string
        userId?: string
        anonymousId?: string
        properties: any
    }
}
