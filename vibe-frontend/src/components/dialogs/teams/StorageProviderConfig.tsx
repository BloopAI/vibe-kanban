import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FolderOpen,
  Cloud,
  HardDrive,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { teamsApi } from '@/lib/api';
import { Alert, AlertDescription } from '@/components/ui/alert';

export type StorageProvider = 'local' | 's3' | 'google_drive' | 'dropbox';

export interface StorageConfig {
  // Local path
  path?: string;

  // S3
  s3_bucket?: string;
  s3_region?: string;
  s3_prefix?: string;
  s3_access_key_id?: string;
  s3_secret_access_key?: string;

  // Google Drive
  google_drive_folder_id?: string;
  google_drive_connected?: boolean;

  // Dropbox
  dropbox_folder_path?: string;
  dropbox_connected?: boolean;
}

export interface StorageProviderConfigProps {
  provider: StorageProvider | null;
  config: StorageConfig;
  onProviderChange: (provider: StorageProvider | null) => void;
  onConfigChange: (config: StorageConfig) => void;
  disabled?: boolean;
}

const STORAGE_PROVIDERS = [
  { value: 'local', label: 'Local Path', icon: HardDrive, description: 'Store documents in a local directory' },
  { value: 's3', label: 'Amazon S3', icon: Cloud, description: 'Store documents in an S3 bucket' },
  { value: 'google_drive', label: 'Google Drive', icon: Cloud, description: 'Store documents in Google Drive' },
  { value: 'dropbox', label: 'Dropbox', icon: Cloud, description: 'Store documents in Dropbox' },
] as const;

const S3_REGIONS = [
  { value: 'us-east-1', label: 'US East (N. Virginia)' },
  { value: 'us-east-2', label: 'US East (Ohio)' },
  { value: 'us-west-1', label: 'US West (N. California)' },
  { value: 'us-west-2', label: 'US West (Oregon)' },
  { value: 'eu-west-1', label: 'EU (Ireland)' },
  { value: 'eu-west-2', label: 'EU (London)' },
  { value: 'eu-central-1', label: 'EU (Frankfurt)' },
  { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
  { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
  { value: 'ap-southeast-2', label: 'Asia Pacific (Sydney)' },
];

export function StorageProviderConfig({
  provider,
  config,
  onProviderChange,
  onConfigChange,
  disabled = false,
}: StorageProviderConfigProps) {
  const [pathValidation, setPathValidation] = useState<{
    status: 'idle' | 'validating' | 'valid' | 'invalid';
    error?: string;
  }>({ status: 'idle' });

  const validateLocalPath = async (path: string) => {
    if (!path.trim()) {
      setPathValidation({ status: 'idle' });
      return;
    }

    setPathValidation({ status: 'validating' });
    try {
      const result = await teamsApi.validateStoragePath({ path: path.trim() });
      if (result.valid) {
        setPathValidation({ status: 'valid' });
      } else {
        setPathValidation({ status: 'invalid', error: result.error || 'Invalid path' });
      }
    } catch (err) {
      setPathValidation({
        status: 'invalid',
        error: err instanceof Error ? err.message : 'Failed to validate path',
      });
    }
  };

  const handleConfigUpdate = (updates: Partial<StorageConfig>) => {
    onConfigChange({ ...config, ...updates });
    // Reset validation when config changes
    setPathValidation({ status: 'idle' });
  };

  const handleProviderChange = (value: string) => {
    if (value === 'none') {
      onProviderChange(null);
      onConfigChange({});
    } else {
      onProviderChange(value as StorageProvider);
      // Clear config when switching providers
      onConfigChange({});
    }
    setPathValidation({ status: 'idle' });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4" />
            Document Storage
          </div>
        </Label>
        <p className="text-xs text-muted-foreground">
          Choose where to store team documents. Leave as default to use application storage.
        </p>
      </div>

      {/* Provider Selection */}
      <div className="space-y-2">
        <Label htmlFor="storage-provider">Storage Provider</Label>
        <Select
          value={provider || 'none'}
          onValueChange={handleProviderChange}
          disabled={disabled}
        >
          <SelectTrigger id="storage-provider" className="h-10">
            <SelectValue placeholder="Select storage provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">
              <div className="flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-muted-foreground" />
                Default (Application Storage)
              </div>
            </SelectItem>
            {STORAGE_PROVIDERS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                <div className="flex items-center gap-2">
                  <p.icon className="h-4 w-4 text-muted-foreground" />
                  {p.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Provider-specific configuration */}
      {provider === 'local' && (
        <LocalPathConfig
          path={config.path || ''}
          onPathChange={(path) => handleConfigUpdate({ path })}
          onValidate={validateLocalPath}
          validation={pathValidation}
          disabled={disabled}
        />
      )}

      {provider === 's3' && (
        <S3Config
          config={config}
          onConfigChange={handleConfigUpdate}
          disabled={disabled}
        />
      )}

      {provider === 'google_drive' && (
        <GoogleDriveConfig
          config={config}
          onConfigChange={handleConfigUpdate}
          disabled={disabled}
        />
      )}

      {provider === 'dropbox' && (
        <DropboxConfig
          config={config}
          onConfigChange={handleConfigUpdate}
          disabled={disabled}
        />
      )}
    </div>
  );
}

// Local Path Configuration
interface LocalPathConfigProps {
  path: string;
  onPathChange: (path: string) => void;
  onValidate: (path: string) => void;
  validation: { status: 'idle' | 'validating' | 'valid' | 'invalid'; error?: string };
  disabled: boolean;
}

function LocalPathConfig({
  path,
  onPathChange,
  onValidate,
  validation,
  disabled,
}: LocalPathConfigProps) {
  return (
    <div className="space-y-2 rounded-lg border p-4">
      <Label htmlFor="local-path">Directory Path</Label>
      <p className="text-xs text-muted-foreground">
        Full path to the directory where documents will be stored.
      </p>
      <div className="flex gap-2">
        <Input
          id="local-path"
          value={path}
          onChange={(e) => onPathChange(e.target.value)}
          placeholder="/path/to/documents"
          disabled={disabled}
          className="h-10 flex-1 font-mono text-sm"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onValidate(path)}
          disabled={disabled || validation.status === 'validating' || !path.trim()}
          className="h-10"
        >
          {validation.status === 'validating' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            'Validate'
          )}
        </Button>
      </div>
      {validation.status === 'valid' && (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <CheckCircle className="h-4 w-4" />
          Path is valid and writable
        </div>
      )}
      {validation.status === 'invalid' && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <XCircle className="h-4 w-4" />
          {validation.error}
        </div>
      )}
    </div>
  );
}

// S3 Configuration
interface S3ConfigProps {
  config: StorageConfig;
  onConfigChange: (updates: Partial<StorageConfig>) => void;
  disabled: boolean;
}

function S3Config({ config, onConfigChange, disabled }: S3ConfigProps) {
  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="s3-bucket">Bucket Name</Label>
          <Input
            id="s3-bucket"
            value={config.s3_bucket || ''}
            onChange={(e) => onConfigChange({ s3_bucket: e.target.value })}
            placeholder="my-bucket"
            disabled={disabled}
            className="h-10 font-mono text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="s3-region">Region</Label>
          <Select
            value={config.s3_region || ''}
            onValueChange={(value) => onConfigChange({ s3_region: value })}
            disabled={disabled}
          >
            <SelectTrigger id="s3-region" className="h-10">
              <SelectValue placeholder="Select region" />
            </SelectTrigger>
            <SelectContent>
              {S3_REGIONS.map((region) => (
                <SelectItem key={region.value} value={region.value}>
                  {region.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="s3-prefix">Prefix / Folder (Optional)</Label>
        <Input
          id="s3-prefix"
          value={config.s3_prefix || ''}
          onChange={(e) => onConfigChange({ s3_prefix: e.target.value })}
          placeholder="team-documents/"
          disabled={disabled}
          className="h-10 font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Optional path prefix within the bucket (e.g., "team-documents/")
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="s3-access-key">Access Key ID</Label>
        <Input
          id="s3-access-key"
          value={config.s3_access_key_id || ''}
          onChange={(e) => onConfigChange({ s3_access_key_id: e.target.value })}
          placeholder="AKIAIOSFODNN7EXAMPLE"
          disabled={disabled}
          className="h-10 font-mono text-sm"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="s3-secret-key">Secret Access Key</Label>
        <Input
          id="s3-secret-key"
          type="password"
          value={config.s3_secret_access_key || ''}
          onChange={(e) => onConfigChange({ s3_secret_access_key: e.target.value })}
          placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
          disabled={disabled}
          className="h-10 font-mono text-sm"
        />
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Credentials are stored securely. Ensure the IAM user has s3:GetObject, s3:PutObject, and s3:ListBucket permissions.
        </AlertDescription>
      </Alert>
    </div>
  );
}

// Google Drive Configuration
interface GoogleDriveConfigProps {
  config: StorageConfig;
  onConfigChange: (updates: Partial<StorageConfig>) => void;
  disabled: boolean;
}

function GoogleDriveConfig({ config, onConfigChange, disabled }: GoogleDriveConfigProps) {
  return (
    <div className="space-y-4 rounded-lg border p-4">
      {!config.google_drive_connected ? (
        <div className="text-center py-4">
          <Cloud className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground mb-4">
            Connect your Google account to store documents in Google Drive.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => {
              // TODO: Implement Google OAuth flow
              alert('Google Drive integration coming soon!');
            }}
          >
            <Cloud className="h-4 w-4 mr-2" />
            Connect with Google
          </Button>
          <p className="text-xs text-muted-foreground mt-4">
            Coming soon - OAuth integration in development
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-green-600">
            <CheckCircle className="h-4 w-4" />
            Connected to Google Drive
          </div>
          <div className="space-y-2">
            <Label htmlFor="gdrive-folder">Folder ID (Optional)</Label>
            <Input
              id="gdrive-folder"
              value={config.google_drive_folder_id || ''}
              onChange={(e) => onConfigChange({ google_drive_folder_id: e.target.value })}
              placeholder="Leave empty for root folder"
              disabled={disabled}
              className="h-10 font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              The Google Drive folder ID where documents will be stored.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Dropbox Configuration
interface DropboxConfigProps {
  config: StorageConfig;
  onConfigChange: (updates: Partial<StorageConfig>) => void;
  disabled: boolean;
}

function DropboxConfig({ config, onConfigChange, disabled }: DropboxConfigProps) {
  return (
    <div className="space-y-4 rounded-lg border p-4">
      {!config.dropbox_connected ? (
        <div className="text-center py-4">
          <Cloud className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground mb-4">
            Connect your Dropbox account to store documents.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => {
              // TODO: Implement Dropbox OAuth flow
              alert('Dropbox integration coming soon!');
            }}
          >
            <Cloud className="h-4 w-4 mr-2" />
            Connect with Dropbox
          </Button>
          <p className="text-xs text-muted-foreground mt-4">
            Coming soon - OAuth integration in development
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-green-600">
            <CheckCircle className="h-4 w-4" />
            Connected to Dropbox
          </div>
          <div className="space-y-2">
            <Label htmlFor="dropbox-folder">Folder Path</Label>
            <Input
              id="dropbox-folder"
              value={config.dropbox_folder_path || ''}
              onChange={(e) => onConfigChange({ dropbox_folder_path: e.target.value })}
              placeholder="/Team Documents"
              disabled={disabled}
              className="h-10 font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              The Dropbox folder path where documents will be stored.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
