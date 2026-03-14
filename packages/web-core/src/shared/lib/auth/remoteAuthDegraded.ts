import type { TFunction } from 'i18next';

export const REMOTE_AUTH_UNAVAILABLE_SLUG = 'remote_auth_unavailable';

export function getRemoteAuthDegradedMessage(
  slug: string,
  t: TFunction<'common'>
): string {
  switch (slug) {
    case REMOTE_AUTH_UNAVAILABLE_SLUG:
    default:
      return t('syncError.remoteAuthUnavailable');
  }
}
