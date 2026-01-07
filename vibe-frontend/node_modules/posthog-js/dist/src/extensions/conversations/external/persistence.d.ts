import { PostHog } from '../../../posthog-core';
import { UserProvidedTraits } from '../../../posthog-conversations-types';
/**
 * ConversationsPersistence manages conversation-related data using PostHog's
 * core persistence layer. This ensures the data respects user's persistence
 * preferences (localStorage, cookie, sessionStorage, memory) and consent settings.
 */
export declare class ConversationsPersistence {
    private readonly _posthog;
    private _cachedWidgetSessionId;
    constructor(_posthog: PostHog);
    /** Check if persistence is available and enabled */
    private _isPersistenceAvailable;
    /**
     * Get or create the widget session ID (random UUID for access control).
     * This ID is generated once per browser and persists across sessions.
     * It is NOT tied to distinct_id - it stays the same even when user identifies.
     *
     * SECURITY: This is the key for access control. Only the browser that created
     * the widget_session_id can access tickets associated with it.
     */
    getOrCreateWidgetSessionId(): string;
    /**
     * Clear the widget session ID (called on posthog.reset()).
     * This will create a new session and lose access to previous tickets.
     */
    clearWidgetSessionId(): void;
    /**
     * Save the current ticket ID to persistence
     */
    saveTicketId(ticketId: string): void;
    /**
     * Load the current ticket ID from persistence
     */
    loadTicketId(): string | null;
    /**
     * Clear the current ticket ID from persistence
     */
    clearTicketId(): void;
    /**
     * Save widget state (open, closed)
     */
    saveWidgetState(state: 'open' | 'closed'): void;
    /**
     * Load widget state
     */
    loadWidgetState(): 'open' | 'closed' | null;
    /**
     * Save user-provided traits (name, email) to persistence
     */
    saveUserTraits(traits: UserProvidedTraits): void;
    /**
     * Load user-provided traits from persistence
     */
    loadUserTraits(): UserProvidedTraits | null;
    /**
     * Clear user-provided traits from persistence
     */
    clearUserTraits(): void;
    /**
     * Clear all conversation-related data from persistence.
     * This is called on posthog.reset() to start fresh.
     */
    clearAll(): void;
}
