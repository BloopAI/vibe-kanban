import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ChevronDown,
  ChevronRight,
  Edit2,
  Info,
  Loader2,
  Plus,
  Trash2,
  Zap,
} from 'lucide-react';
import { webhooksApi } from '@/lib/api';
import { ConfirmDialog } from '@/components/dialogs';
import type { WebhookResponse, WebhookEventType, CreateWebhook, UpdateWebhook } from 'shared/types';

const ALL_EVENTS: WebhookEventType[] = [
  'approval_request',
  'pending_question',
  'executor_finish',
];

const EVENT_LABELS: Record<WebhookEventType, string> = {
  approval_request: 'Approval Request',
  pending_question: 'Pending Question',
  executor_finish: 'Executor Finish',
};

const VARIABLE_GROUPS = [
  {
    label: 'Project',
    vars: ['project.id', 'project.name', 'project.git_repo_path', 'project.github_owner', 'project.github_repo'],
  },
  {
    label: 'Task',
    vars: ['task.id', 'task.title', 'task.description', 'task.status', 'task.labels'],
  },
  {
    label: 'Task Attempt',
    vars: ['task_attempt.id', 'task_attempt.executor', 'task_attempt.branch', 'task_attempt.worktree_path'],
  },
  {
    label: 'Execution',
    vars: ['execution_process.id', 'execution_process.run_reason', 'event.type', 'event.timestamp'],
  },
  {
    label: 'Approval Request',
    vars: ['approval.id', 'approval.tool_name', 'approval.tool_input_json', 'approval.timeout_at'],
  },
  {
    label: 'Pending Question',
    vars: ['question.id', 'question.questions_json', 'question.timeout_at'],
  },
  {
    label: 'Executor Finish',
    vars: [
      'finish.status', 'finish.completion_reason', 'finish.exit_code',
      'finish.duration_ms', 'finish.started_at', 'finish.completed_at',
      'finish.pr_url', 'finish.pr_number',
    ],
  },
];

const TOTAL_VAR_COUNT = VARIABLE_GROUPS.reduce((n, g) => n + g.vars.length, 0);

interface WebhookTestResult {
  ok: boolean;
  status_code?: number;
  response_time_ms?: number;
  body_preview?: string;
  error?: string;
}

interface WebhookFormProps {
  initial?: WebhookResponse;
  projectId?: string;
  onClose: () => void;
  onSaved: () => void;
}

function WebhookForm({ initial, projectId, onClose, onSaved }: WebhookFormProps) {
  const queryClient = useQueryClient();
  const templateRef = useRef<HTMLTextAreaElement>(null);

  const [name, setName] = useState(initial?.name ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [events, setEvents] = useState<WebhookEventType[]>(initial?.events ?? ['executor_finish']);

  // Step 10 (H4): track whether the user has touched headers so we can send null to preserve existing.
  const [headersText, setHeadersText] = useState(() => {
    if (!initial?.headers) return '{}';
    // Header values are masked as "***" by the server — pre-populating them
    // would overwrite real secrets on save. Start with {} and let the user
    // re-enter headers explicitly.
    const hasMasked = Object.values(initial.headers).some((v) => v === '***');
    return hasMasked ? '{}' : JSON.stringify(initial.headers, null, 2);
  });
  const [headersDirty, setHeadersDirty] = useState(false);
  const [headersError, setHeadersError] = useState<string | null>(null);

  const [secret, setSecret] = useState('');
  // Step 9 (C2): track whether user explicitly cleared the secret
  const [clearSecret, setClearSecret] = useState(false);

  const [payloadTemplate, setPayloadTemplate] = useState(initial?.payload_template ?? '');
  // Step 9 (C2): track whether user explicitly cleared the template
  const [clearTemplate, setClearTemplate] = useState(false);

  const [overrideGlobal, setOverrideGlobal] = useState(initial?.override_global ?? false);
  const [active, setActive] = useState(initial?.active ?? true);
  const [varsOpen, setVarsOpen] = useState(false);
  const [testResult, setTestResult] = useState<WebhookTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: CreateWebhook) =>
      projectId ? webhooksApi.createForProject(projectId, data) : webhooksApi.createGlobal(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectId ? ['webhooks', 'project', projectId] : ['webhooks', 'global'] });
      onSaved();
    },
    onError: (err) => {
      console.error('Failed to create webhook:', err);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: UpdateWebhook) => webhooksApi.update(initial!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectId ? ['webhooks', 'project', projectId] : ['webhooks', 'global'] });
      onSaved();
    },
    onError: (err) => {
      console.error('Failed to update webhook:', err);
    },
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const saveError = createMutation.error || updateMutation.error;

  const validateHeaders = (text: string) => {
    try {
      JSON.parse(text);
      setHeadersError(null);
      return true;
    } catch {
      setHeadersError('Invalid JSON');
      return false;
    }
  };

  // Step 10 (H4): set dirty flag when user edits headers
  const handleHeadersChange = (v: string) => {
    setHeadersText(v);
    setHeadersDirty(true);
    validateHeaders(v);
  };

  const toggleEvent = (evt: WebhookEventType) => {
    setEvents((prev) =>
      prev.includes(evt) ? prev.filter((e) => e !== evt) : [...prev, evt]
    );
  };

  const insertVariable = (varName: string) => {
    const el = templateRef.current;
    if (!el) {
      setPayloadTemplate((prev) => prev + `{{${varName}}}`);
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const insertion = `{{${varName}}}`;
    const newVal = el.value.slice(0, start) + insertion + el.value.slice(end);
    setPayloadTemplate(newVal);
    // Restore cursor after insertion
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + insertion.length, start + insertion.length);
    });
  };

  const handleTest = async () => {
    if (!initial?.id) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await webhooksApi.test(initial.id);
      setTestResult(result);
      if (result.ok) {
        setTimeout(() => setTestResult(null), 5000);
      }
    } catch (e) {
      setTestResult({ ok: false, error: String(e) });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    if (!validateHeaders(headersText)) return;
    if (!url.trim()) {
      setUrlError('URL is required');
      return;
    }
    setUrlError(null);

    // Step 10 (H4): for updates, send null when headers not touched so backend preserves existing.
    // null = preserve existing; {} = clear all; {...} = replace all
    // For creates, headers are always required (non-null), default to empty object.
    const parsedHeaders: Record<string, string> = (() => {
      try { return JSON.parse(headersText); } catch { return {}; }
    })();
    const updateHeadersField: Record<string, string> | null = headersDirty ? parsedHeaders : null;

    const sharedBase = {
      name: name.trim() || 'Webhook',
      url: url.trim(),
      events,
      secret: secret || null,
      payload_template: payloadTemplate.trim() || null,
      override_global: overrideGlobal,
      active,
    };

    if (initial) {
      updateMutation.mutate({
        ...sharedBase,
        headers: updateHeadersField,
        // Step 9 (C2): pass explicit clear flags so backend can null out secret/template
        clear_secret: clearSecret,
        clear_payload_template: clearTemplate,
      });
    } else {
      createMutation.mutate({
        ...sharedBase,
        headers: parsedHeaders,
      });
    }
  };

  const isTestEnabled = url.trim().length > 0 && !!initial?.id;

  return (
    <div className="space-y-4">
      {saveError && (
        <Alert variant="destructive">
          <AlertDescription>
            {saveError instanceof Error ? saveError.message : String(saveError)}
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="wh-name">Name</Label>
        <Input
          id="wh-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Webhook"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="wh-url">URL</Label>
        <Input
          id="wh-url"
          value={url}
          onChange={(e) => { setUrl(e.target.value); setUrlError(null); }}
          placeholder="https://hooks.example.com/..."
        />
        {urlError && <p className="text-destructive text-xs">{urlError}</p>}
      </div>

      <div className="space-y-2">
        <Label>Events</Label>
        <div className="space-y-2">
          {ALL_EVENTS.map((evt) => (
            <div key={evt} className="flex items-center gap-2">
              <Checkbox
                id={`evt-${evt}`}
                checked={events.includes(evt)}
                onCheckedChange={() => toggleEvent(evt)}
              />
              <label htmlFor={`evt-${evt}`} className="text-sm cursor-pointer">
                {EVENT_LABELS[evt]}
              </label>
            </div>
          ))}
        </div>
      </div>

      {projectId && (
        <div className="flex items-center gap-3">
          <Switch
            id="wh-override"
            checked={overrideGlobal}
            onCheckedChange={setOverrideGlobal}
          />
          <label htmlFor="wh-override" className="text-sm cursor-pointer">
            Override global webhooks for selected events
          </label>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="wh-headers">Custom Headers (JSON)</Label>
        <Textarea
          id="wh-headers"
          value={headersText}
          onChange={(e) => handleHeadersChange(e.target.value)}
          placeholder={'{"Authorization": "Bearer token"}'}
          className="font-mono text-sm h-24"
        />
        {headersError && (
          <p className="text-destructive text-xs">{headersError}</p>
        )}
        {initial?.id && Object.keys(initial.headers ?? {}).length > 0 && (
          <p className="text-xs text-muted-foreground">
            Existing header values are write-only. Leave as{' '}
            <code className="font-mono">{'{}'}</code> to keep current headers, or
            enter all headers (including ones to preserve) to replace them.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="wh-secret">Signing Secret</Label>
        <div className="flex items-center gap-2">
          <Input
            id="wh-secret"
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder={initial?.secret_set && !clearSecret ? '••••••••' : 'Leave empty to disable signing'}
            disabled={clearSecret}
            className="flex-1"
          />
          {/* Step 9 (C2): "Remove secret" affordance when editing a webhook that has a secret */}
          {initial?.secret_set && !clearSecret && (
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => { setClearSecret(true); setSecret(''); }}
            >
              Remove secret
            </Button>
          )}
          {clearSecret && (
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => setClearSecret(false)}
            >
              Undo
            </Button>
          )}
        </div>
        {clearSecret && (
          <p className="text-xs text-destructive">Secret will be removed on save.</p>
        )}
        {!clearSecret && (
          <p className="text-xs text-muted-foreground">
            When set, payloads are signed with <code className="font-mono">X-VkSwarm-Signature: sha256=…</code>
          </p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="wh-template">
            Payload Template{' '}
            <span className="text-muted-foreground font-normal">(optional — default JSON if empty)</span>
          </Label>
          {/* Step 9 (C2): "Clear template" affordance when editing a webhook that has a template */}
          {initial?.payload_template && !clearTemplate && (
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => { setClearTemplate(true); setPayloadTemplate(''); }}
            >
              Clear template
            </Button>
          )}
          {clearTemplate && (
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => { setClearTemplate(false); setPayloadTemplate(initial?.payload_template ?? ''); }}
            >
              Undo
            </Button>
          )}
        </div>
        <Textarea
          id="wh-template"
          ref={templateRef}
          value={payloadTemplate}
          onChange={(e) => setPayloadTemplate(e.target.value)}
          placeholder={'{"text": "{{task.title}} finished with status {{finish.status}}"}'}
          className="font-mono text-sm h-28"
          disabled={clearTemplate}
        />
        {clearTemplate && (
          <p className="text-xs text-destructive">Payload template will be cleared on save.</p>
        )}
        <button
          type="button"
          onClick={() => setVarsOpen((v) => !v)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {varsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Available variables ({TOTAL_VAR_COUNT})
        </button>
        {varsOpen && (
          <div className="mt-2 space-y-3">
            {VARIABLE_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                  {group.label}
                </p>
                <div className="flex flex-wrap gap-1">
                  {group.vars.map((v) => (
                    <Badge
                      key={v}
                      variant="outline"
                      className="font-mono text-xs cursor-pointer hover:bg-accent"
                      onClick={() => insertVariable(v)}
                      title="Click to insert"
                    >
                      {`{{${v}}}`}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Switch id="wh-active" checked={active} onCheckedChange={setActive} />
        <label htmlFor="wh-active" className="text-sm cursor-pointer">Active</label>
      </div>

      {initial && (
        <div className="space-y-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={!isTestEnabled || testing}
          >
            {testing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Send Test
          </Button>
          {testResult && (
            <Alert variant={testResult.ok ? 'default' : 'destructive'}>
              <AlertDescription className="text-sm">
                {testResult.ok ? (
                  <>
                    <span className="font-medium text-green-600">
                      {testResult.status_code} OK
                    </span>{' '}
                    — {testResult.response_time_ms}ms
                  </>
                ) : (
                  <>
                    <span className="font-medium">Failed</span>
                    {testResult.status_code && ` (${testResult.status_code})`}
                    {testResult.error && `: ${testResult.error}`}
                    {testResult.body_preview && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs">Response body</summary>
                        <pre className="text-xs mt-1 whitespace-pre-wrap break-all">{testResult.body_preview}</pre>
                      </details>
                    )}
                  </>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={isSaving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={isSaving || !!headersError}>
          {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {initial ? 'Save Changes' : 'Create Webhook'}
        </Button>
      </DialogFooter>
    </div>
  );
}

interface WebhookListProps {
  webhooks: WebhookResponse[];
  projectId?: string;
  onEdit: (webhook: WebhookResponse) => void;
  onDelete: (id: string) => void;
  onToggleActive: (webhook: WebhookResponse) => void;
  togglingId: string | null;
}

function WebhookList({
  webhooks,
  onEdit,
  onDelete,
  onToggleActive,
  togglingId,
}: WebhookListProps) {
  if (webhooks.length === 0) {
    return (
      <div className="text-center py-8">
        <Zap className="h-8 w-8 mx-auto mb-3 opacity-40" />
        <p className="text-muted-foreground text-sm">
          No webhooks configured. Add one to receive event notifications.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {webhooks.map((wh) => (
        <div
          key={wh.id}
          className="flex items-center gap-3 p-3 rounded-md border border-border"
        >
          <Switch
            checked={wh.active}
            onCheckedChange={() => onToggleActive(wh)}
            disabled={togglingId === wh.id}
            aria-label={wh.active ? 'Deactivate' : 'Activate'}
          />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate">{wh.name}</div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="text-xs text-muted-foreground truncate max-w-[240px]">
                    {wh.url}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-mono text-xs">{wh.url}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="flex gap-1 flex-wrap">
            {wh.events.map((evt) => (
              <Badge key={evt} variant="secondary" className="text-xs">
                {EVENT_LABELS[evt]}
              </Badge>
            ))}
            {wh.override_global && (
              <Badge variant="outline" className="text-xs">override</Badge>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            <Button variant="ghost" size="sm" onClick={() => onEdit(wh)} className="h-8 w-8 p-0">
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(wh.id)}
              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

interface WebhooksSectionProps {
  /** If provided, manages project-specific webhooks. Otherwise manages global webhooks. */
  projectId?: string;
  title: string;
  description: string;
  showOverrideNote?: boolean;
}

export function WebhooksSection({
  projectId,
  title,
  description,
  showOverrideNote = false,
}: WebhooksSectionProps) {
  const queryClient = useQueryClient();
  const queryKey = projectId ? ['webhooks', 'project', projectId] : ['webhooks', 'global'];

  const { data: webhooks = [], isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      projectId ? webhooksApi.listForProject(projectId) : webhooksApi.listGlobal(),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<WebhookResponse | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: webhooksApi.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateWebhook }) =>
      webhooksApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setTogglingId(null);
    },
    onError: () => setTogglingId(null),
  });

  const handleEdit = (wh: WebhookResponse) => {
    setEditTarget(wh);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setEditTarget(null);
    setDialogOpen(true);
  };

  const handleToggleActive = (wh: WebhookResponse) => {
    setTogglingId(wh.id);
    updateMutation.mutate({
      id: wh.id,
      data: {
        name: null, url: null, events: null, headers: null,
        secret: null, clear_secret: false,
        payload_template: null, clear_payload_template: false,
        override_global: null, active: !wh.active,
      },
    });
  };

  const handleDelete = async (id: string) => {
    const result = await ConfirmDialog.show({
      title: 'Delete Webhook',
      message: 'Are you sure you want to delete this webhook? This cannot be undone.',
      confirmText: 'Delete',
    });
    if (result !== 'confirmed') return;
    deleteMutation.mutate(id);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Add Webhook
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showOverrideNote && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Project webhooks fire in addition to global webhooks. Enable{' '}
              <span className="font-medium">Override global</span> on a project webhook to suppress
              global webhooks for those event types.
            </AlertDescription>
          </Alert>
        )}
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <WebhookList
            webhooks={webhooks}
            projectId={projectId}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onToggleActive={handleToggleActive}
            togglingId={togglingId}
          />
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? 'Edit Webhook' : 'New Webhook'}
            </DialogTitle>
            <DialogDescription>
              {editTarget
                ? 'Update the webhook configuration.'
                : 'Configure a new webhook endpoint.'}
            </DialogDescription>
          </DialogHeader>
          <WebhookForm
            initial={editTarget ?? undefined}
            projectId={projectId}
            onClose={() => setDialogOpen(false)}
            onSaved={() => setDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export function WebhooksSettings() {
  const { t } = useTranslation('settings');

  return (
    <div className="space-y-6">
      <WebhooksSection
        title={t('settings.webhooks.global.title')}
        description={t('settings.webhooks.global.description')}
      />
    </div>
  );
}
