const CODE_SERVER_ERROR_PATTERNS = [
  'Code Server URL is required',
  'Invalid Code Server URL',
  'Code Server URL must start with http://',
];

export function alertIfCodeServerNotConfigured(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';

  if (!CODE_SERVER_ERROR_PATTERNS.some((pattern) => message.includes(pattern))) {
    return false;
  }

  // eslint-disable-next-line no-alert
  window.alert(
    'Code Server URL is not configured or invalid. Please check it in Settings > General > Editor.'
  );
  return true;
}
