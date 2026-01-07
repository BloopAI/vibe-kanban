import { Fragment } from 'react';
import { HTMLVisualElement } from '../html/HTMLVisualElement.mjs';
import { SVGVisualElement } from '../svg/SVGVisualElement.mjs';
import { isSVGComponent } from './utils/is-svg-component.mjs';

const createDomVisualElement = (Component, options) => {
    /**
     * Use explicit isSVG override if provided, otherwise auto-detect
     */
    const isSVG = options.isSVG ?? isSVGComponent(Component);
    return isSVG
        ? new SVGVisualElement(options)
        : new HTMLVisualElement(options, {
            allowProjection: Component !== Fragment,
        });
};

export { createDomVisualElement };
//# sourceMappingURL=create-visual-element.mjs.map
