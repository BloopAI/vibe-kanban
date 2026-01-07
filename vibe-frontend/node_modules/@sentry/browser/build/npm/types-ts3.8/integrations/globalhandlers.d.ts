type GlobalHandlersIntegrationsOptionKeys = 'onerror' | 'onunhandledrejection';
type GlobalHandlersIntegrations = Record<GlobalHandlersIntegrationsOptionKeys, boolean>;
export declare const globalHandlersIntegration: (options?: Partial<GlobalHandlersIntegrations> | undefined) => import("@sentry/core").Integration;
export {};
//# sourceMappingURL=globalhandlers.d.ts.map
