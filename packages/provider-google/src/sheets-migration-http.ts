import {
  GoogleCredentialService,
  type GoogleOAuthTokenGateway,
} from './credential.js';
import type { GoogleHttpClient } from './http.js';
import type { GoogleSheetsBatchUpdateGateway } from './sheets-migration.js';

export class GoogleSheetsMigrationHttpGateway implements GoogleSheetsBatchUpdateGateway {
  public constructor(
    private readonly http: GoogleHttpClient,
    private readonly tokens: GoogleOAuthTokenGateway,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async batchUpdate(
    input: Parameters<GoogleSheetsBatchUpdateGateway['batchUpdate']>[0],
  ): Promise<unknown> {
    const credential = await new GoogleCredentialService(
      input.secrets,
      this.tokens,
      this.now,
    ).authorize(input.credential);
    const url = new URL(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}:batchUpdate`,
    );
    const response = await this.http.execute({
      method: 'POST',
      url: url.href,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${credential.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        requests: input.requests,
        includeSpreadsheetInResponse: false,
        responseIncludeGridData: false,
      }),
      retryable: false,
    });
    try {
      return JSON.parse(response.body);
    } catch (error: unknown) {
      throw new TypeError('Google Sheets batch response is invalid.', {
        cause: error,
      });
    }
  }
}
