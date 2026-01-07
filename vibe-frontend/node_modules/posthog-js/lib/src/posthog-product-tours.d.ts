import { PostHog } from './posthog-core';
import { ProductTour, ProductTourCallback } from './posthog-product-tours-types';
import { RemoteConfig } from './types';
export declare class PostHogProductTours {
    private _instance;
    private _productTourManager;
    private _cachedTours;
    constructor(instance: PostHog);
    onRemoteConfig(response: RemoteConfig): void;
    loadIfEnabled(): void;
    private _loadScript;
    private _startProductTours;
    getProductTours(callback: ProductTourCallback, forceReload?: boolean): void;
    getActiveProductTours(callback: ProductTourCallback): void;
    showProductTour(tourId: string): void;
    previewTour(tour: ProductTour): void;
    dismissProductTour(): void;
    nextStep(): void;
    previousStep(): void;
    clearCache(): void;
    resetTour(tourId: string): void;
    resetAllTours(): void;
    cancelPendingTour(tourId: string): void;
}
