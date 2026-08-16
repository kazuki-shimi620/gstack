export interface GoogleProviderConfig {
  readonly spreadsheetId: string;
  readonly appsScriptProjectId: string;
  readonly driveFolderId: string;
  readonly authentication: {
    readonly mode: 'user_oauth';
    readonly credentialSecret: string;
  };
  readonly authorization?: {
    readonly roleBindings: Readonly<Record<string, readonly string[]>>;
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
  'authorization',
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
      key !== 'authorization' &&
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
  const authorization = parseAuthorization(value.authorization, issues);
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
      ...(authorization === undefined
        ? {}
        : { authorization: Object.freeze({ roleBindings: authorization }) }),
    }),
    issues: [],
  };
}

function parseAuthorization(
  value: unknown,
  issues: GoogleProviderConfigIssue[],
): Readonly<Record<string, readonly string[]>> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    issues.push(
      issue(
        'authorization',
        'Google Provider authorization must be an object.',
      ),
    );
    return undefined;
  }
  for (const key of Object.keys(value)) {
    if (key !== 'roleBindings') {
      issues.push(
        issue(
          `authorization.${key}`,
          `Unknown Google Provider authorization key: ${key}`,
        ),
      );
    }
  }
  if (!isRecord(value.roleBindings)) {
    issues.push(
      issue(
        'authorization.roleBindings',
        'Google Provider authorization requires roleBindings.',
      ),
    );
    return undefined;
  }
  const normalized: Record<string, readonly string[]> = {};
  for (const [role, emails] of Object.entries(value.roleBindings).sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    const path = `authorization.roleBindings.${role}`;
    if (!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/u.test(role)) {
      issues.push(issue(path, 'Google Provider role name is invalid.'));
      continue;
    }
    if (!Array.isArray(emails) || emails.length === 0) {
      issues.push(
        issue(path, 'Google Provider role binding must not be empty.'),
      );
      continue;
    }
    const values: string[] = [];
    const seen = new Set<string>();
    for (const email of emails) {
      if (typeof email !== 'string') {
        issues.push(issue(path, 'Google Provider role email is invalid.'));
        continue;
      }
      const normalizedEmail = email.trim().toLowerCase();
      if (!validEmail(normalizedEmail)) {
        issues.push(issue(path, 'Google Provider role email is invalid.'));
        continue;
      }
      if (seen.has(normalizedEmail)) {
        issues.push(issue(path, 'Google Provider role email is duplicated.'));
        continue;
      }
      seen.add(normalizedEmail);
      values.push(normalizedEmail);
    }
    if (values.length > 0) {
      normalized[role] = Object.freeze(values.sort());
    }
  }
  return Object.freeze(normalized);
}

function validEmail(value: string): boolean {
  if (value.length > 254) return false;
  const parts = value.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts as [string, string];
  if (
    local.length === 0 ||
    local.length > 64 ||
    local.startsWith('.') ||
    local.endsWith('.') ||
    local.includes('..') ||
    !/^[a-z0-9.!#$%&'*+/=?^_{}|~-]+$/u.test(local)
  ) {
    return false;
  }
  const labels = domain.split('.');
  return (
    labels.length >= 2 &&
    labels.every(
      (label) =>
        label.length > 0 &&
        label.length <= 63 &&
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(label),
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function issue(path: string, message: string): GoogleProviderConfigIssue {
  return Object.freeze({ code: 'GOOGLE_CONFIG_INVALID', path, message });
}
