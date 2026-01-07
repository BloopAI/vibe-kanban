import { ProductTour } from '../posthog-product-tours-types';
export declare function doesTourActivateByEvent(tour: Pick<ProductTour, 'conditions'>): boolean;
export declare function doesTourActivateByAction(tour: Pick<ProductTour, 'conditions'>): boolean;
