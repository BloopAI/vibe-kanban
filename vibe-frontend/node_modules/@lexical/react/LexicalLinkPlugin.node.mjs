/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

const mod = await (process.env.NODE_ENV !== 'production' ? import('./LexicalLinkPlugin.dev.mjs') : import('./LexicalLinkPlugin.prod.mjs'));
export const LinkPlugin = mod.LinkPlugin;