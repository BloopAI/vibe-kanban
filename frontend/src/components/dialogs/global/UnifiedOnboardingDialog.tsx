import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Settings, Shield, Github, AlertTriangle } from 'lucide-react';
import {
  BaseCodingAgent,
  EditorType,
  DeviceFlowStartResponse,
  DevicePollStatus,
} from 'shared/types';
import type { ExecutorProfileId } from 'shared/types';
import { useUserSystem } from '@/components/config-provider';
import { githubAuthApi } from '@/lib/api';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import {
  ProgressIndicator,
  AgentConfigStep,
  GitHubLoginStep,
  SafetyNoticeStep,
  FeedbackOptInStep,
} from './onboarding-steps';

export type UnifiedOnboardingResult = {
  profile: ExecutorProfileId;
  editor: { editor_type: EditorType; custom_command: string | null };
  disclaimerAccepted: boolean;
  analyticsEnabled: boolean;
  githubLoginAcknowledged: boolean;
};

const STEP_AGENT_CONFIG = 1;
const STEP_FEEDBACK_OPTIN = 2;
const STEP_GITHUB_LOGIN = 3;
const STEP_SAFETY_NOTICE = 4;

const UnifiedOnboardingDialog = NiceModal.create(() => {
  const modal = useModal();
  const { t } = useTranslation('common');
  const {
    profiles,
    config,
    githubTokenInvalid,
    reloadSystem,
    updateAndSaveConfig,
  } = useUserSystem();

  const [step, setStep] = useState(STEP_AGENT_CONFIG);

  // Step 1: Agent & Editor configuration
  const [profile, setProfile] = useState<ExecutorProfileId>(
    config?.executor_profile || {
      executor: BaseCodingAgent.CLAUDE_CODE,
      variant: null,
    }
  );
  const [editorType, setEditorType] = useState<EditorType>(EditorType.VS_CODE);
  const [customCommand, setCustomCommand] = useState<string>('');

  // Step 2: GitHub login
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceState, setDeviceState] =
    useState<null | DeviceFlowStartResponse>(null);
  const [polling, setPolling] = useState(false);
  const [copied, setCopied] = useState(false);

  // Step 4: Feedback opt-in
  const [analyticsEnabled, setAnalyticsEnabled] = useState(true);

  const handleStepForward = async () => {
    if (step === STEP_AGENT_CONFIG) {
      setStep(STEP_FEEDBACK_OPTIN);
    } else if (step === STEP_FEEDBACK_OPTIN) {
      await saveFeedbackPreference();
      setStep(STEP_GITHUB_LOGIN);
    } else if (step === STEP_GITHUB_LOGIN) {
      setStep(STEP_SAFETY_NOTICE);
    }
  };

  const handleStepBack = () => {
    if (step === STEP_FEEDBACK_OPTIN) {
      setStep(STEP_AGENT_CONFIG);
    } else if (step === STEP_GITHUB_LOGIN) {
      setStep(STEP_FEEDBACK_OPTIN);
    } else if (step === STEP_SAFETY_NOTICE) {
      setStep(STEP_GITHUB_LOGIN);
    }
  };

  const saveFeedbackPreference = async () => {
    const updatedConfig = {
      ...config,
      telemetry_acknowledged: true,
      analytics_enabled: analyticsEnabled,
    };
    await updateAndSaveConfig(updatedConfig);
  };

  const handleComplete = () => {
    modal.resolve({
      profile,
      editor: {
        editor_type: editorType,
        custom_command:
          editorType === EditorType.CUSTOM ? customCommand || null : null,
      },
      disclaimerAccepted: true,
      analyticsEnabled,
      githubLoginAcknowledged: true,
    } as UnifiedOnboardingResult);
  };

  const isStep1Valid =
    editorType !== EditorType.CUSTOM ||
    (editorType === EditorType.CUSTOM && customCommand.trim() !== '');

  const isGitHubAuthenticated =
    !!(config?.github?.username && config?.github?.oauth_token) &&
    !githubTokenInvalid;

  const handleGitHubLogin = async () => {
    setFetching(true);
    setError(null);
    setDeviceState(null);
    try {
      const data = await githubAuthApi.start();
      setDeviceState(data);
      setPolling(true);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || t('onboarding.githubLogin.error.network'));
    } finally {
      setFetching(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch (err) {
          console.warn('Copy to clipboard failed:', err);
        }
        document.body.removeChild(textArea);
      }
    } catch (err) {
      console.warn('Copy to clipboard failed:', err);
    }
  };

  // Poll for GitHub authentication completion
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (polling && deviceState) {
      const poll = async () => {
        try {
          const poll_status = await githubAuthApi.poll();
          switch (poll_status) {
            case DevicePollStatus.SUCCESS:
              setPolling(false);
              setDeviceState(null);
              setError(null);
              await reloadSystem();
              break;
            case DevicePollStatus.AUTHORIZATION_PENDING:
              timer = setTimeout(poll, deviceState.interval * 1000);
              break;
            case DevicePollStatus.SLOW_DOWN:
              timer = setTimeout(poll, (deviceState.interval + 5) * 1000);
              break;
            case DevicePollStatus.ACCESS_DENIED:
              setPolling(false);
              setError(t('onboarding.githubLogin.error.denied'));
              setDeviceState(null);
              break;
            case DevicePollStatus.EXPIRED_TOKEN:
              setPolling(false);
              setError(t('onboarding.githubLogin.error.expired'));
              setDeviceState(null);
              break;
          }
        } catch (e: any) {
          setPolling(false);
          setError(e?.message || t('onboarding.githubLogin.error.failed'));
          setDeviceState(null);
        }
      };
      timer = setTimeout(poll, deviceState.interval * 1000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [polling, deviceState, reloadSystem]);

  // Auto-copy code to clipboard when deviceState is set
  useEffect(() => {
    if (deviceState?.user_code) {
      copyToClipboard(deviceState.user_code);
    }
  }, [deviceState?.user_code]);

  const getStepTitle = () => {
    switch (step) {
      case STEP_AGENT_CONFIG:
        return t('onboarding.agentConfig.title');
      case STEP_FEEDBACK_OPTIN:
        return t('onboarding.feedback.title');
      case STEP_GITHUB_LOGIN:
        return t('onboarding.githubLogin.title');
      case STEP_SAFETY_NOTICE:
        return t('onboarding.safetyNotice.title');
      default:
        return '';
    }
  };

  const getStepIcon = () => {
    switch (step) {
      case STEP_AGENT_CONFIG:
        return <Settings className="h-5 w-5" />;
      case STEP_FEEDBACK_OPTIN:
        return <Shield className="h-5 w-5" />;
      case STEP_GITHUB_LOGIN:
        return <Github className="h-5 w-5" />;
      case STEP_SAFETY_NOTICE:
        return <AlertTriangle className="h-5 w-5 text-destructive" />;
      default:
        return null;
    }
  };

  return (
    <Dialog open={modal.visible} uncloseable={true}>
      <DialogContent className="sm:max-w-[600px] space-y-4">
        <ProgressIndicator currentStep={step} totalSteps={4} />

        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getStepIcon()}
            {getStepTitle()}
          </DialogTitle>
        </DialogHeader>

        {step === STEP_AGENT_CONFIG && (
          <AgentConfigStep
            profile={profile}
            profiles={profiles}
            editorType={editorType}
            customCommand={customCommand}
            onProfileChange={setProfile}
            onEditorChange={setEditorType}
            onCustomCommandChange={setCustomCommand}
          />
        )}

        {step === STEP_FEEDBACK_OPTIN && (
          <FeedbackOptInStep
            analyticsEnabled={analyticsEnabled}
            isGitHubAuthenticated={isGitHubAuthenticated}
            onAnalyticsChange={setAnalyticsEnabled}
          />
        )}

        {step === STEP_GITHUB_LOGIN && (
          <GitHubLoginStep
            isAuthenticated={isGitHubAuthenticated}
            username={config?.github?.username || undefined}
            deviceState={deviceState}
            error={error}
            copied={copied}
            fetching={fetching}
            onLogin={handleGitHubLogin}
            onCopyCode={copyToClipboard}
          />
        )}

        {step === STEP_SAFETY_NOTICE && <SafetyNoticeStep />}

        <DialogFooter className="flex gap-2">
          {(step === STEP_FEEDBACK_OPTIN ||
            step === STEP_GITHUB_LOGIN ||
            step === STEP_SAFETY_NOTICE) && (
            <Button variant="outline" onClick={handleStepBack}>
              {t('buttons.back')}
            </Button>
          )}

          <div className="flex-1" />

          {step === STEP_AGENT_CONFIG && (
            <Button
              onClick={handleStepForward}
              disabled={!isStep1Valid}
              className="min-w-24"
            >
              {t('buttons.next')}
            </Button>
          )}

          {step === STEP_FEEDBACK_OPTIN && (
            <Button onClick={handleStepForward} className="min-w-24">
              {t('buttons.next')}
            </Button>
          )}

          {step === STEP_GITHUB_LOGIN && (
            <Button
              onClick={handleStepForward}
              variant="outline"
              className="min-w-24"
            >
              {t('buttons.skip')}
            </Button>
          )}

          {step === STEP_SAFETY_NOTICE && (
            <Button onClick={handleComplete} className="min-w-24">
              {t('onboarding.buttons.complete')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export { UnifiedOnboardingDialog };
