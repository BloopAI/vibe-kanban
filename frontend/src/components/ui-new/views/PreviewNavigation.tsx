import { ArrowLeftIcon, ArrowRightIcon } from '@phosphor-icons/react';
import {
  IconButtonGroup,
  IconButtonGroupItem,
} from '../primitives/IconButtonGroup';
import type { NavigationState } from '@/types/previewDevTools';

interface PreviewNavigationProps {
  navigation: NavigationState | null;
  onBack: () => void;
  onForward: () => void;
  disabled?: boolean;
  className?: string;
}

export function PreviewNavigation({
  navigation,
  onBack,
  onForward,
  disabled = false,
  className,
}: PreviewNavigationProps) {
  return (
    <IconButtonGroup className={className}>
      <IconButtonGroupItem
        icon={ArrowLeftIcon}
        onClick={onBack}
        disabled={!navigation?.canGoBack || disabled}
        aria-label="Go back"
        title="Go back"
      />
      <IconButtonGroupItem
        icon={ArrowRightIcon}
        onClick={onForward}
        disabled={!navigation?.canGoForward || disabled}
        aria-label="Go forward"
        title="Go forward"
      />
    </IconButtonGroup>
  );
}
