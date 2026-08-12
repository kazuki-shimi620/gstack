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
    getMigrationStatus: () => project.getMigrationStatus(),
    listMigrationHistory: () => project.listMigrationHistory(),
    previewMigrationPlan: () => project.previewMigrationPlan(),
  } as const;
}

export type ReadHandlers = ReturnType<typeof createReadHandlers>;
