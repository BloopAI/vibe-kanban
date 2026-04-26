import { useEffect, useRef } from 'react';
import { $isCodeNode, CodeNode } from '@lexical/code';
import { createRoot, type Root } from 'react-dom/client';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getRoot,
  $isElementNode,
  type ElementNode,
  type RootNode,
} from 'lexical';
import { CodeBlockCopyButton } from '@/shared/components/CodeBlockCopyButton';

interface MountedCodeBlock {
  host: HTMLDivElement;
  root: Root;
  text: string;
}

interface ReadOnlyCodeBlockCopyPluginProps {
  enabled?: boolean;
}

export function ReadOnlyCodeBlockCopyPlugin({
  enabled = true,
}: ReadOnlyCodeBlockCopyPluginProps) {
  const [editor] = useLexicalComposerContext();
  const mountedBlocksRef = useRef<Map<HTMLElement, MountedCodeBlock>>(
    new Map()
  );

  useEffect(() => {
    if (!enabled) return;

    const editorRoot = editor.getRootElement();
    if (!editorRoot) return;

    const removeMountedBlock = (element: HTMLElement) => {
      const mountedBlock = mountedBlocksRef.current.get(element);
      if (!mountedBlock) return;

      mountedBlock.root.unmount();
      mountedBlock.host.remove();
      element.classList.remove('group');
      element.style.position = '';
      element.style.paddingTop = '';
      element.style.paddingRight = '';
      mountedBlocksRef.current.delete(element);
    };

    const cleanupRemovedBlocks = () => {
      for (const element of Array.from(mountedBlocksRef.current.keys())) {
        if (!element.isConnected) {
          removeMountedBlock(element);
        }
      }
    };

    const syncCodeBlocks = () => {
      cleanupRemovedBlocks();

      const currentElements = new Set<HTMLElement>();
      const codeBlocks: Array<{ element: HTMLElement; text: string }> = [];

      editor.getEditorState().read(() => {
        const visitNode = (node: ElementNode | RootNode = $getRoot()) => {
          for (const child of node.getChildren()) {
            if ($isCodeNode(child)) {
              const element = editor.getElementByKey(child.getKey());
              if (element instanceof HTMLElement) {
                codeBlocks.push({
                  element,
                  text: child.getTextContent().replace(/\n$/, ''),
                });
              }
              continue;
            }

            if ($isElementNode(child)) {
              visitNode(child);
            }
          }
        };

        visitNode();
      });

      codeBlocks.forEach(({ element: codeBlock, text: codeText }) => {
        currentElements.add(codeBlock);

        if (!codeText.trim()) {
          removeMountedBlock(codeBlock);
          return;
        }

        const mountedBlock = mountedBlocksRef.current.get(codeBlock);
        if (mountedBlock) {
          if (mountedBlock.text !== codeText) {
            mountedBlock.text = codeText;
            mountedBlock.root.render(<CodeBlockCopyButton text={codeText} />);
          }
          return;
        }

        const host = document.createElement('div');
        host.className =
          'pointer-events-none absolute right-2 top-2 z-10 opacity-100';

        codeBlock.style.position = 'relative';
        codeBlock.style.paddingTop = '2.25rem';
        codeBlock.style.paddingRight = '3rem';
        codeBlock.classList.add('group');
        codeBlock.appendChild(host);

        const root = createRoot(host);
        root.render(<CodeBlockCopyButton text={codeText} />);

        mountedBlocksRef.current.set(codeBlock, {
          host,
          root,
          text: codeText,
        });
      });

      for (const element of Array.from(mountedBlocksRef.current.keys())) {
        if (!currentElements.has(element)) {
          removeMountedBlock(element);
        }
      }
    };

    const queueSync = () => {
      queueMicrotask(syncCodeBlocks);
    };

    const unregisterMutationListener = editor.registerMutationListener(
      CodeNode,
      queueSync,
      { skipInitialization: false }
    );
    const unregisterUpdateListener = editor.registerUpdateListener(queueSync);

    const observer = new MutationObserver(syncCodeBlocks);
    observer.observe(editorRoot, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    syncCodeBlocks();

    return () => {
      unregisterMutationListener();
      unregisterUpdateListener();
      observer.disconnect();
      for (const element of Array.from(mountedBlocksRef.current.keys())) {
        removeMountedBlock(element);
      }
    };
  }, [editor, enabled]);

  return null;
}
