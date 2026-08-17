# @gstack/provider-google

Google Sheets、Drive、Apps ScriptをgstackのProvider contractへ接続する公式Google Workspace Providerです。

## Status

開発中であり、まだnpmへ公開していません。Node.js 24以上のESM環境を対象とします。

CredentialやtokenはPackage、Schema、Migration、Project Configへ保存しません。Google固有処理はこのPackage内へ閉じ、CoreやGeneratorへ持ち込みません。設定とcapabilityは[PROVIDER.md](../../docs/PROVIDER.md)を参照してください。

## Repository

開発、Issue、License状況は[gstack repository](https://github.com/kazuki-shimi620/gstack)を参照してください。

