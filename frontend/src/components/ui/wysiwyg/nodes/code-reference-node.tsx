import { useCallback } from 'react';
import { NodeKey, SerializedLexicalNode, Spread } from 'lexical';
import {
  CodeReferenceCard,
  type CodeReferenceData,
} from '@/components/ui/code-reference-card';
import {
  createDecoratorNode,
  type DecoratorNodeConfig,
  type GeneratedDecoratorNode,
} from '../lib/create-decorator-node';
import { useScrollToLineStore } from '@/stores/useScrollToLineStore';

export type { CodeReferenceData } from '@/components/ui/code-reference-card';

export type SerializedCodeReferenceNode = Spread<
  { data: CodeReferenceData },
  SerializedLexicalNode
>;

function CodeReferenceComponent({
  data,
  onDoubleClickEdit,
}: {
  data: CodeReferenceData;
  nodeKey: NodeKey;
  onDoubleClickEdit: (event: React.MouseEvent) => void;
}): JSX.Element {
  const setScrollTarget = useScrollToLineStore((s) => s.setScrollTarget);

  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      // Scroll to the referenced line in the diff view
      setScrollTarget({
        filePath: data.filePath,
        lineNumber: data.lineNumber,
        side: data.side,
      });
    },
    [data.filePath, data.lineNumber, data.side, setScrollTarget]
  );

  return (
    <CodeReferenceCard
      filePath={data.filePath}
      lineNumber={data.lineNumber}
      side={data.side}
      codeLine={data.codeLine}
      onClick={handleClick}
      onDoubleClick={onDoubleClickEdit}
    />
  );
}

const config: DecoratorNodeConfig<CodeReferenceData> = {
  type: 'code-reference',
  serialization: {
    format: 'fenced',
    language: 'code-ref',
    serialize: (data) => JSON.stringify(data, null, 2),
    deserialize: (content) => JSON.parse(content),
    validate: (data) =>
      !!(
        data.filePath &&
        typeof data.lineNumber === 'number' &&
        (data.side === 'old' || data.side === 'new')
      ),
  },
  component: CodeReferenceComponent,
  exportDOM: (data) => {
    const span = document.createElement('span');
    span.setAttribute('data-code-ref-path', data.filePath);
    span.setAttribute('data-code-ref-line', String(data.lineNumber));
    span.setAttribute('data-code-ref-side', data.side);
    span.textContent = `${data.filePath}:${data.lineNumber} (${data.side})`;
    return span;
  },
};

const result = createDecoratorNode(config);

export const CodeReferenceNode = result.Node;
export type CodeReferenceNodeInstance =
  GeneratedDecoratorNode<CodeReferenceData>;
export const $createCodeReferenceNode = result.createNode;
export const $isCodeReferenceNode = result.isNode;
export const [CODE_REFERENCE_EXPORT_TRANSFORMER, CODE_REFERENCE_TRANSFORMER] =
  result.transformers;
