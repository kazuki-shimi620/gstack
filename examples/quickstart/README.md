# gstack Quickstart

credentialやProvider IDを含まない最小sample Projectです。Schemaは設計情報のSingle Source of Truthであり、`generated/`はgstackだけが所有します。

Repository rootで依存関係をinstallしてbuildした後、次を実行します。

```bash
cd examples/quickstart
node ../../cli/dist/main.js schema validate
node ../../cli/dist/main.js generate --dry-run
```

実際の生成やMigration File作成を試す場合は、このdirectoryを別の作業場所へコピーしてから実行してください。

```bash
node /absolute/path/to/gstack/cli/dist/main.js migration create initial_schema
node /absolute/path/to/gstack/cli/dist/main.js generate
```

生成後も編集対象は`schema/`です。`generated/`内のfileを手動編集せず、再生成してください。Google Provider、credential、Migration Apply、Deployはこのsampleに設定していません。
