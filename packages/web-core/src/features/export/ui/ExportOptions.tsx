import { useState } from 'react';
import {
  ChatCircleIcon,
  ImageIcon,
  WarningIcon,
} from '@phosphor-icons/react';

interface ExportOptionsProps {
  includeComments: boolean;
  includeAttachments: boolean;
  onContinue: (includeComments: boolean, includeAttachments: boolean) => void;
  onBack: () => void;
}

export function ExportOptions({
  includeComments: initialComments,
  includeAttachments: initialAttachments,
  onContinue,
  onBack,
}: ExportOptionsProps) {
  const [includeComments, setIncludeComments] = useState(initialComments);
  const [includeAttachments, setIncludeAttachments] =
    useState(initialAttachments);

  return (
    <div className="p-double space-y-double">
      <div className="space-y-base">
        <h2 className="text-lg font-semibold text-high">Export options</h2>
        <p className="text-sm text-normal">
          Issues, projects, tags, relationships, pull requests, and users are
          always included. Choose what else to export:
        </p>
      </div>

      <div className="space-y-base">
        <label className="flex items-start gap-base cursor-pointer">
          <input
            type="checkbox"
            checked={includeComments}
            onChange={(e) => setIncludeComments(e.target.checked)}
            className="mt-0.5 rounded border-border"
          />
          <div className="space-y-half">
            <div className="flex items-center gap-half">
              <ChatCircleIcon className="size-icon-sm text-normal" />
              <span className="text-sm font-medium text-high">Comments</span>
            </div>
            <p className="text-xs text-low">
              Include all issue comments with author names and timestamps.
            </p>
          </div>
        </label>

        <label className="flex items-start gap-base cursor-pointer">
          <input
            type="checkbox"
            checked={includeAttachments}
            onChange={(e) => setIncludeAttachments(e.target.checked)}
            className="mt-0.5 rounded border-border"
          />
          <div className="space-y-half">
            <div className="flex items-center gap-half">
              <ImageIcon className="size-icon-sm text-normal" />
              <span className="text-sm font-medium text-high">
                Attachments
              </span>
            </div>
            <p className="text-xs text-low">
              Download all images and files attached to issues.
            </p>
            {includeAttachments && (
              <div className="flex items-center gap-half text-xs text-warning">
                <WarningIcon className="size-icon-xs shrink-0" />
                <span>
                  This may significantly increase the download size and time.
                </span>
              </div>
            )}
          </div>
        </label>
      </div>

      <div className="flex gap-base">
        <button
          onClick={onBack}
          className="flex-1 rounded-sm border border-border bg-secondary px-base py-half text-sm font-medium text-normal hover:bg-primary transition-colors"
        >
          Back
        </button>
        <button
          onClick={() => onContinue(includeComments, includeAttachments)}
          className="flex-1 rounded-sm bg-brand px-base py-half text-sm font-medium text-white hover:bg-brand/90 transition-colors"
        >
          Export
        </button>
      </div>
    </div>
  );
}
