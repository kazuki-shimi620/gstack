import type { GstackErrorCategory } from './error.js';

export type GstackLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface GstackLogInput {
  readonly level: GstackLogLevel;
  readonly category: GstackErrorCategory;
  readonly code: string;
}

export interface GstackLogEvent extends GstackLogInput {
  readonly timestamp: string;
}

export interface GstackLogSink {
  write(event: GstackLogEvent): void;
}

export interface GstackLogger {
  emit(input: GstackLogInput): void;
}

const LEVELS = new Set<GstackLogLevel>(['debug', 'info', 'warn', 'error']);
const CATEGORIES = new Set<GstackErrorCategory>([
  'configuration',
  'schema',
  'provider',
  'migration',
  'generator',
  'internal',
]);
const CODE = /^[A-Z][A-Z0-9_]*$/u;

export function createGstackLogger(
  sink: GstackLogSink,
  now: () => Date = () => new Date(),
): GstackLogger {
  return Object.freeze({
    emit(input: GstackLogInput): void {
      if (
        !LEVELS.has(input.level) ||
        !CATEGORIES.has(input.category) ||
        !CODE.test(input.code)
      ) {
        return;
      }
      let timestamp: string;
      try {
        const current = now();
        if (Number.isNaN(current.valueOf())) return;
        timestamp = current.toISOString();
      } catch {
        return;
      }
      try {
        sink.write(
          Object.freeze({
            timestamp,
            level: input.level,
            category: input.category,
            code: input.code,
          }),
        );
      } catch {
        // Logging is observational and must not change domain behavior.
      }
    },
  });
}

export const noopGstackLogger: GstackLogger = Object.freeze({
  emit: () => undefined,
});
