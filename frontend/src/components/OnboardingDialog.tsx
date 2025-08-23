import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, Code, ChevronDown } from 'lucide-react';
import { EditorType, ProfileVariantLabel } from 'shared/types';
import { useUserSystem } from '@/components/config-provider';
import { useTranslation } from '@/lib/i18n';

import { toPrettyCase } from '@/utils/string';

interface OnboardingDialogProps {
  open: boolean;
  onComplete: (config: {
    profile: ProfileVariantLabel;
    editor: { editor_type: EditorType; custom_command: string | null };
  }) => void;
}

export function OnboardingDialog({ open, onComplete }: OnboardingDialogProps) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<ProfileVariantLabel>({
    profile: 'claude-code',
    variant: null,
  });
  const [editorType, setEditorType] = useState<EditorType>(EditorType.VS_CODE);
  const [customCommand, setCustomCommand] = useState<string>('');

  const { profiles } = useUserSystem();

  const handleComplete = () => {
    onComplete({
      profile,
      editor: {
        editor_type: editorType,
        custom_command:
          editorType === EditorType.CUSTOM ? customCommand || null : null,
      },
    });
  };

  const isValid =
    editorType !== EditorType.CUSTOM ||
    (editorType === EditorType.CUSTOM && customCommand.trim() !== '');

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{t('onboarding.title')}</DialogTitle>
          <DialogDescription>{t('onboarding.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                {t('onboarding.codingAgent.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="profile">
                  {t('onboarding.codingAgent.label')}
                </Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between"
                    >
                      {profile.variant
                        ? toPrettyCase(profile.variant)
                        : toPrettyCase(profile.profile)}
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-full">
                    {profiles?.map((profileConfig) => (
                      <div key={profileConfig.label}>
                        <DropdownMenuItem
                          onClick={() =>
                            setProfile({
                              profile: profileConfig.label,
                              variant: null,
                            })
                          }
                        >
                          {toPrettyCase(profileConfig.label)}
                        </DropdownMenuItem>

                        {profileConfig.variants.map((variant) => (
                          <DropdownMenuItem
                            key={variant.label}
                            onClick={() =>
                              setProfile({
                                profile: profileConfig.label,
                                variant: variant.label,
                              })
                            }
                            className="pl-6"
                          >
                            {toPrettyCase(variant.label)}
                          </DropdownMenuItem>
                        ))}
                      </div>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <p className="text-sm text-muted-foreground">
                  {t('onboarding.codingAgent.description')}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-4 w-4" />
                {t('onboarding.codeEditor.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="editor">
                  {t('onboarding.codeEditor.label')}
                </Label>
                <Select
                  value={editorType}
                  onValueChange={(value: EditorType) => setEditorType(value)}
                >
                  <SelectTrigger id="editor">
                    <SelectValue
                      placeholder={t('onboarding.codeEditor.placeholder')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EditorType.VS_CODE}>VS Code</SelectItem>
                    <SelectItem value={EditorType.CURSOR}>Cursor</SelectItem>
                    <SelectItem value={EditorType.WINDSURF}>
                      Windsurf
                    </SelectItem>
                    <SelectItem value={EditorType.INTELLI_J}>
                      IntelliJ
                    </SelectItem>
                    <SelectItem value={EditorType.ZED}>Zed</SelectItem>
                    <SelectItem value={EditorType.XCODE}>Xcode</SelectItem>
                    <SelectItem value={EditorType.CUSTOM}>
                      {t('onboarding.codeEditor.custom')}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  {t('onboarding.codeEditor.description')}
                </p>
              </div>

              {editorType === EditorType.CUSTOM && (
                <div className="space-y-2">
                  <Label htmlFor="custom-command">
                    {t('onboarding.codeEditor.customCommand')}
                  </Label>
                  <Input
                    id="custom-command"
                    placeholder={t('onboarding.codeEditor.customPlaceholder')}
                    value={customCommand}
                    onChange={(e) => setCustomCommand(e.target.value)}
                  />
                  <p className="text-sm text-muted-foreground">
                    {t('onboarding.codeEditor.customDescription')}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button
            onClick={handleComplete}
            disabled={!isValid}
            className="w-full"
          >
            {t('onboarding.continueButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
