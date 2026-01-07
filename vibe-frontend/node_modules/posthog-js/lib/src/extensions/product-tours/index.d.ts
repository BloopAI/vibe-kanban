import { PostHog } from '../../posthog-core';
import { ProductTourManager } from './product-tours';
export { ProductTourManager } from './product-tours';
export { findElementBySelector, getElementMetadata, getProductTourStylesheet } from './product-tours-utils';
export declare function generateProductTours(posthog: PostHog, isEnabled: boolean): ProductTourManager | undefined;
