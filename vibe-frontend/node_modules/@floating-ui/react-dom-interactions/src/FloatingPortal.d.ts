import React from 'react';
/**
 * Portals your floating element outside of the main app node.
 * @see https://floating-ui.com/docs/FloatingPortal
 */
export declare const FloatingPortal: ({ children, id, }: {
    children?: React.ReactNode;
    id?: string;
}) => React.ReactPortal | null;
