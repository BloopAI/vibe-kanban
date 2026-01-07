/**
 * Common types shared across PostHog SDKs
 */

export type Property = any
export type Properties = Record<string, Property>

export type JsonRecord = { [key: string]: JsonType }
export type JsonType = string | number | boolean | null | undefined | JsonRecord | Array<JsonType>
