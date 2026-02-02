import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { WebhookProvider, WebhookConfig } from 'shared/types';
import { toPrettyCase } from '@/utils/string';

interface WebhookConfigurationSectionProps {
  webhookNotificationsEnabled: boolean;
  webhooks: WebhookConfig[];
  onWebhookNotificationsEnabledChange: (enabled: boolean) => void;
  onWebhooksChange: (webhooks: WebhookConfig[]) => void;
}

export function WebhookConfigurationSection({
  webhookNotificationsEnabled,
  webhooks,
  onWebhookNotificationsEnabledChange,
  onWebhooksChange,
}: WebhookConfigurationSectionProps) {
  const { t } = useTranslation(['settings']);

  const addWebhook = () => {
    const newWebhook: WebhookConfig = {
      enabled: true,
      provider: WebhookProvider.GENERIC,
      webhook_url: '',
      pushover_user_key: null,
      telegram_chat_id: null,
    };
    onWebhooksChange([...webhooks, newWebhook]);
  };

  const removeWebhook = (index: number) => {
    const updated = webhooks.filter((_, i) => i !== index);
    onWebhooksChange(updated);
  };

  const updateWebhook = (index: number, updates: Partial<WebhookConfig>) => {
    const updated = webhooks.map((webhook, i) =>
      i === index ? { ...webhook, ...updates } : webhook
    );
    onWebhooksChange(updated);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <Checkbox
          id="webhook-notifications-enabled"
          checked={webhookNotificationsEnabled}
          onCheckedChange={(checked: boolean) =>
            onWebhookNotificationsEnabledChange(checked)
          }
        />
        <div className="space-y-0.5">
          <Label
            htmlFor="webhook-notifications-enabled"
            className="cursor-pointer"
          >
            {t('settings.general.notifications.webhook.label', {
              defaultValue: 'Webhook Notifications',
            })}
          </Label>
          <p className="text-sm text-muted-foreground">
            {t('settings.general.notifications.webhook.helper', {
              defaultValue:
                'Send notifications to external services via webhooks',
            })}
          </p>
        </div>
      </div>

      {webhookNotificationsEnabled && (
        <div className="ml-6 space-y-4">
          {webhooks.map((webhook, index) => (
            <div
              key={index}
              className="p-4 border rounded-lg space-y-3 bg-muted/50"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id={`webhook-${index}-enabled`}
                    checked={webhook.enabled}
                    onCheckedChange={(checked: boolean) =>
                      updateWebhook(index, { enabled: checked })
                    }
                  />
                  <Label
                    htmlFor={`webhook-${index}-enabled`}
                    className="cursor-pointer font-medium"
                  >
                    {t('settings.general.notifications.webhook.enabled', {
                      defaultValue: 'Enabled',
                    })}
                  </Label>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeWebhook(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor={`webhook-${index}-provider`}>
                  {t('settings.general.notifications.webhook.provider', {
                    defaultValue: 'Provider',
                  })}
                </Label>
                <Select
                  value={webhook.provider}
                  onValueChange={(value: WebhookProvider) =>
                    updateWebhook(index, { provider: value })
                  }
                >
                  <SelectTrigger id={`webhook-${index}-provider`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(WebhookProvider).map((provider) => (
                      <SelectItem key={provider} value={provider}>
                        {toPrettyCase(provider)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor={`webhook-${index}-url`}>
                  {t('settings.general.notifications.webhook.url', {
                    defaultValue: 'Webhook URL',
                  })}
                </Label>
                <Input
                  id={`webhook-${index}-url`}
                  type="url"
                  placeholder="https://..."
                  value={webhook.webhook_url}
                  onChange={(e) =>
                    updateWebhook(index, { webhook_url: e.target.value })
                  }
                />
              </div>

              {webhook.provider === WebhookProvider.PUSHOVER && (
                <div className="space-y-2">
                  <Label htmlFor={`webhook-${index}-pushover-key`}>
                    {t(
                      'settings.general.notifications.webhook.pushoverUserKey',
                      {
                        defaultValue: 'Pushover User Key',
                      }
                    )}
                  </Label>
                  <Input
                    id={`webhook-${index}-pushover-key`}
                    type="text"
                    placeholder="User Key"
                    value={webhook.pushover_user_key || ''}
                    onChange={(e) =>
                      updateWebhook(index, {
                        pushover_user_key: e.target.value || null,
                      })
                    }
                  />
                </div>
              )}

              {webhook.provider === WebhookProvider.TELEGRAM && (
                <div className="space-y-2">
                  <Label htmlFor={`webhook-${index}-telegram-chat`}>
                    {t('settings.general.notifications.webhook.telegramChatId', {
                      defaultValue: 'Telegram Chat ID',
                    })}
                  </Label>
                  <Input
                    id={`webhook-${index}-telegram-chat`}
                    type="text"
                    placeholder="Chat ID"
                    value={webhook.telegram_chat_id || ''}
                    onChange={(e) =>
                      updateWebhook(index, {
                        telegram_chat_id: e.target.value || null,
                      })
                    }
                  />
                </div>
              )}
            </div>
          ))}

          <Button variant="outline" onClick={addWebhook} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            {t('settings.general.notifications.webhook.add', {
              defaultValue: 'Add Webhook',
            })}
          </Button>
        </div>
      )}
    </div>
  );
}
