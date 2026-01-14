import {
  DownloadSimpleIcon,
  UploadSimpleIcon,
  CopyIcon,
  ChartBarIcon,
  TagIcon,
  ArchiveIcon,
  DotsThreeIcon,
} from '@phosphor-icons/react';
import {
  ActionPanel,
  ActionPanelButton,
  ActionPanelDropdown,
} from '@/components/ui-new/primitives/ActionPanel';
import { ImportTasksDialog } from '@/components/ui-new/dialogs/ImportTasksDialog';
import { ExportTasksDialog } from '@/components/ui-new/dialogs/ExportTasksDialog';
import { DeduplicateTasksDialog } from '@/components/ui-new/dialogs/DeduplicateTasksDialog';
import { PrioritizeTasksDialog } from '@/components/ui-new/dialogs/PrioritizeTasksDialog';
import { BulkTagDialog } from '@/components/ui-new/dialogs/BulkTagDialog';
import { BulkArchiveDialog } from '@/components/ui-new/dialogs/BulkArchiveDialog';

export interface ActionPanelContainerProps {
  projectId?: string;
  taskCount?: number;
  completedTaskCount?: number;
  cancelledTaskCount?: number;
  selectedTaskIds?: string[];
}

export function ActionPanelContainer({
  projectId,
  taskCount = 0,
  completedTaskCount = 0,
  cancelledTaskCount = 0,
  selectedTaskIds = [],
}: ActionPanelContainerProps) {
  const handleImport = async () => {
    await ImportTasksDialog.show({ projectId });
  };

  const handleExport = async () => {
    await ExportTasksDialog.show({ projectId, taskCount });
  };

  const handleDeduplicate = async () => {
    await DeduplicateTasksDialog.show({ projectId });
  };

  const handlePrioritize = async () => {
    await PrioritizeTasksDialog.show({ projectId, taskCount });
  };

  const handleBulkTag = async () => {
    await BulkTagDialog.show({ projectId, selectedTaskIds });
  };

  const handleBulkArchive = async () => {
    await BulkArchiveDialog.show({
      projectId,
      completedTaskCount,
      cancelledTaskCount,
    });
  };

  return (
    <ActionPanel>
      {/* Primary action buttons - most commonly used */}
      <ActionPanelButton
        icon={DownloadSimpleIcon}
        label="Import"
        onClick={handleImport}
      />
      <ActionPanelButton
        icon={UploadSimpleIcon}
        label="Export"
        onClick={handleExport}
      />

      {/* More actions dropdown for less common operations */}
      <ActionPanelDropdown
        label="More"
        icon={DotsThreeIcon}
        items={[
          {
            icon: CopyIcon,
            label: 'Find Duplicates',
            onClick: handleDeduplicate,
          },
          {
            icon: ChartBarIcon,
            label: 'Prioritize Tasks',
            onClick: handlePrioritize,
          },
          {
            icon: TagIcon,
            label: 'Bulk Tag',
            onClick: handleBulkTag,
          },
          'separator',
          {
            icon: ArchiveIcon,
            label: 'Bulk Archive',
            onClick: handleBulkArchive,
          },
        ]}
      />
    </ActionPanel>
  );
}
