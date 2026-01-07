/**
 * A React component to view a PDF document
 *
 * @see https://react-pdf-viewer.dev
 * @license https://react-pdf-viewer.dev/license
 * @copyright 2019-2023 Nguyen Huu Phuoc <me@phuoc.ng>
 */

import type { Plugin } from '@react-pdf-viewer/core';
import { SpecialZoomLevel } from '@react-pdf-viewer/core';
import * as React from 'react';

// Types
export interface CurrentScaleProps {
    children?: (props: RenderCurrentScaleProps) => React.ReactElement;
}

export interface RenderCurrentScaleProps {
    scale: number;
}

export interface ZoomInProps {
    children?: (props: RenderZoomInProps) => React.ReactElement;
}

export interface ZoomOutProps {
    children?: (props: RenderZoomOutProps) => React.ReactNode;
}

export interface ZoomProps {
    children?: (props: RenderZoomProps) => React.ReactElement;
    levels?: number[];
}

export interface RenderZoomInProps {
    enableShortcuts: boolean;
    onClick: () => void;
}

export interface RenderZoomOutProps {
    enableShortcuts: boolean;
    onClick: () => void;
}

export interface RenderZoomProps {
    scale: number;
    onZoom(newScale: number | SpecialZoomLevel): void;
}

export interface ZoomMenuItemProps {
    onClick: () => void;
}

export interface ZoomPopoverProps {
    levels?: number[];
}

// Plugin
export interface ZoomPluginProps {
    enableShortcuts?: boolean;
}

export interface ZoomPlugin extends Plugin {
    zoomTo: (scale: number | SpecialZoomLevel) => void;
    CurrentScale: (props: CurrentScaleProps) => React.ReactElement;
    ZoomIn: (props: ZoomInProps) => React.ReactElement;
    ZoomInButton: () => React.ReactElement;
    ZoomInMenuItem: (props: ZoomMenuItemProps) => React.ReactElement;
    ZoomOut: (props: ZoomOutProps) => React.ReactElement;
    ZoomOutButton: () => React.ReactElement;
    ZoomOutMenuItem: (props: ZoomMenuItemProps) => React.ReactElement;
    Zoom: (props: ZoomProps) => React.ReactElement;
    ZoomPopover: (props?: ZoomPopoverProps) => React.ReactElement;
}

export function zoomPlugin(props?: ZoomPluginProps): ZoomPlugin;

// Components
export class ZoomInIcon extends React.Component {}
export class ZoomOutIcon extends React.Component {}
