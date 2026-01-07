/**
 * Generic type-safe event emitter
 * @template TEvents - Record of event names to event payload types
 */
export declare class EventEmitter<TEvents extends Record<string, any>> {
    private listeners;
    /**
     * Subscribe to an event
     * @param event - Event name to listen for
     * @param callback - Function to call when event is emitted
     * @returns Unsubscribe function
     */
    on<T extends keyof TEvents>(event: T, callback: (event: TEvents[T]) => void): () => void;
    /**
     * Subscribe to an event once (automatically unsubscribes after first emission)
     * @param event - Event name to listen for
     * @param callback - Function to call when event is emitted
     * @returns Unsubscribe function
     */
    once<T extends keyof TEvents>(event: T, callback: (event: TEvents[T]) => void): () => void;
    /**
     * Unsubscribe from an event
     * @param event - Event name to stop listening for
     * @param callback - Function to remove
     */
    off<T extends keyof TEvents>(event: T, callback: (event: TEvents[T]) => void): void;
    /**
     * Wait for an event to be emitted
     * @param event - Event name to wait for
     * @param timeout - Optional timeout in milliseconds
     * @returns Promise that resolves with the event payload
     */
    waitFor<T extends keyof TEvents>(event: T, timeout?: number): Promise<TEvents[T]>;
    /**
     * Emit an event to all listeners
     * @param event - Event name to emit
     * @param eventPayload - Event payload
     * @internal For use by subclasses - subclasses should wrap this with a public emit if needed
     */
    protected emitInner<T extends keyof TEvents>(event: T, eventPayload: TEvents[T]): void;
    /**
     * Clear all listeners
     */
    protected clearListeners(): void;
}
