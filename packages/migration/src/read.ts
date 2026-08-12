import type { ApplicationModel } from '@gstack/application';

import { diffApplicationModels } from './diff.js';
import type { MigrationHistoryEntry } from './history.js';
import type { ApplicationModelSnapshot } from './snapshot.js';
import type { MigrationHistoryRepository } from './storage.js';
import type { MigrationPlan, RenameColumnIntent } from './types.js';

export interface MigrationStatusSummary {
  readonly totalCount: number;
  readonly pendingCount: number;
  readonly applyingCount: number;
  readonly appliedCount: number;
  readonly failedCount: number;
  readonly rolledBackCount: number;
  readonly latestAttempt: MigrationHistoryEntry | null;
  readonly latestApplied: MigrationHistoryEntry | null;
}

export interface MigrationPlanPreview {
  readonly baselineVersion: string | null;
  readonly plan: MigrationPlan;
}

export class MigrationReadService {
  public constructor(private readonly history: MigrationHistoryRepository) {}

  public async listHistory(): Promise<readonly MigrationHistoryEntry[]> {
    return this.history.list();
  }

  public async getStatus(): Promise<MigrationStatusSummary> {
    const entries = await this.history.list();
    const applied = entries.filter(({ status }) => status === 'applied');
    return Object.freeze({
      totalCount: entries.length,
      pendingCount: count(entries, 'pending'),
      applyingCount: count(entries, 'applying'),
      appliedCount: applied.length,
      failedCount: count(entries, 'failed'),
      rolledBackCount: count(entries, 'rolled_back'),
      latestAttempt: entries.at(-1) ?? null,
      latestApplied: applied.at(-1) ?? null,
    });
  }

  public async previewPlan(
    target: ApplicationModel,
    renameIntents: readonly RenameColumnIntent[] = [],
  ): Promise<MigrationPlanPreview> {
    const entries = await this.history.list();
    const baseline = entries.filter(hasAppliedSnapshot).at(-1);
    const plan = diffApplicationModels(
      baseline?.appliedSnapshot.application ?? null,
      target,
      { renameColumns: renameIntents },
    );
    return Object.freeze({
      baselineVersion: baseline?.version ?? null,
      plan,
    });
  }
}

function hasAppliedSnapshot(
  entry: MigrationHistoryEntry,
): entry is MigrationHistoryEntry & {
  readonly appliedSnapshot: ApplicationModelSnapshot;
} {
  return entry.status === 'applied' && entry.appliedSnapshot !== null;
}

function count(
  entries: readonly MigrationHistoryEntry[],
  status: MigrationHistoryEntry['status'],
): number {
  return entries.filter((entry) => entry.status === status).length;
}
