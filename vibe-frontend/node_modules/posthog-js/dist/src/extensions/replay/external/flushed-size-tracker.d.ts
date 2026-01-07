import { PostHog } from '../../../posthog-core';
export declare class FlushedSizeTracker {
    private readonly _getProperty;
    private readonly _setProperty;
    constructor(posthog: PostHog);
    trackSize(size: number): void;
    reset(): void;
    get currentTrackedSize(): number;
}
