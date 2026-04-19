import { useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { CodeBlockCopyButton } from '@/shared/components/CodeBlockCopyButton';

interface MountedCodeBlock {
  host: HTMLDivElement;
  root: Root;
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

    const cleanupRemovedBlocks = () => {
      for (const [element, mountedBlock] of mountedBlocksRef.current) {
        if (element.isConnected) continue;
        mountedBlock.root.unmount();
        mountedBlock.host.remove();
        mountedBlocksRef.current.delete(element);
      }
    };

    const syncCodeBlocks = () => {
      cleanupRemovedBlocks();

      const codeBlocks = editorRoot.querySelectorAll<HTMLElement>('code.block');
      codeBlocks.forEach((codeBlock) => {
        if (mountedBlocksRef.current.has(codeBlock)) return;

        const codeText = codeBlock.textContent?.replace(/\n$/, '') ?? '';
        if (!codeText.trim()) return;

        const host = document.createElement('div');
        host.className =
          'pointer-events-none absolute right-2 top-2 z-10 opacity-0 transition-opacity group-hover:opacity-100';

        codeBlock.style.position = 'relative';
        codeBlock.style.paddingTop = '2.25rem';
        codeBlock.style.paddingRight = '3rem';
        codeBlock.classList.add('group');
        codeBlock.appendChild(host);

        const root = createRoot(host);
        root.render(<CodeBlockCopyButton text={codeText} />);

        mountedBlocksRef.current.set(codeBlock, { host, root });
      });
    };

    syncCodeBlocks();

    const observer = new MutationObserver(() => {
      syncCodeBlocks();
    });

    observer.observe(editorRoot, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      for (const [, mountedBlock] of mountedBlocksRef.current) {
        mountedBlock.root.unmount();
        mountedBlock.host.remove();
      }
      mountedBlocksRef.current.clear();
    };
  }, [editor, enabled]);

  return null;
}
