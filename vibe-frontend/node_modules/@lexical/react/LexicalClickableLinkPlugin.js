/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

'use strict'
const LexicalClickableLinkPlugin = process.env.NODE_ENV !== 'production' ? require('./LexicalClickableLinkPlugin.dev.js') : require('./LexicalClickableLinkPlugin.prod.js');
module.exports = LexicalClickableLinkPlugin;