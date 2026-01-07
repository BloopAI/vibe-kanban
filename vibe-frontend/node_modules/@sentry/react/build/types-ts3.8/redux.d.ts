import { Scope } from '@sentry/core';
interface Action<T = any> {
    type: T;
}
interface AnyAction extends Action {
    [extraProps: string]: any;
}
export interface SentryEnhancerOptions<S = any> {
    /**
     * Redux state in attachments or not.
     * @default true
     */
    attachReduxState?: boolean;
    /**
     * Transforms the state before attaching it to an event.
     * Use this to remove any private data before sending it to Sentry.
     * Return null to not attach the state.
     */
    stateTransformer(state: S | undefined): (S & any) | null;
    /**
     * Transforms the action before sending it as a breadcrumb.
     * Use this to remove any private data before sending it to Sentry.
     * Return null to not send the breadcrumb.
     */
    actionTransformer(action: AnyAction): AnyAction | null;
    /**
     * Called on every state update, configure the Sentry Scope with the redux state.
     */
    configureScopeWithState?(scope: Scope, state: S): void;
}
/**
 * Creates an enhancer that would be passed to Redux's createStore to log actions and the latest state to Sentry.
 *
 * @param enhancerOptions Options to pass to the enhancer
 */
declare function createReduxEnhancer(enhancerOptions?: Partial<SentryEnhancerOptions>): any;
export { createReduxEnhancer };
//# sourceMappingURL=redux.d.ts.map
