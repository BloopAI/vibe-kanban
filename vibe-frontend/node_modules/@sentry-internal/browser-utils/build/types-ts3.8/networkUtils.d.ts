import { debug } from '@sentry/core';
import { NetworkMetaWarning } from './types';
/**
 * Serializes FormData.
 *
 * This is a bit simplified, but gives us a decent estimate.
 * This converts e.g. { name: 'Anne Smith', age: 13 } to 'name=Anne+Smith&age=13'.
 *
 */
export declare function serializeFormData(formData: FormData): string;
/** Get the string representation of a body. */
export declare function getBodyString(body: unknown, _debug?: typeof debug): [
    string | undefined,
    NetworkMetaWarning?
];
/**
 * Parses the fetch arguments to extract the request payload.
 *
 * We only support getting the body from the fetch options.
 */
export declare function getFetchRequestArgBody(fetchArgs?: unknown[]): RequestInit['body'] | undefined;
//# sourceMappingURL=networkUtils.d.ts.map
