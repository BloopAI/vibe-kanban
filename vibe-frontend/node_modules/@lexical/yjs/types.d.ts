/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import { CollabDecoratorNode } from './CollabDecoratorNode';
import { CollabElementNode } from './CollabElementNode';
import { CollabLineBreakNode } from './CollabLineBreakNode';
import { CollabTextNode } from './CollabTextNode';
declare module 'yjs' {
    interface XmlElement {
        _collabNode: CollabDecoratorNode;
    }
    interface XmlText {
        _collabNode: CollabElementNode;
    }
    interface Map<MapType> {
        _collabNode: CollabLineBreakNode | CollabTextNode;
    }
}
