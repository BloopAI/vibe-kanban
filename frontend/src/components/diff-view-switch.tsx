import { Columns, FileText, Pilcrow } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  useDiffViewMode,
  useDiffViewStore,
  useIgnoreWhitespaceDiff,
} from '@/stores/useDiffViewStore';
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
  const ignoreWhitespace = useIgnoreWhitespaceDiff();
  const setIgnoreWhitespace = useDiffViewStore((s) => s.setIgnoreWhitespace);

  const whitespaceValue = ignoreWhitespace ? ['ignoreWhitespace'] : [];

  return (
    <TooltipProvider>
      <div className={cn('inline-flex gap-4', className)}>
        <ToggleGroup
          type="single"
          value={mode ?? ''}
          onValueChange={(v) => v && setMode(v as 'unified' | 'split')}
          className="inline-flex gap-4"
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

        <ToggleGroup
          type="multiple"
          value={whitespaceValue}
          onValueChange={(values) =>
            setIgnoreWhitespace(values.includes('ignoreWhitespace'))
          }
          className="inline-flex gap-4"
          aria-label={t('diff.ignoreWhitespace')}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <ToggleGroupItem
                value="ignoreWhitespace"
                aria-label={t('diff.ignoreWhitespace')}
                active={ignoreWhitespace}
              >
                <Pilcrow className="h-4 w-4" />
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {t('diff.ignoreWhitespace')}
            </TooltipContent>
          </Tooltip>
        </ToggleGroup>
      </div>
    </TooltipProvider>
  );
}
