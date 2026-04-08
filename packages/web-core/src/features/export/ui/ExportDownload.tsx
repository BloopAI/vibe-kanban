import { useState, useEffect, useCallback, useRef } from 'react';
import {
  CheckCircleIcon,
  SpinnerIcon,
  WarningIcon,
  DownloadSimpleIcon,
} from '@phosphor-icons/react';

export interface ExportRequest {
  organization_id: string;
  project_ids: string[];
  include_attachments: boolean;
}

interface ExportDownloadProps {
  orgId: string;
  projectIds: string[];
  includeAttachments: boolean;
  onExportMore: () => void;
  exportFn: (request: ExportRequest) => Promise<Response>;
}

export function ExportDownload({
  orgId,
  projectIds,
  includeAttachments,
  onExportMore,
  exportFn,
}: ExportDownloadProps) {
  const [isExporting, setIsExporting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState('vibe-kanban-export.zip');
  const hasStartedRef = useRef(false);

  const startExport = useCallback(async () => {
    setIsExporting(true);
    setError(null);
    setDownloadUrl(null);

    try {
      const response = await exportFn({
        organization_id: orgId,
        project_ids: projectIds,
        include_attachments: includeAttachments,
      });

      if (!response.ok) {
        throw new Error(`Export failed (${response.status})`);
      }

      let downloadFilename = 'vibe-kanban-export.zip';
      const disposition = response.headers.get('content-disposition');
      if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match) {
          downloadFilename = match[1];
        }
      }
      setFilename(downloadFilename);

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);

      const a = document.createElement('a');
      a.href = url;
      a.download = downloadFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  }, [orgId, projectIds, includeAttachments, exportFn]);

  useEffect(() => {
    if (hasStartedRef.current) {
      return;
    }
    hasStartedRef.current = true;
    void startExport();
  }, [startExport]);

  useEffect(() => {
    return () => {
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
      }
    };
  }, [downloadUrl]);

  const handleManualDownload = () => {
    if (downloadUrl) {
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  return (
    <div className="p-double space-y-double">
      {isExporting && (
        <div className="flex flex-col items-center gap-base py-double">
          <SpinnerIcon
            className="size-icon-lg text-brand animate-spin"
            weight="bold"
          />
          <div className="text-center space-y-half">
            <p className="text-sm font-medium text-high">
              Generating your export...
            </p>
            <p className="text-xs text-low">
              This may take a moment
              {includeAttachments ? ', especially with attachments' : ''}.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="space-y-base">
          <div className="flex items-center gap-base text-danger">
            <WarningIcon className="size-icon-sm" weight="fill" />
            <p className="text-sm font-medium">Export failed</p>
          </div>
          <p className="text-sm text-normal">{error}</p>
          <button
            onClick={() => {
              hasStartedRef.current = false;
              void startExport();
            }}
            className="w-full rounded-sm border border-border bg-secondary px-base py-half text-sm font-medium text-normal hover:bg-primary transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {!isExporting && !error && downloadUrl && (
        <div className="space-y-double">
          <div className="flex flex-col items-center gap-base py-base">
            <CheckCircleIcon
              className="size-icon-lg text-success"
              weight="fill"
            />
            <div className="text-center space-y-half">
              <p className="text-sm font-medium text-high">Export complete!</p>
              <p className="text-xs text-low">
                Your download should start automatically. If not, click the
                button below.
              </p>
            </div>
          </div>

          <div className="space-y-base">
            <button
              onClick={handleManualDownload}
              className="w-full flex items-center justify-center gap-half rounded-sm bg-brand px-base py-half text-sm font-medium text-white hover:bg-brand/90 transition-colors"
            >
              <DownloadSimpleIcon className="size-icon-sm" />
              Download {filename}
            </button>

            <button
              onClick={onExportMore}
              className="w-full rounded-sm border border-border bg-secondary px-base py-half text-sm font-medium text-normal hover:bg-primary transition-colors"
            >
              Export more projects
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
