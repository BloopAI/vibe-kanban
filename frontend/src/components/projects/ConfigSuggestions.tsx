import { useState } from 'react';
import { Check, X, Sparkles, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader } from '@/components/ui/loader';
import { projectsApi } from '@/lib/api';
import type {
  ProjectConfigSuggestion,
  ProjectConfigField,
  ConfidenceLevel,
} from 'shared/types';

interface ConfigSuggestionsProps {
  repoPath: string;
  onApply: (field: string, value: string) => void;
}

const fieldLabels: Record<ProjectConfigField, string> = {
  SetupScript: 'Setup Script',
  DevScript: 'Dev Script',
  CleanupScript: 'Cleanup Script',
  CopyFiles: 'Copy Files',
  DevHost: 'Dev Server Host',
  DevPort: 'Dev Server Port',
};

const fieldDescriptions: Record<ProjectConfigField, string> = {
  SetupScript: 'Commands to install dependencies and prepare the environment',
  DevScript: 'Command to start the development server',
  CleanupScript: 'Commands to run tests, linters, or validators',
  CopyFiles: 'Files to copy to new worktrees (e.g., .env files)',
  DevHost:
    'Network host configuration for dev server (e.g., 0.0.0.0 for network access)',
  DevPort: 'Port number for dev server',
};

export function ConfigSuggestions({
  repoPath,
  onApply,
}: ConfigSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<ProjectConfigSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);
  const [rejectedSuggestions, setRejectedSuggestions] = useState<Set<string>>(
    new Set()
  );

  const handleScan = async () => {
    setLoading(true);
    setError(null);
    setScanned(false);
    setRejectedSuggestions(new Set());

    try {
      const response = await projectsApi.scanConfig({ repo_path: repoPath });
      setSuggestions(response.suggestions);
      setScanned(true);
    } catch (err) {
      console.error('Failed to scan project config:', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to scan project configuration'
      );
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = (suggestion: ProjectConfigSuggestion) => {
    const fieldKey = fieldToKey(suggestion.field);
    onApply(fieldKey, suggestion.value);
    // Remove from suggestions after accepting
    setSuggestions((prev) =>
      prev.filter(
        (s) => !(s.field === suggestion.field && s.value === suggestion.value)
      )
    );
  };

  const handleReject = (suggestion: ProjectConfigSuggestion) => {
    const key = `${suggestion.field}-${suggestion.value}`;
    setRejectedSuggestions((prev) => new Set(prev).add(key));
    // Remove from suggestions
    setSuggestions((prev) =>
      prev.filter(
        (s) => !(s.field === suggestion.field && s.value === suggestion.value)
      )
    );
  };

  const fieldToKey = (field: ProjectConfigField): string => {
    switch (field) {
      case 'SetupScript':
        return 'setup_script';
      case 'DevScript':
        return 'dev_script';
      case 'CleanupScript':
        return 'cleanup_script';
      case 'CopyFiles':
        return 'copy_files';
      case 'DevHost':
        return 'dev_host';
      case 'DevPort':
        return 'dev_port';
    }
  };

  const visibleSuggestions = suggestions.filter(
    (s) => !rejectedSuggestions.has(`${s.field}-${s.value}`)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleScan}
          disabled={loading || !repoPath}
        >
          {loading ? (
            <>
              <Loader className="mr-2 h-4 w-4" />
              Scanning...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Scan Project
            </>
          )}
        </Button>
        <p className="text-sm text-muted-foreground">
          Auto-detect configuration from documentation and project files
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {scanned && visibleSuggestions.length === 0 && !error && (
        <Alert>
          <AlertDescription>
            No configuration suggestions found. You can manually fill in the
            fields below.
          </AlertDescription>
        </Alert>
      )}

      {visibleSuggestions.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium">Detected Configuration</p>
          {visibleSuggestions.map((suggestion, index) => (
            <SuggestionCard
              key={`${suggestion.field}-${index}`}
              suggestion={suggestion}
              onAccept={() => handleAccept(suggestion)}
              onReject={() => handleReject(suggestion)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface SuggestionCardProps {
  suggestion: ProjectConfigSuggestion;
  onAccept: () => void;
  onReject: () => void;
}

function SuggestionCard({
  suggestion,
  onAccept,
  onReject,
}: SuggestionCardProps) {
  const confidenceColor: Record<ConfidenceLevel, string> = {
    High: 'bg-green-500',
    Medium: 'bg-yellow-500',
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-medium">
                {fieldLabels[suggestion.field]}
              </CardTitle>
              <div className="flex items-center gap-1">
                <div
                  className={`h-2 w-2 rounded-full ${confidenceColor[suggestion.confidence]}`}
                  title={`${suggestion.confidence} confidence`}
                />
                <span className="text-xs text-muted-foreground">
                  {suggestion.confidence} confidence
                </span>
              </div>
            </div>
            <CardDescription className="text-xs mt-1">
              {fieldDescriptions[suggestion.field]}
            </CardDescription>
          </div>
          <Badge variant="secondary" className="text-xs">
            {suggestion.source}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        <div className="space-y-3">
          <div className="rounded-md bg-muted p-3">
            <code className="text-xs font-mono whitespace-pre-wrap break-all">
              {suggestion.value}
            </code>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={onAccept}
              className="flex-1"
            >
              <Check className="mr-1 h-4 w-4" />
              Accept
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onReject}
              className="flex-1"
            >
              <X className="mr-1 h-4 w-4" />
              Reject
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
