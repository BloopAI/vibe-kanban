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

import { toPrettyCase } from '@/utils/string';

interface OnboardingDialogProps {
  open: boolean;
  onComplete: (config: {
    profile: ProfileVariantLabel;
    editor: { editor_type: EditorType; custom_command: string | null };
  }) => void;
}

export function OnboardingDialog({ open, onComplete }: OnboardingDialogProps) {
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
          <div className="flex items-center gap-3">
            <Sparkles className="h-6 w-6 text-primary" />
            <DialogTitle>Welcome to Vibe Kanban</DialogTitle>
          </div>
          <DialogDescription className="text-left pt-2">
            Let's set up your coding preferences. You can always change these
            later in Settings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Choose Your Coding Agent
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="profile">Default Profile</Label>
                <div className="flex gap-2">
                  <Select
                    value={profile.profile}
                    onValueChange={(value) =>
                      setProfile({ profile: value, variant: null })
                    }
                  >
                    <SelectTrigger id="profile" className="flex-1">
                      <SelectValue placeholder="Select your preferred coding agent" />
                    </SelectTrigger>
                    <SelectContent>
                      {profiles?.map((profile) => (
                        <SelectItem key={profile.label} value={profile.label}>
                          {profile.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Show variant selector if selected profile has variants */}
                  {(() => {
                    const selectedProfile = profiles?.find(
                      (p) => p.label === profile.profile
                    );
                    const hasVariants =
                      selectedProfile?.variants &&
                      selectedProfile.variants.length > 0;

                    if (hasVariants) {
                      return (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              className="w-24 px-2 flex items-center justify-between"
                            >
                              <span className="text-xs truncate flex-1 text-left">
                                {profile.variant || 'Default'}
                              </span>
                              <ChevronDown className="h-3 w-3 ml-1 flex-shrink-0" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem
                              onClick={() =>
                                setProfile({ ...profile, variant: null })
                              }
                              className={!profile.variant ? 'bg-accent' : ''}
                            >
                              Default
                            </DropdownMenuItem>
                            {selectedProfile.variants.map((variant) => (
                              <DropdownMenuItem
                                key={variant.label}
                                onClick={() =>
                                  setProfile({
                                    ...profile,
                                    variant: variant.label,
                                  })
                                }
                                className={
                                  profile.variant === variant.label
                                    ? 'bg-accent'
                                    : ''
                                }
                              >
                                {variant.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      );
                    } else if (selectedProfile) {
                      // Show disabled button when profile exists but has no variants
                      return (
                        <Button
                          variant="outline"
                          className="w-24 px-2 flex items-center justify-between"
                          disabled
                        >
                          <span className="text-xs truncate flex-1 text-left">
                            Default
                          </span>
                        </Button>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-4 w-4" />
                Choose Your Code Editor
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="editor">Preferred Editor</Label>
                <Select
                  value={editorType}
                  onValueChange={(value: EditorType) => setEditorType(value)}
                >
                  <SelectTrigger id="editor">
                    <SelectValue placeholder="Select your preferred editor" />
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
                  This editor will be used to open task attempts and project
                  files.
                </p>
              </div>

              {editorType === EditorType.CUSTOM && (
                <div className="space-y-2">
                  <Label htmlFor="custom-command">Custom Command</Label>
                  <Input
                    id="custom-command"
                    placeholder="e.g., code, subl, vim"
                    value={customCommand}
                    onChange={(e) => setCustomCommand(e.target.value)}
                  />
                  <p className="text-sm text-muted-foreground">
                    Enter the command to run your custom editor. Use spaces for
                    arguments (e.g., "code --wait").
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
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
