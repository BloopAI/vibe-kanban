import { useMemo } from 'react';
import {
  GitBranchIcon,
  GitPullRequestIcon,
  ArrowsClockwiseIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  CrosshairIcon,
  ArrowSquareOutIcon,
  GitMergeIcon,
  CheckCircleIcon,
  SpinnerGapIcon,
  WarningCircleIcon,
  DotsThreeIcon,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
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
  commitsBehind?: number;
  prNumber?: number;
  prUrl?: string;
  prStatus?: 'open' | 'merged' | 'closed' | 'unknown';
  showPushButton?: boolean;
  isPushPending?: boolean;
  isPushSuccess?: boolean;
  isPushError?: boolean;
  isTargetRemote?: boolean;
  branchDropdownContent?: React.ReactNode;
  onChangeTarget?: () => void;
  onRebase?: () => void;
  onActionsClick?: (action: RepoAction) => void;
  onPushClick?: () => void;
  onMoreClick?: () => void;
}

export function RepoCard({
  repoId,
  name,
  targetBranch,
  commitsAhead = 0,
  commitsBehind = 0,
  prNumber,
  prUrl,
  prStatus,
  showPushButton = false,
  isPushPending = false,
  isPushSuccess = false,
  isPushError = false,
  isTargetRemote = false,
  branchDropdownContent,
  onChangeTarget,
  onRebase,
  onActionsClick,
  onPushClick,
  onMoreClick,
}: RepoCardProps) {
  const { t } = useTranslation('tasks');
  const { t: tCommon } = useTranslation('common');
  const [selectedAction, setSelectedAction] = useRepoAction(repoId);

  // Hide "Open pull request" option when PR is already open
  // Hide "merge" option when PR is already open or target branch is remote
  const hasPrOpen = prStatus === 'open';
  const availableActionOptions = useMemo(
    () =>
      repoActionOptions.filter((opt) => {
        if (opt.value === 'pull-request' && hasPrOpen) return false;
        if (opt.value === 'merge' && (hasPrOpen || isTargetRemote))
          return false;
        return true;
      }),
    [hasPrOpen, isTargetRemote]
  );

  // If current selection is unavailable, fall back to the first available option.
  const effectiveSelectedAction = useMemo(() => {
    const selectedOption = availableActionOptions.find(
      (option) => option.value === selectedAction
    );
    return (
      selectedOption?.value ??
      availableActionOptions[0]?.value ??
      selectedAction
    );
  }, [availableActionOptions, selectedAction]);

  return (
    <div className="bg-primary rounded-sm my-base p-base space-y-base">
      <div className="font-medium">{name}</div>
      {/* Branch row */}
      <div className="flex items-center gap-base">
        <div className="min-w-0 flex-1">
          <DropdownMenu>
            <DropdownMenuTriggerButton
              icon={GitBranchIcon}
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

        {/* Commits ahead/behind indicators */}
        {commitsAhead > 0 && (
          <span className="inline-flex items-center gap-0.5 text-xs text-success shrink-0">
            <ArrowUpIcon className="size-icon-xs" weight="bold" />
            <span className="font-medium">{commitsAhead}</span>
          </span>
        )}
        {commitsBehind > 0 && (
          <span className="inline-flex items-center gap-0.5 text-xs text-error shrink-0">
            <ArrowDownIcon className="size-icon-xs" weight="bold" />
            <span className="font-medium">{commitsBehind}</span>
          </span>
        )}

        <button
          onClick={onMoreClick}
          className="flex items-center justify-center p-1.5 rounded hover:bg-tertiary text-low hover:text-base transition-colors shrink-0"
          title={tCommon('workspaces.more')}
        >
          <DotsThreeIcon className="size-icon-base" weight="bold" />
        </button>
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
