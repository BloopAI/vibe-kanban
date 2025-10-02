// imageChipExport.ts
import type { TextMatchTransformer } from '@lexical/markdown';
import { $isImageChipNode, ImageChipNode } from './ImageChipNode';

export const IMAGE_CHIP_EXPORT: TextMatchTransformer = {
  type: 'text-match',
  dependencies: [ImageChipNode],

  // required by the type but unused here:
  regExp: /$^/, // never matches

  export: (node) => {
    if (!$isImageChipNode(node)) return null;
    const alt = node.__alt ?? '';
    const src = node.__src;
    return `![${alt}](${src})`;
  },
};
