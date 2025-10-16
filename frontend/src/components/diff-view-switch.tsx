import { Columns, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useDiffViewMode, useDiffViewStore } from '@/stores/useDiffViewStore';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type Props = {
  className?: string;
};

export default function DiffViewSwitch({ className }: Props) {
  const { t } = useTranslation('tasks');
  const mode = useDiffViewMode();
  const setMode = useDiffViewStore((s) => s.setMode);

  return (
    <TooltipProvider>
      <ToggleGroup
        type="single"
        value={mode ?? ''}
        onValueChange={(v) => v && setMode(v as 'unified' | 'split')}
        className={cn('inline-flex gap-4', className)}
        aria-label="Diff view mode"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <ToggleGroupItem
              value="unified"
              aria-label="Inline view"
              active={mode === 'unified'}
            >
              <FileText className="h-4 w-4" />
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {t('diff.viewModes.inline')}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <ToggleGroupItem
              value="split"
              aria-label="Split view"
              active={mode === 'split'}
            >
              <Columns className="h-4 w-4" />
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {t('diff.viewModes.split')}
          </TooltipContent>
        </Tooltip>
      </ToggleGroup>
    </TooltipProvider>
  );
}
