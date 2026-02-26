import type { ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDownIcon } from '@phosphor-icons/react';
import { cn } from '../lib/cn';

export interface WorkspacesMainWorkspace {
  id: string;
}

interface WorkspacesMainProps {
  workspaceWithSession: WorkspacesMainWorkspace | undefined;
  isLoading: boolean;
  containerRef: RefObject<HTMLElement>;
  conversationContent?: ReactNode;
  chatBoxContent: ReactNode;
  contextBarContent?: ReactNode;
  isAtBottom?: boolean;
  onAtBottomChange?: (atBottom: boolean) => void;
  onScrollToBottom?: () => void;
  isMobile?: boolean;
}

export function WorkspacesMain({
  workspaceWithSession,
  isLoading,
  containerRef,
  conversationContent,
  chatBoxContent,
  contextBarContent,
  isAtBottom = true,
  onScrollToBottom,
  isMobile,
}: WorkspacesMainProps) {
  const { t } = useTranslation(['tasks', 'common']);

  // Always render the main structure to prevent chat box flash during workspace transitions
  return (
    <main
      ref={containerRef}
      className={cn(
        'relative flex flex-1 flex-col bg-primary',
        isMobile ? 'min-h-0' : 'h-full'
      )}
    >
      {/* Conversation content - conditional based on loading/workspace state */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-low">{t('common:workspaces.loading')}</p>
        </div>
      ) : !workspaceWithSession ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-low">{t('common:workspaces.selectToStart')}</p>
        </div>
      ) : (
        conversationContent
      )}
      {/* Scroll to bottom button */}
      {workspaceWithSession && !isAtBottom && (
        <div className="flex justify-center pointer-events-none">
          <div className="w-chat max-w-full relative">
            <button
              type="button"
              onClick={onScrollToBottom}
              className="absolute bottom-2 right-4 z-10 pointer-events-auto flex items-center justify-center size-8 rounded-full bg-secondary/80 backdrop-blur-sm border border-secondary text-low hover:text-normal hover:bg-secondary shadow-md transition-all"
              aria-label="Scroll to bottom"
              title="Scroll to bottom"
            >
              <ArrowDownIcon className="size-icon-base" weight="bold" />
            </button>
          </div>
        </div>
      )}
      {/* Chat box - always rendered to prevent flash during workspace switch */}
      <div className="flex justify-center @container pl-px">
        {chatBoxContent}
      </div>
      {/* Context Bar - floating toolbar */}
      {workspaceWithSession ? contextBarContent : null}
    </main>
  );
}
