import { TextMatchTransformer } from '@lexical/markdown';
import { $createImageNode, ImageNode } from '../nodes/image-node';

export const IMAGE_TRANSFORMER: TextMatchTransformer = {
  dependencies: [ImageNode],
  export: (node) => {
    if (node instanceof ImageNode) {
      return `![${node.getAltText()}](${node.getSrc()})`;
    }
    return null;
  },
  importRegExp: /!\[([^\]]*)\]\(([^)]+)\)/,
  regExp: /!\[([^\]]*)\]\(([^)]+)\)$/,
  replace: (textNode, match) => {
    const [, altText, src] = match;
    const imageNode = $createImageNode(src, altText);
    textNode.replace(imageNode);
  },
  trigger: ')',
  type: 'text-match',
};
