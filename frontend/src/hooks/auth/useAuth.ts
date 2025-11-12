import { useUserSystem } from '../../components/config-provider';

export function useAuth() {
  const { loginStatus } = useUserSystem();

  return {
    isSignedIn: loginStatus?.status === 'loggedin',
    isLoaded: loginStatus !== null,
    userId:
      loginStatus?.status === 'loggedin' ? loginStatus.profile.user_id : null,
  };
}
