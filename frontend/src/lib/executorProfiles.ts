type VariantConfigValue = Record<string, unknown>;

function normalizeVariantConfig(
  profiles: Record<string, Record<string, unknown>> | null,
  executor: string | null | undefined,
  variant: string | null | undefined
): VariantConfigValue | null {
  if (!profiles || !executor) return null;
  const variants = profiles[executor];
  if (!variants) return null;
  const variantKey = variant ?? 'DEFAULT';
  const variantConfig = variants[variantKey] as Record<string, unknown> | undefined;
  const configValue = variantConfig?.[executor];
  return configValue && typeof configValue === 'object'
    ? (configValue as VariantConfigValue)
    : null;
}

export function describeExecutorVariant(
  profiles: Record<string, Record<string, unknown>> | null,
  executor: string | null | undefined,
  variant: string | null | undefined
): string | null {
  const config = normalizeVariantConfig(profiles, executor, variant);
  if (!config || !executor) return null;

  if (executor === 'CODEX') {
    const parts = [
      typeof config.collaboration_mode === 'string'
        ? config.collaboration_mode
        : null,
      typeof config.model === 'string' ? config.model : null,
      typeof config.sandbox === 'string' ? config.sandbox : null,
      typeof config.ask_for_approval === 'string'
        ? config.ask_for_approval
        : null,
    ].filter(Boolean);
    return parts.length ? parts.join(' • ') : null;
  }

  if (executor === 'CLAUDE_CODE') {
    const parts = [
      typeof config.model === 'string' ? config.model : null,
      config.plan === true ? 'plan' : null,
      config.approvals === true ? 'approvals' : null,
    ].filter(Boolean);
    return parts.length ? parts.join(' • ') : null;
  }

  return typeof config.model === 'string' ? config.model : null;
}
