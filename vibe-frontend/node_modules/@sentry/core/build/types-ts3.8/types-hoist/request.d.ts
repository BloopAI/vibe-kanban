/**
 * Request data included in an event as sent to Sentry.
 */
export interface RequestEventData {
    url?: string;
    method?: string;
    data?: unknown;
    query_string?: QueryParams;
    cookies?: Record<string, string>;
    env?: Record<string, string>;
    headers?: {
        [key: string]: string;
    };
}
export type QueryParams = string | {
    [key: string]: string;
} | Array<[
    string,
    string
]>;
/**
 * Request data that is considered safe for `span.data` on `http.client` spans
 * and for `http` breadcrumbs
 * See https://develop.sentry.dev/sdk/data-handling/#structuring-data
 */
export type SanitizedRequestData = {
    url: string;
    'http.method': string;
    'http.fragment'?: string;
    'http.query'?: string;
};
//# sourceMappingURL=request.d.ts.map
