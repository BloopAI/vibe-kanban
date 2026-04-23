import { useEffect, useRef, type RefObject } from 'react';

import type { ConversationListHandle } from './ConversationListContainer';

interface UsePinConversationToBottomOnChatBoxResizeOptions {
  containerRef: RefObject<HTMLElement | null>;
  conversationListRef: RefObject<ConversationListHandle | null>;
  isAtBottom: boolean;
  scopeKey: string;
}

/**
 * Keeps the conversation visually pinned to the latest messages when the chat
 * composer area changes height. Without this, composer/tooling growth shrinks
 * the viewport from below and appears to "jump" the conversation upward.
 */
export function usePinConversationToBottomOnChatBoxResize({
  containerRef,
  conversationListRef,
  isAtBottom,
  scopeKey,
}: UsePinConversationToBottomOnChatBoxResizeOptions) {
  const isAtBottomRef = useRef(isAtBottom);

  useEffect(() => {
    isAtBottomRef.current = isAtBottom;
  }, [isAtBottom]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;

    const chatBoxContainer = container.querySelector<HTMLElement>(
      '[data-chatbox-container="true"]'
    );
    if (!chatBoxContainer) return;

    let previousHeight = chatBoxContainer.getBoundingClientRect().height;

    const observer = new ResizeObserver((entries) => {
      const nextHeight =
        entries[0]?.contentRect.height ??
        chatBoxContainer.getBoundingClientRect().height;

      if (Math.abs(nextHeight - previousHeight) < 0.5) return;
      const heightDelta = nextHeight - previousHeight;
      previousHeight = nextHeight;

      if (!isAtBottomRef.current) return;

      requestAnimationFrame(() => {
        if (!isAtBottomRef.current) return;
        conversationListRef.current?.adjustScrollBy(heightDelta);
      });
    });

    observer.observe(chatBoxContainer);

    return () => {
      observer.disconnect();
    };
  }, [containerRef, conversationListRef, scopeKey]);
}
