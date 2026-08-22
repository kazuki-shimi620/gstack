export const PUBLISH_BLOCKER = Object.freeze({
  technicalGateFailed: 'TECHNICAL_GATE_FAILED',
  versionPlaceholder: 'VERSION_PLACEHOLDER',
  licenseUndecided: 'LICENSE_UNDECIDED',
  changelogReleaseEntryMissing: 'CHANGELOG_RELEASE_ENTRY_MISSING',
});

export function assessPublishReadiness({
  diagnostics,
  version,
  license,
  releaseNotesReady = true,
}) {
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
  if (!releaseNotesReady) {
    publishBlockers.push(PUBLISH_BLOCKER.changelogReleaseEntryMissing);
  }

  return {
    ready: diagnostics.length === 0,
    publishReady: diagnostics.length === 0 && publishBlockers.length === 0,
    publishBlockers,
  };
}

export function hasReleaseEntry(changelog, version) {
  if (version === null || version === '0.0.0') return false;
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(`^## ${escapedVersion} - \\d{4}-\\d{2}-\\d{2}$`, 'mu').test(
    changelog,
  );
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
