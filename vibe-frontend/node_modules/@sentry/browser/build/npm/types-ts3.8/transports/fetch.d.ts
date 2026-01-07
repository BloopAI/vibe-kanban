import { Transport } from '@sentry/core';
import { WINDOW } from '../helpers';
import { BrowserTransportOptions } from './types';
/**
 * Creates a Transport that uses the Fetch API to send events to Sentry.
 */
export declare function makeFetchTransport(options: BrowserTransportOptions, nativeFetch?: typeof WINDOW.fetch | undefined): Transport;
//# sourceMappingURL=fetch.d.ts.map
