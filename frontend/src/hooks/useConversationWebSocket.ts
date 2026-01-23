import { useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { conversationKeys } from './useReviewConversations';
import type { ConversationEvent, ConversationWithMessages } from 'shared/types';

export function useConversationWebSocket(attemptId: string | undefined) {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const retryAttemptsRef = useRef<number>(0);
  const [retryNonce, setRetryNonce] = useState(0);
  const attemptIdRef = useRef(attemptId);
  attemptIdRef.current = attemptId;

  const scheduleReconnect = useCallback(() => {
    if (retryTimerRef.current) return;
    const attempt = retryAttemptsRef.current;
    const delay = Math.min(8000, 1000 * Math.pow(2, attempt));
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      retryAttemptsRef.current += 1;
      setRetryNonce((n) => n + 1);
    }, delay);
  }, []);

  const handleEvent = useCallback(
    (event: ConversationEvent) => {
      const id = attemptIdRef.current;
      if (!id) return;

      switch (event.type) {
        case 'conversation_created': {
          queryClient.setQueryData<ConversationWithMessages[]>(
            conversationKeys.byAttempt(id),
            (old) => (old ? [...old, event.conversation] : [event.conversation])
          );
          if (!event.conversation.is_resolved) {
            queryClient.setQueryData<ConversationWithMessages[]>(
              conversationKeys.unresolved(id),
              (old) =>
                old ? [...old, event.conversation] : [event.conversation]
            );
          }
          break;
        }

        case 'message_added':
        case 'conversation_resolved':
        case 'conversation_unresolved':
        case 'message_deleted': {
          const conv = event.conversation;
          queryClient.setQueryData<ConversationWithMessages[]>(
            conversationKeys.byAttempt(id),
            (old) =>
              old ? old.map((c) => (c.id === conv.id ? conv : c)) : [conv]
          );
          queryClient.setQueryData(conversationKeys.single(id, conv.id), conv);
          queryClient.setQueryData<ConversationWithMessages[]>(
            conversationKeys.unresolved(id),
            (old) => {
              if (!old) return conv.is_resolved ? [] : [conv];
              const filtered = old.filter((c) => c.id !== conv.id);
              return conv.is_resolved ? filtered : [...filtered, conv];
            }
          );
          break;
        }

        case 'conversation_deleted':
        case 'conversation_auto_deleted': {
          const convId = event.conversation_id;
          queryClient.setQueryData<ConversationWithMessages[]>(
            conversationKeys.byAttempt(id),
            (old) => (old ? old.filter((c) => c.id !== convId) : [])
          );
          queryClient.setQueryData<ConversationWithMessages[]>(
            conversationKeys.unresolved(id),
            (old) => (old ? old.filter((c) => c.id !== convId) : [])
          );
          queryClient.removeQueries({
            queryKey: conversationKeys.single(id, convId),
          });
          break;
        }

        case 'refresh': {
          queryClient.invalidateQueries({
            queryKey: conversationKeys.byAttempt(id),
          });
          queryClient.invalidateQueries({
            queryKey: conversationKeys.unresolved(id),
          });
          break;
        }
      }
    },
    [queryClient]
  );

  useEffect(() => {
    if (!attemptId) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      retryAttemptsRef.current = 0;
      return;
    }

    if (wsRef.current) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/task-attempts/${attemptId}/conversations/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      retryAttemptsRef.current = 0;
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }

      if (retryNonce > 0) {
        queryClient.invalidateQueries({
          queryKey: conversationKeys.byAttempt(attemptId),
        });
        queryClient.invalidateQueries({
          queryKey: conversationKeys.unresolved(attemptId),
        });
      }
    };

    ws.onmessage = (evt) => {
      try {
        const event: ConversationEvent = JSON.parse(evt.data);
        handleEvent(event);
      } catch (err) {
        console.error('Failed to parse conversation WS event:', err);
      }
    };

    ws.onerror = () => {};

    ws.onclose = (evt) => {
      wsRef.current = null;
      if (evt.code === 1000 && evt.wasClean) return;
      scheduleReconnect();
    };

    wsRef.current = ws;

    return () => {
      if (wsRef.current) {
        const socket = wsRef.current;
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
        wsRef.current = null;
      }
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [attemptId, retryNonce, handleEvent, scheduleReconnect, queryClient]);
}
