/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

'use strict'
const LexicalPlainText = process.env.NODE_ENV !== 'production' ? require('./LexicalPlainText.dev.js') : require('./LexicalPlainText.prod.js');
module.exports = LexicalPlainText;