import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';
import { BaseCodingAgent, EditorType } from 'shared/types';
import type { ExecutorProfileId } from 'shared/types';
import { toPrettyCase } from '@/utils/string';

type AgentConfigStepProps = {
  profile: ExecutorProfileId;
  profiles: Record<string, Record<string, any>> | null;
  editorType: EditorType;
  customCommand: string;
  onProfileChange: (profile: ExecutorProfileId) => void;
  onEditorChange: (editorType: EditorType) => void;
  onCustomCommandChange: (command: string) => void;
};

/**
 * AgentConfigStep - Step 1 of the unified onboarding flow
 *
 * Allows users to configure their default coding agent and preferred code editor.
 *
 * Features:
 * - Agent selection with variant support (e.g., claude-code with temperature variants)
 * - Editor type selection (VS Code, Cursor, Custom, etc.)
 * - Custom command input for custom editor configurations
 *
 * @param profile - Current executor profile (agent + variant)
 * @param profiles - Available agent profiles from config
 * @param editorType - Selected editor type
 * @param customCommand - Custom editor command (when EditorType.CUSTOM is selected)
 * @param onProfileChange - Callback when profile changes
 * @param onEditorChange - Callback when editor type changes
 * @param onCustomCommandChange - Callback when custom command changes
 */
export function AgentConfigStep({
  profile,
  profiles,
  editorType,
  customCommand,
  onProfileChange,
  onEditorChange,
  onCustomCommandChange,
}: AgentConfigStepProps) {
  const { t } = useTranslation('common');
  const selectedProfile = profiles?.[profile.executor];
  const hasVariants =
    selectedProfile && Object.keys(selectedProfile).length > 0;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="profile">
          {t('onboarding.agentConfig.agentLabel')}
        </Label>
        <div className="flex gap-2">
          <Select
            value={profile.executor}
            onValueChange={(v) =>
              onProfileChange({
                executor: v as BaseCodingAgent,
                variant: null,
              })
            }
          >
            <SelectTrigger id="profile" className="flex-1">
              <SelectValue
                placeholder={t('onboarding.agentConfig.agentPlaceholder')}
              />
            </SelectTrigger>
            <SelectContent>
              {profiles &&
                (Object.keys(profiles) as BaseCodingAgent[]).map((agent) => (
                  <SelectItem key={agent} value={agent}>
                    {agent}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>

          {hasVariants ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="flex-1 px-2 flex items-center justify-between"
                >
                  <span className="text-xs truncate flex-1 text-left">
                    {profile.variant || 'DEFAULT'}
                  </span>
                  <ChevronDown className="h-3 w-3 ml-1 flex-shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {Object.keys(selectedProfile).map((variant) => (
                  <DropdownMenuItem
                    key={variant}
                    onClick={() =>
                      onProfileChange({
                        ...profile,
                        variant: variant,
                      })
                    }
                    className={profile.variant === variant ? 'bg-accent' : ''}
                  >
                    {variant}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : selectedProfile ? (
            <Button
              variant="outline"
              className="flex-1 px-2 flex items-center justify-between"
              disabled
            >
              <span className="text-xs truncate flex-1 text-left">Default</span>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="editor">
          {t('onboarding.agentConfig.editorLabel')}
        </Label>
        <Select
          value={editorType}
          onValueChange={(value: EditorType) => onEditorChange(value)}
        >
          <SelectTrigger id="editor">
            <SelectValue
              placeholder={t('onboarding.agentConfig.editorPlaceholder')}
            />
          </SelectTrigger>
          <SelectContent>
            {Object.values(EditorType).map((type) => (
              <SelectItem key={type} value={type}>
                {toPrettyCase(type)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          {t('onboarding.agentConfig.editorHelper')}
        </p>

        {editorType === EditorType.CUSTOM && (
          <div className="space-y-2">
            <Label htmlFor="custom-command">
              {t('onboarding.agentConfig.customCommandLabel')}
            </Label>
            <Input
              id="custom-command"
              placeholder={t('onboarding.agentConfig.customCommandPlaceholder')}
              value={customCommand}
              onChange={(e) => onCustomCommandChange(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              {t('onboarding.agentConfig.customCommandHelper')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
