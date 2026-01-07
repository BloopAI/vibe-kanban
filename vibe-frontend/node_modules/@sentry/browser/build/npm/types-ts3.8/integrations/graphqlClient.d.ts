import { FetchHint, XhrHint } from '@sentry-internal/browser-utils';
interface GraphQLClientOptions {
    endpoints: Array<string | RegExp>;
}
/** Standard graphql request shape: https://graphql.org/learn/serving-over-http/#post-request-and-body */
interface GraphQLRequestPayload {
    query: string;
    operationName?: string;
    variables?: Record<string, unknown>;
    extensions?: Record<string, unknown>;
}
interface GraphQLOperation {
    operationType?: string;
    operationName?: string;
}
/**
 * Get the request body/payload based on the shape of the hint.
 *
 * Exported for tests only.
 */
export declare function getRequestPayloadXhrOrFetch(hint: XhrHint | FetchHint): string | undefined;
/**
 * Extract the name and type of the operation from the GraphQL query.
 *
 * Exported for tests only.
 */
export declare function parseGraphQLQuery(query: string): GraphQLOperation;
/**
 * Extract the payload of a request if it's GraphQL.
 * Exported for tests only.
 * @param payload - A valid JSON string
 * @returns A POJO or undefined
 */
export declare function getGraphQLRequestPayload(payload: string): GraphQLRequestPayload | undefined;
/**
 * This integration ensures that GraphQL requests made in the browser
 * have their GraphQL-specific data captured and attached to spans and breadcrumbs.
 */
export declare const graphqlClientIntegration: (options: GraphQLClientOptions) => import("@sentry/core").Integration;
export {};
//# sourceMappingURL=graphqlClient.d.ts.map
