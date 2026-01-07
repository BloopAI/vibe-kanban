import type { ClientRect } from '../../types';
interface Options {
    ignoreTransform?: boolean;
}
/**
 * Returns the bounding client rect of an element relative to the viewport.
 */
export declare function getClientRect(element: Element, options?: Options): {
    top: number;
    left: number;
    width: number;
    height: number;
    bottom: number;
    right: number;
};
/**
 * Returns the bounding client rect of an element relative to the viewport.
 *
 * @remarks
 * The ClientRect returned by this method does not take into account transforms
 * applied to the element it measures.
 *
 */
export declare function getTransformAgnosticClientRect(element: Element): ClientRect;
export {};
