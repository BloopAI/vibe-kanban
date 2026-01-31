import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, User, Bot, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SwarmChatMessage } from './types';

interface SwarmChatProps {
  messages: SwarmChatMessage[];
  onSendMessage?: (message: string) => void;
  isLoading?: boolean;
}

const senderConfig = {
  system: {
    icon: Settings,
    label: 'System',
    className: 'bg-muted/50',
    iconClassName: 'text-muted-foreground',
  },
  user: {
    icon: User,
    label: 'You',
    className: 'bg-blue-500/10',
    iconClassName: 'text-blue-500',
  },
  sandbox: {
    icon: Bot,
    label: 'Sandbox',
    className: 'bg-green-500/10',
    iconClassName: 'text-green-500',
  },
};

export function SwarmChat({
  messages,
  onSendMessage,
  isLoading = false,
}: SwarmChatProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    onSendMessage?.(input.trim());
    setInput('');
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="border rounded-lg flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b">
        <Bot className="h-4 w-4" aria-hidden="true" />
        <h3 className="font-semibold text-sm">Chat</h3>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No messages yet. Send a message to interact with the swarm.
          </div>
        ) : (
          messages.map((msg) => {
            const config = senderConfig[msg.sender_type];
            const Icon = config.icon;

            return (
              <div
                key={msg.id}
                className={cn('rounded-lg p-3', config.className)}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={cn('h-3.5 w-3.5', config.iconClassName)} aria-hidden="true" />
                  <span className="text-xs font-medium">
                    {msg.sender_id
                      ? `${config.label} (${msg.sender_id.slice(0, 8)})`
                      : config.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatTime(msg.created_at)}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Send a message..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button type="submit" disabled={!input.trim() || isLoading} size="icon" aria-label="Enviar mensagem">
            <Send className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </form>
    </div>
  );
}
