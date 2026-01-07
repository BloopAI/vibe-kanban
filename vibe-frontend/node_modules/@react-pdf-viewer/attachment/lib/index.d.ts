/**
 * A React component to view a PDF document
 *
 * @see https://react-pdf-viewer.dev
 * @license https://react-pdf-viewer.dev/license
 * @copyright 2019-2023 Nguyen Huu Phuoc <me@phuoc.ng>
 */

import type { Plugin } from '@react-pdf-viewer/core';
import * as React from 'react';

// Plugin
export interface AttachmentPlugin extends Plugin {
    Attachments: () => React.ReactElement;
}

export function attachmentPlugin(): AttachmentPlugin;
