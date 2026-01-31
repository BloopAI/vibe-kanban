import { Link } from 'react-router-dom';
import {
  FolderIcon,
  ArrowSquareOutIcon,
  ArrowCounterClockwiseIcon,
  CheckIcon,
} from '@phosphor-icons/react';
import { PrimaryButton } from '@/components/ui-new/primitives/PrimaryButton';

interface MigratedProject {
  localId: string;
  localName: string;
}

interface MigrateFinishProps {
  migratedProjects: MigratedProject[];
  onMigrateMore: () => void;
  onClose: () => void;
}

export function MigrateFinish({
  migratedProjects,
  onMigrateMore,
  onClose,
}: MigrateFinishProps) {
  return (
    <div className="max-w-2xl mx-auto py-double px-base">
      {/* Header */}
      <div className="mb-double">
        <h1 className="text-xl font-semibold text-high mb-base">
          Migration Complete!
        </h1>
        <p className="text-base text-normal">
          Your projects have been migrated to the cloud. Click a project below
          to view it.
        </p>
      </div>

      {/* Project list */}
      <div className="mb-double">
        <div className="bg-secondary border rounded divide-y divide-border">
          {migratedProjects.map((project) => (
            <div
              key={project.localId}
              className="flex items-center gap-base px-base py-half hover:bg-panel/50"
            >
              <FolderIcon
                className="size-icon-sm text-brand shrink-0"
                weight="duotone"
              />
              <span className="flex-1 text-sm text-high truncate">
                {project.localName}
              </span>
              <Link
                to={`/local-projects/${project.localId}/tasks`}
                className="flex items-center gap-half text-sm text-brand hover:underline"
              >
                View
                <ArrowSquareOutIcon className="size-icon-xs" weight="bold" />
              </Link>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="pt-base border-t flex justify-between">
        <PrimaryButton
          variant="tertiary"
          onClick={onMigrateMore}
          actionIcon={ArrowCounterClockwiseIcon}
        >
          Migrate More Projects
        </PrimaryButton>
        <PrimaryButton onClick={onClose} actionIcon={CheckIcon}>
          Done
        </PrimaryButton>
      </div>
    </div>
  );
}
