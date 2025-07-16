import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  IntegrationCategory, 
  IntegrationWithCategory,
  CreateIntegrationRequest,
  UpdateIntegrationRequest,
  PROVIDERS,
  INTEGRATION_TYPES,
  getProviderDisplayName
} from '@/lib/types/integrations';

interface IntegrationFormProps {
  categories: IntegrationCategory[];
  integration?: IntegrationWithCategory;
  onSubmit: (data: CreateIntegrationRequest | UpdateIntegrationRequest) => void;
  onCancel: () => void;
}

interface FormData {
  name: string;
  type: string;
  provider: string;
  category_id: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

const providersByType: Record<string, string[]> = {
  [INTEGRATION_TYPES.AI_ASSISTANT]: [
    PROVIDERS.CLAUDE,
    PROVIDERS.AMP,
    PROVIDERS.GEMINI,
    PROVIDERS.CHARMOPENCODE,
    PROVIDERS.OPENAI,
  ],
  [INTEGRATION_TYPES.VERSION_CONTROL]: [
    PROVIDERS.GITHUB,
    PROVIDERS.GITLAB,
    PROVIDERS.BITBUCKET,
  ],
  [INTEGRATION_TYPES.COMMUNICATION]: [
    PROVIDERS.SLACK,
    PROVIDERS.DISCORD,
    PROVIDERS.TEAMS,
  ],
  [INTEGRATION_TYPES.PROJECT_MANAGEMENT]: [
    PROVIDERS.JIRA,
    PROVIDERS.LINEAR,
    PROVIDERS.ASANA,
    PROVIDERS.TRELLO,
  ],
  [INTEGRATION_TYPES.DEVELOPMENT_TOOL]: [
    PROVIDERS.VSCODE,
    PROVIDERS.CURSOR,
    PROVIDERS.CUSTOM_EDITOR,
  ],
};

export function IntegrationForm({
  categories,
  integration,
  onSubmit,
  onCancel,
}: IntegrationFormProps) {
  const [formData, setFormData] = useState<FormData>({
    name: integration?.name || '',
    type: integration?.type || '',
    provider: integration?.provider || '',
    category_id: integration?.category.id || '',
    enabled: integration?.enabled || false,
    config: integration?.config || {},
  });

  const [configJson, setConfigJson] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (integration?.config) {
      setConfigJson(JSON.stringify(integration.config, null, 2));
    }
  }, [integration]);

  // Update type and reset provider when category changes
  useEffect(() => {
    const category = categories.find(c => c.id === formData.category_id);
    if (category) {
      setFormData(prev => ({
        ...prev,
        type: category.id,
        provider: '', // Reset provider when category changes
      }));
    }
  }, [formData.category_id, categories]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const newErrors: Record<string, string> = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }
    
    if (!formData.category_id) {
      newErrors.category_id = 'Category is required';
    }
    
    if (!formData.provider) {
      newErrors.provider = 'Provider is required';
    }

    // Validate JSON config
    let parsedConfig: Record<string, unknown> = {};
    if (configJson.trim()) {
      try {
        parsedConfig = JSON.parse(configJson);
      } catch (error) {
        newErrors.config = 'Invalid JSON configuration';
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const submitData = {
      name: formData.name.trim(),
      type: formData.type,
      provider: formData.provider,
      category_id: formData.category_id,
      enabled: formData.enabled,
      config: Object.keys(parsedConfig).length > 0 ? parsedConfig : undefined,
    };

    if (integration) {
      // Update mode - only include changed fields
      const updateData: UpdateIntegrationRequest = {};
      if (submitData.name !== integration.name) updateData.name = submitData.name;
      if (submitData.enabled !== integration.enabled) updateData.enabled = submitData.enabled;
      if (JSON.stringify(parsedConfig) !== JSON.stringify(integration.config || {})) {
        updateData.config = parsedConfig;
      }
      onSubmit(updateData);
    } else {
      // Create mode
      onSubmit(submitData as CreateIntegrationRequest);
    }
  };

  const availableProviders = formData.type ? providersByType[formData.type] || [] : [];

  return (
    <Dialog open onOpenChange={onCancel}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {integration ? 'Edit Integration' : 'Add New Integration'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Integration Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., My GitHub Integration"
                className={errors.name ? 'border-red-500' : ''}
              />
              {errors.name && <p className="text-sm text-red-500 mt-1">{errors.name}</p>}
            </div>

            <div>
              <Label htmlFor="category">Category</Label>
              <Select 
                value={formData.category_id} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, category_id: value }))}
                disabled={!!integration} // Disable category change in edit mode
              >
                <SelectTrigger className={errors.category_id ? 'border-red-500' : ''}>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.category_id && <p className="text-sm text-red-500 mt-1">{errors.category_id}</p>}
            </div>

            <div>
              <Label htmlFor="provider">Provider</Label>
              <Select 
                value={formData.provider} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, provider: value }))}
                disabled={!!integration} // Disable provider change in edit mode
              >
                <SelectTrigger className={errors.provider ? 'border-red-500' : ''}>
                  <SelectValue placeholder="Select a provider" />
                </SelectTrigger>
                <SelectContent>
                  {availableProviders.map((provider) => (
                    <SelectItem key={provider} value={provider}>
                      {getProviderDisplayName(provider)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.provider && <p className="text-sm text-red-500 mt-1">{errors.provider}</p>}
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="enabled"
                checked={formData.enabled}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, enabled: checked }))}
              />
              <Label htmlFor="enabled">Enable this integration</Label>
            </div>
          </div>

          {/* Configuration */}
          <div className="space-y-2">
            <Label htmlFor="config">Configuration (JSON)</Label>
            <Textarea
              id="config"
              value={configJson}
              onChange={(e) => setConfigJson(e.target.value)}
              placeholder={getConfigPlaceholder(formData.provider)}
              rows={8}
              className={`font-mono text-sm ${errors.config ? 'border-red-500' : ''}`}
            />
            {errors.config && <p className="text-sm text-red-500 mt-1">{errors.config}</p>}
            <p className="text-xs text-muted-foreground">
              Provider-specific configuration in JSON format. Leave empty for default settings.
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit">
              {integration ? 'Update Integration' : 'Create Integration'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function getConfigPlaceholder(provider: string): string {
  const placeholders: Record<string, string> = {
    [PROVIDERS.GITHUB]: JSON.stringify({
      token: "your_github_token",
      organization: "your_org",
      repositories: ["repo1", "repo2"]
    }, null, 2),
    [PROVIDERS.SLACK]: JSON.stringify({
      workspace_id: "your_workspace_id",
      bot_token: "xoxb-your-bot-token",
      channels: {
        notifications: "#notifications",
        task_updates: "#task-updates",
        errors: "#errors"
      }
    }, null, 2),
    [PROVIDERS.CLAUDE]: JSON.stringify({
      command: "claude",
      args: ["--config", "/path/to/config.json"],
      env: {
        "ANTHROPIC_API_KEY": "your_api_key"
      }
    }, null, 2),
    [PROVIDERS.JIRA]: JSON.stringify({
      server_url: "https://your-domain.atlassian.net",
      email: "your_email@example.com",
      api_token: "your_api_token",
      project_key: "PROJ"
    }, null, 2),
  };

  return placeholders[provider] || JSON.stringify({
    key: "value",
    nested: {
      property: "example"
    }
  }, null, 2);
}