import type {
  GenerationPlan,
  GstackErrorDetails,
  ProviderHealth,
  ProviderIssue,
  ProviderSummary,
  ValidationResult,
} from '@gstack/core';

export function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function formatValidationHuman(result: ValidationResult): string {
  const lines = [
    result.valid
      ? `Schema is valid (${result.level}).`
      : `Schema validation failed (${result.level}).`,
  ];

  for (const issue of [...result.errors, ...result.warnings]) {
    const location = issue.file
      ? `${issue.file}${issue.range ? `:${issue.range.start.line}:${issue.range.start.column}` : ''}`
      : 'project';
    lines.push(
      `${issue.severity.toUpperCase()} ${issue.code} ${location} ${issue.message}`,
    );
  }

  return lines.join('\n');
}

export function formatErrorHuman(error: GstackErrorDetails): string {
  return [
    `${error.code}: ${error.message}`,
    ...(error.path ? [`Path: ${error.path}`] : []),
    ...(error.hint ? [`Hint: ${error.hint}`] : []),
  ].join('\n');
}

export function formatGenerationHuman(
  plan: GenerationPlan,
  dryRun: boolean,
): string {
  return [
    dryRun ? 'Generation Plan:' : 'Generated Artifacts:',
    ...plan.writes.map(({ path }) => `WRITE ${path}`),
    ...plan.deletes.map((path) => `DELETE ${path}`),
    `Summary: ${plan.writes.length} write(s), ${plan.deletes.length} delete(s).`,
  ].join('\n');
}

export function formatProviderListHuman(
  providers: readonly ProviderSummary[],
): string {
  return providers.length === 0
    ? 'No Providers are enabled.'
    : providers
        .map(
          ({ name, version, capabilities }) =>
            `${name} ${version} ${enabledCapabilities(capabilities)}`,
        )
        .join('\n');
}

export function formatProviderInfoHuman(provider: ProviderSummary): string {
  return [
    `Provider: ${provider.name}`,
    `Package: ${provider.packageName}`,
    `Version: ${provider.version}`,
    `Minimum gstack: ${provider.minimumGstackVersion}`,
    `Capabilities: ${enabledCapabilities(provider.capabilities)}`,
  ].join('\n');
}

export function formatProviderValidationHuman(
  name: string,
  issues: readonly ProviderIssue[],
): string {
  return issues.length === 0
    ? `Provider ${name} configuration is valid.`
    : [
        `Provider ${name} validation found ${issues.length} issue(s).`,
        ...issues.map(
          ({ severity, code, message }) =>
            `${severity.toUpperCase()} ${code} ${message}`,
        ),
      ].join('\n');
}

export function formatProviderHealthHuman(
  name: string,
  health: ProviderHealth,
): string {
  return `Provider ${name}: ${health.status} (${health.code})`;
}

function enabledCapabilities(
  capabilities: ProviderSummary['capabilities'],
): string {
  const enabled = Object.entries(capabilities)
    .filter(([, available]) => available)
    .map(([name]) => name)
    .sort();
  return enabled.length === 0 ? 'none' : enabled.join(',');
}
