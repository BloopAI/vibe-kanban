import { useState, useEffect, useRef, useMemo } from 'react';
import {
    ExternalLink,
    RefreshCw,
    Copy,
    Loader2,
    MonitorSpeaker,
    Play,
    StopCircle,
    Terminal,
    ChevronDown,
    Edit3,
    X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
    useDevserverPreview,
} from '@/hooks/useDevserverPreview';
import { useDevServer } from '@/hooks/useDevServer';
import { ClickToComponentListener } from '@/utils/previewBridge';
import { useClickedElements } from '@/contexts/ClickedElementsProvider';
import { TaskAttempt } from 'shared/types';
import { Alert } from '@/components/ui/alert';
import ProcessLogsViewer from './ProcessLogsViewer';
import { useUserSystem } from '@/components/config-provider';
import { createScriptPlaceholderStrategy, ScriptPlaceholderContext } from '@/utils/script-placeholders';
import { projectsApi } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { useProject } from '@/contexts/project-context';

interface DevServerLogsViewProps {
    latestDevServerProcess: any;
    showLogs: boolean;
    onToggle: () => void;
    height?: string;
    showToggleText?: boolean;
}

function DevServerLogsView({
    latestDevServerProcess,
    showLogs,
    onToggle,
    height = "h-60",
    showToggleText = true
}: DevServerLogsViewProps) {
    if (!latestDevServerProcess) {
        return null;
    }

    return (
        <div className="border-t bg-background">
            {/* Logs toolbar */}
            <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/50">
                <div className="flex items-center gap-2">
                    <Terminal className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">
                        Dev Server Logs
                    </span>
                </div>
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={onToggle}
                >
                    <ChevronDown className={`h-4 w-4 mr-1 ${showToggleText ? 'transition-transform' : ''} ${showLogs ? '' : 'rotate-180'}`} />
                    {showToggleText ? (showLogs ? 'Hide' : 'Show') : 'Hide'}
                </Button>
            </div>

            {/* Logs viewer */}
            {showLogs && (
                <div className={height}>
                    <ProcessLogsViewer processId={latestDevServerProcess.id} />
                </div>
            )}
        </div>
    );
}

interface PreviewTabProps {
    selectedAttempt: TaskAttempt;
    projectId: string;
    projectHasDevScript: boolean;
}

export default function PreviewTab({
    selectedAttempt,
    projectId,
    projectHasDevScript,
}: PreviewTabProps) {
    const [iframeError, setIframeError] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [loadingTimeFinished, setLoadingTimeFinished] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const [showLogs, setShowLogs] = useState(false);
    const [devScriptInput, setDevScriptInput] = useState('');
    const [isSavingDevScript, setIsSavingDevScript] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [devScriptAdded, setDevScriptAdded] = useState(false);
    const [isEditingExistingScript, setIsEditingExistingScript] = useState(false);
    const [showNoServerLogs, setShowNoServerLogs] = useState(true);
    const listenerRef = useRef<ClickToComponentListener | null>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    // Hooks
    const queryClient = useQueryClient();
    const { project } = useProject();
    const { system } = useUserSystem();

    // Compute effective dev script status
    const effectiveHasDevScript = projectHasDevScript || devScriptAdded;

    // Script placeholders
    const placeholders = useMemo(() => {
        if (system.environment) {
            return new ScriptPlaceholderContext(
                createScriptPlaceholderStrategy(system.environment.os_type)
            ).getPlaceholders();
        }
        return {
            setup: '#!/bin/bash\nnpm install\n# Add any setup commands here...',
            dev: '#!/bin/bash\nnpm run dev\n# Add dev server start command here...',
            cleanup: '#!/bin/bash\n# Add cleanup commands here...\n# This runs after coding agent execution',
        };
    }, [system.environment]);

    const previewState = useDevserverPreview(selectedAttempt.id, {
        projectHasDevScript: effectiveHasDevScript,
        projectId,
    });

    const {
        start: startDevServer,
        stop: stopDevServer,
        isStarting: isStartingDevServer,
        runningDevServer,
        latestDevServerProcess,
    } = useDevServer(selectedAttempt.id);

    const handleRefresh = () => {
        setIframeError(false);
        setRefreshKey((prev) => prev + 1);
    };
    const handleIframeError = () => {
        setIframeError(true);
    };

    const { addElement } = useClickedElements();

    const handleCopyUrl = async () => {
        if (previewState.url) {
            await navigator.clipboard.writeText(previewState.url);
        }
    };

    const handleSaveDevScript = async (startAfterSave?: boolean) => {
        setSaveError(null);
        if (!project) {
            setSaveError('Project not loaded');
            return;
        }

        const script = devScriptInput.trim();
        if (!script) {
            setSaveError('Dev script cannot be empty');
            return;
        }

        setIsSavingDevScript(true);
        try {
            await projectsApi.update(project.id, {
                name: project.name,
                git_repo_path: project.git_repo_path,
                setup_script: project.setup_script ?? null,
                dev_script: script,
                cleanup_script: project.cleanup_script ?? null,
                copy_files: project.copy_files ?? null,
            });

            setDevScriptAdded(true);
            setIsEditingExistingScript(false);
            await queryClient.invalidateQueries({ queryKey: ['project', projectId] });

            if (startAfterSave) {
                setLoadingTimeFinished(false);
                setShowNoServerLogs(false);
                startDevServer();
            }
        } catch (err: any) {
            setSaveError(err?.message || 'Failed to save dev script');
        } finally {
            setIsSavingDevScript(false);
        }
    };

    const handleEditExistingScript = () => {
        if (project?.dev_script) {
            setDevScriptInput(project.dev_script);
        }
        setIsEditingExistingScript(true);
        setSaveError(null);
    };

    const handleCancelEdit = () => {
        setIsEditingExistingScript(false);
        setDevScriptInput('');
        setSaveError(null);
    };

    // Set up message listener when iframe is ready
    useEffect(() => {
        if (previewState.status !== 'ready' || !previewState.url || !addElement) {
            return;
        }

        const listener = new ClickToComponentListener({
            onOpenInEditor: (payload) => {
                addElement(payload);
            },
            onReady: () => {
                setIsReady(true);
                setShowNoServerLogs(false);
            },
        });

        listener.start();
        listenerRef.current = listener;

        return () => {
            listener.stop();
            listenerRef.current = null;
        };
    }, [previewState.status, previewState.url, addElement]);

    // If the preview status isn't ready, and it's been five seconds and we haven't received a ready message, set notReadyInTime true
    useEffect(() => {
        setTimeout(() => {
            setLoadingTimeFinished(true);
        }, 5000);
    }, []);

    // Auto-show logs when having trouble loading preview
    useEffect(() => {
        if (loadingTimeFinished && !isReady && latestDevServerProcess && !showLogs) {
            setShowLogs(true);
        }
    }, [loadingTimeFinished, isReady, latestDevServerProcess, showLogs]);

    if (!runningDevServer) {
        return (
            <div className="flex-1 flex flex-col min-h-0">
                <div className={`flex-1 flex items-center justify-center ${latestDevServerProcess ? 'min-h-0' : ''}`}>
                    <div className="text-center space-y-4 max-w-md mx-auto p-6">
                        <div className="flex items-center justify-center">
                            <MonitorSpeaker className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <div>
                            <h3 className="text-lg font-medium text-foreground mb-2">
                                No dev server running
                            </h3>
                            <p className="text-sm text-muted-foreground">
                                Please start a dev server to see the preview.
                            </p>
                            {effectiveHasDevScript && !isEditingExistingScript && (
                                <div className="mt-4 flex items-center justify-center gap-2">
                                    <Button
                                        variant={runningDevServer ? 'destructive' : 'default'}
                                        size="sm"
                                        onClick={() => {
                                            if (runningDevServer) {
                                                stopDevServer();
                                            } else {
                                                setLoadingTimeFinished(false);
                                                setShowNoServerLogs(false);
                                                startDevServer();
                                            }
                                        }}
                                        disabled={isStartingDevServer}
                                        className="gap-1"
                                    >
                                        {isStartingDevServer ? (
                                            <>
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                Starting...
                                            </>
                                        ) : runningDevServer ? (
                                            <>
                                                <StopCircle className="h-4 w-4" />
                                                Stop Dev
                                            </>
                                        ) : (
                                            <>
                                                <Play className="h-4 w-4" />
                                                Start Dev Server
                                            </>
                                        )}
                                    </Button>
                                    {!runningDevServer && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={handleEditExistingScript}
                                            className="gap-1"
                                        >
                                            <Edit3 className="h-3 w-3" />
                                            Edit Script
                                        </Button>
                                    )}
                                </div>
                            )}
                            {effectiveHasDevScript && isEditingExistingScript && (
                                <div className="mt-4 text-left space-y-2 max-w-md">
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs text-muted-foreground">
                                            Edit your dev server script:
                                        </p>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={handleCancelEdit}
                                            className="h-6 w-6 p-0"
                                        >
                                            <X className="h-3 w-3" />
                                        </Button>
                                    </div>
                                    <Label htmlFor="edit-existing-dev-script" className="text-xs">Dev server script</Label>
                                    <textarea
                                        id="edit-existing-dev-script"
                                        value={devScriptInput}
                                        onChange={(e) => setDevScriptInput(e.target.value)}
                                        placeholder={placeholders.dev}
                                        rows={4}
                                        className="w-full px-3 py-2 text-sm border border-input bg-background text-foreground rounded-md resize-vertical focus:outline-none focus:ring-2 focus:ring-ring"
                                    />
                                    {saveError && (
                                        <p className="text-xs text-destructive">{saveError}</p>
                                    )}
                                    <div className="flex items-center gap-2 justify-end">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={handleCancelEdit}
                                            disabled={isSavingDevScript}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            size="sm"
                                            onClick={() => handleSaveDevScript(false)}
                                            disabled={isSavingDevScript || !devScriptInput.trim()}
                                            className="gap-1"
                                        >
                                            {isSavingDevScript ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                            Save
                                        </Button>
                                    </div>
                                </div>
                            )}
                            {!effectiveHasDevScript && (
                                <div className="mt-4 text-left space-y-2 max-w-md">
                                    <p className="text-xs text-muted-foreground">
                                        No "dev" script found. Add one below (e.g., Next.js: npm run dev, Vite: vite):
                                    </p>
                                    <Label htmlFor="inline-dev-script" className="text-xs">Dev server script</Label>
                                    <textarea
                                        id="inline-dev-script"
                                        value={devScriptInput}
                                        onChange={(e) => setDevScriptInput(e.target.value)}
                                        placeholder={placeholders.dev}
                                        rows={4}
                                        className="w-full px-3 py-2 text-sm border border-input bg-background text-foreground rounded-md resize-vertical focus:outline-none focus:ring-2 focus:ring-ring"
                                    />
                                    {saveError && (
                                        <p className="text-xs text-destructive">{saveError}</p>
                                    )}
                                    <div className="flex items-center gap-2 justify-end">
                                        <Button
                                            size="sm"
                                            onClick={() => handleSaveDevScript(true)}
                                            disabled={isSavingDevScript || !devScriptInput.trim()}
                                            className="gap-1"
                                        >
                                            {isSavingDevScript ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                            Save & Start
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <DevServerLogsView
                    latestDevServerProcess={latestDevServerProcess}
                    showLogs={showNoServerLogs}
                    onToggle={() => setShowNoServerLogs(!showNoServerLogs)}
                />
            </div>
        );
    }

    if (iframeError) {
        return (
            <div className="flex-1 flex flex-col">
                {/* Toolbar */}
                <div className="flex items-center gap-2 p-3 border-b bg-muted/50">
                    <span className="text-sm text-muted-foreground font-mono truncate flex-1">
                        {previewState.url}
                    </span>
                    <Button size="sm" variant="outline" onClick={handleRefresh}>
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Retry
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleCopyUrl}>
                        <Copy className="h-4 w-4 mr-1" />
                        Copy URL
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowLogs(!showLogs)}
                        disabled={!latestDevServerProcess}
                    >
                        <Terminal className="h-4 w-4 mr-1" />
                        {showLogs ? 'Hide' : 'Show'} Logs
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                        <a
                            href={previewState.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center"
                        >
                            <ExternalLink className="h-4 w-4 mr-1" />
                            Open External
                        </a>
                    </Button>
                </div>

                {/* Content container with error state and optional logs */}
                <div className="flex-1 flex flex-col min-h-0">
                    {/* Error state */}
                    <div className={`flex-1 flex items-center justify-center ${showLogs ? 'min-h-0' : ''}`}>
                        <div className="text-center space-y-4 max-w-md mx-auto p-6">
                            <div className="text-destructive">
                                <MonitorSpeaker className="h-8 w-8 mx-auto mb-2" />
                            </div>
                            <div>
                                <h3 className="text-lg font-medium text-foreground mb-2">
                                    Preview unavailable
                                </h3>
                                <p className="text-sm text-muted-foreground mb-4">
                                    The iframe couldn't load the preview. This might be due to:
                                </p>
                                <ul className="text-xs text-muted-foreground list-disc list-inside space-y-1 mb-4">
                                    <li>Mixed content restrictions (HTTPS ↔ HTTP)</li>
                                    <li>Server not ready or crashed</li>
                                    <li>CORS or X-Frame-Options blocking</li>
                                </ul>
                                <Button onClick={handleRefresh} className="mr-2">
                                    <RefreshCw className="h-4 w-4 mr-1" />
                                    Retry
                                </Button>
                                <Button variant="outline" asChild>
                                    <a
                                        href={previewState.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center"
                                    >
                                        <ExternalLink className="h-4 w-4 mr-1" />
                                        Open External
                                    </a>
                                </Button>
                            </div>
                        </div>
                    </div>

                    {showLogs && (
                        <DevServerLogsView
                            latestDevServerProcess={latestDevServerProcess}
                            showLogs={showLogs}
                            onToggle={() => setShowLogs(false)}
                            height="h-80"
                            showToggleText={false}
                        />
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col min-h-0">
            {/* Toolbar */}
            <div className="flex items-center gap-2 p-3 border-b bg-muted/50 shrink-0">
                <span className="text-sm text-muted-foreground font-mono truncate flex-1">
                    {previewState.url}
                </span>
                <Button size="sm" variant="outline" onClick={handleRefresh}>
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Refresh
                </Button>
                <Button size="sm" variant="outline" onClick={handleCopyUrl}>
                    <Copy className="h-4 w-4 mr-1" />
                    Copy URL
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowLogs(!showLogs)}
                    disabled={!latestDevServerProcess}
                >
                    <Terminal className="h-4 w-4 mr-1" />
                    {showLogs ? 'Hide' : 'Show'} Logs
                </Button>
                <Button size="sm" variant="outline" asChild>
                    <a
                        href={previewState.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center"
                    >
                        <ExternalLink className="h-4 w-4 mr-1" />
                        Open External
                    </a>
                </Button>
            </div>
            {loadingTimeFinished && !isReady && (
                <Alert>
                    It looks like we're having trouble loading a preview of your application. <span className="font-bold">Please check the following troubleshooting steps:</span>
                    <ol className="list-decimal list-inside">
                        <li>Have you started the dev server?</li>
                        <li>Did you dev server start successfully?</li>
                        <li>Does your dev server print the URL and port to the terminal? (this is how we know it's running)</li>
                    </ol>
                </Alert>
            )}

            {/* Content container with iframe and optional logs */}
            <div className="flex-1 flex flex-col min-h-0">
                {/* Preview iframe */}
                <div className={`flex-1 ${showLogs ? 'min-h-0' : ''}`}>
                    <iframe
                        ref={iframeRef}
                        key={`${previewState.url}-${refreshKey}`}
                        src={previewState.url}
                        title="Dev server preview"
                        className="w-full h-full border-0"
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                        referrerPolicy="no-referrer"
                        onError={handleIframeError}
                    />
                </div>

                {showLogs && (
                    <DevServerLogsView
                        latestDevServerProcess={latestDevServerProcess}
                        showLogs={showLogs}
                        onToggle={() => setShowLogs(false)}
                        height="h-80"
                        showToggleText={false}
                    />
                )}
            </div>
        </div>
    );
}
