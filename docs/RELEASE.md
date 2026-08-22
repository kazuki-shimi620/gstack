# Release Guide

> Documentation index: [`../README.md`](../README.md)

この文書はgstack Packageをnpmへ公開する前の手順と停止条件を定義します。現時点ではLicenseと最初のRelease versionが未決定のため、公開してはいけません。

## Readinessの区別

- `npm run release:check`: metadata、Build entry、依存closure、pack内容を検証する技術的Gateです。
- `npm run release:publish-check`: 技術的Gateに加えて、placeholder versionと`UNLICENSED`が解消済みであることを要求します。
- `npm run release:smoke`: 全14 Packageをtarball化し、一時Consumer Projectへinstallして全entry importとCLI起動を検証します。

`release:check`の`ready: true`はnpm公開の承認を意味しません。`publishReady: true`、GitHub Actions成功、Repository ownerによる公開承認がすべて必要です。

## 公開前チェックリスト

1. Repository ownerがLicenseを決定し、rootのLicense文書と全Package metadataを同じSPDX identifierへ更新する。
2. npmの`@gstack` scope利用権限、2FA、publish tokenの保管先、provenance方針をRepository ownerが確認する。tokenをRepositoryやlogへ保存しない。
3. SemVer影響をレビューし、`npm run version:set -- <semver>`で同期versionを設定する。
4. 公開API／CLI差分をレビューし、意図した場合だけ`npm run compatibility:update`を実行する。
5. `npm ci`、`npm run check`、`npm run release:publish-check`、`npm run release:smoke`をclean checkoutで成功させる。
6. GitHub Actionsの同一commitが成功していることを確認する。
7. changelogとRelease noteをレビューし、公開対象commitをtagで固定する。

## Package公開順序

全Packageは同期exact versionで依存するため、Release監査が出力する`publicationOrder`の順に公開します。順序はWorkspace dependency graphから毎回決定し、手書きlistをsource of truthにしません。途中失敗時にversionを上書きせず、同じversionの再公開を試みないでください。未公開Packageを特定し、必要なら新しいpatch versionで全Packageを再同期します。

公開commandの自動実行、npm token設定、GitHub Release作成は、License、npm organization、provenance、失敗回復の判断が完了するまでこのRepositoryへ追加しません。
