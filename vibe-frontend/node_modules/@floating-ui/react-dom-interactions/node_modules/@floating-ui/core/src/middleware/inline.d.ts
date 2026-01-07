import type { Middleware, Padding } from '../types';
export interface Options {
    /**
     * Viewport-relative `x` coordinate to choose a `ClientRect`.
     * @default undefined
     */
    x: number;
    /**
     * Viewport-relative `y` coordinate to choose a `ClientRect`.
     * @default undefined
     */
    y: number;
    /**
     * @experimental
     * @default 2
     */
    padding: Padding;
}
/**
 * Provides improved positioning for inline reference elements that can span
 * over multiple lines, such as hyperlinks or range selections.
 * @see https://floating-ui.com/docs/inline
 */
export declare const inline: (options?: Partial<Options>) => Middleware;
