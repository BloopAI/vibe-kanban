import { useState } from 'react';
import { 
  Settings, 
  TestTube, 
  RefreshCw, 
  Trash2, 
  MoreHorizontal,
  ExternalLink,
  AlertCircle,
  CheckCircle,
  XCircle,
  HelpCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  IntegrationWithCategory, 
  getProviderDisplayName,
  getHealthStatusColor,
  HEALTH_STATUS
} from '@/lib/types/integrations';
import { formatDistanceToNow } from 'date-fns';

interface IntegrationCardProps {
  integration: IntegrationWithCategory;
  onToggle: (id: string, enabled: boolean) => void;
  onTest: (id: string) => void;
  onSync: (id: string) => void;
  onEdit: (integration: IntegrationWithCategory) => void;
  onDelete: (id: string) => void;
}

export function IntegrationCard({
  integration,
  onToggle,
  onTest,
  onSync,
  onEdit,
  onDelete,
}: IntegrationCardProps) {
  const [isLoading, setIsLoading] = useState({
    toggle: false,
    test: false,
    sync: false,
  });

  const handleToggle = async (enabled: boolean) => {
    setIsLoading(prev => ({ ...prev, toggle: true }));
    try {
      await onToggle(integration.id, enabled);
    } finally {
      setIsLoading(prev => ({ ...prev, toggle: false }));
    }
  };

  const handleTest = async () => {
    setIsLoading(prev => ({ ...prev, test: true }));
    try {
      await onTest(integration.id);
    } finally {
      setIsLoading(prev => ({ ...prev, test: false }));
    }
  };

  const handleSync = async () => {
    setIsLoading(prev => ({ ...prev, sync: true }));
    try {
      await onSync(integration.id);
    } finally {
      setIsLoading(prev => ({ ...prev, sync: false }));
    }
  };

  const getHealthStatusIcon = () => {
    switch (integration.health_status) {
      case HEALTH_STATUS.HEALTHY:
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case HEALTH_STATUS.ERROR:
        return <XCircle className="h-4 w-4 text-red-600" />;
      case HEALTH_STATUS.WARNING:
        return <AlertCircle className="h-4 w-4 text-yellow-600" />;
      default:
        return <HelpCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getProviderIcon = () => {
    // This would be expanded with actual provider icons
    const iconMap: Record<string, string> = {
      github: '🐙',
      slack: '💬',
      claude: '🤖',
      amp: '⚡',
      gemini: '♊',
      jira: '📋',
      linear: '📐',
      vscode: '💻',
    };
    
    return iconMap[integration.provider] || '🔗';
  };

  const formatLastActivity = (timestamp?: string) => {
    if (!timestamp) return 'Never';
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch {
      return 'Unknown';
    }
  };

  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="text-2xl">{getProviderIcon()}</div>
            <div>
              <h3 className="font-semibold text-sm">{integration.name}</h3>
              <p className="text-xs text-muted-foreground">
                {getProviderDisplayName(integration.provider)}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {getHealthStatusIcon()}
            <Switch
              checked={integration.enabled}
              onCheckedChange={handleToggle}
              disabled={isLoading.toggle}
            />
          </div>
        </div>

        {/* Status Information */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Status</span>
            <Badge 
              variant={integration.enabled ? 'default' : 'secondary'}
              className="text-xs"
            >
              {integration.enabled ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Health</span>
            <span className={getHealthStatusColor(integration.health_status)}>
              {integration.health_status.charAt(0).toUpperCase() + integration.health_status.slice(1)}
            </span>
          </div>

          {integration.last_sync_at && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Last Sync</span>
              <span className="text-muted-foreground">
                {formatLastActivity(integration.last_sync_at)}
              </span>
            </div>
          )}

          {integration.last_health_check_at && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Last Check</span>
              <span className="text-muted-foreground">
                {formatLastActivity(integration.last_health_check_at)}
              </span>
            </div>
          )}
        </div>

        {/* Error Message */}
        {integration.error_message && (
          <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-800">
            {integration.error_message}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={isLoading.test}
            className="flex-1"
          >
            {isLoading.test ? (
              <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <TestTube className="h-3 w-3 mr-1" />
            )}
            Test
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={isLoading.sync}
            className="flex-1"
          >
            {isLoading.sync ? (
              <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3 mr-1" />
            )}
            Sync
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(integration)}>
                <Settings className="h-4 w-4 mr-2" />
                Configure
              </DropdownMenuItem>
              <DropdownMenuItem>
                <ExternalLink className="h-4 w-4 mr-2" />
                View Events
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => onDelete(integration.id)}
                className="text-red-600"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </Card>
  );
}