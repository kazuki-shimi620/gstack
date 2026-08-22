# Changelog

gstackの利用者向け変更を記録します。公開前の変更は`Unreleased`へ追記し、Release時に確定versionと日付を持つ節へ移動します。

## Unreleased

### Added

- Schema DSLからApplication Modelを構築するConfig／Schema Loader、YAML Parser、AST、Semantic Analyzer。
- Provider非依存Migration、Generator、Plugin、Core API、CLI、read-only MCP。
- Google Sheets、Drive、Apps Scriptを利用する公式Google Providerと安全なMigration／Deploy workflow。
- credentialを含まないQuickstart Projectと、CLI／MCP／配布Tarballのcontract test。
- Architecture、互換性、Release readiness、Documentation linkを検証するCI Gate。

### Security

- Secret／CredentialをSchema、Migration、generated code、通常出力へ保存しない境界。
- 破壊的Migration、Rollback、Unlock、Deployに対するdry-run、fingerprint、明示承認。
- MCP Tool surfaceをRead／Validate専用allowlistへ固定。
