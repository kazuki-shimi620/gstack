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
  } as const;
}

export type ReadHandlers = ReturnType<typeof createReadHandlers>;
