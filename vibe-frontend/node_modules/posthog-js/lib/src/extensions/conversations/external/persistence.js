"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationsPersistence = void 0;
var logger_1 = require("../../../utils/logger");
var uuidv7_1 = require("../../../uuidv7");
var logger = (0, logger_1.createLogger)('[ConversationsPersistence]');
// Persistence keys - defined here in the lazy-loaded extension bundle
// These keys are also listed in constants.ts PERSISTENCE_RESERVED_PROPERTIES
// to prevent them from being included in event properties
var CONVERSATIONS_WIDGET_SESSION_ID = '$conversations_widget_session_id';
var CONVERSATIONS_TICKET_ID = '$conversations_ticket_id';
var CONVERSATIONS_WIDGET_STATE = '$conversations_widget_state';
var CONVERSATIONS_USER_TRAITS = '$conversations_user_traits';
/**
 * ConversationsPersistence manages conversation-related data using PostHog's
 * core persistence layer. This ensures the data respects user's persistence
 * preferences (localStorage, cookie, sessionStorage, memory) and consent settings.
 */
var ConversationsPersistence = /** @class */ (function () {
    function ConversationsPersistence(_posthog) {
        this._posthog = _posthog;
        this._cachedWidgetSessionId = null;
    }
    /** Check if persistence is available and enabled */
    ConversationsPersistence.prototype._isPersistenceAvailable = function () {
        var _a, _b;
        return !!this._posthog.persistence && !((_b = (_a = this._posthog.persistence).isDisabled) === null || _b === void 0 ? void 0 : _b.call(_a));
    };
    /**
     * Get or create the widget session ID (random UUID for access control).
     * This ID is generated once per browser and persists across sessions.
     * It is NOT tied to distinct_id - it stays the same even when user identifies.
     *
     * SECURITY: This is the key for access control. Only the browser that created
     * the widget_session_id can access tickets associated with it.
     */
    ConversationsPersistence.prototype.getOrCreateWidgetSessionId = function () {
        var _a;
        var _b, _c;
        // Return cached value if available
        if (this._cachedWidgetSessionId) {
            return this._cachedWidgetSessionId;
        }
        // Check if persistence is available
        if (!this._isPersistenceAvailable()) {
            // Fallback: generate a new one each time (won't persist)
            // This is acceptable for SSR or environments without persistence
            var sessionId = (0, uuidv7_1.uuidv7)();
            logger.warn('Persistence not available, widget_session_id will not persist', { sessionId: sessionId });
            return sessionId;
        }
        try {
            var sessionId = (_b = this._posthog.persistence) === null || _b === void 0 ? void 0 : _b.get_property(CONVERSATIONS_WIDGET_SESSION_ID);
            if (!sessionId) {
                sessionId = (0, uuidv7_1.uuidv7)();
                (_c = this._posthog.persistence) === null || _c === void 0 ? void 0 : _c.register((_a = {}, _a[CONVERSATIONS_WIDGET_SESSION_ID] = sessionId, _a));
            }
            this._cachedWidgetSessionId = sessionId;
            return sessionId;
        }
        catch (error) {
            logger.error('Failed to get/create widget_session_id', error);
            // Fallback: generate a new one (won't persist)
            return (0, uuidv7_1.uuidv7)();
        }
    };
    /**
     * Clear the widget session ID (called on posthog.reset()).
     * This will create a new session and lose access to previous tickets.
     */
    ConversationsPersistence.prototype.clearWidgetSessionId = function () {
        var _a;
        this._cachedWidgetSessionId = null;
        if (!this._isPersistenceAvailable()) {
            return;
        }
        try {
            (_a = this._posthog.persistence) === null || _a === void 0 ? void 0 : _a.unregister(CONVERSATIONS_WIDGET_SESSION_ID);
            logger.info('Cleared widget_session_id');
        }
        catch (error) {
            logger.error('Failed to clear widget_session_id', error);
        }
    };
    /**
     * Save the current ticket ID to persistence
     */
    ConversationsPersistence.prototype.saveTicketId = function (ticketId) {
        var _a;
        var _b;
        if (!this._isPersistenceAvailable()) {
            logger.warn('Persistence not available');
            return;
        }
        try {
            (_b = this._posthog.persistence) === null || _b === void 0 ? void 0 : _b.register((_a = {}, _a[CONVERSATIONS_TICKET_ID] = ticketId, _a));
            logger.info('Saved ticket ID', { ticketId: ticketId });
        }
        catch (error) {
            logger.error('Failed to save ticket ID', error);
        }
    };
    /**
     * Load the current ticket ID from persistence
     */
    ConversationsPersistence.prototype.loadTicketId = function () {
        var _a;
        if (!this._isPersistenceAvailable()) {
            logger.warn('Persistence not available');
            return null;
        }
        try {
            var ticketId = (_a = this._posthog.persistence) === null || _a === void 0 ? void 0 : _a.get_property(CONVERSATIONS_TICKET_ID);
            if (ticketId) {
                logger.info('Loaded ticket ID', { ticketId: ticketId });
            }
            return ticketId || null;
        }
        catch (error) {
            logger.error('Failed to load ticket ID', error);
            return null;
        }
    };
    /**
     * Clear the current ticket ID from persistence
     */
    ConversationsPersistence.prototype.clearTicketId = function () {
        var _a;
        if (!this._isPersistenceAvailable()) {
            logger.warn('Persistence not available');
            return;
        }
        try {
            (_a = this._posthog.persistence) === null || _a === void 0 ? void 0 : _a.unregister(CONVERSATIONS_TICKET_ID);
            logger.info('Cleared ticket ID');
        }
        catch (error) {
            logger.error('Failed to clear ticket ID', error);
        }
    };
    /**
     * Save widget state (open, closed)
     */
    ConversationsPersistence.prototype.saveWidgetState = function (state) {
        var _a;
        var _b;
        if (!this._isPersistenceAvailable()) {
            return;
        }
        try {
            (_b = this._posthog.persistence) === null || _b === void 0 ? void 0 : _b.register((_a = {}, _a[CONVERSATIONS_WIDGET_STATE] = state, _a));
        }
        catch (error) {
            logger.error('Failed to save widget state', error);
        }
    };
    /**
     * Load widget state
     */
    ConversationsPersistence.prototype.loadWidgetState = function () {
        var _a;
        if (!this._isPersistenceAvailable()) {
            return null;
        }
        try {
            var state = (_a = this._posthog.persistence) === null || _a === void 0 ? void 0 : _a.get_property(CONVERSATIONS_WIDGET_STATE);
            if (state === 'open' || state === 'closed') {
                return state;
            }
            return null;
        }
        catch (error) {
            logger.error('Failed to load widget state', error);
            return null;
        }
    };
    /**
     * Save user-provided traits (name, email) to persistence
     */
    ConversationsPersistence.prototype.saveUserTraits = function (traits) {
        var _a;
        var _b;
        if (!this._isPersistenceAvailable()) {
            logger.warn('Persistence not available');
            return;
        }
        try {
            (_b = this._posthog.persistence) === null || _b === void 0 ? void 0 : _b.register((_a = {}, _a[CONVERSATIONS_USER_TRAITS] = traits, _a));
            logger.info('Saved user traits', { hasName: !!traits.name, hasEmail: !!traits.email });
        }
        catch (error) {
            logger.error('Failed to save user traits', error);
        }
    };
    /**
     * Load user-provided traits from persistence
     */
    ConversationsPersistence.prototype.loadUserTraits = function () {
        var _a;
        if (!this._isPersistenceAvailable()) {
            return null;
        }
        try {
            var traits = (_a = this._posthog.persistence) === null || _a === void 0 ? void 0 : _a.get_property(CONVERSATIONS_USER_TRAITS);
            if (traits) {
                logger.info('Loaded user traits', { hasName: !!traits.name, hasEmail: !!traits.email });
                return traits;
            }
            return null;
        }
        catch (error) {
            logger.error('Failed to load user traits', error);
            return null;
        }
    };
    /**
     * Clear user-provided traits from persistence
     */
    ConversationsPersistence.prototype.clearUserTraits = function () {
        var _a;
        if (!this._isPersistenceAvailable()) {
            return;
        }
        try {
            (_a = this._posthog.persistence) === null || _a === void 0 ? void 0 : _a.unregister(CONVERSATIONS_USER_TRAITS);
            logger.info('Cleared user traits');
        }
        catch (error) {
            logger.error('Failed to clear user traits', error);
        }
    };
    /**
     * Clear all conversation-related data from persistence.
     * This is called on posthog.reset() to start fresh.
     */
    ConversationsPersistence.prototype.clearAll = function () {
        var _a, _b, _c;
        if (!this._isPersistenceAvailable()) {
            return;
        }
        try {
            // Clear all conversation properties
            (_a = this._posthog.persistence) === null || _a === void 0 ? void 0 : _a.unregister(CONVERSATIONS_WIDGET_STATE);
            (_b = this._posthog.persistence) === null || _b === void 0 ? void 0 : _b.unregister(CONVERSATIONS_USER_TRAITS);
            (_c = this._posthog.persistence) === null || _c === void 0 ? void 0 : _c.unregister(CONVERSATIONS_TICKET_ID);
            // Clear widget session ID last (this will lose access to previous tickets)
            this.clearWidgetSessionId();
            logger.info('Cleared all conversation data');
        }
        catch (error) {
            logger.error('Failed to clear conversation data', error);
        }
    };
    return ConversationsPersistence;
}());
exports.ConversationsPersistence = ConversationsPersistence;
//# sourceMappingURL=persistence.js.map