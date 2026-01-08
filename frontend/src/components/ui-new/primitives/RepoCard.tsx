import {
  GitBranchIcon,
  GitPullRequestIcon,
  ArrowsClockwiseIcon,
  FileTextIcon,
  ArrowUpIcon,
  CrosshairIcon,
  ArrowRightIcon,
  CodeIcon,
  ArrowSquareOutIcon,
  CopyIcon,
  GitMergeIcon,
  CheckCircleIcon,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuTriggerButton,
  DropdownMenuContent,
  DropdownMenuItem,
} from './Dropdown';
import { CollapsibleSection } from './CollapsibleSection';
import { SplitButton, type SplitButtonOption } from './SplitButton';
import { useRepoAction, PERSIST_KEYS } from '@/stores/useUiPreferencesStore';

export type RepoAction = 'pull-request' | 'merge' | 'change-target' | 'rebase';

const repoActionOptions: SplitButtonOption<RepoAction>[] = [
  {
    value: 'pull-request',
    label: 'Open pull request',
    icon: GitPullRequestIcon,
  },
  { value: 'merge', label: 'Merge', icon: GitMergeIcon },
];

interface RepoCardProps {
  repoId: string;
  name: string;
  targetBranch: string;
  commitsAhead?: number;
  filesChanged?: number;
  linesAdded?: number;
  linesRemoved?: number;
  prNumber?: number;
  prUrl?: string;
  prStatus?: 'open' | 'merged' | 'closed' | 'unknown';
  branchDropdownContent?: React.ReactNode;
  onChangeTarget?: () => void;
  onRebase?: () => void;
  onActionsClick?: (action: RepoAction) => void;
  onOpenInEditor?: () => void;
  onCopyPath?: () => void;
}

export function RepoCard({
  repoId,
  name,
  targetBranch,
  commitsAhead = 0,
  filesChanged = 0,
  linesAdded,
  linesRemoved,
  prNumber,
  prUrl,
  prStatus,
  branchDropdownContent,
  onChangeTarget,
  onRebase,
  onActionsClick,
  onOpenInEditor,
  onCopyPath,
}: RepoCardProps) {
  const { t } = useTranslation('tasks');
  const { t: tCommon } = useTranslation('common');
  const [selectedAction, setSelectedAction] = useRepoAction(repoId);

  return (
    <CollapsibleSection
      persistKey={PERSIST_KEYS.repoCard(repoId)}
      title={name}
      className="gap-half"
      defaultExpanded
    >
      {/* Branch row */}
      <div className="flex items-center gap-base">
        <div className="flex items-center justify-center">
          <GitBranchIcon className="size-icon-base text-base" weight="fill" />
        </div>
        <div className="flex items-center justify-center">
          <ArrowRightIcon className="size-icon-sm text-low" weight="bold" />
        </div>
        <div className="flex items-center justify-center">
          <CrosshairIcon className="size-icon-sm text-low" weight="bold" />
        </div>
        <div className="flex-1 min-w-0">
          <DropdownMenu>
            <DropdownMenuTriggerButton
              label={targetBranch}
              className="max-w-full"
            />
            <DropdownMenuContent>
              {branchDropdownContent ?? (
                <>
                  <DropdownMenuItem
                    icon={CrosshairIcon}
                    onClick={onChangeTarget}
                  >
                    {t('git.actions.changeTarget')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    icon={ArrowsClockwiseIcon}
                    onClick={onRebase}
                  >
                    {t('rebase.common.action')}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Commits badge */}
        {commitsAhead > 0 && (
          <div className="flex items-center py-half">
            <span className="text-sm font-medium text-brand-secondary">
              {commitsAhead}
            </span>
            <ArrowUpIcon
              className="size-icon-xs text-brand-secondary"
              weight="bold"
            />
          </div>
        )}
      </div>

      {/* Files changed row */}
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-half">
          <FileTextIcon className="size-icon-xs text-low" />
          <span className="text-sm font-medium text-low truncate">
            {t('diff.filesChanged', { count: filesChanged })}
          </span>
        </div>
        <span className="text-sm font-semibold text-right">
          {linesAdded !== undefined && (
            <span className="text-success">+{linesAdded} </span>
          )}
          {linesRemoved !== undefined && (
            <span className="text-error">-{linesRemoved}</span>
          )}
        </span>
      </div>

      {/* PR status row */}
      {prNumber && (
      <div className="flex items-center gap-half">
        {prStatus === 'merged' ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100/70 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-sm font-medium">
            <CheckCircleIcon className="size-icon-xs" weight="fill" />
            {t('git.pr.merged', { prNumber })}
          </span>
        ) : prUrl ? (
          <button
            onClick={() => window.open(prUrl, '_blank')}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-100/60 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 hover:underline text-sm font-medium"
          >
            <GitPullRequestIcon className="size-icon-xs" weight="fill" />
            {t('git.pr.open', { prNumber })}
            <ArrowSquareOutIcon className="size-icon-xs" weight="bold" />
          </button>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-100/60 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 text-sm font-medium">
            <GitPullRequestIcon className="size-icon-xs" weight="fill" />
            {t('git.pr.open', { prNumber })}
          </span>
        )}
      </div>
      )}

      {/* Actions row */}
      <div className="flex items-center gap-half">
        <SplitButton
          options={repoActionOptions}
          selectedValue={selectedAction}
          onSelectionChange={setSelectedAction}
          onAction={(action) => onActionsClick?.(action)}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center justify-center p-1.5 rounded hover:bg-tertiary text-low hover:text-base transition-colors"
              title="Repo actions"
            >
              <ArrowSquareOutIcon className="size-icon-base" weight="bold" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem icon={CopyIcon} onClick={onCopyPath}>
              {tCommon('actions.copyPath')}
            </DropdownMenuItem>
            <DropdownMenuItem icon={CodeIcon} onClick={onOpenInEditor}>
              {tCommon('actions.openInIde')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </CollapsibleSection>
  );
}
