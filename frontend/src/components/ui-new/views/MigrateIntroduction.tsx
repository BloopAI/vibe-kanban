import {
  UsersIcon,
  TagIcon,
  ChatCircleIcon,
  TreeStructureIcon,
  GitPullRequestIcon,
  SlidersHorizontalIcon,
  ArrowRightIcon,
} from '@phosphor-icons/react';
import { PrimaryButton } from '@/components/ui-new/primitives/PrimaryButton';

interface MigrateIntroductionProps {
  onContinue: () => void;
}

const features = [
  {
    icon: UsersIcon,
    title: 'Team Collaboration',
    description:
      'Work on issues collaboratively with your team and assign issues to members',
  },
  {
    icon: TagIcon,
    title: 'Tags & Priorities',
    description:
      'Organize issues with custom tags and set priorities for better workflow',
  },
  {
    icon: ChatCircleIcon,
    title: 'Comments',
    description:
      'Discuss issues with inline comments and keep all context in one place',
  },
  {
    icon: TreeStructureIcon,
    title: 'Sub-issues',
    description: 'Break down complex tasks into manageable sub-issues',
  },
  {
    icon: GitPullRequestIcon,
    title: 'Pull Request Tracking',
    description:
      'Track pull requests attached to issues for complete visibility',
  },
  {
    icon: SlidersHorizontalIcon,
    title: 'Customization',
    description:
      'Customize kanban columns, tags, and workflows to match your process',
  },
];

export function MigrateIntroduction({ onContinue }: MigrateIntroductionProps) {
  return (
    <div className="max-w-2xl mx-auto py-double px-base">
      {/* Header section */}
      <div className="mb-double">
        <h1 className="text-xl font-semibold text-high mb-base">
          Upgrade to Cloud Projects
        </h1>
        <p className="text-base text-normal mb-half">
          You have been selected as an early user to try our new cloud-based
          project management. We would love your feedback as we prepare for a
          wider rollout.
        </p>
        <p className="text-sm text-low">
          Upgrading is currently voluntary but will become mandatory shortly.
        </p>
      </div>

      {/* Features grid */}
      <div className="mb-double">
        <h2 className="text-lg font-medium text-high mb-base">
          What you will get with cloud projects
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-base">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="p-base bg-secondary rounded border"
              >
                <div className="flex items-start gap-base">
                  <div className="p-half bg-panel rounded">
                    <Icon
                      className="size-icon-sm text-brand"
                      weight="duotone"
                    />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-high mb-half">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-low">{feature.description}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* CTA */}
      <div className="flex justify-end">
        <PrimaryButton onClick={onContinue} actionIcon={ArrowRightIcon}>
          Continue
        </PrimaryButton>
      </div>
    </div>
  );
}
