/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

'use strict'
const LexicalLinkPlugin = process.env.NODE_ENV !== 'production' ? require('./LexicalLinkPlugin.dev.js') : require('./LexicalLinkPlugin.prod.js');
module.exports = LexicalLinkPlugin;