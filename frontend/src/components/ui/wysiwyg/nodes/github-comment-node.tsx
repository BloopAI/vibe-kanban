import { useCallback } from 'react';
import { NodeKey, SerializedLexicalNode, Spread } from 'lexical';
import { GitHubCommentCard } from '@/components/ui/github-comment-card';
import {
  createDecoratorNode,
  type DecoratorNodeConfig,
  type GeneratedDecoratorNode,
} from '../lib/create-decorator-node';

/**
 * Normalized comment data stored in the node.
 * Uses string IDs (bigint converted) and consistent field names.
 */
export interface NormalizedComment {
  id: string;
  comment_type: 'general' | 'review';
  author: string;
  body: string;
  created_at: string;
  url: string;
  // Review-specific (optional)
  path?: string;
  line?: number | null;
  diff_hunk?: string;
}

export type SerializedGitHubCommentNode = Spread<
  NormalizedComment,
  SerializedLexicalNode
>;

function GitHubCommentComponent({
  data,
  onDoubleClickEdit,
}: {
  data: NormalizedComment;
  nodeKey: NodeKey;
  onDoubleClickEdit: (event: React.MouseEvent) => void;
}): JSX.Element {
  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      // Open GitHub URL in new tab
      window.open(data.url, '_blank', 'noopener,noreferrer');
    },
    [data.url]
  );

  return (
    <GitHubCommentCard
      author={data.author}
      body={data.body}
      createdAt={data.created_at}
      url={data.url}
      commentType={data.comment_type}
      path={data.path}
      line={data.line}
      diffHunk={data.diff_hunk}
      variant="full"
      onClick={handleClick}
      onDoubleClick={onDoubleClickEdit}
    />
  );
}

const config: DecoratorNodeConfig<NormalizedComment> = {
  type: 'github-comment',
  serialization: {
    format: 'fenced',
    language: 'gh-comment',
    serialize: (data) => JSON.stringify(data, null, 2),
    deserialize: (content) => JSON.parse(content),
    validate: (data) =>
      !!(data.id && data.comment_type && data.author && data.body && data.url),
  },
  component: GitHubCommentComponent,
  exportDOM: (data) => {
    const span = document.createElement('span');
    span.setAttribute('data-github-comment-id', data.id);
    span.textContent = `GitHub comment by @${data.author}: ${data.body}`;
    return span;
  },
};

const result = createDecoratorNode(config);

export const GitHubCommentNode = result.Node;
export type GitHubCommentNodeInstance =
  GeneratedDecoratorNode<NormalizedComment>;
export const $createGitHubCommentNode = result.createNode;
export const $isGitHubCommentNode = result.isNode;
export const [GITHUB_COMMENT_EXPORT_TRANSFORMER, GITHUB_COMMENT_TRANSFORMER] =
  result.transformers;
