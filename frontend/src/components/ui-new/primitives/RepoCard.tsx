import { useMemo } from 'react';
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
  SpinnerGapIcon,
  WarningCircleIcon,
  DotsThreeIcon,
  GearIcon,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuTriggerButton,
  DropdownMenuContent,
  DropdownMenuItem,
} from './Dropdown';
import { SplitButton, type SplitButtonOption } from './SplitButton';
import { useRepoAction } from '@/stores/useUiPreferencesStore';

export type RepoAction =
  | 'pull-request'
  | 'merge'
  | 'change-target'
  | 'rebase'
  | 'push';

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
  showPushButton?: boolean;
  isPushPending?: boolean;
  isPushSuccess?: boolean;
  isPushError?: boolean;
  branchDropdownContent?: React.ReactNode;
  onChangeTarget?: () => void;
  onRebase?: () => void;
  onActionsClick?: (action: RepoAction) => void;
  onPushClick?: () => void;
  onOpenInEditor?: () => void;
  onCopyPath?: () => void;
  onOpenSettings?: () => void;
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
  showPushButton = false,
  isPushPending = false,
  isPushSuccess = false,
  isPushError = false,
  branchDropdownContent,
  onChangeTarget,
  onRebase,
  onActionsClick,
  onPushClick,
  onOpenInEditor,
  onCopyPath,
  onOpenSettings,
}: RepoCardProps) {
  const { t } = useTranslation('tasks');
  const { t: tCommon } = useTranslation('common');
  const [selectedAction, setSelectedAction] = useRepoAction(repoId);

  // Hide "Open pull request" option when PR is already open
  const hasPrOpen = prStatus === 'open';
  const availableActionOptions = useMemo(
    () =>
      hasPrOpen
        ? repoActionOptions.filter((opt) => opt.value !== 'pull-request')
        : repoActionOptions,
    [hasPrOpen]
  );

  // If PR is open and 'pull-request' was selected, fall back to 'merge'
  const effectiveSelectedAction =
    hasPrOpen && selectedAction === 'pull-request' ? 'merge' : selectedAction;

  return (
    <div className="bg-primary rounded-sm my-base p-base space-y-base">
      <div className="font-medium">{name}</div>
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
        <div className="flex-1 min-w-0 flex">
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center justify-center p-1.5 rounded hover:bg-tertiary text-low hover:text-base transition-colors"
                title="Repo actions"
              >
                <DotsThreeIcon className="size-icon-base" weight="bold" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem icon={CopyIcon} onClick={onCopyPath}>
                {tCommon('actions.copyPath')}
              </DropdownMenuItem>
              <DropdownMenuItem icon={CodeIcon} onClick={onOpenInEditor}>
                {tCommon('actions.openInIde')}
              </DropdownMenuItem>
              <DropdownMenuItem icon={GearIcon} onClick={onOpenSettings}>
                {tCommon('actions.repoSettings')}
              </DropdownMenuItem>
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
        <div className="flex items-center gap-half my-base">
          {prStatus === 'merged' ? (
            prUrl ? (
              <button
                onClick={() => window.open(prUrl, '_blank')}
                className="inline-flex items-center gap-half px-base py-half rounded-sm bg-panel text-success hover:bg-tertiary text-sm font-medium transition-colors"
              >
                <CheckCircleIcon className="size-icon-xs" weight="fill" />
                {t('git.pr.merged', { prNumber })}
                <ArrowSquareOutIcon className="size-icon-xs" weight="bold" />
              </button>
            ) : (
              <span className="inline-flex items-center gap-half px-base py-half rounded-sm bg-panel text-success text-sm font-medium">
                <CheckCircleIcon className="size-icon-xs" weight="fill" />
                {t('git.pr.merged', { prNumber })}
              </span>
            )
          ) : prUrl ? (
            <button
              onClick={() => window.open(prUrl, '_blank')}
              className="inline-flex items-center gap-half px-base py-half rounded-sm bg-panel text-normal hover:bg-tertiary text-sm font-medium transition-colors"
            >
              <GitPullRequestIcon className="size-icon-xs" weight="fill" />
              {t('git.pr.open', { number: prNumber })}
              <ArrowSquareOutIcon className="size-icon-xs" weight="bold" />
            </button>
          ) : (
            <span className="inline-flex items-center gap-half px-base py-half rounded-sm bg-panel text-normal text-sm font-medium">
              <GitPullRequestIcon className="size-icon-xs" weight="fill" />
              {t('git.pr.open', { number: prNumber })}
            </span>
          )}
          {/* Push button - shows loading/success/error state */}
          {(showPushButton ||
            isPushPending ||
            isPushSuccess ||
            isPushError) && (
            <button
              onClick={onPushClick}
              disabled={isPushPending || isPushSuccess || isPushError}
              className={`inline-flex items-center gap-half px-base py-half rounded-sm text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                isPushSuccess
                  ? 'bg-success/20 text-success'
                  : isPushError
                    ? 'bg-error/20 text-error'
                    : 'bg-panel text-normal hover:bg-tertiary disabled:opacity-50'
              }`}
            >
              {isPushPending ? (
                <SpinnerGapIcon className="size-icon-xs animate-spin" />
              ) : isPushSuccess ? (
                <CheckCircleIcon className="size-icon-xs" weight="fill" />
              ) : isPushError ? (
                <WarningCircleIcon className="size-icon-xs" weight="fill" />
              ) : (
                <ArrowUpIcon className="size-icon-xs" weight="bold" />
              )}
              {isPushPending
                ? t('git.states.pushing')
                : isPushSuccess
                  ? t('git.states.pushed')
                  : isPushError
                    ? t('git.states.pushFailed')
                    : t('git.states.push')}
            </button>
          )}
        </div>
      )}

      {/* Actions row */}
      <div className="my-base">
        <SplitButton
          options={availableActionOptions}
          selectedValue={effectiveSelectedAction}
          onSelectionChange={setSelectedAction}
          onAction={(action) => onActionsClick?.(action)}
        />
      </div>
    </div>
  );
}
