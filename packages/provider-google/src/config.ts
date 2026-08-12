export interface GoogleProviderConfig {
  readonly spreadsheetId: string;
  readonly appsScriptProjectId: string;
  readonly driveFolderId: string;
  readonly credentialSecret: string;
}

export interface GoogleProviderConfigIssue {
  readonly code: 'GOOGLE_CONFIG_INVALID';
  readonly path: string;
  readonly message: string;
}

const KEYS = [
  'spreadsheetId',
  'appsScriptProjectId',
  'driveFolderId',
  'credentialSecret',
] as const;

export function parseGoogleProviderConfig(
  value: Readonly<Record<string, unknown>>,
):
  | { readonly config: GoogleProviderConfig; readonly issues: readonly [] }
  | {
      readonly config: null;
      readonly issues: readonly GoogleProviderConfigIssue[];
    } {
  const issues: GoogleProviderConfigIssue[] = [];
  for (const key of Object.keys(value)) {
    if (!KEYS.includes(key as (typeof KEYS)[number])) {
      issues.push(
        issue(key, `Unknown Google Provider configuration key: ${key}`),
      );
    }
  }
  for (const key of KEYS) {
    if (typeof value[key] !== 'string' || value[key].trim().length === 0) {
      issues.push(issue(key, `Google Provider configuration requires ${key}.`));
    }
  }
  if (issues.length > 0) {
    return {
      config: null,
      issues: Object.freeze(
        issues.sort((left, right) => left.path.localeCompare(right.path)),
      ),
    };
  }
  return {
    config: Object.freeze({
      spreadsheetId: value.spreadsheetId as string,
      appsScriptProjectId: value.appsScriptProjectId as string,
      driveFolderId: value.driveFolderId as string,
      credentialSecret: value.credentialSecret as string,
    }),
    issues: [],
  };
}

function issue(path: string, message: string): GoogleProviderConfigIssue {
  return Object.freeze({ code: 'GOOGLE_CONFIG_INVALID', path, message });
}
