import {
  DecoratorNode,
  DOMConversionMap,
  DOMExportOutput,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical';
import { PrismTokenizer } from '@lexical/code';
import { CODE_HIGHLIGHT_CLASSES } from '../lib/code-highlight-theme';

export type SerializedInlineCodeNode = Spread<
  {
    code: string;
  },
  SerializedLexicalNode
>;

interface Token {
  type: string;
  content: string | Token | (string | Token)[];
}

function renderToken(token: string | Token, index: number): React.ReactNode {
  if (typeof token === 'string') {
    return token;
  }

  const className = CODE_HIGHLIGHT_CLASSES[token.type] || '';

  // Handle nested tokens
  let content: React.ReactNode;
  if (typeof token.content === 'string') {
    content = token.content;
  } else if (Array.isArray(token.content)) {
    content = token.content.map((t, i) => renderToken(t, i));
  } else {
    content = renderToken(token.content, 0);
  }

  return (
    <span key={index} className={className}>
      {content}
    </span>
  );
}

function InlineCodeComponent({ code }: { code: string }): JSX.Element {
  // Use PrismTokenizer to tokenize the code
  const tokens = PrismTokenizer.tokenize(code);

  return (
    <code className="font-mono bg-muted px-1 py-0.5 rounded text-sm">
      {tokens.map((token, index) => renderToken(token, index))}
    </code>
  );
}

export class InlineCodeNode extends DecoratorNode<JSX.Element> {
  __code: string;

  static getType(): string {
    return 'inline-code';
  }

  static clone(node: InlineCodeNode): InlineCodeNode {
    return new InlineCodeNode(node.__code, node.__key);
  }

  constructor(code: string, key?: NodeKey) {
    super(key);
    this.__code = code;
  }

  createDOM(): HTMLElement {
    const span = document.createElement('span');
    return span;
  }

  updateDOM(): false {
    return false;
  }

  static importJSON(serializedNode: SerializedInlineCodeNode): InlineCodeNode {
    const { code } = serializedNode;
    return $createInlineCodeNode(code);
  }

  exportJSON(): SerializedInlineCodeNode {
    return {
      type: 'inline-code',
      version: 1,
      code: this.__code,
    };
  }

  static importDOM(): DOMConversionMap | null {
    return {
      code: (domNode: HTMLElement) => {
        // Only import inline code elements (not block code)
        const isBlock =
          domNode.parentElement?.tagName === 'PRE' ||
          domNode.style.display === 'block';
        if (isBlock) {
          return null;
        }
        return {
          conversion: (node: HTMLElement) => {
            const code = node.textContent || '';
            return { node: $createInlineCodeNode(code) };
          },
          priority: 0,
        };
      },
    };
  }

  exportDOM(): DOMExportOutput {
    const code = document.createElement('code');
    code.textContent = this.__code;
    return { element: code };
  }

  getCode(): string {
    return this.__code;
  }

  getTextContent(): string {
    return this.__code;
  }

  decorate(): JSX.Element {
    return <InlineCodeComponent code={this.__code} />;
  }

  isInline(): boolean {
    return true;
  }

  isKeyboardSelectable(): boolean {
    return true;
  }
}

export function $createInlineCodeNode(code: string): InlineCodeNode {
  return new InlineCodeNode(code);
}

export function $isInlineCodeNode(
  node: LexicalNode | null | undefined
): node is InlineCodeNode {
  return node instanceof InlineCodeNode;
}
