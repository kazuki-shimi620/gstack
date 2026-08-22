export const PUBLISH_BLOCKER = Object.freeze({
  technicalGateFailed: 'TECHNICAL_GATE_FAILED',
  versionPlaceholder: 'VERSION_PLACEHOLDER',
  licenseUndecided: 'LICENSE_UNDECIDED',
});

export function assessPublishReadiness({ diagnostics, version, license }) {
  const publishBlockers = [];
  if (diagnostics.length > 0) {
    publishBlockers.push(PUBLISH_BLOCKER.technicalGateFailed);
  }
  if (version === '0.0.0') {
    publishBlockers.push(PUBLISH_BLOCKER.versionPlaceholder);
  }
  if (license === 'UNLICENSED') {
    publishBlockers.push(PUBLISH_BLOCKER.licenseUndecided);
  }

  return {
    ready: diagnostics.length === 0,
    publishReady: diagnostics.length === 0 && publishBlockers.length === 0,
    publishBlockers,
  };
}

export function resolvePublicationOrder(packageDependencies) {
  const remaining = new Map(
    [...packageDependencies].map(([name, dependencies]) => [
      name,
      new Set(dependencies),
    ]),
  );
  const publicationOrder = [];

  while (remaining.size > 0) {
    const next = [...remaining]
      .filter(([, dependencies]) => dependencies.size === 0)
      .map(([name]) => name)
      .sort()[0];
    if (!next) {
      return {
        publicationOrder: [],
        cyclicPackages: [...remaining.keys()].sort(),
      };
    }

    publicationOrder.push(next);
    remaining.delete(next);
    for (const dependencies of remaining.values()) dependencies.delete(next);
  }

  return { publicationOrder, cyclicPackages: [] };
}
