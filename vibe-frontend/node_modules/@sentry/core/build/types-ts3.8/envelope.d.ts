import { Client } from './client';
import { SentrySpan } from './tracing/sentrySpan';
import { LegacyCSPReport } from './types-hoist/csp';
import { DsnComponents } from './types-hoist/dsn';
import { EventEnvelope, RawSecurityEnvelope, SessionEnvelope, SpanEnvelope } from './types-hoist/envelope';
import { Event } from './types-hoist/event';
import { SdkMetadata } from './types-hoist/sdkmetadata';
import { Session, SessionAggregates } from './types-hoist/session';
/** Creates an envelope from a Session */
export declare function createSessionEnvelope(session: Session | SessionAggregates, dsn?: DsnComponents, metadata?: SdkMetadata, tunnel?: string): SessionEnvelope;
/**
 * Create an Envelope from an event.
 */
export declare function createEventEnvelope(event: Event, dsn?: DsnComponents, metadata?: SdkMetadata, tunnel?: string): EventEnvelope;
/**
 * Create envelope from Span item.
 *
 * Takes an optional client and runs spans through `beforeSendSpan` if available.
 */
export declare function createSpanEnvelope(spans: [
    SentrySpan,
    ...SentrySpan[]
], client?: Client): SpanEnvelope;
/**
 * Create an Envelope from a CSP report.
 */
export declare function createRawSecurityEnvelope(report: LegacyCSPReport, dsn: DsnComponents, tunnel?: string, release?: string, environment?: string): RawSecurityEnvelope;
//# sourceMappingURL=envelope.d.ts.map
