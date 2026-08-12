export interface GoogleProviderConfig {
  readonly spreadsheetId: string;
  readonly appsScriptProjectId: string;
  readonly driveFolderId: string;
  readonly authentication: {
    readonly mode: 'user_oauth';
    readonly credentialSecret: string;
  };
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
  'authentication',
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
    if (
      key !== 'authentication' &&
      (typeof value[key] !== 'string' || value[key].trim().length === 0)
    ) {
      issues.push(issue(key, `Google Provider configuration requires ${key}.`));
    }
  }
  const authentication = value.authentication;
  if (!isRecord(authentication)) {
    issues.push(
      issue(
        'authentication',
        'Google Provider configuration requires authentication.',
      ),
    );
  } else {
    for (const key of Object.keys(authentication)) {
      if (!['mode', 'credentialSecret'].includes(key)) {
        issues.push(
          issue(
            `authentication.${key}`,
            `Unknown Google Provider authentication key: ${key}`,
          ),
        );
      }
    }
    if (authentication.mode !== 'user_oauth') {
      issues.push(
        issue(
          'authentication.mode',
          'Google Provider authentication mode must be user_oauth.',
        ),
      );
    }
    if (
      typeof authentication.credentialSecret !== 'string' ||
      authentication.credentialSecret.trim().length === 0
    ) {
      issues.push(
        issue(
          'authentication.credentialSecret',
          'Google Provider authentication requires credentialSecret.',
        ),
      );
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
      authentication: Object.freeze({
        mode: 'user_oauth',
        credentialSecret: (value.authentication as Record<string, unknown>)
          .credentialSecret as string,
      }),
    }),
    issues: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function issue(path: string, message: string): GoogleProviderConfigIssue {
  return Object.freeze({ code: 'GOOGLE_CONFIG_INVALID', path, message });
}
