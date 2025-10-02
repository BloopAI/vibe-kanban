// ImageChipNode.tsx
import {
  DecoratorNode,
  type NodeKey,
  createCommand,
  $getSelection,
  $isRangeSelection,
} from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $insertNodes } from 'lexical';
import React from 'react';

// ---- Node payload & command
export type ImageChipPayload = {
  src: string;
  name?: string; // filename or label
  sizeKB?: number; // optional metadata
  alt?: string;
};
export const INSERT_IMAGE_CHIP_COMMAND =
  createCommand<ImageChipPayload>('INSERT_IMAGE_CHIP');

// ---- Node definition
export class ImageChipNode extends DecoratorNode<JSX.Element> {
  __src: string;
  __name?: string;
  __sizeKB?: number;
  __alt?: string;

  static getType(): string {
    return 'image-chip';
  }

  static clone(node: ImageChipNode): ImageChipNode {
    return new ImageChipNode(
      {
        src: node.__src,
        name: node.__name,
        sizeKB: node.__sizeKB,
        alt: node.__alt,
      },
      node.__key
    );
  }

  constructor(payload: ImageChipPayload, key?: NodeKey) {
    super(key);
    this.__src = payload.src;
    this.__name = payload.name;
    this.__sizeKB = payload.sizeKB;
    this.__alt = payload.alt;
  }

  // Render as a React “chip”, not an <img>
  decorate(): JSX.Element {
    const name = this.__name ?? this.__src.split('/').pop() ?? 'image';
    const meta = this.__sizeKB
      ? `${this.__sizeKB} KB`
      : this.__alt
        ? this.__alt
        : '';
    return (
      <span
        contentEditable={false}
        className="inline-flex items-center gap-2 px-2 py-1 rounded-full border text-sm align-middle"
        title={this.__src}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
          <path
            d="M4 5h16v14H4zM4 16l4-4 3 3 4-5 5 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
        <span className="font-medium">{name}</span>
        {meta && <span className="opacity-70">· {meta}</span>}
      </span>
    );
  }

  createDOM(): HTMLElement {
    // container for the React decoration
    return document.createElement('span');
  }

  updateDOM(): boolean {
    return false;
  }

  static importJSON(json: any): ImageChipNode {
    return new ImageChipNode(json);
  }
  exportJSON(): any {
    return {
      type: 'image-chip',
      version: 1,
      src: this.__src,
      name: this.__name,
      sizeKB: this.__sizeKB,
      alt: this.__alt,
    };
  }
  isInline(): boolean {
    return true;
  }
}

// ---- Helper to create the node
export function $createImageChipNode(payload: ImageChipPayload): ImageChipNode {
  return new ImageChipNode(payload);
}

// ---- Tiny plugin: wire a demo button + command
export function InsertImageChipPlugin() {
  const [editor] = useLexicalComposerContext();

  React.useEffect(() => {
    return editor.registerCommand(
      INSERT_IMAGE_CHIP_COMMAND,
      (payload) => {
        editor.update(() => {
          const sel = $getSelection();
          if ($isRangeSelection(sel)) {
            $insertNodes([$createImageChipNode(payload)]);
          }
        });
        return true;
      },
      0
    );
  }, [editor]);

  return null;

  // // Example UI (replace with your own image picker/uploader)
  // return (
  //     <div className="mt-2 flex gap-2">
  //         <button
  //             type="button"
  //             className="px-2 py-1 border rounded"
  //             onClick={() =>
  //                 editor.dispatchCommand(INSERT_IMAGE_CHIP_COMMAND, {
  //                     src: "https://example.com/cat.png",
  //                     name: "cat.png",
  //                     sizeKB: 128,
  //                     alt: "Cat",
  //                 })
  //             }
  //         >
  //             Insert image chip
  //         </button>
  //     </div>
  // );
}

export function $isImageChipNode(node: unknown): node is ImageChipNode {
  return node instanceof ImageChipNode;
}
