# @gstack/cli

Schema Firstなgstack Projectを操作する公式CLIです。

## Status

開発中であり、まだnpmへ公開していません。Node.js 24以上のESM環境を対象とします。

## Entry point

Packageの`gstack` binを使用します。利用可能なCommandと安全要件は[CLI仕様](../docs/CLI.md)を参照してください。

Credentialを引数、Schema、Migrationへ保存しないでください。変更操作ではdry-run、fingerprint approval、必要に応じた破壊操作承認を要求します。

## Repository

開発、Issue、License状況は[gstack repository](https://github.com/kazuki-shimi620/gstack)を参照してください。
