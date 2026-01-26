import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { AgentSelector } from '@/components/tasks/AgentSelector';
import { ConfigSelector } from '@/components/tasks/ConfigSelector';
import { useUserSystem } from '@/components/ConfigProvider';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import type { ExecutorProfileId } from 'shared/types';
import type { AutoReviewSettings } from '@/hooks/useAutoReviewSettings';
import { Settings2 } from 'lucide-react';

export interface AutoReviewSettingsDialogProps {
  projectId: string;
  currentSettings: AutoReviewSettings;
  onSave: (settings: AutoReviewSettings) => void;
}

const AutoReviewSettingsDialogImpl =
  NiceModal.create<AutoReviewSettingsDialogProps>(
    ({ currentSettings, onSave }) => {
      const modal = useModal();
      const { profiles, config } = useUserSystem();
      const { t } = useTranslation(['tasks', 'common']);

      const [enabled, setEnabled] = useState(currentSettings.enabled);
      const [executorProfileId, setExecutorProfileId] =
        useState<ExecutorProfileId | null>(
          currentSettings.executorProfileId ?? config?.executor_profile ?? null
        );
      const [includePmReview, setIncludePmReview] = useState(
        currentSettings.includePmReview
      );
      const [includeCodeReview, setIncludeCodeReview] = useState(
        currentSettings.includeCodeReview
      );
      const [additionalPrompt, setAdditionalPrompt] = useState(
        currentSettings.additionalPrompt
      );

      useEffect(() => {
        // Reset form when dialog opens
        setEnabled(currentSettings.enabled);
        setExecutorProfileId(
          currentSettings.executorProfileId ?? config?.executor_profile ?? null
        );
        setIncludePmReview(currentSettings.includePmReview);
        setIncludeCodeReview(currentSettings.includeCodeReview);
        setAdditionalPrompt(currentSettings.additionalPrompt);
      }, [currentSettings, config?.executor_profile]);

      const handleSave = () => {
        onSave({
          enabled,
          executorProfileId,
          includePmReview,
          includeCodeReview,
          additionalPrompt,
        });
        modal.hide();
      };

      const handleOpenChange = (open: boolean) => {
        if (!open) modal.hide();
      };

      return (
        <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Settings2 className="h-5 w-5" />
                <DialogTitle>
                  {t('autoReviewSettings.title', 'Auto-Review Settings')}
                </DialogTitle>
              </div>
              <DialogDescription>
                {t(
                  'autoReviewSettings.description',
                  'Configure automatic review when tasks move to the "In Review" column.'
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* Enable/Disable Toggle */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label
                    htmlFor="auto-review-enabled"
                    className="text-sm font-medium"
                  >
                    {t(
                      'autoReviewSettings.enableAutoReview',
                      'Enable Auto-Review'
                    )}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'autoReviewSettings.enableDescription',
                      'Automatically start AI review when a task moves to In Review'
                    )}
                  </p>
                </div>
                <Switch
                  id="auto-review-enabled"
                  checked={enabled}
                  onCheckedChange={setEnabled}
                />
              </div>

              {enabled && (
                <>
                  {/* AI Executor Selection */}
                  {profiles && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">
                        {t(
                          'autoReviewSettings.selectAI',
                          'Select AI for Review'
                        )}
                      </Label>
                      <div className="flex gap-3 flex-col sm:flex-row">
                        <AgentSelector
                          profiles={profiles}
                          selectedExecutorProfile={executorProfileId}
                          onChange={setExecutorProfileId}
                          showLabel={false}
                        />
                        <ConfigSelector
                          profiles={profiles}
                          selectedExecutorProfile={executorProfileId}
                          onChange={setExecutorProfileId}
                          showLabel={false}
                        />
                      </div>
                    </div>
                  )}

                  {/* Review Types */}
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">
                      {t('autoReviewSettings.reviewTypes', 'Review Types')}
                    </Label>

                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="pm-review"
                          checked={includePmReview}
                          onCheckedChange={(checked) =>
                            setIncludePmReview(checked === true)
                          }
                        />
                        <div className="space-y-0.5">
                          <Label
                            htmlFor="pm-review"
                            className="cursor-pointer text-sm"
                          >
                            {t('autoReviewSettings.pmReview', 'PM Spec Review')}
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            {t(
                              'autoReviewSettings.pmReviewDescription',
                              'Check changes against project specifications and requirements'
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="code-review"
                          checked={includeCodeReview}
                          onCheckedChange={(checked) =>
                            setIncludeCodeReview(checked === true)
                          }
                        />
                        <div className="space-y-0.5">
                          <Label
                            htmlFor="code-review"
                            className="cursor-pointer text-sm"
                          >
                            {t('autoReviewSettings.codeReview', 'Code Review')}
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            {t(
                              'autoReviewSettings.codeReviewDescription',
                              'Check code quality, best practices, and potential issues'
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Additional Prompt */}
                  <div className="space-y-2">
                    <Label
                      htmlFor="additional-prompt"
                      className="text-sm font-medium"
                    >
                      {t(
                        'autoReviewSettings.additionalPrompt',
                        'Additional Instructions (Optional)'
                      )}
                    </Label>
                    <Textarea
                      id="additional-prompt"
                      value={additionalPrompt}
                      onChange={(e) => setAdditionalPrompt(e.target.value)}
                      placeholder={t(
                        'autoReviewSettings.additionalPromptPlaceholder',
                        'Add custom review instructions...'
                      )}
                      className="min-h-[80px] resize-none"
                    />
                  </div>
                </>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => modal.hide()}>
                {t('common:buttons.cancel')}
              </Button>
              <Button onClick={handleSave}>
                {t('common:buttons.save', 'Save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    }
  );

export const AutoReviewSettingsDialog = defineModal<
  AutoReviewSettingsDialogProps,
  void
>(AutoReviewSettingsDialogImpl);
