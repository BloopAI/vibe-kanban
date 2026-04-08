import { DownloadSimpleIcon } from '@phosphor-icons/react';

interface ExportIntroductionProps {
  onContinue: () => void;
}

export function ExportIntroduction({ onContinue }: ExportIntroductionProps) {
  return (
    <div className="p-double space-y-double">
      <div className="space-y-base">
        <div className="flex items-center gap-base">
          <DownloadSimpleIcon className="size-icon text-brand" weight="fill" />
          <h2 className="text-lg font-semibold text-high">Export your data</h2>
        </div>
        <p className="text-sm text-normal">
          The Vibe Kanban cloud service is shutting down. You can export all
          your data as a ZIP file containing CSV files that are compatible with
          other issue trackers like Jira, Linear, and Asana.
        </p>
      </div>

      <div className="space-y-half">
        <h3 className="text-sm font-medium text-high">What&apos;s included:</h3>
        <ul className="text-sm text-normal space-y-half list-disc pl-double">
          <li>
            <strong>Issues</strong> &mdash; titles, descriptions, statuses,
            priorities, assignees, dates
          </li>
          <li>
            <strong>Projects</strong> &mdash; project names and metadata
          </li>
          <li>
            <strong>Users</strong> &mdash; team member names and emails
          </li>
          <li>
            <strong>Attachments</strong> (optional) &mdash; images and files
            uploaded to issues
          </li>
        </ul>
      </div>

      <button
        onClick={onContinue}
        className="w-full rounded-sm bg-brand px-base py-half text-sm font-medium text-white hover:bg-brand/90 transition-colors"
      >
        Get started
      </button>
    </div>
  );
}
