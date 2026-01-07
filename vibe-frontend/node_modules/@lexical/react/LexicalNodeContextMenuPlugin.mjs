/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import * as modDev from './LexicalNodeContextMenuPlugin.dev.mjs';
import * as modProd from './LexicalNodeContextMenuPlugin.prod.mjs';
const mod = process.env.NODE_ENV !== 'production' ? modDev : modProd;
export const NodeContextMenuOption = mod.NodeContextMenuOption;
export const NodeContextMenuPlugin = mod.NodeContextMenuPlugin;
export const NodeContextMenuSeparator = mod.NodeContextMenuSeparator;