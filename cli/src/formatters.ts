import type {
  GenerationPlan,
  GstackErrorDetails,
  ProviderHealth,
  ProviderIssue,
  ProviderSummary,
  ValidationResult,
} from '@gstack/core';
import type {
  MigrationHistoryEntry,
  MigrationPlanPreview,
  MigrationStatusSummary,
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

export function formatDeployPreviewHuman(preview: {
  readonly provider: string;
  readonly scriptId: string;
  readonly fingerprint: string;
  readonly files: readonly { readonly name: string; readonly type: string }[];
}): string {
  return [
    'Deploy Dry Run:',
    `Provider: ${preview.provider}`,
    `Script project: ${preview.scriptId}`,
    `Fingerprint: ${preview.fingerprint}`,
    ...preview.files.map(({ name, type }) => `${type} ${name}`),
    `Summary: ${preview.files.length} file(s).`,
  ].join('\n');
}

export function formatDeployResultHuman(result: {
  readonly fingerprint: string;
  readonly deployment: {
    readonly outcome: string;
    readonly versionNumber: number;
    readonly deploymentId: string;
    readonly url: string;
  };
}): string {
  return [
    `Deploy ${result.deployment.outcome}.`,
    `Version: ${result.deployment.versionNumber}`,
    `Deployment: ${result.deployment.deploymentId}`,
    `URL: ${result.deployment.url}`,
    `Fingerprint: ${result.fingerprint}`,
  ].join('\n');
}

export function formatBuildHuman(result: {
  readonly dryRun: boolean;
  readonly artifacts: readonly { readonly path: string }[];
  readonly deletes: readonly string[];
  readonly deploy: {
    readonly fingerprint: string;
    readonly files: readonly unknown[];
  };
}): string {
  return [
    result.dryRun ? 'Build Dry Run:' : 'Build completed.',
    ...result.artifacts.map(({ path }) => `BUILD ${path}`),
    ...result.deletes.map((path) => `DELETE ${path}`),
    `Deploy fingerprint: ${result.deploy.fingerprint}`,
    `Summary: ${result.artifacts.length} artifact(s), ${result.deploy.files.length} deploy file(s).`,
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

export function formatPluginListHuman(
  plugins: readonly {
    readonly id: string;
    readonly kind: string;
    readonly packageName: string;
    readonly version: string;
    readonly configured: boolean;
  }[],
): string {
  return plugins.length === 0
    ? 'No Plugins are allowlisted.'
    : plugins
        .map(
          ({ id, kind, packageName, version, configured }) =>
            `${id} ${kind} ${packageName}@${version}${configured ? ' configured' : ''}`,
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

export function formatProjectInitializationHuman(
  preview: {
    readonly scriptId: string;
    readonly manifestChecksum: string;
    readonly fingerprint: string;
  },
  dryRun: boolean,
): string {
  return [
    dryRun ? 'Project Initialization Dry Run:' : 'Project initialized.',
    `Script project: ${preview.scriptId}`,
    `Manifest checksum: ${preview.manifestChecksum}`,
    `Fingerprint: ${preview.fingerprint}`,
  ].join('\n');
}

export function formatMigrationStatusHuman(
  status: MigrationStatusSummary,
): string {
  return [
    `Migration History: ${status.totalCount} total`,
    `Pending: ${status.pendingCount}`,
    `Applying: ${status.applyingCount}`,
    `Applied: ${status.appliedCount}`,
    `Failed: ${status.failedCount}`,
    `Rolled back: ${status.rolledBackCount}`,
    `Latest: ${status.latestAttempt?.version ?? 'none'}`,
  ].join('\n');
}

export function formatMigrationHistoryHuman(
  entries: readonly MigrationHistoryEntry[],
): string {
  return entries.length === 0
    ? 'No Migration History exists.'
    : entries
        .map(
          ({
            version,
            name,
            status,
            completedOperationCount,
            operationCount,
          }) =>
            `${version} ${name} ${status} ${completedOperationCount}/${operationCount}`,
        )
        .join('\n');
}

export function formatMigrationPlanHuman(
  preview: MigrationPlanPreview,
): string {
  const { plan } = preview;
  return [
    `Migration Plan (baseline: ${preview.baselineVersion ?? 'none'}):`,
    ...(plan.operations.length === 0
      ? ['No changes.']
      : plan.operations.map(
          ({ id, risk, capability }) =>
            `${risk.toUpperCase()} ${id} [${capability}]`,
        )),
    `Summary: ${plan.operations.length} operation(s), risk=${plan.risk}, applicable=${String(plan.applicable)}.`,
  ].join('\n');
}

export interface MigrationApplyDryRunView {
  readonly version: string;
  readonly name: string;
  readonly checksum: string;
  readonly planFingerprint: string;
  readonly plan: MigrationPlanPreview['plan'];
}

export function formatMigrationApplyDryRunHuman(
  preview: MigrationApplyDryRunView,
): string {
  return [
    'Migration Apply Dry Run:',
    `Version: ${preview.version}`,
    `Name: ${preview.name}`,
    `Checksum: ${preview.checksum}`,
    `Plan fingerprint: ${preview.planFingerprint}`,
    ...preview.plan.operations.map(
      ({ id, risk, capability }) =>
        `${risk.toUpperCase()} ${id} [${capability}]`,
    ),
    `Summary: ${preview.plan.operations.length} operation(s), risk=${preview.plan.risk}, applicable=${String(preview.plan.applicable)}.`,
  ].join('\n');
}

export function formatMigrationApplyHuman(result: {
  readonly outcome: 'applied' | 'skipped';
  readonly history: MigrationHistoryEntry;
}): string {
  return [
    result.outcome === 'applied'
      ? 'Migration applied.'
      : 'Migration already applied; no operations executed.',
    `Version: ${result.history.version}`,
    `Status: ${result.history.status}`,
    `Operations: ${result.history.completedOperationCount}/${result.history.operationCount}`,
  ].join('\n');
}

export interface MigrationRollbackDryRunView {
  readonly sourceVersion: string;
  readonly sourceChecksum: string;
  readonly targetVersion: string | null;
  readonly planFingerprint: string;
  readonly plan: MigrationPlanPreview['plan'];
}

export function formatMigrationRollbackDryRunHuman(
  preview: MigrationRollbackDryRunView,
): string {
  return [
    'Migration Rollback Dry Run:',
    `Source version: ${preview.sourceVersion}`,
    `Source checksum: ${preview.sourceChecksum}`,
    `Target version: ${preview.targetVersion ?? 'initial (none)'}`,
    `Plan fingerprint: ${preview.planFingerprint}`,
    ...preview.plan.operations.map(
      ({ id, risk, capability }) =>
        `${risk.toUpperCase()} ${id} [${capability}]`,
    ),
    `Summary: ${preview.plan.operations.length} operation(s), risk=${preview.plan.risk}, destructive=${String(preview.plan.destructive)}, applicable=${String(preview.plan.applicable)}.`,
  ].join('\n');
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
