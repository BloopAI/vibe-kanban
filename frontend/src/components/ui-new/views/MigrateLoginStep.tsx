import {
  CloudIcon,
  UsersIcon,
  UserIcon,
  SignInIcon,
} from '@phosphor-icons/react';
import { PrimaryButton } from '@/components/ui-new/primitives/PrimaryButton';
import { OAuthDialog } from '@/components/dialogs/global/OAuthDialog';

interface MigrateLoginStepProps {
  onContinue: () => void;
}

const benefits = [
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

export function MigrateLoginStep({ onContinue }: MigrateLoginStepProps) {
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
          Sign In to Continue
        </h1>
        <p className="text-base text-normal">
          To migrate your projects to the cloud, you'll need to sign in with
          your account.
        </p>
      </div>

      {/* Benefits list */}
      <div className="mb-double space-y-base">
        {benefits.map((benefit) => {
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
