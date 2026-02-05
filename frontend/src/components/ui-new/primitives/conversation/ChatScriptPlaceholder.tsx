import { useTranslation } from 'react-i18next';
import { TerminalIcon, GearSixIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

export type ScriptPlaceholderType = 'setup' | 'cleanup';

interface ChatScriptPlaceholderProps {
  type: ScriptPlaceholderType;
  className?: string;
  onOpenSettings?: () => void;
}

export function ChatScriptPlaceholder({
  type,
  className,
  onOpenSettings,
}: ChatScriptPlaceholderProps) {
  const { t } = useTranslation('tasks');

  const title =
    type === 'setup'
      ? t('conversation.scriptPlaceholder.setupTitle')
      : t('conversation.scriptPlaceholder.cleanupTitle');

  const description =
    type === 'setup'
      ? t('conversation.scriptPlaceholder.setupDescription')
      : t('conversation.scriptPlaceholder.cleanupDescription');

  return (
    <div
      className={cn(
        'flex items-start gap-base text-sm rounded-md -mx-half px-half py-half',
        className
      )}
    >
      <span className="relative shrink-0 mt-0.5">
        <TerminalIcon className="size-icon-base text-lowest" />
      </span>
      <div className="flex flex-col min-w-0 flex-1 gap-0.5">
        <span className="text-low font-medium">{title}</span>
        <span className="text-lowest text-xs">{description}</span>
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="mt-1 inline-flex items-center gap-1 text-xs text-brand hover:text-brand-hover transition-colors w-fit"
          >
            <GearSixIcon className="size-icon-xs" />
            <span>
              {t('conversation.scriptPlaceholder.configureInSettings')}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
