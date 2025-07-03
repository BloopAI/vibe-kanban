import { useState, useEffect } from 'react';
import { 
  User, 
  Bot, 
  Eye, 
  Edit, 
  Terminal, 
  Search, 
  Globe, 
  Plus, 
  Settings,
  Brain,
  MessageSquare 
} from 'lucide-react';
import { makeRequest } from '@/lib/api';
import type { NormalizedConversation, NormalizedEntryType, ExecutionProcess, ApiResponse } from 'shared/types';

interface NormalizedConversationViewerProps {
  executionProcess: ExecutionProcess;
  projectId: string;
}

const getEntryIcon = (entryType: NormalizedEntryType) => {
  if (entryType.type === 'user_message') {
    return <User className="h-4 w-4 text-blue-600" />;
  }
  if (entryType.type === 'assistant_message') {
    return <Bot className="h-4 w-4 text-green-600" />;
  }
  if (entryType.type === 'system_message') {
    return <Settings className="h-4 w-4 text-gray-600" />;
  }
  if (entryType.type === 'thinking') {
    return <Brain className="h-4 w-4 text-purple-600" />;
  }
  if (entryType.type === 'tool_use') {
    const { action_type } = entryType;
    if (action_type.action === 'file_read') {
      return <Eye className="h-4 w-4 text-orange-600" />;
    }
    if (action_type.action === 'file_write') {
      return <Edit className="h-4 w-4 text-red-600" />;
    }
    if (action_type.action === 'command_run') {
      return <Terminal className="h-4 w-4 text-yellow-600" />;
    }
    if (action_type.action === 'search') {
      return <Search className="h-4 w-4 text-indigo-600" />;
    }
    if (action_type.action === 'web_fetch') {
      return <Globe className="h-4 w-4 text-cyan-600" />;
    }
    if (action_type.action === 'task_create') {
      return <Plus className="h-4 w-4 text-teal-600" />;
    }
    return <Settings className="h-4 w-4 text-gray-600" />;
  }
  return <MessageSquare className="h-4 w-4 text-gray-400" />;
};

const getEntryTypeDisplay = (entryType: NormalizedEntryType) => {
  if (entryType.type === 'user_message') return 'User';
  if (entryType.type === 'assistant_message') return 'Assistant';
  if (entryType.type === 'system_message') return 'System';
  if (entryType.type === 'thinking') return 'Thinking';
  if (entryType.type === 'tool_use') {
    const { tool_name, action_type } = entryType;
    if (action_type.action === 'file_read') {
      return `Read: ${action_type.path}`;
    }
    if (action_type.action === 'file_write') {
      return `Write: ${action_type.path}`;
    }
    if (action_type.action === 'command_run') {
      return `Command: ${action_type.command}`;
    }
    if (action_type.action === 'search') {
      return `Search: ${action_type.query}`;
    }
    if (action_type.action === 'web_fetch') {
      return `Fetch: ${action_type.url}`;
    }
    if (action_type.action === 'task_create') {
      return `Task: ${action_type.description}`;
    }
    if (action_type.action === 'other') {
      return `${tool_name}: ${action_type.description}`;
    }
    return tool_name;
  }
  return 'Message';
};

export function NormalizedConversationViewer({ 
  executionProcess, 
  projectId 
}: NormalizedConversationViewerProps) {
  const [conversation, setConversation] = useState<NormalizedConversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchNormalizedLogs = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await makeRequest(
          `/api/projects/${projectId}/execution-processes/${executionProcess.id}/normalized-logs`
        );
        
        if (response.ok) {
          const result: ApiResponse<NormalizedConversation> = await response.json();
          if (result.success && result.data) {
            setConversation(result.data);
          } else {
            setError(result.message || 'Failed to fetch normalized logs');
          }
        } else {
          const errorText = await response.text();
          setError(`Failed to fetch logs: ${errorText || response.statusText}`);
        }
      } catch (err) {
        setError(`Error fetching logs: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setLoading(false);
      }
    };

    fetchNormalizedLogs();
  }, [executionProcess.id, projectId]);

  if (loading) {
    return (
      <div className="text-xs text-muted-foreground italic text-center">
        Loading conversation...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-xs text-red-600 text-center">
        {error}
      </div>
    );
  }

  if (!conversation || conversation.entries.length === 0) {
    return (
      <div className="text-xs text-muted-foreground italic text-center">
        No conversation data available
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {conversation.entries.map((entry, index) => (
        <div key={index} className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-1">
            {getEntryIcon(entry.entry_type)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-muted-foreground">
                {getEntryTypeDisplay(entry.entry_type)}
              </span>
            </div>
            <div className="text-sm whitespace-pre-wrap break-words">
              {entry.content}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
