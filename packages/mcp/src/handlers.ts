import type { GstackProject } from '@gstack/core';

export function createReadHandlers(project: GstackProject) {
  return {
    getConfig: () => project.getConfig(),
    getProjectStatus: () => project.getStatus(),
    getProjectContext: () => project.getProjectContext(),
    listSchemas: () => project.listSchemas(),
    getSchema: (name: string) => project.getSchema(name),
    validateSchema: () => project.validateSchema(),
    getApplicationModel: () => project.getApplicationModel(),
    listProviders: () => project.listProviders(),
    getProvider: (name: string) => project.getProvider(name),
    validateProvider: (name: string) => project.validateProvider(name),
    getProviderHealth: (name: string) => project.getProviderHealth(name),
    getMigrationStatus: () => project.getMigrationStatus(),
    listMigrationHistory: () => project.listMigrationHistory(),
    previewMigrationPlan: () => project.previewMigrationPlan(),
    previewGeneration: () => project.previewGeneration(),
  } as const;
}

export type ReadHandlers = ReturnType<typeof createReadHandlers>;
