import { useRef, useState } from 'react';
import {
  CheckIcon,
  GithubLogoIcon,
  GoogleLogoIcon,
  XIcon,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router-dom';
import { PROJECTS_SHAPE, type Project } from 'shared/remote-types';
import { ThemeMode, type OrganizationWithRole } from 'shared/types';
import {
  OAuthDialog,
  type OAuthProvider,
} from '@/components/dialogs/global/OAuthDialog';
import { useUserSystem } from '@/components/ConfigProvider';
import { useTheme } from '@/components/ThemeProvider';
import { PrimaryButton } from '@/components/ui-new/primitives/PrimaryButton';
import { createShapeCollection } from '@/lib/electric/collections';
import { organizationsApi } from '@/lib/api';
import { useOrganizationStore } from '@/stores/useOrganizationStore';

const COMPARISON_ROWS = [
  {
    feature: 'Use kanban board to track issues',
    signedIn: true,
    skip: false,
  },
  {
    feature: 'Invite team to collaborate',
    signedIn: true,
    skip: false,
  },
  {
    feature: 'Organise work into projects and organizations',
    signedIn: true,
    skip: false,
  },
  {
    feature: 'Create workspaces',
    signedIn: true,
    skip: true,
  },
];

const FIRST_PROJECT_LOOKUP_TIMEOUT_MS = 3000;

function resolveTheme(theme: ThemeMode): 'light' | 'dark' {
  if (theme === ThemeMode.SYSTEM) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return theme === ThemeMode.DARK ? 'dark' : 'light';
}

function getFirstOrganization(
  organizations: OrganizationWithRole[]
): OrganizationWithRole | null {
  if (organizations.length === 0) {
    return null;
  }

  const firstNonPersonal = organizations.find(
    (organization) => !organization.is_personal
  );
  return firstNonPersonal ?? organizations[0];
}

function getFirstProject(projects: Project[]): Project | null {
  if (projects.length === 0) {
    return null;
  }

  const sortedProjects = [...projects].sort((a, b) => {
    const aCreatedAt = new Date(a.created_at).getTime();
    const bCreatedAt = new Date(b.created_at).getTime();
    if (aCreatedAt !== bCreatedAt) {
      return aCreatedAt - bCreatedAt;
    }

    const nameCompare = a.name.localeCompare(b.name);
    if (nameCompare !== 0) {
      return nameCompare;
    }

    return a.id.localeCompare(b.id);
  });

  return sortedProjects[0];
}

async function getFirstProjectInOrganization(
  organizationId: string
): Promise<Project | null> {
  const collection = createShapeCollection(PROJECTS_SHAPE, {
    organization_id: organizationId,
  });

  if (collection.isReady()) {
    return getFirstProject(collection.toArray as unknown as Project[]);
  }

  return new Promise<Project | null>((resolve) => {
    let settled = false;
    let timeoutId: number | undefined;
    let subscription: { unsubscribe: () => void } | undefined;

    const settle = (project: Project | null) => {
      if (settled) return;
      settled = true;

      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      if (subscription) {
        subscription.unsubscribe();
        subscription = undefined;
      }

      resolve(project);
    };

    const tryResolve = () => {
      if (!collection.isReady()) {
        return;
      }

      settle(getFirstProject(collection.toArray as unknown as Project[]));
    };

    subscription = collection.subscribeChanges(tryResolve, {
      includeInitialState: true,
    });

    timeoutId = window.setTimeout(() => {
      settle(null);
    }, FIRST_PROJECT_LOOKUP_TIMEOUT_MS);

    tryResolve();
  });
}

export function OnboardingSignInPage() {
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  const { theme } = useTheme();
  const { config, loginStatus, loading, updateAndSaveConfig } = useUserSystem();
  const setSelectedOrgId = useOrganizationStore((s) => s.setSelectedOrgId);

  const [showComparison, setShowComparison] = useState(false);
  const [saving, setSaving] = useState(false);
  const isCompletingOnboardingRef = useRef(false);
  const [pendingProvider, setPendingProvider] = useState<OAuthProvider | null>(
    null
  );

  const logoSrc =
    resolveTheme(theme) === 'dark'
      ? '/vibe-kanban-logo-dark.svg'
      : '/vibe-kanban-logo.svg';

  const isLoggedIn = loginStatus?.status === 'loggedin';

  const getOnboardingDestination = async (
    preferProjectRedirect: boolean
  ): Promise<string> => {
    if (!preferProjectRedirect) {
      return '/workspaces';
    }

    try {
      const organizationsResponse =
        await organizationsApi.getUserOrganizations();
      const firstOrganization = getFirstOrganization(
        organizationsResponse.organizations ?? []
      );

      if (!firstOrganization) {
        return '/workspaces';
      }

      setSelectedOrgId(firstOrganization.id);

      const firstProject = await getFirstProjectInOrganization(
        firstOrganization.id
      );
      if (!firstProject) {
        return '/workspaces';
      }

      return `/projects/${firstProject.id}`;
    } catch (error) {
      console.error('Failed to resolve onboarding destination:', error);
      return '/workspaces';
    }
  };

  const finishOnboarding = async (
    options: { preferProjectRedirect?: boolean } = {}
  ) => {
    if (!config || saving || isCompletingOnboardingRef.current) return;

    const preferProjectRedirect = options.preferProjectRedirect ?? isLoggedIn;

    isCompletingOnboardingRef.current = true;
    setSaving(true);
    const success = await updateAndSaveConfig({
      remote_onboarding_acknowledged: true,
      onboarding_acknowledged: true,
      disclaimer_acknowledged: true,
    });

    if (!success) {
      isCompletingOnboardingRef.current = false;
      setSaving(false);
      return;
    }

    const destination = await getOnboardingDestination(preferProjectRedirect);
    navigate(destination, { replace: true });
  };

  const handleProviderSignIn = async (provider: OAuthProvider) => {
    if (saving || pendingProvider) return;

    setPendingProvider(provider);
    const profile = await OAuthDialog.show({ initialProvider: provider });
    setPendingProvider(null);

    if (profile) {
      await finishOnboarding({ preferProjectRedirect: true });
    }
  };

  if (loading || !config) {
    return (
      <div className="h-screen bg-primary flex items-center justify-center">
        <p className="text-low">Loading...</p>
      </div>
    );
  }

  if (
    config.remote_onboarding_acknowledged &&
    !isCompletingOnboardingRef.current
  ) {
    return <Navigate to="/workspaces" replace />;
  }

  return (
    <div className="h-screen overflow-auto bg-primary">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-base py-double">
        <div className="rounded-sm border border-border bg-secondary p-double space-y-double">
          <header className="space-y-double text-center">
            <div className="flex justify-center">
              <img
                src={logoSrc}
                alt="Vibe Kanban"
                className="h-8 w-auto logo"
              />
            </div>
            <p className="text-sm text-low">{t('onboardingSignIn.subtitle')}</p>
          </header>

          {isLoggedIn ? (
            <section className="space-y-base">
              <p className="text-sm text-normal text-center">
                {t('onboardingSignIn.signedInAs', {
                  name:
                    loginStatus.profile.username || loginStatus.profile.email,
                })}
              </p>
              <div className="flex justify-end">
                <PrimaryButton
                  value={saving ? 'Continuing...' : 'Continue'}
                  onClick={() => void finishOnboarding()}
                  disabled={saving}
                />
              </div>
            </section>
          ) : (
            <>
              <section className="flex flex-col items-center gap-2">
                <PrimaryButton
                  value={
                    pendingProvider === 'github'
                      ? 'Opening GitHub...'
                      : 'Continue with GitHub'
                  }
                  actionIcon={GithubLogoIcon}
                  className="min-w-[260px] justify-center"
                  onClick={() => void handleProviderSignIn('github')}
                  disabled={saving || pendingProvider !== null}
                />
                <PrimaryButton
                  value={
                    pendingProvider === 'google'
                      ? 'Opening Google...'
                      : 'Continue with Google'
                  }
                  actionIcon={GoogleLogoIcon}
                  className="min-w-[260px] justify-center"
                  onClick={() => void handleProviderSignIn('google')}
                  disabled={saving || pendingProvider !== null}
                />
              </section>

              <div className="flex justify-center">
                <button
                  type="button"
                  className="text-sm text-low hover:text-normal underline underline-offset-2"
                  onClick={() => setShowComparison(true)}
                  disabled={saving || pendingProvider !== null}
                >
                  {t('onboardingSignIn.moreOptions')}
                </button>
              </div>
            </>
          )}

          {showComparison && !isLoggedIn && (
            <section className="space-y-base rounded-sm border border-border bg-panel p-base">
              <div className="overflow-x-auto rounded-sm border border-border">
                <table className="w-full border-collapse">
                  <thead className="bg-secondary text-xs font-medium text-low">
                    <tr>
                      <th className="px-base py-half text-left">
                        {t('onboardingSignIn.featureHeader')}
                      </th>
                      <th className="px-base py-half text-left border-l border-border">
                        {t('onboardingSignIn.signedInHeader')}
                      </th>
                      <th className="px-base py-half text-left border-l border-border">
                        {t('onboardingSignIn.skipSignInHeader')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {COMPARISON_ROWS.map((row, index) => (
                      <tr
                        key={row.feature}
                        className={index > 0 ? 'border-t border-border' : ''}
                      >
                        <td className="px-base py-half text-normal align-top">
                          {row.feature}
                        </td>
                        <td className="px-base py-half align-top border-l border-border text-center">
                          {row.signedIn ? (
                            <>
                              <CheckIcon
                                className="size-icon-xs text-success inline"
                                weight="bold"
                              />
                              <span className="sr-only">
                                {t('onboardingSignIn.yes')}
                              </span>
                            </>
                          ) : (
                            <>
                              <XIcon
                                className="size-icon-xs text-warning inline"
                                weight="bold"
                              />
                              <span className="sr-only">
                                {t('onboardingSignIn.no')}
                              </span>
                            </>
                          )}
                        </td>
                        <td className="px-base py-half align-top border-l border-border text-center">
                          {row.skip ? (
                            <>
                              <CheckIcon
                                className="size-icon-xs text-success inline"
                                weight="bold"
                              />
                              <span className="sr-only">
                                {t('onboardingSignIn.yes')}
                              </span>
                            </>
                          ) : (
                            <>
                              <XIcon
                                className="size-icon-xs text-warning inline"
                                weight="bold"
                              />
                              <span className="sr-only">
                                {t('onboardingSignIn.no')}
                              </span>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end">
                <PrimaryButton
                  value={
                    saving
                      ? 'Continuing...'
                      : 'I understand, continue without signing in'
                  }
                  variant="tertiary"
                  onClick={() => void finishOnboarding()}
                  disabled={saving || pendingProvider !== null}
                />
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
