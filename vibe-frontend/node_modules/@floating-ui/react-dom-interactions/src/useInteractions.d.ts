import * as React from 'react';
import type { ElementProps } from './types';
export declare const useInteractions: (propsList?: Array<ElementProps | void>) => {
    getReferenceProps: (userProps?: React.HTMLProps<Element>) => any;
    getFloatingProps: (userProps?: React.HTMLProps<HTMLElement>) => any;
    getItemProps: (userProps?: React.HTMLProps<HTMLElement>) => any;
};
