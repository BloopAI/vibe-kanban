import {
  UsersIcon,
  TagIcon,
  ChatCircleIcon,
  TreeStructureIcon,
  GitPullRequestIcon,
  SlidersHorizontalIcon,
  CloudIcon,
  UserIcon,
  SignInIcon,
} from '@phosphor-icons/react';
import { PrimaryButton } from '@/components/ui-new/primitives/PrimaryButton';
import { OAuthDialog } from '@/components/dialogs/global/OAuthDialog';

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

const loginBenefits = [
  {
    icon: CloudIcon,
    title: 'Secure Cloud Storage',
    description: (
      <>
        Your tasks now live on our secure cloud infrastructure. You can also{' '}
        <a
          href="https://github.com/BloopAI/vibe-kanban"
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand hover:underline"
        >
          self-host your own task server
        </a>
        .
      </>
    ),
  },
  {
    icon: UsersIcon,
    title: 'Collaborative Features',
    description:
      'This enables team collaboration, shared projects, and real-time updates.',
  },
  {
    icon: UserIcon,
    title: 'Personal Organisation',
    description:
      'A personal organisation will be created automatically for you when you first sign in.',
  },
];

export function MigrateIntroduction({ onContinue }: MigrateIntroductionProps) {
  const handleSignIn = async () => {
    const profile = await OAuthDialog.show();
    if (profile) {
      onContinue();
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-double px-base">
      {/* Header section */}
      <div className="mb-double">
        <h1 className="text-xl font-semibold text-high mb-base">
          Upgrade to Cloud Projects
        </h1>
        <p className="text-base text-normal mb-half">
          Migrate your existing local projects to the cloud. You have been
          selected as an early user to try our new cloud-based project
          management. We would love your feedback as we prepare for a wider
          rollout.
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

      {/* Sign in section */}
      <div className="mb-double">
        <h2 className="text-lg font-medium text-high mb-base">
          Sign in to migrate your projects
        </h2>
        <div className="space-y-base">
          {loginBenefits.map((benefit) => {
            const Icon = benefit.icon;
            return (
              <div key={benefit.title} className="flex items-start gap-base">
                <div className="p-half bg-panel rounded shrink-0">
                  <Icon className="size-icon-sm text-brand" weight="duotone" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-high mb-half">
                    {benefit.title}
                  </h3>
                  <p className="text-sm text-low">{benefit.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* CTA */}
      <div className="flex justify-end">
        <PrimaryButton
          onClick={() => void handleSignIn()}
          actionIcon={SignInIcon}
        >
          Sign In
        </PrimaryButton>
      </div>
    </div>
  );
}
