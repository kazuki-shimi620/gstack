import type { ProviderSecretResolver } from '@gstack/provider';

import type { GoogleProviderConfig } from './config.js';
import { GoogleDeployHttpGateway } from './deploy-http.js';
import { GoogleDeployService } from './deploy.js';
import type { DefaultGoogleProviderOptions } from './default.js';
import { FetchGoogleHttpTransport, GoogleHttpExecutor } from './http.js';
import { GoogleOAuthHttpGateway } from './oauth-http.js';
import { GoogleScriptHttpGateway } from './script-http.js';
import { GoogleScriptWriteService } from './script.js';

export interface DefaultGoogleDeployComponents {
  readonly content: GoogleScriptWriteService;
  readonly deployment: GoogleDeployService;
}

export function createDefaultGoogleDeployComponents(
  config: GoogleProviderConfig,
  secrets: ProviderSecretResolver,
  options: DefaultGoogleProviderOptions = {},
): DefaultGoogleDeployComponents {
  const transport = new FetchGoogleHttpTransport(options.fetch);
  const http = new GoogleHttpExecutor(
    transport,
    {
      ...(options.timeoutMilliseconds === undefined
        ? {}
        : { timeoutMilliseconds: options.timeoutMilliseconds }),
      ...(options.maxAttempts === undefined
        ? {}
        : { maxAttempts: options.maxAttempts }),
      ...(options.retryDelaysMilliseconds === undefined
        ? {}
        : { retryDelaysMilliseconds: options.retryDelaysMilliseconds }),
    },
    options.wait,
  );
  const oauth = new GoogleOAuthHttpGateway(http, options.now);
  return Object.freeze({
    content: new GoogleScriptWriteService(
      new GoogleScriptHttpGateway(http, oauth, options.now),
      config,
      secrets,
    ),
    deployment: new GoogleDeployService(
      new GoogleDeployHttpGateway(http, oauth, options.now),
      config,
      secrets,
    ),
  });
}
