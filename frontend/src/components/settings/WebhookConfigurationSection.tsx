import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Bell, Plus, Trash2 } from 'lucide-react';
import { toPrettyCase } from '@/utils/string';

// These will be generated from Rust types
// For now, defining them here until types are regenerated
export enum WebhookProvider {
  SLACK = 'SLACK',
  DISCORD = 'DISCORD',
  PUSHOVER = 'PUSHOVER',
  TELEGRAM = 'TELEGRAM',
  GENERIC = 'GENERIC',
}

export interface WebhookConfig {
  enabled: boolean;
  provider: WebhookProvider;
  webhook_url: string;
  pushover_user_key?: string | null;
  telegram_chat_id?: string | null;
}

interface WebhookConfigurationSectionProps {
  webhookNotificationsEnabled: boolean;
  webhooks: WebhookConfig[];
  onWebhookNotificationsChange: (enabled: boolean) => void;
  onWebhooksChange: (webhooks: WebhookConfig[]) => void;
}

export function WebhookConfigurationSection({
  webhookNotificationsEnabled,
  webhooks,
  onWebhookNotificationsChange,
  onWebhooksChange,
}: WebhookConfigurationSectionProps) {
  const { t } = useTranslation(['settings']);
  const [expandedWebhook, setExpandedWebhook] = useState<number | null>(null);

  const addWebhook = () => {
    const newWebhook: WebhookConfig = {
      enabled: false,
      provider: WebhookProvider.GENERIC,
      webhook_url: '',
      pushover_user_key: null,
      telegram_chat_id: null,
    };
    onWebhooksChange([...webhooks, newWebhook]);
    setExpandedWebhook(webhooks.length);
  };

  const removeWebhook = (index: number) => {
    const updated = webhooks.filter((_, i) => i !== index);
    onWebhooksChange(updated);
    if (expandedWebhook === index) {
      setExpandedWebhook(null);
    }
  };

  const updateWebhook = (index: number, updates: Partial<WebhookConfig>) => {
    const updated = [...webhooks];
    updated[index] = { ...updated[index], ...updates };
    onWebhooksChange(updated);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          {t('settings.general.webhooks.title', 'Webhook Notifications')}
        </CardTitle>
        <CardDescription>
          {t(
            'settings.general.webhooks.description',
            'Configure webhook notifications for task completions on remote server deployments'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Webhook Notifications Toggle */}
        <div className="flex items-center space-x-2">
          <Checkbox
            id="webhook-notifications"
            checked={webhookNotificationsEnabled}
            onCheckedChange={onWebhookNotificationsChange}
          />
          <div className="space-y-0.5">
            <Label htmlFor="webhook-notifications" className="cursor-pointer">
              {t(
                'settings.general.webhooks.taskNotifications.label',
                'Enable Webhook Notifications'
              )}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t(
                'settings.general.webhooks.taskNotifications.helper',
                'Send webhook notifications when tasks complete (for remote server deployments)'
              )}
            </p>
          </div>
        </div>

        {/* Webhook List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>
              {t('settings.general.webhooks.endpoints.label', 'Webhook Endpoints')}
            </Label>
            <Button
              variant="outline"
              size="sm"
              onClick={addWebhook}
              className="h-8"
            >
              <Plus className="h-4 w-4 mr-1" />
              {t('settings.general.webhooks.add', 'Add Webhook')}
            </Button>
          </div>

          {webhooks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground border rounded-lg border-dashed">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">
                {t(
                  'settings.general.webhooks.empty',
                  'No webhooks configured. Add one to receive notifications.'
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {webhooks.map((webhook, index) => (
                <div
                  key={index}
                  className="border rounded-lg p-3 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={webhook.enabled}
                        onCheckedChange={(checked) =>
                          updateWebhook(index, { enabled: !!checked })
                        }
                      />
                      <span className="font-medium text-sm">
                        {toPrettyCase(webhook.provider)}
                      </span>
                      {webhook.webhook_url && (
                        <span className="text-xs text-muted-foreground">
                          ({webhook.webhook_url.substring(0, 30)}...)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setExpandedWebhook(
                            expandedWebhook === index ? null : index
                          )
                        }
                      >
                        {expandedWebhook === index ? 'Hide' : 'Configure'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeWebhook(index)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {expandedWebhook === index && (
                    <div className="space-y-3 pt-2 border-t">
                      <div className="space-y-2">
                        <Label htmlFor={`webhook-provider-${index}`}>
                          {t('settings.general.webhooks.provider.label', 'Provider')}
                        </Label>
                        <Select
                          value={webhook.provider}
                          onValueChange={(value: WebhookProvider) =>
                            updateWebhook(index, { provider: value })
                          }
                        >
                          <SelectTrigger id={`webhook-provider-${index}`}>
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
                        <Label htmlFor={`webhook-url-${index}`}>
                          {t('settings.general.webhooks.url.label', 'Webhook URL')}
                        </Label>
                        <Input
                          id={`webhook-url-${index}`}
                          type="url"
                          placeholder={getPlaceholderForProvider(webhook.provider)}
                          value={webhook.webhook_url}
                          onChange={(e) =>
                            updateWebhook(index, { webhook_url: e.target.value })
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          {getHelperTextForProvider(webhook.provider)}
                        </p>
                      </div>

                      {webhook.provider === WebhookProvider.PUSHOVER && (
                        <div className="space-y-2">
                          <Label htmlFor={`pushover-user-${index}`}>
                            {t(
                              'settings.general.webhooks.pushover.userKey',
                              'Pushover User Key'
                            )}
                          </Label>
                          <Input
                            id={`pushover-user-${index}`}
                            placeholder="Your Pushover user key"
                            value={webhook.pushover_user_key || ''}
                            onChange={(e) =>
                              updateWebhook(index, {
                                pushover_user_key: e.target.value,
                              })
                            }
                          />
                        </div>
                      )}

                      {webhook.provider === WebhookProvider.TELEGRAM && (
                        <div className="space-y-2">
                          <Label htmlFor={`telegram-chat-${index}`}>
                            {t(
                              'settings.general.webhooks.telegram.chatId',
                              'Telegram Chat ID'
                            )}
                          </Label>
                          <Input
                            id={`telegram-chat-${index}`}
                            placeholder="Your Telegram chat ID"
                            value={webhook.telegram_chat_id || ''}
                            onChange={(e) =>
                              updateWebhook(index, {
                                telegram_chat_id: e.target.value,
                              })
                            }
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          {t(
            'settings.general.webhooks.helper',
            'Webhooks will receive notifications when tasks complete. Configure your webhook endpoints above.'
          )}
        </p>
      </CardContent>
    </Card>
  );
}

function getPlaceholderForProvider(provider: WebhookProvider): string {
  switch (provider) {
    case WebhookProvider.SLACK:
      return 'https://hooks.slack.com/services/...';
    case WebhookProvider.DISCORD:
      return 'https://discord.com/api/webhooks/...';
    case WebhookProvider.PUSHOVER:
      return 'Your Pushover API token';
    case WebhookProvider.TELEGRAM:
      return 'https://api.telegram.org/bot<TOKEN>/sendMessage';
    case WebhookProvider.GENERIC:
      return 'https://your-webhook-endpoint.com/webhook';
  }
}

function getHelperTextForProvider(provider: WebhookProvider): string {
  switch (provider) {
    case WebhookProvider.SLACK:
      return 'Create a webhook in your Slack workspace settings';
    case WebhookProvider.DISCORD:
      return 'Create a webhook in your Discord server settings';
    case WebhookProvider.PUSHOVER:
      return 'Enter your Pushover application API token (also provide user key below)';
    case WebhookProvider.TELEGRAM:
      return 'Create a bot with @BotFather and use the bot token in the URL';
    case WebhookProvider.GENERIC:
      return 'Any webhook endpoint that accepts POST requests with JSON';
  }
}
