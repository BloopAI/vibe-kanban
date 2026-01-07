/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

'use strict'
const LexicalTableOfContentsPlugin = process.env.NODE_ENV !== 'production' ? require('./LexicalTableOfContentsPlugin.dev.js') : require('./LexicalTableOfContentsPlugin.prod.js');
module.exports = LexicalTableOfContentsPlugin;