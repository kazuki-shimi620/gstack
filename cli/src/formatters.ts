import type {
  GenerationPlan,
  GstackErrorDetails,
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
