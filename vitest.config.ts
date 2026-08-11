import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const workspacePackage = (path: string): string =>
  fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@gstack/analyzer': workspacePackage('./packages/analyzer/src/index.ts'),
      '@gstack/application': workspacePackage(
        './packages/application/src/index.ts',
      ),
      '@gstack/config': workspacePackage('./packages/config/src/index.ts'),
      '@gstack/core': workspacePackage('./packages/core/src/index.ts'),
      '@gstack/mcp': workspacePackage('./packages/mcp/src/index.ts'),
      '@gstack/parser': workspacePackage('./packages/parser/src/index.ts'),
      '@gstack/schema': workspacePackage('./packages/schema/src/index.ts'),
    },
  },
  test: {
    coverage: {
      reporter: ['text', 'html'],
    },
    include: ['**/*.test.ts'],
    passWithNoTests: true,
  },
});
