const MISSING_CODE_SERVER_URL_ERROR = 'Code Server URL is required';

export function alertIfCodeServerNotConfigured(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';

  if (!message.includes(MISSING_CODE_SERVER_URL_ERROR)) {
    return false;
  }

  // eslint-disable-next-line no-alert
  window.alert(
    'Code Server URL is not configured. Please set it in Settings > General > Editor.'
  );
  return true;
}
