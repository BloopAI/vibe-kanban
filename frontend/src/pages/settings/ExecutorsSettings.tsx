import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { JSONEditor } from '@/components/ui/json-editor';
import { Loader2 } from 'lucide-react';

import { ExecutorConfigForm } from '@/components/ExecutorConfigForm';
import { profilesApi } from '@/lib/api';

export function ExecutorsSettings() {
  // Profiles editor state
  const [profilesContent, setProfilesContent] = useState('');
  const [profilesPath, setProfilesPath] = useState('');
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [profilesSaving, setProfilesSaving] = useState(false);
  const [profilesSuccess, setProfilesSuccess] = useState(false);

  // Form-based editor state
  const [useFormEditor, setUseFormEditor] = useState(true);
  const [selectedExecutorType, setSelectedExecutorType] =
    useState<string>('AMP');
  const [selectedProfile, setSelectedProfile] = useState<string>('DEFAULT');
  const [parsedProfiles, setParsedProfiles] = useState<any>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Load profiles content on mount
  useEffect(() => {
    const loadProfiles = async () => {
      setProfilesLoading(true);
      try {
        const result = await profilesApi.load();
        setProfilesContent(result.content);
        setProfilesPath(result.path);

        // Try to parse the JSON for form editor
        try {
          const parsed = JSON.parse(result.content);
          setParsedProfiles(parsed);
        } catch (parseErr) {
          console.warn('Failed to parse profiles JSON:', parseErr);
          setParsedProfiles(null);
        }
      } catch (err) {
        console.error('Failed to load profiles:', err);
        setProfilesError('Failed to load profiles');
      } finally {
        setProfilesLoading(false);
      }
    };
    loadProfiles();
  }, []);

  // Sync raw profiles with parsed profiles
  const syncRawProfiles = (profiles: any) => {
    setProfilesContent(JSON.stringify(profiles, null, 2));
  };

  // Mark profiles as dirty
  const markDirty = (nextProfiles: any) => {
    setParsedProfiles(nextProfiles);
    syncRawProfiles(nextProfiles);
    setIsDirty(true);
  };

  const handleProfilesChange = (value: string) => {
    setProfilesContent(value);
    setProfilesError(null);
    setIsDirty(true);

    // Validate JSON on change
    if (value.trim()) {
      try {
        const parsed = JSON.parse(value);
        setParsedProfiles(parsed);
        // Basic structure validation
        if (!parsed.executors) {
          setProfilesError('Invalid structure: must have a "executors" object');
        }
      } catch (err) {
        if (err instanceof SyntaxError) {
          setProfilesError('Invalid JSON format');
        } else {
          setProfilesError('Validation error');
        }
      }
    }
  };

  const handleSaveProfiles = async () => {
    setProfilesSaving(true);
    setProfilesError(null);
    setProfilesSuccess(false);

    try {
      const contentToSave =
        useFormEditor && parsedProfiles
          ? JSON.stringify(parsedProfiles, null, 2)
          : profilesContent;

      await profilesApi.save(contentToSave);
      setProfilesSuccess(true);
      setIsDirty(false);
      setTimeout(() => setProfilesSuccess(false), 3000);

      // Update the raw content if using form editor
      if (useFormEditor && parsedProfiles) {
        setProfilesContent(contentToSave);
      }
    } catch (err: any) {
      setProfilesError(err.message || 'Failed to save profiles');
    } finally {
      setProfilesSaving(false);
    }
  };

  const handleExecutorConfigChange = (
    executorType: string,
    profile: string,
    formData: any
  ) => {
    if (!parsedProfiles || !parsedProfiles.executors) return;

    // Update the parsed profiles with the new config
    const updatedProfiles = {
      ...parsedProfiles,
      executors: {
        ...parsedProfiles.executors,
        [executorType]: {
          ...parsedProfiles.executors[executorType],
          [profile]: {
            [executorType]: formData,
          },
        },
      },
    };

    markDirty(updatedProfiles);
  };

  const handleExecutorConfigSave = async (formData: any) => {
    if (!parsedProfiles || !parsedProfiles.executors) return;

    // Update the parsed profiles with the saved config
    const updatedProfiles = {
      ...parsedProfiles,
      executors: {
        ...parsedProfiles.executors,
        [selectedExecutorType]: {
          ...parsedProfiles.executors[selectedExecutorType],
          [selectedProfile]: {
            [selectedExecutorType]: formData,
          },
        },
      },
    };

    // Update state
    setParsedProfiles(updatedProfiles);

    // Save the updated profiles directly
    setProfilesSaving(true);
    setProfilesError(null);
    setProfilesSuccess(false);

    try {
      const contentToSave = JSON.stringify(updatedProfiles, null, 2);

      await profilesApi.save(contentToSave);
      setProfilesSuccess(true);
      setIsDirty(false);
      setTimeout(() => setProfilesSuccess(false), 3000);

      // Update the raw content as well
      setProfilesContent(contentToSave);
    } catch (err: any) {
      setProfilesError(err.message || 'Failed to save profiles');
    } finally {
      setProfilesSaving(false);
    }
  };

  if (profilesLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading executor configurations...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {profilesError && (
        <Alert variant="destructive">
          <AlertDescription>{profilesError}</AlertDescription>
        </Alert>
      )}

      {profilesSuccess && (
        <Alert className="border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
          <AlertDescription className="font-medium">
            ✓ Executor configurations saved successfully!
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Coding Agent Configurations</CardTitle>
          <CardDescription>
            Customize the behavior of coding agents with different executor
            profiles.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Editor type toggle */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="use-form-editor"
              checked={useFormEditor}
              onCheckedChange={(checked) => setUseFormEditor(!!checked)}
              disabled={profilesLoading || !parsedProfiles}
            />
            <Label htmlFor="use-form-editor">Edit visually with forms</Label>
          </div>

          {useFormEditor && parsedProfiles && parsedProfiles.executors ? (
            // Form-based editor
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="executor-type">Executor</Label>
                  <Select
                    value={selectedExecutorType}
                    onValueChange={(value) => {
                      setSelectedExecutorType(value);
                      // Reset profile selection when executor type changes
                      const profiles = Object.keys(
                        parsedProfiles.executors[value] || {}
                      );
                      setSelectedProfile(profiles[0] || 'DEFAULT');
                    }}
                  >
                    <SelectTrigger id="executor-type">
                      <SelectValue placeholder="Select executor type" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(parsedProfiles.executors).map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="profile">Profile</Label>
                  <Select
                    value={selectedProfile}
                    onValueChange={setSelectedProfile}
                    disabled={!parsedProfiles.executors[selectedExecutorType]}
                  >
                    <SelectTrigger id="profile">
                      <SelectValue placeholder="Select profile" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(
                        parsedProfiles.executors[selectedExecutorType] || {}
                      ).map((profile) => (
                        <SelectItem key={profile} value={profile}>
                          {profile}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {parsedProfiles.executors[selectedExecutorType]?.[
                selectedProfile
              ]?.[selectedExecutorType] && (
                <ExecutorConfigForm
                  executor={selectedExecutorType as any}
                  value={
                    parsedProfiles.executors[selectedExecutorType][
                      selectedProfile
                    ][selectedExecutorType] || {}
                  }
                  onChange={(formData) =>
                    handleExecutorConfigChange(
                      selectedExecutorType,
                      selectedProfile,
                      formData
                    )
                  }
                  onSave={handleExecutorConfigSave}
                  disabled={profilesSaving}
                  isSaving={profilesSaving}
                  isDirty={isDirty}
                />
              )}
            </div>
          ) : (
            // Raw JSON editor
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="profiles-editor">
                  Profiles Configuration (JSON)
                </Label>
                <JSONEditor
                  id="profiles-editor"
                  placeholder={
                    profilesLoading
                      ? 'Loading profiles...'
                      : '{\n  "executors": {\n    "AMP": {\n      "DEFAULT": {\n        "AMP": {\n          "append_prompt": null,\n          "dangerously_allow_all": null\n        }\n      }\n    }\n  }\n}'
                  }
                  value={profilesLoading ? 'Loading...' : profilesContent}
                  onChange={handleProfilesChange}
                  disabled={profilesLoading}
                  minHeight={300}
                />
              </div>

              {!profilesError && profilesPath && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium">
                      Configuration file location:
                    </span>{' '}
                    <span className="font-mono text-xs">{profilesPath}</span>
                  </p>
                </div>
              )}

              {/* Save button for JSON editor mode */}
              <div className="flex justify-end pt-4">
                <Button
                  onClick={handleSaveProfiles}
                  disabled={!isDirty || profilesSaving || !!profilesError}
                >
                  {profilesSaving && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Save Executor Configurations
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
