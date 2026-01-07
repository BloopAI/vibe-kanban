/**
 * A React component to view a PDF document
 *
 * @see https://react-pdf-viewer.dev
 * @license https://react-pdf-viewer.dev/license
 * @copyright 2019-2023 Nguyen Huu Phuoc <me@phuoc.ng>
 */

import type { OpenFile, Plugin } from '@react-pdf-viewer/core';
import * as React from 'react';

// Types
export interface DownloadProps {
    children?(props: RenderDownloadProps): React.ReactElement;
}

export interface DownloadMenuItemProps {
    onClick(): void;
}

export interface RenderDownloadProps {
    onClick(): void;
}

// Plugin
export interface GetFilePlugin extends Plugin {
    Download(props: DownloadProps): React.ReactElement;
    DownloadButton(): React.ReactElement;
    DownloadMenuItem(props: DownloadMenuItemProps): React.ReactElement;
}

export interface GetFilePluginProps {
    // Custom the download file name
    fileNameGenerator?: (file: OpenFile) => string;
}

export function getFilePlugin(props?: GetFilePluginProps): GetFilePlugin;

// Components
export class DownloadIcon extends React.Component {}
