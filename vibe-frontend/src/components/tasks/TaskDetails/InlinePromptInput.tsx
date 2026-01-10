import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SendHorizonal, Loader2, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAttemptCreation } from '@/hooks/useAttemptCreation';
import { useAgentMentions, type AgentMention } from '@/hooks/useAgentMentions';
import { useRepoBranchSelection } from '@/hooks/useRepoBranchSelection';
import { useProjectRepos, useNavigateWithSearch } from '@/hooks';
import { useProject } from '@/contexts/ProjectContext';
import { paths } from '@/lib/paths';
import { AgentMentionSuggestions } from './AgentMentionSuggestions';
import { cn } from '@/lib/utils';

interface InlinePromptInputProps {
  taskId: string;
  onAttemptCreated?: (workspaceId: string) => void;
  className?: string;
}

export function InlinePromptInput({
  taskId,
  onAttemptCreated,
  className,
}: InlinePromptInputProps) {
  const { t } = useTranslation('tasks');
  const navigate = useNavigateWithSearch();
  const { projectId } = useProject();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // State
  const [promptText, setPromptText] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Hooks
  const {
    defaultProfile,
    filterMentions,
    parseMentions,
    resolveMentionToProfile,
    getMentionPosition,
  } = useAgentMentions();

  const { data: projectRepos = [] } = useProjectRepos(projectId);

  const { getWorkspaceRepoInputs } = useRepoBranchSelection({
    repos: projectRepos,
    enabled: projectRepos.length > 0,
  });

  const { createAttempt, isCreating, error } = useAttemptCreation({
    taskId,
    onSuccess: (attempt) => {
      onAttemptCreated?.(attempt.id);
      if (projectId) {
        navigate(paths.attempt(projectId, taskId, attempt.id));
      }
    },
  });

  // Get current mention state
  const mentionState = getMentionPosition(promptText, cursorPosition);
  const filteredSuggestions = mentionState
    ? filterMentions(mentionState.searchTerm)
    : [];

  // Show suggestions when typing @
  useEffect(() => {
    setShowSuggestions(mentionState !== null && filteredSuggestions.length > 0);
    setSelectedSuggestionIndex(0);
  }, [mentionState, filteredSuggestions.length]);

  // Handle text change
  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setPromptText(e.target.value);
      setCursorPosition(e.target.selectionStart || 0);
    },
    []
  );

  // Handle cursor position changes
  const handleSelect = useCallback(
    (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
      const target = e.target as HTMLTextAreaElement;
      setCursorPosition(target.selectionStart || 0);
    },
    []
  );

  // Handle agent selection from suggestions
  const handleAgentSelect = useCallback(
    (agent: AgentMention) => {
      if (!mentionState) return;

      // Replace the @mention with the selected agent's trigger
      const beforeMention = promptText.slice(0, mentionState.start);
      const afterMention = promptText.slice(cursorPosition);
      const newText = `${beforeMention}${agent.trigger} ${afterMention}`;

      setPromptText(newText);
      setShowSuggestions(false);

      // Focus back to textarea and set cursor after the inserted mention
      const newCursorPos = mentionState.start + agent.trigger.length + 1;
      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(newCursorPos, newCursorPos);
        setCursorPosition(newCursorPos);
      }, 0);
    },
    [promptText, cursorPosition, mentionState]
  );

  // Handle suggestion navigation
  const handleNavigate = useCallback(
    (direction: 'up' | 'down') => {
      setSelectedSuggestionIndex((prev) => {
        if (direction === 'down') {
          return prev < filteredSuggestions.length - 1 ? prev + 1 : 0;
        }
        return prev > 0 ? prev - 1 : filteredSuggestions.length - 1;
      });
    },
    [filteredSuggestions.length]
  );

  // Handle form submission
  const handleSubmit = useCallback(async () => {
    if (!promptText.trim() || isCreating || projectRepos.length === 0) return;

    // Parse the prompt to extract agent mention
    const { agent, cleanPrompt } = parseMentions(promptText);

    if (!cleanPrompt) {
      // Empty prompt after removing @mentions
      return;
    }

    // Get the executor profile (from mention or default)
    const profile = resolveMentionToProfile(agent);

    if (!profile) {
      console.error('No agent configured');
      return;
    }

    try {
      const repos = getWorkspaceRepoInputs();

      await createAttempt({
        profile,
        repos,
      });

      // Clear input on success
      setPromptText('');
    } catch (err) {
      console.error('Failed to create attempt:', err);
    }
  }, [
    promptText,
    isCreating,
    projectRepos.length,
    parseMentions,
    resolveMentionToProfile,
    getWorkspaceRepoInputs,
    createAttempt,
    t,
  ]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // If suggestions are shown, let AgentMentionSuggestions handle navigation
      if (showSuggestions) {
        if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
          return; // Let the suggestions component handle these
        }
      }

      // Submit on Cmd/Ctrl + Enter
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [showSuggestions, handleSubmit]
  );

  // Parse current prompt to show which agent will be used
  const { agent: selectedAgent } = parseMentions(promptText);
  const effectiveAgent = selectedAgent || (defaultProfile ? {
    displayName: defaultProfile.executor.replace(/_/g, ' '),
    executor: defaultProfile.executor,
    variant: defaultProfile.variant,
  } : null);

  const canSubmit =
    promptText.trim().length > 0 && !isCreating && projectRepos.length > 0;

  return (
    <div className={cn('relative', className)}>
      {/* Agent indicator */}
      {effectiveAgent && (
        <div className="flex items-center gap-1 mb-1 text-xs text-muted-foreground">
          <Bot className="h-3 w-3" />
          <span>
            {selectedAgent
              ? selectedAgent.displayName
              : `${effectiveAgent.displayName} (${t('inlinePrompt.default', 'default')})`}
          </span>
        </div>
      )}

      {/* Input area */}
      <div className="relative flex gap-2 items-end">
        <div className="relative flex-1">
          {/* Suggestions dropdown */}
          <AgentMentionSuggestions
            suggestions={filteredSuggestions}
            selectedIndex={selectedSuggestionIndex}
            onSelect={handleAgentSelect}
            onClose={() => setShowSuggestions(false)}
            onNavigate={handleNavigate}
            visible={showSuggestions}
          />

          <Textarea
            ref={textareaRef}
            value={promptText}
            onChange={handleTextChange}
            onSelect={handleSelect}
            onKeyDown={handleKeyDown}
            placeholder={t(
              'inlinePrompt.placeholder',
              'Type a prompt... Use @agent to specify agent'
            )}
            className="min-h-[60px] max-h-[200px] resize-none pr-2"
            disabled={isCreating}
            data-testid="inline-prompt-input"
          />
        </div>

        <Button
          type="button"
          size="icon"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="h-10 w-10 flex-shrink-0"
          data-testid="inline-prompt-submit"
        >
          {isCreating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <SendHorizonal className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Hint text */}
      <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
        <span>{t('inlinePrompt.hint', 'Cmd+Enter to submit')}</span>
        {error && (
          <span className="text-destructive">
            {t('inlinePrompt.error', 'Failed to create attempt')}
          </span>
        )}
      </div>
    </div>
  );
}
