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
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

import { ExecutorConfigForm } from '@/components/ExecutorConfigForm';
import { useProfiles } from '@/hooks/useProfiles';
import { useUserSystem } from '@/components/config-provider';

export function AgentSettings() {
  // Use profiles hook for server state
  const {
    profilesContent: serverProfilesContent,
    parsedProfiles: serverParsedProfiles,
    profilesPath,
    isLoading: profilesLoading,
    isSaving: profilesSaving,
    error: profilesError,
    save: saveProfiles,
  } = useProfiles();

  const { reloadSystem } = useUserSystem();

  useEffect(() => {
    return () => {
      reloadSystem();
    };
  }, []);

  // Local editor state (draft that may differ from server)
  const [localProfilesContent, setLocalProfilesContent] = useState('');
  const [profilesSuccess, setProfilesSuccess] = useState(false);

  // Form-based editor state
  const [useFormEditor, setUseFormEditor] = useState(true);
  const [selectedExecutorType, setSelectedExecutorType] =
    useState<string>('CLAUDE_CODE');
  const [selectedConfiguration, setSelectedConfiguration] =
    useState<string>('DEFAULT');
  const [localParsedProfiles, setLocalParsedProfiles] = useState<any>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Create configuration dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newConfigName, setNewConfigName] = useState('');
  const [cloneFrom, setCloneFrom] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  // Delete configuration dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [configToDelete, setConfigToDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Sync server state to local state when not dirty
  useEffect(() => {
    if (!isDirty && serverProfilesContent) {
      setLocalProfilesContent(serverProfilesContent);
      setLocalParsedProfiles(serverParsedProfiles);
    }
  }, [serverProfilesContent, serverParsedProfiles, isDirty]);

  // Sync raw profiles with parsed profiles
  const syncRawProfiles = (profiles: any) => {
    setLocalProfilesContent(JSON.stringify(profiles, null, 2));
  };

  // Mark profiles as dirty
  const markDirty = (nextProfiles: any) => {
    setLocalParsedProfiles(nextProfiles);
    syncRawProfiles(nextProfiles);
    setIsDirty(true);
  };

  // Validate configuration name
  const validateConfigName = (name: string): string | null => {
    const trimmedName = name.trim();
    if (!trimmedName) return 'Configuration name cannot be empty';
    if (trimmedName.length > 40)
      return 'Configuration name must be 40 characters or less';
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmedName)) {
      return 'Configuration name can only contain letters, numbers, underscores, and hyphens';
    }
    if (localParsedProfiles?.executors?.[selectedExecutorType]?.[trimmedName]) {
      return 'A configuration with this name already exists';
    }
    return null;
  };

  // Open create dialog
  const openCreateDialog = () => {
    setNewConfigName('');
    setCloneFrom(null);
    setDialogError(null);
    setShowCreateDialog(true);
  };

  // Create new configuration
  const createConfiguration = (
    executorType: string,
    configName: string,
    baseConfig?: string | null
  ) => {
    if (!localParsedProfiles || !localParsedProfiles.executors) return;

    const base =
      baseConfig &&
      localParsedProfiles.executors[executorType]?.[baseConfig]?.[executorType]
        ? localParsedProfiles.executors[executorType][baseConfig][executorType]
        : {};

    const updatedProfiles = {
      ...localParsedProfiles,
      executors: {
        ...localParsedProfiles.executors,
        [executorType]: {
          ...localParsedProfiles.executors[executorType],
          [configName]: {
            [executorType]: base,
          },
        },
      },
    };

    markDirty(updatedProfiles);
    setSelectedConfiguration(configName);
  };

  // Handle create dialog submission
  const handleCreateConfiguration = () => {
    const validationError = validateConfigName(newConfigName);
    if (validationError) {
      setDialogError(validationError);
      return;
    }

    createConfiguration(selectedExecutorType, newConfigName.trim(), cloneFrom);
    setShowCreateDialog(false);
  };

  // Open delete dialog
  const openDeleteDialog = (configName: string) => {
    setConfigToDelete(configName);
    setDeleteError(null);
    setShowDeleteDialog(true);
  };

  // Handle delete configuration
  const handleDeleteConfiguration = async () => {
    if (!localParsedProfiles || !configToDelete) {
      setDeleteError('Invalid configuration data');
      return;
    }

    try {
      // Validate that the configuration exists
      if (
        !localParsedProfiles.executors[selectedExecutorType]?.[configToDelete]
      ) {
        setDeleteError(`Configuration "${configToDelete}" not found`);
        return;
      }

      // Check if this is the last configuration
      const currentConfigs = Object.keys(
        localParsedProfiles.executors[selectedExecutorType] || {}
      );
      if (currentConfigs.length <= 1) {
        setDeleteError('Cannot delete the last configuration');
        return;
      }

      // Remove the configuration from the executor
      const remainingConfigs = {
        ...localParsedProfiles.executors[selectedExecutorType],
      };
      delete remainingConfigs[configToDelete];

      const updatedProfiles = {
        ...localParsedProfiles,
        executors: {
          ...localParsedProfiles.executors,
          [selectedExecutorType]: remainingConfigs,
        },
      };

      // If no configurations left, create a blank DEFAULT (should not happen due to check above)
      if (Object.keys(remainingConfigs).length === 0) {
        updatedProfiles.executors[selectedExecutorType] = {
          DEFAULT: { [selectedExecutorType]: {} },
        };
      }

      try {
        // Save using hook
        await saveProfiles(JSON.stringify(updatedProfiles, null, 2));

        // Update local state and reset dirty flag
        setLocalParsedProfiles(updatedProfiles);
        setLocalProfilesContent(JSON.stringify(updatedProfiles, null, 2));
        setIsDirty(false);

        // Select the next available configuration
        const nextConfigs = Object.keys(
          updatedProfiles.executors[selectedExecutorType]
        );
        const nextSelected = nextConfigs[0] || 'DEFAULT';
        setSelectedConfiguration(nextSelected);

        // Show success and close dialog
        setProfilesSuccess(true);
        setTimeout(() => setProfilesSuccess(false), 3000);
        setShowDeleteDialog(false);
      } catch (saveError: any) {
        console.error('Failed to save deletion to backend:', saveError);
        setDeleteError(
          saveError.message || 'Failed to save deletion. Please try again.'
        );
      }
    } catch (error) {
      console.error('Error deleting configuration:', error);
      setDeleteError('Failed to delete configuration. Please try again.');
    }
  };

  const handleProfilesChange = (value: string) => {
    setLocalProfilesContent(value);
    setIsDirty(true);

    // Validate JSON on change
    if (value.trim()) {
      try {
        const parsed = JSON.parse(value);
        setLocalParsedProfiles(parsed);
      } catch (err) {
        // Invalid JSON, keep local content but clear parsed
        setLocalParsedProfiles(null);
      }
    }
  };

  const handleSaveProfiles = async () => {
    try {
      const contentToSave =
        useFormEditor && localParsedProfiles
          ? JSON.stringify(localParsedProfiles, null, 2)
          : localProfilesContent;

      await saveProfiles(contentToSave);
      setProfilesSuccess(true);
      setIsDirty(false);
      setTimeout(() => setProfilesSuccess(false), 3000);

      // Update the local content if using form editor
      if (useFormEditor && localParsedProfiles) {
        setLocalProfilesContent(contentToSave);
      }
    } catch (err: any) {
      console.error('Failed to save profiles:', err);
    }
  };

  const handleExecutorConfigChange = (
    executorType: string,
    configuration: string,
    formData: any
  ) => {
    if (!localParsedProfiles || !localParsedProfiles.executors) return;

    // Update the parsed profiles with the new config
    const updatedProfiles = {
      ...localParsedProfiles,
      executors: {
        ...localParsedProfiles.executors,
        [executorType]: {
          ...localParsedProfiles.executors[executorType],
          [configuration]: {
            [executorType]: formData,
          },
        },
      },
    };

    markDirty(updatedProfiles);
  };

  const handleExecutorConfigSave = async (formData: any) => {
    if (!localParsedProfiles || !localParsedProfiles.executors) return;

    // Update the parsed profiles with the saved config
    const updatedProfiles = {
      ...localParsedProfiles,
      executors: {
        ...localParsedProfiles.executors,
        [selectedExecutorType]: {
          ...localParsedProfiles.executors[selectedExecutorType],
          [selectedConfiguration]: {
            [selectedExecutorType]: formData,
          },
        },
      },
    };

    // Update state
    setLocalParsedProfiles(updatedProfiles);

    // Save the updated profiles directly
    try {
      const contentToSave = JSON.stringify(updatedProfiles, null, 2);

      await saveProfiles(contentToSave);
      setProfilesSuccess(true);
      setIsDirty(false);
      setTimeout(() => setProfilesSuccess(false), 3000);

      // Update the local content as well
      setLocalProfilesContent(contentToSave);
    } catch (err: any) {
      console.error('Failed to save profiles:', err);
    }
  };

  if (profilesLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading agent configurations...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!!profilesError && (
        <Alert variant="destructive">
          <AlertDescription>
            {profilesError instanceof Error
              ? profilesError.message
              : String(profilesError)}
          </AlertDescription>
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
            Customize the behavior of coding agents with different
            configurations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Editor type toggle */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="use-form-editor"
              checked={!useFormEditor}
              onCheckedChange={(checked) => setUseFormEditor(!checked)}
              disabled={profilesLoading || !localParsedProfiles}
            />
            <Label htmlFor="use-form-editor">Edit JSON</Label>
          </div>

          {useFormEditor &&
          localParsedProfiles &&
          localParsedProfiles.executors ? (
            // Form-based editor
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="executor-type">Agent</Label>
                  <Select
                    value={selectedExecutorType}
                    onValueChange={(value) => {
                      setSelectedExecutorType(value);
                      // Reset configuration selection when executor type changes
                      setSelectedConfiguration('DEFAULT');
                    }}
                  >
                    <SelectTrigger id="executor-type">
                      <SelectValue placeholder="Select executor type" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(localParsedProfiles.executors).map(
                        (type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="configuration">Configuration</Label>
                  <div className="flex gap-2">
                    <Select
                      value={selectedConfiguration}
                      onValueChange={(value) => {
                        if (value === '__create__') {
                          openCreateDialog();
                        } else {
                          setSelectedConfiguration(value);
                        }
                      }}
                      disabled={
                        !localParsedProfiles.executors[selectedExecutorType]
                      }
                    >
                      <SelectTrigger id="configuration">
                        <SelectValue placeholder="Select configuration" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(
                          localParsedProfiles.executors[selectedExecutorType] ||
                            {}
                        ).map((configuration) => (
                          <SelectItem key={configuration} value={configuration}>
                            {configuration}
                          </SelectItem>
                        ))}
                        <SelectItem value="__create__">
                          Create new...
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-10"
                      onClick={() => openDeleteDialog(selectedConfiguration)}
                      disabled={
                        profilesSaving ||
                        !localParsedProfiles.executors[selectedExecutorType] ||
                        Object.keys(
                          localParsedProfiles.executors[selectedExecutorType] ||
                            {}
                        ).length <= 1
                      }
                      title={
                        Object.keys(
                          localParsedProfiles.executors[selectedExecutorType] ||
                            {}
                        ).length <= 1
                          ? 'Cannot delete the last configuration'
                          : `Delete ${selectedConfiguration}`
                      }
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>

              {localParsedProfiles.executors[selectedExecutorType]?.[
                selectedConfiguration
              ]?.[selectedExecutorType] && (
                <ExecutorConfigForm
                  executor={selectedExecutorType as any}
                  value={
                    localParsedProfiles.executors[selectedExecutorType][
                      selectedConfiguration
                    ][selectedExecutorType] || {}
                  }
                  onChange={(formData) =>
                    handleExecutorConfigChange(
                      selectedExecutorType,
                      selectedConfiguration,
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
                  Agent Configuration (JSON)
                </Label>
                <JSONEditor
                  id="profiles-editor"
                  placeholder="Loading profiles..."
                  value={profilesLoading ? 'Loading...' : localProfilesContent}
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
                  Save Agent Configurations
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Configuration Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Configuration</DialogTitle>
            <DialogDescription>
              Add a new configuration for the {selectedExecutorType} executor.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="config-name">Configuration Name</Label>
              <Input
                id="config-name"
                value={newConfigName}
                onChange={(e) => {
                  setNewConfigName(e.target.value);
                  setDialogError(null);
                }}
                placeholder="e.g., PRODUCTION, DEVELOPMENT"
                maxLength={40}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="clone-from">Clone from (optional)</Label>
              <Select
                value={cloneFrom || '__blank__'}
                onValueChange={(value) =>
                  setCloneFrom(value === '__blank__' ? null : value)
                }
              >
                <SelectTrigger id="clone-from">
                  <SelectValue placeholder="Start blank or clone existing" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__blank__">Start blank</SelectItem>
                  {Object.keys(
                    localParsedProfiles?.executors?.[selectedExecutorType] || {}
                  ).map((configuration) => (
                    <SelectItem key={configuration} value={configuration}>
                      Clone from {configuration}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {dialogError && (
              <Alert variant="destructive">
                <AlertDescription>{dialogError}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              disabled={profilesSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateConfiguration}
              disabled={!newConfigName.trim() || profilesSaving}
            >
              Create Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Configuration Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Configuration?</DialogTitle>
            <DialogDescription>
              This will permanently remove "{configToDelete}" from the{' '}
              {selectedExecutorType} executor. You can't undo this action.
            </DialogDescription>
          </DialogHeader>

          {deleteError && (
            <Alert variant="destructive">
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={profilesSaving}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfiguration}
              disabled={profilesSaving}
            >
              {profilesSaving && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
